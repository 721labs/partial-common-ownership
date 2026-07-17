import { expect } from "chai";
import { ethers, network } from "hardhat";

import type {
  Contract,
  ContractTransactionReceipt,
  ContractTransactionResponse,
  LogDescription,
} from "ethers";

type EventSource = {
  label: string;
  contract: Contract;
  address: string;
};

type DecodedEvent = {
  source: string;
  name: string;
  args: LogDescription["args"];
};

const ZERO_ADDRESS = ethers.ZeroAddress;
const ZERO = BigInt(0);
const ONE_ETHER = ethers.parseEther("1");
const TWO_ETHER = ethers.parseEther("2");
const THREE_ETHER = ethers.parseEther("3");
const NINETY_DAYS = 90 * 24 * 60 * 60;
const TEN_YEARS = 3650 * 24 * 60 * 60;
const TAX_DENOMINATOR = BigInt("1000000000000");

const NETWORK_START = 2_000_000_000;
const ACQUISITION_TIME = 2_000_010_000;
const COLLECTION_TIME = ACQUISITION_TIME + 10 * 24 * 60 * 60;
const EXIT_TIME = COLLECTION_TIME + 1;
const APPROVAL_TIME = 2_000_019_999;
const WRAP_TIME = 2_000_020_000;
const TAKEOVER_TIME = WRAP_TIME + 100;
const UNWRAP_TIME = TAKEOVER_TIME + 1;

const TOKEN_ID = BigInt(1);
const TAX_RATE_FIVE_PERCENT = BigInt("50000000000");
const TAX_RATE_MINIMUM = BigInt(1);

function calculateTax(
  valuation: bigint,
  elapsed: number,
  frequency: number,
  taxRate: bigint
): bigint {
  return (
    (((valuation * BigInt(elapsed)) / BigInt(frequency)) * taxRate) /
    TAX_DENOMINATOR
  );
}

async function requiredReceipt(
  transaction: ContractTransactionResponse
): Promise<ContractTransactionReceipt> {
  const receipt = await transaction.wait();
  if (receipt === null) throw new Error("Transaction was not mined");
  return receipt;
}

async function eventSource(
  label: string,
  contract: Contract
): Promise<EventSource> {
  return {
    label,
    contract,
    address: (await contract.getAddress()).toLowerCase(),
  };
}

function decodeEvents(
  receipt: ContractTransactionReceipt,
  sources: EventSource[]
): DecodedEvent[] {
  const events: DecodedEvent[] = [];

  for (const log of receipt.logs) {
    const source = sources.find(
      ({ address }) => address === log.address.toLowerCase()
    );
    if (!source) continue;

    const parsed = source.contract.interface.parseLog({
      topics: log.topics,
      data: log.data,
    });
    if (parsed === null) continue;

    events.push({
      source: source.label,
      name: parsed.name,
      args: parsed.args,
    });
  }

  return events;
}

async function expectRevertReason(
  action: Promise<unknown>,
  expectedReason: string
): Promise<void> {
  let caught: unknown;
  try {
    await action;
  } catch (error) {
    caught = error;
  }

  if (caught === undefined) {
    expect.fail(`Expected transaction to revert with: ${expectedReason}`);
  }
  if (ethers.isError(caught, "CALL_EXCEPTION") && caught.reason !== null) {
    expect(caught.reason).to.equal(expectedReason);
    return;
  }
  if (caught instanceof Error) {
    expect(caught.message).to.include(expectedReason);
    return;
  }
  expect.fail(`Unexpected rejection value: ${String(caught)}`);
}

function eventNames(events: DecodedEvent[]): string[] {
  return events.map(({ source, name }) => `${source}.${name}`);
}

async function resetNetwork(): Promise<void> {
  await network.provider.send("hardhat_reset");
  await network.provider.send("evm_setNextBlockTimestamp", [NETWORK_START]);
  await network.provider.send("evm_mine");
}

async function setNextTimestamp(timestamp: number): Promise<void> {
  await network.provider.send("evm_setNextBlockTimestamp", [timestamp]);
}

describe("Hardhat interoperability smokes", function () {
  beforeEach(async function () {
    await resetNetwork();
  });

  it("deploys and reads deterministic PCO configuration", async function () {
    const [, beneficiary] = await ethers.getSigners();
    const beneficiaryAddress = await beneficiary.getAddress();
    const pcoFactory = await ethers.getContractFactory("TestPCOToken");
    const pco = await pcoFactory.deploy(beneficiaryAddress);
    await pco.waitForDeployment();
    const pcoAddress = await pco.getAddress();

    expect(await pco.supportsInterface("0x01ffc9a7")).to.equal(true);
    expect(await pco.supportsInterface("0x80ac58cd")).to.equal(true);
    expect(await pco.supportsInterface("0x5b5e139f")).to.equal(false);

    const expectedRates = [
      BigInt("50000000000"),
      BigInt("1000000000000"),
      BigInt("1000000000000"),
    ];
    const expectedFrequencies = [90, 30, 365].map((days) =>
      BigInt(days * 24 * 60 * 60)
    );

    for (let index = 0; index < 3; index++) {
      const tokenId = BigInt(index + 1);
      expect(await pco.ownerOf(tokenId)).to.equal(pcoAddress);
      expect(await pco.beneficiaryOf(tokenId)).to.equal(beneficiaryAddress);
      expect(await pco.taxRateOf(tokenId)).to.equal(expectedRates[index]);
      expect(await pco.collectionFrequencyOf(tokenId)).to.equal(
        expectedFrequencies[index]
      );
      expect(await pco.valuationOf(tokenId)).to.equal(ZERO);
      expect(await pco.depositOf(tokenId)).to.equal(ZERO);
      expect(await pco.taxationCollected(tokenId)).to.equal(ZERO);
      expect(await pco.lastCollectionTimeOf(tokenId)).to.equal(ZERO);
    }
  });

  it("acquires, collects tax, and exits with ordered events and conserved balances", async function () {
    const [collector, beneficiary, alice] = await ethers.getSigners();
    const beneficiaryAddress = await beneficiary.getAddress();
    const aliceAddress = await alice.getAddress();
    const pcoFactory = await ethers.getContractFactory("TestPCOToken");
    const pco = await pcoFactory.deploy(beneficiaryAddress);
    await pco.waitForDeployment();
    const pcoAddress = await pco.getAddress();

    const valuation = ethers.parseEther("9");
    const initialDeposit = TWO_ETHER;

    await setNextTimestamp(ACQUISITION_TIME);
    const acquisition = await (pco.connect(alice) as Contract).takeoverLease(
      TOKEN_ID,
      valuation,
      ZERO,
      { value: initialDeposit }
    );
    const acquisitionReceipt = await requiredReceipt(acquisition);
    const acquisitionEvents = decodeEvents(acquisitionReceipt, [
      await eventSource("pco", pco),
    ]);

    expect(eventNames(acquisitionEvents)).to.deep.equal([
      "pco.LogValuation",
      "pco.Approval",
      "pco.Transfer",
      "pco.LogLeaseTakeover",
    ]);
    expect(acquisitionEvents[0].args.tokenId).to.equal(TOKEN_ID);
    expect(acquisitionEvents[0].args.newValuation).to.equal(valuation);
    expect(acquisitionEvents[1].args.owner).to.equal(pcoAddress);
    expect(acquisitionEvents[1].args.approved).to.equal(ZERO_ADDRESS);
    expect(acquisitionEvents[2].args.from).to.equal(pcoAddress);
    expect(acquisitionEvents[2].args.to).to.equal(aliceAddress);
    expect(acquisitionEvents[3].args.owner).to.equal(aliceAddress);
    expect(acquisitionEvents[3].args.newValuation).to.equal(valuation);

    expect(await pco.ownerOf(TOKEN_ID)).to.equal(aliceAddress);
    expect(await pco.valuationOf(TOKEN_ID)).to.equal(valuation);
    expect(await pco.depositOf(TOKEN_ID)).to.equal(initialDeposit);
    expect(await pco.lastCollectionTimeOf(TOKEN_ID)).to.equal(
      BigInt(ACQUISITION_TIME)
    );
    expect(await ethers.provider.getBalance(pcoAddress)).to.equal(
      initialDeposit
    );

    const firstTax = calculateTax(
      valuation,
      COLLECTION_TIME - ACQUISITION_TIME,
      NINETY_DAYS,
      TAX_RATE_FIVE_PERCENT
    );
    const beneficiaryBeforeCollection = await ethers.provider.getBalance(
      beneficiaryAddress
    );

    await setNextTimestamp(COLLECTION_TIME);
    const collection = await (pco.connect(collector) as Contract).collectTax(
      TOKEN_ID
    );
    const collectionReceipt = await requiredReceipt(collection);
    const collectionEvents = decodeEvents(collectionReceipt, [
      await eventSource("pco", pco),
    ]);

    expect(eventNames(collectionEvents)).to.deep.equal([
      "pco.LogCollection",
      "pco.LogRemittance",
    ]);
    expect(collectionEvents[0].args.tokenId).to.equal(TOKEN_ID);
    expect(collectionEvents[0].args.collected).to.equal(firstTax);
    expect(collectionEvents[1].args.trigger).to.equal(BigInt(3));
    expect(collectionEvents[1].args.recipient).to.equal(beneficiaryAddress);
    expect(collectionEvents[1].args.amount).to.equal(firstTax);

    expect(
      (await ethers.provider.getBalance(beneficiaryAddress)) -
        beneficiaryBeforeCollection
    ).to.equal(firstTax);
    expect(await pco.depositOf(TOKEN_ID)).to.equal(initialDeposit - firstTax);
    expect(await pco.taxationCollected(TOKEN_ID)).to.equal(firstTax);
    expect(await pco.taxCollectedSinceLastTransferOf(TOKEN_ID)).to.equal(
      firstTax
    );
    expect(await pco.lastCollectionTimeOf(TOKEN_ID)).to.equal(
      BigInt(COLLECTION_TIME)
    );
    expect(await ethers.provider.getBalance(pcoAddress)).to.equal(
      initialDeposit - firstTax
    );

    const exitTax = calculateTax(
      valuation,
      EXIT_TIME - COLLECTION_TIME,
      NINETY_DAYS,
      TAX_RATE_FIVE_PERCENT
    );
    const returnedDeposit = initialDeposit - firstTax - exitTax;
    const aliceBeforeExit = await ethers.provider.getBalance(aliceAddress);
    const beneficiaryBeforeExit = await ethers.provider.getBalance(
      beneficiaryAddress
    );

    await setNextTimestamp(EXIT_TIME);
    const exit = await (pco.connect(alice) as Contract).exit(TOKEN_ID);
    const exitReceipt = await requiredReceipt(exit);
    const exitEvents = decodeEvents(exitReceipt, [
      await eventSource("pco", pco),
    ]);

    expect(eventNames(exitEvents)).to.deep.equal([
      "pco.LogCollection",
      "pco.LogRemittance",
      "pco.LogRemittance",
      "pco.LogValuation",
      "pco.Approval",
      "pco.Transfer",
      "pco.LogForeclosure",
    ]);
    expect(exitEvents[0].args.collected).to.equal(exitTax);
    expect(exitEvents[1].args.trigger).to.equal(BigInt(3));
    expect(exitEvents[1].args.recipient).to.equal(beneficiaryAddress);
    expect(exitEvents[1].args.amount).to.equal(exitTax);
    expect(exitEvents[2].args.trigger).to.equal(BigInt(1));
    expect(exitEvents[2].args.recipient).to.equal(aliceAddress);
    expect(exitEvents[2].args.amount).to.equal(returnedDeposit);
    expect(exitEvents[3].args.newValuation).to.equal(ZERO);
    expect(exitEvents[4].args.owner).to.equal(aliceAddress);
    expect(exitEvents[4].args.approved).to.equal(ZERO_ADDRESS);
    expect(exitEvents[5].args.from).to.equal(aliceAddress);
    expect(exitEvents[5].args.to).to.equal(pcoAddress);
    expect(exitEvents[6].args.prevOwner).to.equal(aliceAddress);

    const exitGas = exitReceipt.gasUsed * exitReceipt.gasPrice;
    expect(await ethers.provider.getBalance(aliceAddress)).to.equal(
      aliceBeforeExit + returnedDeposit - exitGas
    );
    expect(
      (await ethers.provider.getBalance(beneficiaryAddress)) -
        beneficiaryBeforeExit
    ).to.equal(exitTax);
    expect(await ethers.provider.getBalance(pcoAddress)).to.equal(ZERO);
    expect(await pco.ownerOf(TOKEN_ID)).to.equal(pcoAddress);
    expect(await pco.valuationOf(TOKEN_ID)).to.equal(ZERO);
    expect(await pco.depositOf(TOKEN_ID)).to.equal(ZERO);
    expect(await pco.taxationCollected(TOKEN_ID)).to.equal(firstTax + exitTax);
    expect(await pco.taxCollectedSinceLastTransferOf(TOKEN_ID)).to.equal(ZERO);
    expect(await pco.lastCollectionTimeOf(TOKEN_ID)).to.equal(
      BigInt(EXIT_TIME)
    );
    expect(await pco.foreclosed(TOKEN_ID)).to.equal(true);
  });

  it("approves, wraps, takes over, and unwraps with custody and metadata cleanup", async function () {
    const [originator, , buyer] = await ethers.getSigners();
    const originatorAddress = await originator.getAddress();
    const buyerAddress = await buyer.getAddress();
    const nftFactory = await ethers.getContractFactory("TestNFT");
    const nft = await nftFactory.connect(originator).deploy();
    await nft.waitForDeployment();
    const nftAddress = await nft.getAddress();
    const wrapperFactory = await ethers.getContractFactory("TestWrapper");
    const wrapper = await wrapperFactory.connect(originator).deploy();
    await wrapper.waitForDeployment();
    const wrapperAddress = await wrapper.getAddress();

    const initialValuation = ONE_ETHER;
    const buyerValuation = TWO_ETHER;
    const initialDeposit = THREE_ETHER;
    const wrappedId = await wrapper.wrappedTokenId(nftAddress, TOKEN_ID);
    const independentlyDerivedId = BigInt(
      ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "uint256"],
          [nftAddress, TOKEN_ID]
        )
      )
    );
    expect(wrappedId).to.equal(independentlyDerivedId);

    await setNextTimestamp(APPROVAL_TIME);
    const approval = await (nft.connect(originator) as Contract).approve(
      wrapperAddress,
      TOKEN_ID
    );
    const approvalReceipt = await requiredReceipt(approval);
    const approvalEvents = decodeEvents(approvalReceipt, [
      await eventSource("nft", nft),
    ]);
    expect(eventNames(approvalEvents)).to.deep.equal(["nft.Approval"]);
    expect(approvalEvents[0].args.owner).to.equal(originatorAddress);
    expect(approvalEvents[0].args.approved).to.equal(wrapperAddress);
    expect(approvalEvents[0].args.tokenId).to.equal(TOKEN_ID);

    await setNextTimestamp(WRAP_TIME);
    const wrap = await (wrapper.connect(originator) as Contract).wrap(
      nftAddress,
      TOKEN_ID,
      initialValuation,
      buyerAddress,
      TAX_RATE_MINIMUM,
      3650,
      { value: initialDeposit }
    );
    const wrapReceipt = await requiredReceipt(wrap);
    const wrapEvents = decodeEvents(wrapReceipt, [
      await eventSource("nft", nft),
      await eventSource("wrapper", wrapper),
    ]);

    expect(eventNames(wrapEvents)).to.deep.equal([
      "nft.Transfer",
      "wrapper.Transfer",
      "wrapper.LogValuation",
      "wrapper.LogBeneficiaryUpdated",
      "wrapper.LogTokenWrapped",
    ]);
    expect(wrapEvents[0].args.from).to.equal(originatorAddress);
    expect(wrapEvents[0].args.to).to.equal(wrapperAddress);
    expect(wrapEvents[1].args.from).to.equal(ZERO_ADDRESS);
    expect(wrapEvents[1].args.to).to.equal(originatorAddress);
    expect(wrapEvents[2].args.newValuation).to.equal(initialValuation);
    expect(wrapEvents[3].args.newBeneficiary).to.equal(buyerAddress);
    expect(wrapEvents[4].args.contractAddress).to.equal(nftAddress);
    expect(wrapEvents[4].args.tokenId).to.equal(TOKEN_ID);
    expect(wrapEvents[4].args.wrappedTokenId).to.equal(wrappedId);

    expect(await nft.ownerOf(TOKEN_ID)).to.equal(wrapperAddress);
    expect(await nft.getApproved(TOKEN_ID)).to.equal(ZERO_ADDRESS);
    expect(await wrapper.ownerOf(wrappedId)).to.equal(originatorAddress);
    expect(await wrapper.tokenURI(wrappedId)).to.equal("721.dev/1");
    expect(await wrapper.valuationOf(wrappedId)).to.equal(initialValuation);
    expect(await wrapper.depositOf(wrappedId)).to.equal(initialDeposit);
    expect(await wrapper.beneficiaryOf(wrappedId)).to.equal(buyerAddress);
    expect(await wrapper.taxRateOf(wrappedId)).to.equal(TAX_RATE_MINIMUM);
    expect(await wrapper.collectionFrequencyOf(wrappedId)).to.equal(
      BigInt(TEN_YEARS)
    );
    expect(await wrapper.lastCollectionTimeOf(wrappedId)).to.equal(ZERO);
    expect(await ethers.provider.getBalance(wrapperAddress)).to.equal(
      initialDeposit
    );

    const takeoverTax = calculateTax(
      initialValuation,
      TAKEOVER_TIME,
      TEN_YEARS,
      TAX_RATE_MINIMUM
    );
    const takeoverRemittance = initialValuation + initialDeposit - takeoverTax;
    const originatorBeforeTakeover = await ethers.provider.getBalance(
      originatorAddress
    );
    const buyerBeforeTakeover = await ethers.provider.getBalance(buyerAddress);

    await setNextTimestamp(TAKEOVER_TIME);
    const takeover = await (wrapper.connect(buyer) as Contract).takeoverLease(
      wrappedId,
      buyerValuation,
      initialValuation,
      {
        value: initialValuation,
      }
    );
    const takeoverReceipt = await requiredReceipt(takeover);
    const takeoverEvents = decodeEvents(takeoverReceipt, [
      await eventSource("wrapper", wrapper),
    ]);

    expect(eventNames(takeoverEvents)).to.deep.equal([
      "wrapper.LogCollection",
      "wrapper.LogRemittance",
      "wrapper.LogRemittance",
      "wrapper.LogValuation",
      "wrapper.Approval",
      "wrapper.Transfer",
      "wrapper.LogLeaseTakeover",
    ]);
    expect(takeoverEvents[0].args.collected).to.equal(takeoverTax);
    expect(takeoverEvents[1].args.trigger).to.equal(BigInt(3));
    expect(takeoverEvents[1].args.recipient).to.equal(buyerAddress);
    expect(takeoverEvents[1].args.amount).to.equal(takeoverTax);
    expect(takeoverEvents[2].args.trigger).to.equal(BigInt(0));
    expect(takeoverEvents[2].args.recipient).to.equal(originatorAddress);
    expect(takeoverEvents[2].args.amount).to.equal(takeoverRemittance);
    expect(takeoverEvents[3].args.newValuation).to.equal(buyerValuation);
    expect(takeoverEvents[4].args.owner).to.equal(originatorAddress);
    expect(takeoverEvents[4].args.approved).to.equal(ZERO_ADDRESS);
    expect(takeoverEvents[5].args.from).to.equal(originatorAddress);
    expect(takeoverEvents[5].args.to).to.equal(buyerAddress);
    expect(takeoverEvents[6].args.owner).to.equal(buyerAddress);
    expect(takeoverEvents[6].args.newValuation).to.equal(buyerValuation);

    const takeoverGas = takeoverReceipt.gasUsed * takeoverReceipt.gasPrice;
    expect(
      (await ethers.provider.getBalance(originatorAddress)) -
        originatorBeforeTakeover
    ).to.equal(takeoverRemittance);
    expect(await ethers.provider.getBalance(buyerAddress)).to.equal(
      buyerBeforeTakeover - initialValuation + takeoverTax - takeoverGas
    );
    expect(await ethers.provider.getBalance(wrapperAddress)).to.equal(ZERO);
    expect(await wrapper.ownerOf(wrappedId)).to.equal(buyerAddress);
    expect(await wrapper.valuationOf(wrappedId)).to.equal(buyerValuation);
    expect(await wrapper.depositOf(wrappedId)).to.equal(ZERO);
    expect(await wrapper.taxationCollected(wrappedId)).to.equal(takeoverTax);
    expect(await wrapper.taxCollectedSinceLastTransferOf(wrappedId)).to.equal(
      ZERO
    );
    expect(await wrapper.lastCollectionTimeOf(wrappedId)).to.equal(
      BigInt(TAKEOVER_TIME)
    );
    expect(await nft.ownerOf(TOKEN_ID)).to.equal(wrapperAddress);
    expect(await wrapper.tokenURI(wrappedId)).to.equal("721.dev/1");

    await setNextTimestamp(UNWRAP_TIME);
    const unwrap = await (wrapper.connect(originator) as Contract).unwrap(
      wrappedId
    );
    const unwrapReceipt = await requiredReceipt(unwrap);
    const unwrapEvents = decodeEvents(unwrapReceipt, [
      await eventSource("wrapper", wrapper),
      await eventSource("nft", nft),
    ]);

    expect(eventNames(unwrapEvents)).to.deep.equal([
      "wrapper.Approval",
      "wrapper.Transfer",
      "nft.Transfer",
    ]);
    expect(unwrapEvents[0].args.owner).to.equal(buyerAddress);
    expect(unwrapEvents[0].args.approved).to.equal(ZERO_ADDRESS);
    expect(unwrapEvents[1].args.from).to.equal(buyerAddress);
    expect(unwrapEvents[1].args.to).to.equal(ZERO_ADDRESS);
    expect(unwrapEvents[2].args.from).to.equal(wrapperAddress);
    expect(unwrapEvents[2].args.to).to.equal(buyerAddress);
    expect(unwrapEvents[2].args.tokenId).to.equal(TOKEN_ID);

    expect(await nft.ownerOf(TOKEN_ID)).to.equal(buyerAddress);
    expect(await nft.getApproved(TOKEN_ID)).to.equal(ZERO_ADDRESS);
    await expectRevertReason(
      wrapper.ownerOf(wrappedId),
      "ERC721: owner query for nonexistent token"
    );
    await expectRevertReason(
      wrapper.tokenURI(wrappedId),
      "ERC721Metadata: URI query for nonexistent token"
    );
    await expectRevertReason(
      wrapper.depositOf(wrappedId),
      "ERC721: query for nonexistent token"
    );
    await expectRevertReason(
      wrapper.taxRateOf(wrappedId),
      "ERC721: query for nonexistent token"
    );
    await expectRevertReason(
      wrapper.collectionFrequencyOf(wrappedId),
      "ERC721: query for nonexistent token"
    );
    expect(await wrapper.valuationOf(wrappedId)).to.equal(ZERO);
    expect(await wrapper.beneficiaryOf(wrappedId)).to.equal(ZERO_ADDRESS);
    expect(await wrapper.taxationCollected(wrappedId)).to.equal(takeoverTax);
    expect(await wrapper.balanceOf(buyerAddress)).to.equal(ZERO);
    expect(await ethers.provider.getBalance(wrapperAddress)).to.equal(ZERO);
  });
});
