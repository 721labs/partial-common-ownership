import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ethers as ethersLibrary } from "ethers";
import hre from "hardhat";

import type { HardhatEthersProvider } from "@nomicfoundation/hardhat-ethers/types";
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

const ZERO_ADDRESS = ethersLibrary.ZeroAddress;
const ZERO = BigInt(0);
const ONE_ETHER = ethersLibrary.parseEther("1");
const TWO_ETHER = ethersLibrary.parseEther("2");
const THREE_ETHER = ethersLibrary.parseEther("3");
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
    assert.fail(`Expected transaction to revert with: ${expectedReason}`);
  }
  if (
    ethersLibrary.isError(caught, "CALL_EXCEPTION") &&
    caught.reason !== null
  ) {
    assert.equal(caught.reason, expectedReason);
    return;
  }
  if (caught instanceof Error) {
    assert.ok(caught.message.includes(expectedReason));
    return;
  }
  assert.fail(`Unexpected rejection value: ${String(caught)}`);
}

function eventNames(events: DecodedEvent[]): string[] {
  return events.map(({ source, name }) => `${source}.${name}`);
}

async function initializeNetwork(
  provider: HardhatEthersProvider
): Promise<void> {
  await provider.send("evm_setNextBlockTimestamp", [NETWORK_START]);
  await provider.send("evm_mine", []);
}

async function setNextTimestamp(
  provider: HardhatEthersProvider,
  timestamp: number
): Promise<void> {
  await provider.send("evm_setNextBlockTimestamp", [timestamp]);
}

describe("Hardhat interoperability smokes", function () {
  it("deploys and reads deterministic PCO configuration", async function () {
    const { ethers } = await hre.network.create("hardhat");
    await initializeNetwork(ethers.provider);
    const [, beneficiary] = await ethers.getSigners();
    const beneficiaryAddress = await beneficiary.getAddress();
    const pcoFactory = await ethers.getContractFactory("TestPCOToken");
    const pco = await pcoFactory.deploy(beneficiaryAddress);
    await pco.waitForDeployment();
    const pcoAddress = await pco.getAddress();

    assert.equal(await pco.supportsInterface("0x01ffc9a7"), true);
    assert.equal(await pco.supportsInterface("0x80ac58cd"), true);
    assert.equal(await pco.supportsInterface("0x5b5e139f"), false);

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
      assert.equal(await pco.ownerOf(tokenId), pcoAddress);
      assert.equal(await pco.beneficiaryOf(tokenId), beneficiaryAddress);
      assert.equal(await pco.taxRateOf(tokenId), expectedRates[index]);
      assert.equal(
        await pco.collectionFrequencyOf(tokenId),
        expectedFrequencies[index]
      );
      assert.equal(await pco.valuationOf(tokenId), ZERO);
      assert.equal(await pco.depositOf(tokenId), ZERO);
      assert.equal(await pco.taxationCollected(tokenId), ZERO);
      assert.equal(await pco.lastCollectionTimeOf(tokenId), ZERO);
    }
  });

  it("acquires, collects tax, and exits with ordered events and conserved balances", async function () {
    const { ethers } = await hre.network.create("hardhat");
    await initializeNetwork(ethers.provider);
    const [collector, beneficiary, alice] = await ethers.getSigners();
    const beneficiaryAddress = await beneficiary.getAddress();
    const aliceAddress = await alice.getAddress();
    const pcoFactory = await ethers.getContractFactory("TestPCOToken");
    const pco = await pcoFactory.deploy(beneficiaryAddress);
    await pco.waitForDeployment();
    const pcoAddress = await pco.getAddress();

    const valuation = ethersLibrary.parseEther("9");
    const initialDeposit = TWO_ETHER;

    await setNextTimestamp(ethers.provider, ACQUISITION_TIME);
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

    assert.deepEqual(eventNames(acquisitionEvents), [
      "pco.LogValuation",
      "pco.Approval",
      "pco.Transfer",
      "pco.LogLeaseTakeover",
    ]);
    assert.equal(acquisitionEvents[0].args.tokenId, TOKEN_ID);
    assert.equal(acquisitionEvents[0].args.newValuation, valuation);
    assert.equal(acquisitionEvents[1].args.owner, pcoAddress);
    assert.equal(acquisitionEvents[1].args.approved, ZERO_ADDRESS);
    assert.equal(acquisitionEvents[2].args.from, pcoAddress);
    assert.equal(acquisitionEvents[2].args.to, aliceAddress);
    assert.equal(acquisitionEvents[3].args.owner, aliceAddress);
    assert.equal(acquisitionEvents[3].args.newValuation, valuation);

    assert.equal(await pco.ownerOf(TOKEN_ID), aliceAddress);
    assert.equal(await pco.valuationOf(TOKEN_ID), valuation);
    assert.equal(await pco.depositOf(TOKEN_ID), initialDeposit);
    assert.equal(
      await pco.lastCollectionTimeOf(TOKEN_ID),
      BigInt(ACQUISITION_TIME)
    );
    assert.equal(
      await ethers.provider.getBalance(pcoAddress),
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

    await setNextTimestamp(ethers.provider, COLLECTION_TIME);
    const collection = await (pco.connect(collector) as Contract).collectTax(
      TOKEN_ID
    );
    const collectionReceipt = await requiredReceipt(collection);
    const collectionEvents = decodeEvents(collectionReceipt, [
      await eventSource("pco", pco),
    ]);

    assert.deepEqual(eventNames(collectionEvents), [
      "pco.LogCollection",
      "pco.LogRemittance",
    ]);
    assert.equal(collectionEvents[0].args.tokenId, TOKEN_ID);
    assert.equal(collectionEvents[0].args.collected, firstTax);
    assert.equal(collectionEvents[1].args.trigger, BigInt(3));
    assert.equal(collectionEvents[1].args.recipient, beneficiaryAddress);
    assert.equal(collectionEvents[1].args.amount, firstTax);

    assert.equal(
      (await ethers.provider.getBalance(beneficiaryAddress)) -
        beneficiaryBeforeCollection,
      firstTax
    );
    assert.equal(await pco.depositOf(TOKEN_ID), initialDeposit - firstTax);
    assert.equal(await pco.taxationCollected(TOKEN_ID), firstTax);
    assert.equal(
      await pco.taxCollectedSinceLastTransferOf(TOKEN_ID),
      firstTax
    );
    assert.equal(
      await pco.lastCollectionTimeOf(TOKEN_ID),
      BigInt(COLLECTION_TIME)
    );
    assert.equal(
      await ethers.provider.getBalance(pcoAddress),
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

    await setNextTimestamp(ethers.provider, EXIT_TIME);
    const exit = await (pco.connect(alice) as Contract).exit(TOKEN_ID);
    const exitReceipt = await requiredReceipt(exit);
    const exitEvents = decodeEvents(exitReceipt, [
      await eventSource("pco", pco),
    ]);

    assert.deepEqual(eventNames(exitEvents), [
      "pco.LogCollection",
      "pco.LogRemittance",
      "pco.LogRemittance",
      "pco.LogValuation",
      "pco.Approval",
      "pco.Transfer",
      "pco.LogForeclosure",
    ]);
    assert.equal(exitEvents[0].args.collected, exitTax);
    assert.equal(exitEvents[1].args.trigger, BigInt(3));
    assert.equal(exitEvents[1].args.recipient, beneficiaryAddress);
    assert.equal(exitEvents[1].args.amount, exitTax);
    assert.equal(exitEvents[2].args.trigger, BigInt(1));
    assert.equal(exitEvents[2].args.recipient, aliceAddress);
    assert.equal(exitEvents[2].args.amount, returnedDeposit);
    assert.equal(exitEvents[3].args.newValuation, ZERO);
    assert.equal(exitEvents[4].args.owner, aliceAddress);
    assert.equal(exitEvents[4].args.approved, ZERO_ADDRESS);
    assert.equal(exitEvents[5].args.from, aliceAddress);
    assert.equal(exitEvents[5].args.to, pcoAddress);
    assert.equal(exitEvents[6].args.prevOwner, aliceAddress);

    const exitGas = exitReceipt.gasUsed * exitReceipt.gasPrice;
    assert.equal(
      await ethers.provider.getBalance(aliceAddress),
      aliceBeforeExit + returnedDeposit - exitGas
    );
    assert.equal(
      (await ethers.provider.getBalance(beneficiaryAddress)) -
        beneficiaryBeforeExit,
      exitTax
    );
    assert.equal(await ethers.provider.getBalance(pcoAddress), ZERO);
    assert.equal(await pco.ownerOf(TOKEN_ID), pcoAddress);
    assert.equal(await pco.valuationOf(TOKEN_ID), ZERO);
    assert.equal(await pco.depositOf(TOKEN_ID), ZERO);
    assert.equal(await pco.taxationCollected(TOKEN_ID), firstTax + exitTax);
    assert.equal(await pco.taxCollectedSinceLastTransferOf(TOKEN_ID), ZERO);
    assert.equal(
      await pco.lastCollectionTimeOf(TOKEN_ID),
      BigInt(EXIT_TIME)
    );
    assert.equal(await pco.foreclosed(TOKEN_ID), true);
  });

  it("approves, wraps, takes over, and unwraps with custody and metadata cleanup", async function () {
    const { ethers } = await hre.network.create("hardhat");
    await initializeNetwork(ethers.provider);
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
      ethersLibrary.keccak256(
        ethersLibrary.AbiCoder.defaultAbiCoder().encode(
          ["address", "uint256"],
          [nftAddress, TOKEN_ID]
        )
      )
    );
    assert.equal(wrappedId, independentlyDerivedId);

    await setNextTimestamp(ethers.provider, APPROVAL_TIME);
    const approval = await (nft.connect(originator) as Contract).approve(
      wrapperAddress,
      TOKEN_ID
    );
    const approvalReceipt = await requiredReceipt(approval);
    const approvalEvents = decodeEvents(approvalReceipt, [
      await eventSource("nft", nft),
    ]);
    assert.deepEqual(eventNames(approvalEvents), ["nft.Approval"]);
    assert.equal(approvalEvents[0].args.owner, originatorAddress);
    assert.equal(approvalEvents[0].args.approved, wrapperAddress);
    assert.equal(approvalEvents[0].args.tokenId, TOKEN_ID);

    await setNextTimestamp(ethers.provider, WRAP_TIME);
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

    assert.deepEqual(eventNames(wrapEvents), [
      "nft.Transfer",
      "wrapper.Transfer",
      "wrapper.LogValuation",
      "wrapper.LogBeneficiaryUpdated",
      "wrapper.LogTokenWrapped",
    ]);
    assert.equal(wrapEvents[0].args.from, originatorAddress);
    assert.equal(wrapEvents[0].args.to, wrapperAddress);
    assert.equal(wrapEvents[1].args.from, ZERO_ADDRESS);
    assert.equal(wrapEvents[1].args.to, originatorAddress);
    assert.equal(wrapEvents[2].args.newValuation, initialValuation);
    assert.equal(wrapEvents[3].args.newBeneficiary, buyerAddress);
    assert.equal(wrapEvents[4].args.contractAddress, nftAddress);
    assert.equal(wrapEvents[4].args.tokenId, TOKEN_ID);
    assert.equal(wrapEvents[4].args.wrappedTokenId, wrappedId);

    assert.equal(await nft.ownerOf(TOKEN_ID), wrapperAddress);
    assert.equal(await nft.getApproved(TOKEN_ID), ZERO_ADDRESS);
    assert.equal(await wrapper.ownerOf(wrappedId), originatorAddress);
    assert.equal(await wrapper.tokenURI(wrappedId), "721.dev/1");
    assert.equal(await wrapper.valuationOf(wrappedId), initialValuation);
    assert.equal(await wrapper.depositOf(wrappedId), initialDeposit);
    assert.equal(await wrapper.beneficiaryOf(wrappedId), buyerAddress);
    assert.equal(await wrapper.taxRateOf(wrappedId), TAX_RATE_MINIMUM);
    assert.equal(
      await wrapper.collectionFrequencyOf(wrappedId),
      BigInt(TEN_YEARS)
    );
    assert.equal(await wrapper.lastCollectionTimeOf(wrappedId), ZERO);
    assert.equal(
      await ethers.provider.getBalance(wrapperAddress),
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

    await setNextTimestamp(ethers.provider, TAKEOVER_TIME);
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

    assert.deepEqual(eventNames(takeoverEvents), [
      "wrapper.LogCollection",
      "wrapper.LogRemittance",
      "wrapper.LogRemittance",
      "wrapper.LogValuation",
      "wrapper.Approval",
      "wrapper.Transfer",
      "wrapper.LogLeaseTakeover",
    ]);
    assert.equal(takeoverEvents[0].args.collected, takeoverTax);
    assert.equal(takeoverEvents[1].args.trigger, BigInt(3));
    assert.equal(takeoverEvents[1].args.recipient, buyerAddress);
    assert.equal(takeoverEvents[1].args.amount, takeoverTax);
    assert.equal(takeoverEvents[2].args.trigger, BigInt(0));
    assert.equal(takeoverEvents[2].args.recipient, originatorAddress);
    assert.equal(takeoverEvents[2].args.amount, takeoverRemittance);
    assert.equal(takeoverEvents[3].args.newValuation, buyerValuation);
    assert.equal(takeoverEvents[4].args.owner, originatorAddress);
    assert.equal(takeoverEvents[4].args.approved, ZERO_ADDRESS);
    assert.equal(takeoverEvents[5].args.from, originatorAddress);
    assert.equal(takeoverEvents[5].args.to, buyerAddress);
    assert.equal(takeoverEvents[6].args.owner, buyerAddress);
    assert.equal(takeoverEvents[6].args.newValuation, buyerValuation);

    const takeoverGas = takeoverReceipt.gasUsed * takeoverReceipt.gasPrice;
    assert.equal(
      (await ethers.provider.getBalance(originatorAddress)) -
        originatorBeforeTakeover,
      takeoverRemittance
    );
    assert.equal(
      await ethers.provider.getBalance(buyerAddress),
      buyerBeforeTakeover - initialValuation + takeoverTax - takeoverGas
    );
    assert.equal(await ethers.provider.getBalance(wrapperAddress), ZERO);
    assert.equal(await wrapper.ownerOf(wrappedId), buyerAddress);
    assert.equal(await wrapper.valuationOf(wrappedId), buyerValuation);
    assert.equal(await wrapper.depositOf(wrappedId), ZERO);
    assert.equal(await wrapper.taxationCollected(wrappedId), takeoverTax);
    assert.equal(
      await wrapper.taxCollectedSinceLastTransferOf(wrappedId),
      ZERO
    );
    assert.equal(
      await wrapper.lastCollectionTimeOf(wrappedId),
      BigInt(TAKEOVER_TIME)
    );
    assert.equal(await nft.ownerOf(TOKEN_ID), wrapperAddress);
    assert.equal(await wrapper.tokenURI(wrappedId), "721.dev/1");

    await setNextTimestamp(ethers.provider, UNWRAP_TIME);
    const unwrap = await (wrapper.connect(originator) as Contract).unwrap(
      wrappedId
    );
    const unwrapReceipt = await requiredReceipt(unwrap);
    const unwrapEvents = decodeEvents(unwrapReceipt, [
      await eventSource("wrapper", wrapper),
      await eventSource("nft", nft),
    ]);

    assert.deepEqual(eventNames(unwrapEvents), [
      "wrapper.Approval",
      "wrapper.Transfer",
      "nft.Transfer",
    ]);
    assert.equal(unwrapEvents[0].args.owner, buyerAddress);
    assert.equal(unwrapEvents[0].args.approved, ZERO_ADDRESS);
    assert.equal(unwrapEvents[1].args.from, buyerAddress);
    assert.equal(unwrapEvents[1].args.to, ZERO_ADDRESS);
    assert.equal(unwrapEvents[2].args.from, wrapperAddress);
    assert.equal(unwrapEvents[2].args.to, buyerAddress);
    assert.equal(unwrapEvents[2].args.tokenId, TOKEN_ID);

    assert.equal(await nft.ownerOf(TOKEN_ID), buyerAddress);
    assert.equal(await nft.getApproved(TOKEN_ID), ZERO_ADDRESS);
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
    assert.equal(await wrapper.valuationOf(wrappedId), ZERO);
    assert.equal(await wrapper.beneficiaryOf(wrappedId), ZERO_ADDRESS);
    assert.equal(await wrapper.taxationCollected(wrappedId), takeoverTax);
    assert.equal(await wrapper.balanceOf(buyerAddress), ZERO);
    assert.equal(await ethers.provider.getBalance(wrapperAddress), ZERO);
  });
});
