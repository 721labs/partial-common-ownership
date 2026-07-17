import { expect } from "chai";
import { ethers, network } from "hardhat";

import type { BigNumber, Contract, ContractReceipt } from "ethers";

type EventSource = {
  label: string;
  contract: Contract;
};

type DecodedEvent = {
  source: string;
  name: string;
  args: any;
};

const ZERO_ADDRESS = ethers.constants.AddressZero;
const ZERO = ethers.constants.Zero;
const ONE_ETHER = ethers.utils.parseEther("1");
const TWO_ETHER = ethers.utils.parseEther("2");
const THREE_ETHER = ethers.utils.parseEther("3");
const NINETY_DAYS = 90 * 24 * 60 * 60;
const TEN_YEARS = 3650 * 24 * 60 * 60;
const TAX_DENOMINATOR = ethers.BigNumber.from("1000000000000");

const NETWORK_START = 2_000_000_000;
const ACQUISITION_TIME = 2_000_010_000;
const COLLECTION_TIME = ACQUISITION_TIME + 10 * 24 * 60 * 60;
const EXIT_TIME = COLLECTION_TIME + 1;
const APPROVAL_TIME = 2_000_019_999;
const WRAP_TIME = 2_000_020_000;
const TAKEOVER_TIME = WRAP_TIME + 100;
const UNWRAP_TIME = TAKEOVER_TIME + 1;

const TOKEN_ID = 1;
const TAX_RATE_FIVE_PERCENT = ethers.BigNumber.from("50000000000");
const TAX_RATE_MINIMUM = ethers.BigNumber.from(1);

function calculateTax(
  valuation: BigNumber,
  elapsed: number,
  frequency: number,
  taxRate: BigNumber
): BigNumber {
  return valuation
    .mul(elapsed)
    .div(frequency)
    .mul(taxRate)
    .div(TAX_DENOMINATOR);
}

function decodeEvents(
  receipt: ContractReceipt,
  sources: EventSource[]
): DecodedEvent[] {
  const events: DecodedEvent[] = [];

  for (const log of receipt.logs) {
    const source = sources.find(
      ({ contract }) =>
        contract.address.toLowerCase() === log.address.toLowerCase()
    );
    if (!source) continue;

    try {
      const parsed = source.contract.interface.parseLog(log);
      events.push({
        source: source.label,
        name: parsed.name,
        args: parsed.args,
      });
    } catch {
      // Ignore logs that are not described by the source contract's interface.
    }
  }

  return events;
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
    const pcoFactory = await ethers.getContractFactory("TestPCOToken");
    const pco = await pcoFactory.deploy(beneficiary.address);
    await pco.deployed();

    expect(await pco.supportsInterface("0x01ffc9a7")).to.equal(true);
    expect(await pco.supportsInterface("0x80ac58cd")).to.equal(true);
    expect(await pco.supportsInterface("0x5b5e139f")).to.equal(false);

    const expectedRates = [
      ethers.BigNumber.from("50000000000"),
      ethers.BigNumber.from("1000000000000"),
      ethers.BigNumber.from("1000000000000"),
    ];
    const expectedFrequencies = [90, 30, 365].map(
      (days) => days * 24 * 60 * 60
    );

    for (let index = 0; index < 3; index++) {
      const tokenId = index + 1;
      expect(await pco.ownerOf(tokenId)).to.equal(pco.address);
      expect(await pco.beneficiaryOf(tokenId)).to.equal(beneficiary.address);
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
    const pcoFactory = await ethers.getContractFactory("TestPCOToken");
    const pco = await pcoFactory.deploy(beneficiary.address);
    await pco.deployed();

    const valuation = ethers.utils.parseEther("9");
    const initialDeposit = TWO_ETHER;

    await setNextTimestamp(ACQUISITION_TIME);
    const acquisition = await pco
      .connect(alice)
      .takeoverLease(TOKEN_ID, valuation, ZERO, { value: initialDeposit });
    const acquisitionReceipt = await acquisition.wait();
    const acquisitionEvents = decodeEvents(acquisitionReceipt, [
      { label: "pco", contract: pco },
    ]);

    expect(eventNames(acquisitionEvents)).to.deep.equal([
      "pco.LogValuation",
      "pco.Approval",
      "pco.Transfer",
      "pco.LogLeaseTakeover",
    ]);
    expect(acquisitionEvents[0].args.tokenId).to.equal(TOKEN_ID);
    expect(acquisitionEvents[0].args.newValuation).to.equal(valuation);
    expect(acquisitionEvents[1].args.owner).to.equal(pco.address);
    expect(acquisitionEvents[1].args.approved).to.equal(ZERO_ADDRESS);
    expect(acquisitionEvents[2].args.from).to.equal(pco.address);
    expect(acquisitionEvents[2].args.to).to.equal(alice.address);
    expect(acquisitionEvents[3].args.owner).to.equal(alice.address);
    expect(acquisitionEvents[3].args.newValuation).to.equal(valuation);

    expect(await pco.ownerOf(TOKEN_ID)).to.equal(alice.address);
    expect(await pco.valuationOf(TOKEN_ID)).to.equal(valuation);
    expect(await pco.depositOf(TOKEN_ID)).to.equal(initialDeposit);
    expect(await pco.lastCollectionTimeOf(TOKEN_ID)).to.equal(ACQUISITION_TIME);
    expect(await ethers.provider.getBalance(pco.address)).to.equal(
      initialDeposit
    );

    const firstTax = calculateTax(
      valuation,
      COLLECTION_TIME - ACQUISITION_TIME,
      NINETY_DAYS,
      TAX_RATE_FIVE_PERCENT
    );
    const beneficiaryBeforeCollection = await beneficiary.getBalance();

    await setNextTimestamp(COLLECTION_TIME);
    const collection = await pco.connect(collector).collectTax(TOKEN_ID);
    const collectionReceipt = await collection.wait();
    const collectionEvents = decodeEvents(collectionReceipt, [
      { label: "pco", contract: pco },
    ]);

    expect(eventNames(collectionEvents)).to.deep.equal([
      "pco.LogCollection",
      "pco.LogRemittance",
    ]);
    expect(collectionEvents[0].args.tokenId).to.equal(TOKEN_ID);
    expect(collectionEvents[0].args.collected).to.equal(firstTax);
    expect(collectionEvents[1].args.trigger).to.equal(3);
    expect(collectionEvents[1].args.recipient).to.equal(beneficiary.address);
    expect(collectionEvents[1].args.amount).to.equal(firstTax);

    expect(
      (await beneficiary.getBalance()).sub(beneficiaryBeforeCollection)
    ).to.equal(firstTax);
    expect(await pco.depositOf(TOKEN_ID)).to.equal(
      initialDeposit.sub(firstTax)
    );
    expect(await pco.taxationCollected(TOKEN_ID)).to.equal(firstTax);
    expect(await pco.taxCollectedSinceLastTransferOf(TOKEN_ID)).to.equal(
      firstTax
    );
    expect(await pco.lastCollectionTimeOf(TOKEN_ID)).to.equal(COLLECTION_TIME);
    expect(await ethers.provider.getBalance(pco.address)).to.equal(
      initialDeposit.sub(firstTax)
    );

    const exitTax = calculateTax(
      valuation,
      EXIT_TIME - COLLECTION_TIME,
      NINETY_DAYS,
      TAX_RATE_FIVE_PERCENT
    );
    const returnedDeposit = initialDeposit.sub(firstTax).sub(exitTax);
    const aliceBeforeExit = await alice.getBalance();
    const beneficiaryBeforeExit = await beneficiary.getBalance();

    await setNextTimestamp(EXIT_TIME);
    const exit = await pco.connect(alice).exit(TOKEN_ID);
    const exitReceipt = await exit.wait();
    const exitEvents = decodeEvents(exitReceipt, [
      { label: "pco", contract: pco },
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
    expect(exitEvents[1].args.trigger).to.equal(3);
    expect(exitEvents[1].args.recipient).to.equal(beneficiary.address);
    expect(exitEvents[1].args.amount).to.equal(exitTax);
    expect(exitEvents[2].args.trigger).to.equal(1);
    expect(exitEvents[2].args.recipient).to.equal(alice.address);
    expect(exitEvents[2].args.amount).to.equal(returnedDeposit);
    expect(exitEvents[3].args.newValuation).to.equal(ZERO);
    expect(exitEvents[4].args.owner).to.equal(alice.address);
    expect(exitEvents[4].args.approved).to.equal(ZERO_ADDRESS);
    expect(exitEvents[5].args.from).to.equal(alice.address);
    expect(exitEvents[5].args.to).to.equal(pco.address);
    expect(exitEvents[6].args.prevOwner).to.equal(alice.address);

    const exitGas = exitReceipt.gasUsed.mul(exitReceipt.effectiveGasPrice);
    expect(await alice.getBalance()).to.equal(
      aliceBeforeExit.add(returnedDeposit).sub(exitGas)
    );
    expect(
      (await beneficiary.getBalance()).sub(beneficiaryBeforeExit)
    ).to.equal(exitTax);
    expect(await ethers.provider.getBalance(pco.address)).to.equal(ZERO);
    expect(await pco.ownerOf(TOKEN_ID)).to.equal(pco.address);
    expect(await pco.valuationOf(TOKEN_ID)).to.equal(ZERO);
    expect(await pco.depositOf(TOKEN_ID)).to.equal(ZERO);
    expect(await pco.taxationCollected(TOKEN_ID)).to.equal(
      firstTax.add(exitTax)
    );
    expect(await pco.taxCollectedSinceLastTransferOf(TOKEN_ID)).to.equal(ZERO);
    expect(await pco.lastCollectionTimeOf(TOKEN_ID)).to.equal(EXIT_TIME);
    expect(await pco.foreclosed(TOKEN_ID)).to.equal(true);
  });

  it("approves, wraps, takes over, and unwraps with custody and metadata cleanup", async function () {
    const [originator, , buyer] = await ethers.getSigners();
    const nftFactory = await ethers.getContractFactory("TestNFT");
    const nft = await nftFactory.connect(originator).deploy();
    await nft.deployed();
    const wrapperFactory = await ethers.getContractFactory("TestWrapper");
    const wrapper = await wrapperFactory.connect(originator).deploy();
    await wrapper.deployed();

    const initialValuation = ONE_ETHER;
    const buyerValuation = TWO_ETHER;
    const initialDeposit = THREE_ETHER;
    const wrappedId = await wrapper.wrappedTokenId(nft.address, TOKEN_ID);
    const independentlyDerivedId = ethers.BigNumber.from(
      ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["address", "uint256"],
          [nft.address, TOKEN_ID]
        )
      )
    );
    expect(wrappedId).to.equal(independentlyDerivedId);

    await setNextTimestamp(APPROVAL_TIME);
    const approval = await nft
      .connect(originator)
      .approve(wrapper.address, TOKEN_ID);
    const approvalReceipt = await approval.wait();
    const approvalEvents = decodeEvents(approvalReceipt, [
      { label: "nft", contract: nft },
    ]);
    expect(eventNames(approvalEvents)).to.deep.equal(["nft.Approval"]);
    expect(approvalEvents[0].args.owner).to.equal(originator.address);
    expect(approvalEvents[0].args.approved).to.equal(wrapper.address);
    expect(approvalEvents[0].args.tokenId).to.equal(TOKEN_ID);

    await setNextTimestamp(WRAP_TIME);
    const wrap = await wrapper
      .connect(originator)
      .wrap(
        nft.address,
        TOKEN_ID,
        initialValuation,
        buyer.address,
        TAX_RATE_MINIMUM,
        3650,
        { value: initialDeposit }
      );
    const wrapReceipt = await wrap.wait();
    const wrapEvents = decodeEvents(wrapReceipt, [
      { label: "nft", contract: nft },
      { label: "wrapper", contract: wrapper },
    ]);

    expect(eventNames(wrapEvents)).to.deep.equal([
      "nft.Transfer",
      "wrapper.Transfer",
      "wrapper.LogValuation",
      "wrapper.LogBeneficiaryUpdated",
      "wrapper.LogTokenWrapped",
    ]);
    expect(wrapEvents[0].args.from).to.equal(originator.address);
    expect(wrapEvents[0].args.to).to.equal(wrapper.address);
    expect(wrapEvents[1].args.from).to.equal(ZERO_ADDRESS);
    expect(wrapEvents[1].args.to).to.equal(originator.address);
    expect(wrapEvents[2].args.newValuation).to.equal(initialValuation);
    expect(wrapEvents[3].args.newBeneficiary).to.equal(buyer.address);
    expect(wrapEvents[4].args.contractAddress).to.equal(nft.address);
    expect(wrapEvents[4].args.tokenId).to.equal(TOKEN_ID);
    expect(wrapEvents[4].args.wrappedTokenId).to.equal(wrappedId);

    expect(await nft.ownerOf(TOKEN_ID)).to.equal(wrapper.address);
    expect(await nft.getApproved(TOKEN_ID)).to.equal(ZERO_ADDRESS);
    expect(await wrapper.ownerOf(wrappedId)).to.equal(originator.address);
    expect(await wrapper.tokenURI(wrappedId)).to.equal("721.dev/1");
    expect(await wrapper.valuationOf(wrappedId)).to.equal(initialValuation);
    expect(await wrapper.depositOf(wrappedId)).to.equal(initialDeposit);
    expect(await wrapper.beneficiaryOf(wrappedId)).to.equal(buyer.address);
    expect(await wrapper.taxRateOf(wrappedId)).to.equal(TAX_RATE_MINIMUM);
    expect(await wrapper.collectionFrequencyOf(wrappedId)).to.equal(TEN_YEARS);
    expect(await wrapper.lastCollectionTimeOf(wrappedId)).to.equal(ZERO);
    expect(await ethers.provider.getBalance(wrapper.address)).to.equal(
      initialDeposit
    );

    const takeoverTax = calculateTax(
      initialValuation,
      TAKEOVER_TIME,
      TEN_YEARS,
      TAX_RATE_MINIMUM
    );
    const takeoverRemittance = initialValuation
      .add(initialDeposit)
      .sub(takeoverTax);
    const originatorBeforeTakeover = await originator.getBalance();
    const buyerBeforeTakeover = await buyer.getBalance();

    await setNextTimestamp(TAKEOVER_TIME);
    const takeover = await wrapper
      .connect(buyer)
      .takeoverLease(wrappedId, buyerValuation, initialValuation, {
        value: initialValuation,
      });
    const takeoverReceipt = await takeover.wait();
    const takeoverEvents = decodeEvents(takeoverReceipt, [
      { label: "wrapper", contract: wrapper },
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
    expect(takeoverEvents[1].args.trigger).to.equal(3);
    expect(takeoverEvents[1].args.recipient).to.equal(buyer.address);
    expect(takeoverEvents[1].args.amount).to.equal(takeoverTax);
    expect(takeoverEvents[2].args.trigger).to.equal(0);
    expect(takeoverEvents[2].args.recipient).to.equal(originator.address);
    expect(takeoverEvents[2].args.amount).to.equal(takeoverRemittance);
    expect(takeoverEvents[3].args.newValuation).to.equal(buyerValuation);
    expect(takeoverEvents[4].args.owner).to.equal(originator.address);
    expect(takeoverEvents[4].args.approved).to.equal(ZERO_ADDRESS);
    expect(takeoverEvents[5].args.from).to.equal(originator.address);
    expect(takeoverEvents[5].args.to).to.equal(buyer.address);
    expect(takeoverEvents[6].args.owner).to.equal(buyer.address);
    expect(takeoverEvents[6].args.newValuation).to.equal(buyerValuation);

    const takeoverGas = takeoverReceipt.gasUsed.mul(
      takeoverReceipt.effectiveGasPrice
    );
    expect(
      (await originator.getBalance()).sub(originatorBeforeTakeover)
    ).to.equal(takeoverRemittance);
    expect(await buyer.getBalance()).to.equal(
      buyerBeforeTakeover
        .sub(initialValuation)
        .add(takeoverTax)
        .sub(takeoverGas)
    );
    expect(await ethers.provider.getBalance(wrapper.address)).to.equal(ZERO);
    expect(await wrapper.ownerOf(wrappedId)).to.equal(buyer.address);
    expect(await wrapper.valuationOf(wrappedId)).to.equal(buyerValuation);
    expect(await wrapper.depositOf(wrappedId)).to.equal(ZERO);
    expect(await wrapper.taxationCollected(wrappedId)).to.equal(takeoverTax);
    expect(await wrapper.taxCollectedSinceLastTransferOf(wrappedId)).to.equal(
      ZERO
    );
    expect(await wrapper.lastCollectionTimeOf(wrappedId)).to.equal(
      TAKEOVER_TIME
    );
    expect(await nft.ownerOf(TOKEN_ID)).to.equal(wrapper.address);
    expect(await wrapper.tokenURI(wrappedId)).to.equal("721.dev/1");

    await setNextTimestamp(UNWRAP_TIME);
    const unwrap = await wrapper.connect(originator).unwrap(wrappedId);
    const unwrapReceipt = await unwrap.wait();
    const unwrapEvents = decodeEvents(unwrapReceipt, [
      { label: "wrapper", contract: wrapper },
      { label: "nft", contract: nft },
    ]);

    expect(eventNames(unwrapEvents)).to.deep.equal([
      "wrapper.Approval",
      "wrapper.Transfer",
      "nft.Transfer",
    ]);
    expect(unwrapEvents[0].args.owner).to.equal(buyer.address);
    expect(unwrapEvents[0].args.approved).to.equal(ZERO_ADDRESS);
    expect(unwrapEvents[1].args.from).to.equal(buyer.address);
    expect(unwrapEvents[1].args.to).to.equal(ZERO_ADDRESS);
    expect(unwrapEvents[2].args.from).to.equal(wrapper.address);
    expect(unwrapEvents[2].args.to).to.equal(buyer.address);
    expect(unwrapEvents[2].args.tokenId).to.equal(TOKEN_ID);

    expect(await nft.ownerOf(TOKEN_ID)).to.equal(buyer.address);
    expect(await nft.getApproved(TOKEN_ID)).to.equal(ZERO_ADDRESS);
    await expect(wrapper.ownerOf(wrappedId)).to.be.revertedWith(
      "ERC721: owner query for nonexistent token"
    );
    await expect(wrapper.tokenURI(wrappedId)).to.be.revertedWith(
      "ERC721Metadata: URI query for nonexistent token"
    );
    await expect(wrapper.depositOf(wrappedId)).to.be.revertedWith(
      "ERC721: query for nonexistent token"
    );
    await expect(wrapper.taxRateOf(wrappedId)).to.be.revertedWith(
      "ERC721: query for nonexistent token"
    );
    await expect(wrapper.collectionFrequencyOf(wrappedId)).to.be.revertedWith(
      "ERC721: query for nonexistent token"
    );
    expect(await wrapper.valuationOf(wrappedId)).to.equal(ZERO);
    expect(await wrapper.beneficiaryOf(wrappedId)).to.equal(ZERO_ADDRESS);
    expect(await wrapper.taxationCollected(wrappedId)).to.equal(takeoverTax);
    expect(await wrapper.balanceOf(buyer.address)).to.equal(ZERO);
    expect(await ethers.provider.getBalance(wrapper.address)).to.equal(ZERO);
  });
});
