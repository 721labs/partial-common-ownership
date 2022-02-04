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
  let testTokenURI = "i.am.a.domain.name";
  let wrapperName = "Partial Common Ownership Token Wrapper";
  let wrapperSymbol = "wPCO";

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
  let deployerAddress;
  let wrappedTokenIds = {};

  const TAX_NUMERATOR = ethers.BigNumber.from(config.taxRate);

  const TAX_PERIOD_AS_SECONDS = taxationPeriodToSeconds(
    config.collectionFrequency
  );

  //$ Helpers

  /**
   * Deploys the ERC721 contract
   * @param factory contract to deploy
   * @returns contract interface
   */
  async function deployERC721(factory): Promise<any> {
    const contract = await factory.deploy(
      TEST_NAME,
      TEST_SYMBOL,
      testTokenURI,
      GLOBAL_TRX_CONFIG
    );

    let res = await contract.deployed();
    expect(contract.address).to.not.be.null;

    return contract;
  }

  /**
   * Deploys the Wrapper contract
   * @param factory contract to deploy
   * @returns contract interface
   */
  async function deployWrapper(factory): Promise<any> {
    const contract = await factory.deploy(
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

  //$ Setup

  before(async function () {
    provider = new ethers.providers.Web3Provider(web3.currentProvider);
    signers = await ethers.getSigners();
    factory721 = await ethers.getContractFactory("Test721Token");
    factoryWrapper = await ethers.getContractFactory("Test721Wrapper");

    //$ Set up contracts

    contract721 = await deployERC721(factory721);
    contractWrapper = await deployWrapper(factoryWrapper);

    //$ Set up wallets

    deployerAddress = signers[0].address;
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
    wrappedTokenIds[TOKENS.ONE] = ethers.BigNumber.from(ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["address","uint"],[contract721.address, TOKENS.ONE])));
    wrappedTokenIds[TOKENS.TWO] = ethers.BigNumber.from(ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["address","uint"],[contract721.address, TOKENS.TWO])));
    wrappedTokenIds[TOKENS.THREE] = ethers.BigNumber.from(ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["address","uint"],[contract721.address, TOKENS.THREE])));

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

  describe.only("Test721Token", async function () {
    context("succeeds", async function () {
      it("mints three tokens during construction", async function () {
        expect(await contract721.ownerOf(TOKENS.ONE)).to.equal(deployerAddress);
        expect(await contract721.ownerOf(TOKENS.TWO)).to.equal(deployerAddress);
        expect(await contract721.ownerOf(TOKENS.THREE)).to.equal(deployerAddress);
      });
    });
  });

  describe.only("#constructor()", async function () {
    context("succeeds", async function () {
      it(`Constructs the wrapper succesfully`, async function () {
        expect(await contractWrapper.name()).to.equal(wrapperName);
        expect(await contractWrapper.symbol()).to.equal(wrapperSymbol);
      });
    });
  });

  describe.only("#acquire()", async function () {
    context("succeeds", async function () {
      it(`Acquires the token succesfully`, async function () {
        await contract721.approve(contractWrapper.address, TOKENS.ONE);

        expect(await contractWrapper.acquire(contract721.address, beneficiary.address, TOKENS.ONE, 100, TAX_NUMERATOR, config.collectionFrequency))
          .to.emit(contractWrapper, 'Acquire')
          .withArgs(wrappedTokenIds[TOKENS.ONE]);
        expect(await contractWrapper.ownerOf(wrappedTokenIds[TOKENS.ONE])).to.equal(deployerAddress);
        expect(await contractWrapper.priceOf(wrappedTokenIds[TOKENS.ONE])).to.equal(100);
        expect(await contractWrapper.beneficiaryOf(wrappedTokenIds[TOKENS.ONE])).to.equal(beneficiary.address);
        expect(await contractWrapper.taxRateOf(wrappedTokenIds[TOKENS.ONE])).to.equal(TAX_NUMERATOR);
        expect(await contractWrapper.taxPeriodOf(wrappedTokenIds[TOKENS.ONE])).to.equal(TAX_PERIOD_AS_SECONDS);
      });
    });

    context("fails", async function () {
      it(`Cannot acquire the token if not approved`, async function () {
        try {
          await contractWrapper.acquire(contract721.address, beneficiary.address, TOKENS.ONE, 100, TAX_NUMERATOR, config.collectionFrequency);
        } catch (error) {
          expect(error.message).to.equal(
            "VM Exception while processing transaction: reverted with reason string \'ERC721: transfer caller is not owner nor approved\'"
          );
        }
      });
    });
  });

  describe.only("#tokenURI()", async function () {
    context("succeeds", async function () {
      it(`Can get the tokenURI via the wrapper succesfully`, async function () {
        await contract721.approve(contractWrapper.address, TOKENS.ONE);

        await contractWrapper.acquire(contract721.address, beneficiary.address, TOKENS.ONE, 100, TAX_NUMERATOR, config.collectionFrequency);
        
        expect(await contractWrapper.tokenURI(wrappedTokenIds[TOKENS.ONE])).to.equal(testTokenURI);
      });
    });
  });

}

export default tests;
