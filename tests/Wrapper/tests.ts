//@ts-nocheck

import { time } from "@openzeppelin/test-helpers";

import { expect } from "chai";
import { ethers } from "hardhat";

import Wallet from "../helpers/Wallet";
import { ErrorMessages, TOKENS, Events } from "../helpers/types";
import {
  TEST_NAME,
  TEST_SYMBOL,
  INVALID_TOKEN_ID,
  ETH0,
  ETH1,
  ETH2,
  ETH3,
  ETH4,
  TAX_DENOMINATOR,
} from "../helpers/constants";
import { now } from "../helpers/Time";
import { taxationPeriodToSeconds } from "../helpers/utils";
import type { TestConfiguration } from "../helpers/types";

//$ Tests

async function tests(config: TestConfiguration): Promise<void> {
  //$ Constants
  const GLOBAL_TRX_CONFIG = {
    gasLimit: 9500000, // if gas limit is set, estimateGas isn't run superfluously, slowing tests down.
  };

  // If wallet does not redeposit funds after purchasing,
  // how many days until the entire deposit is exhausted?
  const DAYS_TILL_FORECLOSURE_WITHOUT_REDEPOSIT =
    config.collectionFrequency / (config.taxRate / 10 ** 12) + 1;

  //$ Constants declared during setup
  let provider;
  let signers;
  let factory721;
  let factoryWrapper;
  let contract721;
  let contractWrapper;
  let beneficiary;
  let alice;
  let bob;
  let wallets;
  let walletsByAddress;
  let snapshot;
  let tenMinDue;
  let deployer;
  let wrappedTokenIds = {};

  const TAX_NUMERATOR = ethers.BigNumber.from(config.taxRate);

  //$ Helpers

  /**
   * Calculates the tax due.
   * price * % of tax period completed (represented from 0 - 1) * tax rate;
   * @param price Current price
   * @param now Unix timestamp when request was made
   * @param lastCollectionTime Unix timestamp of last tax collection
   * @returns Tax due between now and last collection.
   */
  function getTaxDue(
    price: BigNumber,
    now: BigNumber,
    lastCollectionTime: BigNumber
  ): BigNumber {
    const secondsSinceLastCollection = now.sub(lastCollectionTime);
    const taxPeriodAsSeconds = taxationPeriodToSeconds(
      config.collectionFrequency
    );
    return price
      .mul(secondsSinceLastCollection)
      .div(taxPeriodAsSeconds)
      .mul(TAX_NUMERATOR)
      .div(TAX_DENOMINATOR);
  }

  /**
   * Deploys the ERC721 contract
   * @param factory contract to deploy
   * @returns contract interface
   */
  async function deployERC721(factory): Promise<any> {
    const contract = await factory.deploy(
      TEST_NAME,
      TEST_SYMBOL,
      GLOBAL_TRX_CONFIG
    );

    let res = await contract.deployed();
    expect(contract.address).to.not.be.null;

    return contract;
  }

  /**
   * Deploys the PCO contract
   * @param factory contract to deploy
   * @returns contract interface
   */
  async function deployPCO(factory): Promise<any> {
    const contract = await factory.deploy(
      signers[1].address,
      config.taxRate,
      config.collectionFrequency,
      GLOBAL_TRX_CONFIG
    );

    let res = await contract.deployed();
    expect(contract.address).to.not.be.null;

    return contract;
  }

  /**
   * Scopes a snapshot of the EVM.
   */
  async function snapshotEVM(): Promise<void> {
    snapshot = await provider.send("evm_snapshot", []);
  }

  /**
   * Executes purchase and verifies expectations.
   * @param wallet Wallet making the purchase
   * @param tokenId Token being purchased
   * @param purchasePrice Price purchasing for
   * @param currentPriceForVerification Current price
   * @param value Trx value
   * @returns Transaction Receipt
   */
  async function buy(
    wallet: Wallet,
    tokenId: TOKENS,
    purchasePrice: BigNumber,
    currentPriceForVerification: BigNumber,
    value: BigNumber
  ): Promise<{
    trx: any;
    block: any;
  }> {
    //$ Setup

    // Determine whether remittance recipient is the previous owner
    // or the beneficiary (if the token is owned by the contract). Note:
    // owner may be previous even though foreclosure is pending.
    const currentOwner = await contract.ownerOf(tokenId);
    const foreclosed = await contract.foreclosed(tokenId);
    const remittanceRecipientWallet =
      foreclosed || currentOwner === contract.address
        ? beneficiary
        : walletsByAddress[currentOwner];

    const depositBefore = await contract.depositOf(tokenId);

    let depositUponPurchase;

    // Check if foreclosed
    if (foreclosed) {
      // Entire deposit will be taken in the foreclosure
      depositUponPurchase = ETH0;
    } else {
      // Get the balance and then determine how much will be deducted by taxation
      const taxDue = getTaxDue(
        currentPriceForVerification,
        (await now()).add(1), // block timestamp
        await contract.lastCollectionTimes(tokenId)
      );

      depositUponPurchase = (await contract.depositOf(tokenId)).sub(taxDue);
    }

    //$ Buy

    const trx = await wallet.contract.buy(
      tokenId,
      purchasePrice,
      currentPriceForVerification,
      { value, ...GLOBAL_TRX_CONFIG }
    );

    const block = await provider.getBlock(trx.blockNumber);

    //$ Test Cases

    // Buy Event emitted

    expect(trx).to.emit(contract, Events.APPROVAL);

    expect(trx).to.emit(contract, Events.TRANSFER);

    expect(trx)
      .to.emit(contract, Events.BUY)
      .withArgs(tokenId, wallet.address, purchasePrice);

    // Deposit updated
    const surplus = value.sub(purchasePrice);
    expect(await contract.depositOf(tokenId)).to.equal(surplus);

    // Price updated
    expect(await contract.priceOf(tokenId)).to.equal(purchasePrice);

    // Collection timestamp updates
    expect(await contract.lastCollectionTimes(tokenId)).to.equal(
      block.timestamp
    );

    // Last transfer time
    expect(await contract.lastTransferTimes(tokenId)).to.equal(block.timestamp);

    // Owned updated
    expect(await contract.ownerOf(tokenId)).to.equal(wallet.address);

    const expectedRemittance = depositUponPurchase.add(purchasePrice);
    if (expectedRemittance.gt(0)) {
      // Remittance Event emitted
      expect(trx)
        .to.emit(contract, Events.REMITTANCE)
        .withArgs(
          tokenId,
          remittanceRecipientWallet.address,
          expectedRemittance
        );

      // Eth remitted to beneficiary
      const { delta } = await remittanceRecipientWallet.balanceDelta();
      expect(delta).to.equal(
        foreclosed
          ? depositBefore.add(expectedRemittance) // Beneficiary will receive the deposit from tax collection in addition
          : expectedRemittance
      );
    }

    //$ Cleanup

    // Baseline wallet balances
    await wallet.balance();
    await remittanceRecipientWallet.balance();

    return { trx, block };
  }

  /**
   * Verifies that, after a given amount of time, taxation due is correct.
   * @param tokenId Token being purchased
   * @param after Number of days from now to verify after
   * @returns Nothing.
   */
  async function verifyCorrectTaxOwed(
    tokenId: TOKENS,
    after: number
  ): Promise<void> {
    const lastCollectionTime = await contract.lastCollectionTimes(tokenId);

    await time.increase(after);

    const owed = await contract.taxOwed(tokenId);

    const price = await contract.priceOf(tokenId);

    const due = getTaxDue(price, owed.timestamp, lastCollectionTime);

    expect(owed.amount).to.equal(due);
  }

  /**
   * Increases time by a given amount, collects tax, and verifies that the
   * correct amount of tax was collected.
   * @param contract Contract that owns the token
   * @param tokenId Token being purchased
   * @param after Number of minutes from now to collect after
   * @param currentPrice Current token price
   * @returns Nothing.
   */
  async function collectTax(
    tokenId: TOKENS,
    after: number,
    currentPrice: BigNumber
  ): Promise<void> {
    //$ Setup

    await beneficiary.balance();

    const depositBefore = await contract.depositOf(tokenId);
    const taxCollectedSinceLastTransferBefore =
      await contract.taxCollectedSinceLastTransfer(tokenId);
    const taxCollectedBefore = await contract.taxationCollected(tokenId);

    //$ Collect

    const before = await now();

    await time.increase(time.duration.minutes(after));

    const trx = await contract._collectTax(tokenId);

    const timeAfter = await now();
    const due = getTaxDue(currentPrice, timeAfter, before);

    //$ Expectations

    // Events emitted
    expect(trx).to.emit(contract, Events.COLLECTION).withArgs(tokenId, due);

    expect(trx)
      .to.emit(contract, Events.BENEFICIARY_REMITTANCE)
      .withArgs(tokenId, due);

    // Deposit updates
    expect(await contract.depositOf(tokenId)).to.equal(depositBefore.sub(due));

    // Token collection statistics update
    expect(await contract.lastCollectionTimes(tokenId)).to.equal(timeAfter);

    expect(await contract.taxCollectedSinceLastTransfer(tokenId)).to.equal(
      taxCollectedSinceLastTransferBefore.add(due)
    );

    expect(await contract.taxationCollected(tokenId)).to.equal(
      taxCollectedBefore.add(due)
    );

    // Beneficiary is remitted the expected amount
    expect((await beneficiary.balanceDelta()).delta).to.equal(due);

    //$ Cleanup

    await beneficiary.balance();
  }

  /**
   * Verifies that a given token forecloses at the expected time.
   * Note: Allows for +/- 2s variation from shouldForecloseAt due to
   * integer division-based slippages between subsequently returned times.
   * @param contract Contract that owns the token
   * @param tokenId id of the token
   * @param shouldForecloseAt timestamp as BigNumber
   */
  async function verifyExpectedForeclosureTime(
    tokenId: TOKENS,
    shouldForecloseAt: BigNumber
  ): Promise<void> {
    expect(await contract.foreclosureTime(tokenId)).to.be.closeTo(
      shouldForecloseAt,
      2
    );
  }

  //$ Setup

  before(async function () {
    // Compute tax rate for 1ETH over 10 minutes
    const tenMin = await now();
    const prior = tenMin.sub(600);
    tenMinDue = getTaxDue(ETH1, tenMin, prior);

    provider = new ethers.providers.Web3Provider(web3.currentProvider);
    signers = await ethers.getSigners();
    factory721 = await ethers.getContractFactory("Test721Token");
    factoryWrapper = await ethers.getContractFactory("Test721Wrapper");

    //$ Set up contracts

    contract721 = await deployERC721(factory721);
    contractWrapper = await deployPCO(factoryWrapper);

    //$ Set up wallets

    deployer = signers[0].address;
    beneficiary = new Wallet(contractWrapper, signers[1]);
    alice = new Wallet(contractWrapper, signers[2]);
    bob = new Wallet(contractWrapper, signers[3]);

    wallets = [beneficiary, alice, bob];

    walletsByAddress = wallets.reduce(
      (memo, wallet) => ({ ...memo, [wallet.address]: wallet }),
      {}
    );

    await Promise.all(
      wallets.map(function (wallet) {
        return wallet.setup();
      })
    );

    // $ Create wrapped token ids: take the first 4 bytes of hash(contract, tokenId)
    wrappedTokenIds[TOKENS.ONE] = parseInt(ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["address","uint"],[contract721.address, TOKENS.ONE])).slice(2,10), 16);
    wrappedTokenIds[TOKENS.TWO] = parseInt(ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["address","uint"],[contract721.address, TOKENS.TWO])).slice(2,10), 16);
    wrappedTokenIds[TOKENS.THREE] = parseInt(ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["address","uint"],[contract721.address, TOKENS.THREE])).slice(2,10), 16);

    await snapshotEVM();
  });

  /**
   * Between each test wipe the state of the contract.
   */
  beforeEach(async function () {
    console.log("Calling beforeEach");
    // Reset contract state
    await provider.send("evm_revert", [snapshot]);
    await snapshotEVM();

    // Reset balance trackers
    await Promise.all(
      wallets.map(function (wallet) {
        return wallet.balance();
      })
    );
  });

  //$ Tests

  describe("Test721Token", async function () {
    it("mints three tokens during construction", async function () {
      expect(await contract721.ownerOf(TOKENS.ONE)).to.equal(DEPLOYER);
      expect(await contract721.ownerOf(TOKENS.TWO)).to.equal(DEPLOYER);
      expect(await contract721.ownerOf(TOKENS.THREE)).to.equal(DEPLOYER);
    });
  });

  describe("#constructor()", async function () {
    context("succeeds", async function () {
      it("Setting beneficiary", async function () {
        expect(await contractWrapper.beneficiary()).to.equal(beneficiary.address);
      });

      it(`Setting tax rate`, async function () {
        expect(await contractWrapper.taxRate()).to.equal(TAX_NUMERATOR);
      });
    });
  });

  describe("#acquire()", async function () {
    context("succeeds", async function () {
      it(`Acquiring the token`, async function () {
        await contract721.approve(contractWrapper.address, TOKENS.ONE);
        expect(await contractWrapper.acquire(contract721.address, TOKENS.ONE, 100))
          .to.emit(contractWrapper, 'Acquire')
          .withArgs(wrappedTokenIds[TOKENS.ONE]);
        expect(await contractWrapper.ownerOf(wrappedTokenIds[TOKENS.ONE])).to.equal(DEPLOYER);
        expect(await contractWrapper.priceOf(wrappedTokenIds[TOKENS.ONE])).to.equal(100);
      });
    });
  });

}

export default tests;
