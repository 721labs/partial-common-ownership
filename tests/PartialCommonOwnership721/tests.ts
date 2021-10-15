//@ts-nocheck

import { time } from "@openzeppelin/test-helpers";

import { expect } from "chai";
import { ethers } from "hardhat";

import Wallet from "../helpers/Wallet";
import { ErrorMessages, TOKENS, Events } from "./types";
import {
  TEST_NAME,
  TEST_SYMBOL,
  INVALID_TOKEN_ID,
  ETH0,
  ETH1,
  ETH2,
  ETH3,
  ETH4,
  AnnualTenMinDue,
  MonthlyTenMinDue,
  TAX_DENOMINATOR,
} from "./constants";
import { now } from "../helpers/Time";
import { taxationPeriodToSeconds, getTaxDue } from "./utils";
import type { TestConfiguration } from "./types";

//$ Tests

async function tests(config: TestConfiguration): Promise<void> {
  //$ Constants
  const GLOBAL_TRX_CONFIG = {
    gasLimit: 9500000, // if gas limit is set, estimateGas isn't run superfluously, slowing tests down.
  };

  //$ Constants declared during setup
  let taxRate;
  let provider;
  let signers;
  let factory;
  let monthlyContract;
  let contract;
  let monthlyContractAddress;
  let contractAddress;
  let beneficiary;
  let alice;
  let bob;
  let monthlyAlice;
  let monthlyBob;
  let wallets;
  let walletsByAddress;
  let snapshot;

  //$ Helpers

  /**
   * Deploys the contract with a given taxation period.
   * @param taxationPeriod Taxation period in days
   * @param beneficiaryAddress Address to remit taxes to
   * @returns contract interface
   */
  async function deploy(taxationPeriod: number): Promise<any> {
    const contract = await factory.deploy(
      signers[1].address,
      taxationPeriod,
      GLOBAL_TRX_CONFIG
    );

    await contract.deployed();
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
   * @param contract Contract that owns the token
   * @param wallet Wallet making the purchase
   * @param tokenId Token being purchased
   * @param purchasePrice Price purchasing for
   * @param currentPriceForVerification Current price
   * @param value Trx value
   * @param taxationPeriod {30|365}
   * @returns Transaction Receipt
   */
  async function buy(
    contract: any,
    wallet: Wallet,
    tokenId: TOKENS,
    purchasePrice: BigNumber,
    currentPriceForVerification: BigNumber,
    value: BigNumber,
    taxationPeriod: number
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
        await contract.lastCollectionTimes(tokenId),
        taxationPeriod,
        taxRate
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
   * @param contract Contract that owns the token
   * @param tokenId Token being purchased
   * @param after Number of days from now to verify after
   * @param taxationPeriod {30|365}
   * @returns Nothing.
   */
  async function verifyCorrectTaxOwed(
    contract: any,
    tokenId: TOKENS,
    after: number,
    taxationPeriod: number
  ): Promise<void> {
    const lastCollectionTime = await contract.lastCollectionTimes(tokenId);

    await time.increase(after);

    const owed = await contract.taxOwed(tokenId);

    const price = await contract.priceOf(tokenId);

    const due = getTaxDue(
      price,
      owed.timestamp,
      lastCollectionTime,
      taxationPeriod,
      taxRate
    );

    expect(owed.amount).to.equal(due);
  }

  /**
   * Increases time by a given amount, collects tax, and verifies that the
   * correct amount of tax was collected.
   * @param contract Contract that owns the token
   * @param tokenId Token being purchased
   * @param after Number of minutes from now to collect after
   * @param currentPrice Current token price
   * @param taxationPeriod {30|365}
   * @returns Nothing.
   */
  async function collectTax(
    contract: any,
    tokenId: TOKENS,
    after: number,
    currentPrice: BigNumber,
    taxationPeriod: number
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
    const due = getTaxDue(
      currentPrice,
      timeAfter,
      before,
      taxationPeriod,
      taxRate
    );

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
   * Note: Allows for +/- 1s variation from shouldForecloseAt due to
   * integer division-based slippages between subsequently returned times.
   * @param contract Contract that owns the token
   * @param tokenId id of the token
   * @param shouldForecloseAt timestamp as BigNumber
   */
  async function verifyExpectedForeclosureTime(
    contract: any,
    tokenId: TOKENS,
    shouldForecloseAt: BigNumber
  ): Promise<void> {
    expect(await contract.foreclosureTime(tokenId)).to.be.closeTo(
      shouldForecloseAt,
      1
    );
  }

  //$ Setup

  before(async function () {
    taxRate = ethers.BigNumber.from(config.taxRate).div(TAX_DENOMINATOR);

    provider = new ethers.providers.Web3Provider(web3.currentProvider);
    signers = await ethers.getSigners();
    factory = await ethers.getContractFactory("Test721Token");

    //$ Set up contracts

    monthlyContract = await deploy(30);
    contract = await deploy(365);

    monthlyContractAddress = monthlyContract.address;
    contractAddress = contract.address;

    //$ Set up wallets

    beneficiary = new Wallet(contract, signers[1]);
    alice = new Wallet(contract, signers[2]);
    bob = new Wallet(contract, signers[3]);
    monthlyAlice = new Wallet(monthlyContract, signers[4]);
    monthlyBob = new Wallet(monthlyContract, signers[5]);

    wallets = [beneficiary, monthlyAlice, monthlyBob, alice, bob];

    walletsByAddress = wallets.reduce(
      (memo, wallet) => ({ ...memo, [wallet.address]: wallet }),
      {}
    );

    await Promise.all(
      wallets.map(function (wallet) {
        return wallet.setup();
      })
    );

    await snapshotEVM();
  });

  /**
   * Between each test wipe the state of the contract.
   */
  beforeEach(async function () {
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
      expect(await contract.ownerOf(TOKENS.ONE)).to.equal(contractAddress);
      expect(await contract.ownerOf(TOKENS.TWO)).to.equal(contractAddress);
      expect(await contract.ownerOf(TOKENS.THREE)).to.equal(contractAddress);
    });
  });

  describe("Prevent non-buy/foreclosure (i.e. ERC721) transfers", async function () {
    context("fails", async function () {
      it("#transferFrom()", async function () {
        await expect(
          contract.transferFrom(contractAddress, alice.address, TOKENS.ONE)
        ).to.be.revertedWith(ErrorMessages.PROHIBITED_TRANSFER_METHOD);
      });

      it("#safeTransferFrom()", async function () {
        await expect(
          contract.functions["safeTransferFrom(address,address,uint256)"](
            contractAddress,
            alice.address,
            TOKENS.ONE
          )
        ).to.be.revertedWith(ErrorMessages.PROHIBITED_TRANSFER_METHOD);

        await expect(
          contract.functions["safeTransferFrom(address,address,uint256,bytes)"](
            contractAddress,
            alice.address,
            TOKENS.ONE,
            0x0
          )
        ).to.be.revertedWith(ErrorMessages.PROHIBITED_TRANSFER_METHOD);
      });
    });
  });

  describe("#constructor()", async function () {
    context("succeeds", async function () {
      it("Setting name", async function () {
        expect(await contract.name()).to.equal(TEST_NAME);
      });

      it("Setting symbol", async function () {
        expect(await contract.symbol()).to.equal(TEST_SYMBOL);
      });

      /**
       * For the purposes of testing, the beneficiary address is the address
       * of the contract owner / deployer.
       */
      it("Setting beneficiary", async function () {
        expect(await contract.beneficiary()).to.equal(beneficiary.address);
      });

      it("Setting tax rate", async function () {
        expect(await contract.taxRate()).to.equal(taxRate);
      });
    });
  });

  describe("#onlyOwner()", async function () {
    context("fails", async function () {
      context("when required but signer is not owner", async function () {
        it("#depositWei()", async function () {
          await expect(
            alice.contract.depositWei(TOKENS.ONE, { value: ETH1 })
          ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
        });

        it("#changePrice()", async function () {
          await expect(
            alice.contract.changePrice(TOKENS.ONE, 500)
          ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
        });

        it("#withdrawDeposit()", async function () {
          await expect(
            alice.contract.withdrawDeposit(TOKENS.ONE, 10)
          ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
        });

        it("#exit()", async function () {
          await expect(alice.contract.exit(TOKENS.ONE)).to.be.revertedWith(
            ErrorMessages.ONLY_OWNER
          );
        });
      });
    });
  });

  describe("#_collectTax()", async function () {
    context("fails", async function () {});
    context("succeeds", async function () {
      it("30d: collects after 10m", async function () {
        const price = ETH1;
        const token = TOKENS.ONE;

        await buy(monthlyContract, monthlyAlice, token, price, ETH0, ETH2, 30);

        await collectTax(monthlyContract, token, 10, price, 30);
      });

      it("annual: collects after 10m", async function () {
        const price = ETH1;
        const token = TOKENS.ONE;

        await buy(contract, alice, token, price, ETH0, ETH2, 365);

        await collectTax(contract, token, 10, price, 365);
      });

      it("30d: collects after 10m and subsequently after 10m", async function () {
        const price = ETH1;
        const token = TOKENS.ONE;

        await buy(monthlyContract, monthlyAlice, token, price, ETH0, ETH2, 30);

        await collectTax(monthlyContract, token, 10, price, 30);

        await collectTax(monthlyContract, token, 10, price, 30);
      });

      it("annual: collects after 10m and subsequently after 10m", async function () {
        const price = ETH1;
        const token = TOKENS.ONE;

        await buy(contract, alice, token, price, ETH0, ETH2, 365);

        await collectTax(contract, token, 10, price, 365);
        await collectTax(contract, token, 10, price, 365);
      });
    });
  });

  describe("#tokenMinted()", async function () {
    context("fails", async function () {
      context("when token not minted but required", async function () {
        it("#priceOf()", async function () {
          await expect(contract.ownerOf(INVALID_TOKEN_ID)).to.be.revertedWith(
            ErrorMessages.NONEXISTENT_TOKEN
          );
        });
        it("#depositOf()", async function () {
          await expect(contract.depositOf(INVALID_TOKEN_ID)).to.be.revertedWith(
            ErrorMessages.NONEXISTENT_TOKEN
          );
        });
        it("#buy()", async function () {
          await expect(
            contract.buy(INVALID_TOKEN_ID, ETH0, ETH0, { value: ETH0 })
          ).to.be.revertedWith(ErrorMessages.NONEXISTENT_TOKEN);
        });
        it("#taxOwedSince()", async function () {
          await expect(
            contract.taxOwedSince(INVALID_TOKEN_ID, await now())
          ).to.be.revertedWith(ErrorMessages.NONEXISTENT_TOKEN);
        });
      });
    });
  });

  describe("#taxRate()", async function () {
    context("succeeds", async function () {
      it("returning expected tax rate [100%]", async function () {
        expect(await alice.contract.taxRate()).to.equal(taxRate);
      });
    });
  });

  describe("#priceOf()", async function () {
    context("succeeds", async function () {
      it("returning expected price [ETH0]", async function () {
        expect(await contract.priceOf(TOKENS.ONE)).to.equal(ETH0);
      });
    });
  });

  describe("#depositOf()", async function () {
    context("succeeds", async function () {
      it("returning expected deposit [ETH0]", async function () {
        expect(await contract.priceOf(TOKENS.ONE)).to.equal(ETH0);
      });
    });
  });

  describe("#taxOwed()", async function () {
    context("fails", async function () {});
    context("succeeds", async function () {
      it("30d: Returns correct taxation after 1 second", async function () {
        const token = TOKENS.ONE;

        await buy(monthlyContract, monthlyAlice, token, ETH1, ETH0, ETH2, 30);

        await verifyCorrectTaxOwed(monthlyContract, token, 1, 30);
      });

      it("annual: Returns correct taxation after 1 second", async function () {
        const token = TOKENS.ONE;

        await buy(contract, alice, token, ETH1, ETH0, ETH2, 365);

        await verifyCorrectTaxOwed(contract, token, 1, 365);
      });
    });

    it("30d: Returns correct taxation after 30 days", async function () {
      const token = TOKENS.ONE;

      await buy(monthlyContract, monthlyAlice, token, ETH1, ETH0, ETH2, 30);

      await verifyCorrectTaxOwed(monthlyContract, token, 30, 30);
    });

    it("30d: Returns correct taxation after 60 days", async function () {
      const token = TOKENS.ONE;

      await buy(monthlyContract, monthlyAlice, token, ETH1, ETH0, ETH2, 30);

      await verifyCorrectTaxOwed(monthlyContract, token, 60, 30);
    });

    it("annual: Returns correct taxation after 1 year", async function () {
      const token = TOKENS.ONE;

      await buy(contract, alice, token, ETH1, ETH0, ETH2, 365);

      await verifyCorrectTaxOwed(contract, token, 365, 365);
    });
  });

  describe("#taxOwedSince()", async function () {
    context("fails", async function () {});
    context("succeeds", async function () {
      it("Returns zero if no purchase", async function () {
        expect(
          await contract.taxOwedSince(TOKENS.ONE, (await now()).sub(1))
        ).to.equal(0);
      });

      it("30d: Returns correct amount", async function () {
        const token = TOKENS.ONE;
        const price = ETH1;

        await buy(monthlyContract, monthlyAlice, token, price, ETH0, ETH2, 30);

        const time = (await now()).sub(1);

        const expected = price
          .mul(time)
          .div(taxationPeriodToSeconds(30))
          .mul(taxRate);

        expect(await monthlyContract.taxOwedSince(token, time)).to.equal(
          expected
        );
      });

      it("annual: Returns correct amount", async function () {
        const token = TOKENS.ONE;
        const price = ETH1;

        await buy(contract, alice, token, price, ETH0, ETH2, 365);

        const time = (await now()).sub(1);

        const expected = price
          .mul(time)
          .div(taxationPeriodToSeconds(365))
          .mul(taxRate);

        expect(await contract.taxOwedSince(token, time)).to.equal(expected);
      });
    });
  });

  describe("#taxCollectedSinceLastTransfer()", async function () {
    context("fails", async function () {});
    context("succeeds", async function () {
      context("returning correct amount", async function () {
        it("if never transferred", async function () {
          expect(
            await contract.taxCollectedSinceLastTransfer(TOKENS.ONE)
          ).to.equal(0);
        });

        it("30d: after initial purchase", async function () {
          const token = TOKENS.ONE;
          const price = ETH1;

          await buy(
            monthlyContract,
            monthlyAlice,
            token,
            price,
            ETH0,
            ETH2,
            30
          );

          await collectTax(monthlyContract, token, 1, price, 30);
        });

        it("annual: after initial purchase", async function () {
          const token = TOKENS.ONE;
          const price = ETH1;

          await buy(contract, alice, token, price, ETH0, ETH2, 365);

          await collectTax(contract, token, 1, price, 365);
        });

        it("30d: after 1 secondary-purchase", async function () {
          const token = TOKENS.ONE;
          const price = ETH1;

          await buy(
            monthlyContract,
            monthlyAlice,
            token,
            price,
            ETH0,
            ETH2,
            30
          );

          await collectTax(monthlyContract, token, 1, price, 30);

          const secondaryPrice = ETH2;

          await buy(
            monthlyContract,
            monthlyBob,
            token,
            secondaryPrice,
            ETH1,
            ETH3,
            30
          );

          await collectTax(monthlyContract, token, 1, secondaryPrice, 30);
        });

        it("annual: after 1 secondary-purchase", async function () {
          const token = TOKENS.ONE;
          const price = ETH1;

          await buy(contract, alice, token, price, ETH0, ETH2, 365);

          await collectTax(contract, token, 1, price, 365);

          const secondaryPrice = ETH2;

          await buy(contract, bob, token, secondaryPrice, ETH1, ETH3, 365);

          await collectTax(contract, token, 1, secondaryPrice, 365);
        });

        it("when foreclosed", async function () {
          const token = TOKENS.ONE;

          await buy(contract, alice, token, ETH1, ETH0, ETH2, 365);

          await time.increase(time.duration.days(366));
          expect(await contract.foreclosed(token)).to.equal(true);
          await time.increase(time.duration.days(1));
          expect(await contract.taxCollectedSinceLastTransfer(token)).to.equal(
            0
          );
        });

        it("30d: after purchase from foreclosure", async function () {
          const token = TOKENS.ONE;

          await buy(monthlyContract, monthlyAlice, token, ETH1, ETH0, ETH2, 30);

          await time.increase(time.duration.days(31));
          expect(await monthlyContract.foreclosed(token)).to.equal(true);

          await time.increase(time.duration.days(1));

          // Purchase out of foreclosure
          const price = ETH1;
          await buy(monthlyContract, monthlyBob, token, price, ETH0, ETH2, 30);

          await collectTax(monthlyContract, token, 1, price, 30);
        });

        it("annual: after purchase from foreclosure", async function () {
          const token = TOKENS.ONE;

          await buy(contract, alice, token, ETH1, ETH0, ETH2, 365);

          await time.increase(time.duration.days(366));
          expect(await contract.foreclosed(token)).to.equal(true);

          await time.increase(time.duration.days(1));

          // Purchase out of foreclosure
          const price = ETH1;
          await buy(contract, bob, token, price, ETH0, ETH2, 365);

          await collectTax(contract, token, 1, price, 365);
        });
      });
    });
  });

  describe("#foreclosed()", async function () {
    context("fails", async function () {});
    context("succeeds", async function () {
      it("true positive", async function () {
        const token = TOKENS.ONE;

        await buy(contract, alice, token, ETH1, ETH0, ETH2, 365);

        await time.increase(time.duration.days(366)); // Entire deposit will be exceeded after 1yr
        expect(await contract.foreclosed(token)).to.equal(true);
      });
      it("true negative", async function () {
        const token = TOKENS.ONE;

        await buy(contract, alice, token, ETH1, ETH0, ETH2, 365);

        await time.increase(time.duration.minutes(1));
        expect(await contract.foreclosed(token)).to.equal(false);
      });
    });
  });

  describe("#withdrawableDeposit()", async function () {
    context("fails", async function () {});
    context("succeeds", async function () {
      it("Returns zero when owed >= deposit", async function () {
        const token = TOKENS.ONE;

        await buy(contract, alice, token, ETH1, ETH0, ETH2, 365);

        // Exhaust deposit
        await time.increase(time.duration.days(366));

        expect(await contract.withdrawableDeposit(token)).to.equal(0);
      });
      it("Returns (deposit - owed) when owed < deposit", async function () {
        const token = TOKENS.ONE;

        await buy(contract, alice, token, ETH1, ETH0, ETH2, 365);

        await time.increase(time.duration.days(1));
        const owed = await contract.taxOwed(token);

        expect(await contract.withdrawableDeposit(token)).to.equal(
          ETH1.sub(owed.amount)
        );
      });
    });
  });

  describe("#foreclosureTime()", async function () {
    context("fails", async function () {});
    context("succeeds", async function () {
      it("consistently returns within +/- 1s", async function () {
        const token = TOKENS.ONE;

        await buy(
          contract,
          alice,
          token,
          ETH1,
          ETH0,
          ETH1.add(AnnualTenMinDue),
          365
        );

        // Future:

        const tenMinutes = time.duration.minutes(10);

        const shouldForecloseAt = (await now()).add(
          ethers.BigNumber.from(tenMinutes.toString())
        );

        await verifyExpectedForeclosureTime(contract, token, shouldForecloseAt);

        // Present:

        await time.increase(tenMinutes);

        // Foreclosure should be backdated to when token was in foreclosed state.
        await verifyExpectedForeclosureTime(contract, token, shouldForecloseAt);

        // Trigger foreclosure
        await contract._collectTax(token);

        // Past:

        await time.increase(tenMinutes);

        await verifyExpectedForeclosureTime(contract, token, shouldForecloseAt);
      });

      it("30d: time is 10m into the future", async function () {
        const token = TOKENS.ONE;

        await buy(
          monthlyContract,
          monthlyAlice,
          token,
          ETH1,
          ETH0,
          ETH1.add(MonthlyTenMinDue), // Deposit a surplus 10 min of patronage
          30
        );

        const tenMinutesFromNow = (await now()).add(
          ethers.BigNumber.from(time.duration.minutes(10).toString())
        );

        await verifyExpectedForeclosureTime(
          monthlyContract,
          token,
          tenMinutesFromNow
        );
      });

      it("annual: time is 10m into the future", async function () {
        const token = TOKENS.ONE;

        await buy(
          contract,
          alice,
          token,
          ETH1,
          ETH0,
          ETH1.add(AnnualTenMinDue), // Deposit a surplus 10 min of patronage
          365
        );

        const tenMinutesFromNow = (await now()).add(
          ethers.BigNumber.from(time.duration.minutes(10).toString())
        );

        await verifyExpectedForeclosureTime(contract, token, tenMinutesFromNow);
      });

      it("30d: returns backdated time if foreclosed", async function () {
        const token = TOKENS.ONE;

        await buy(
          monthlyContract,
          monthlyAlice,
          token,
          ETH1,
          ETH0,
          ETH1.add(MonthlyTenMinDue), // Deposit a surplus 10 min of patronage
          30
        );

        await time.increase(time.duration.minutes(10));
        const shouldForecloseAt = await now();

        // Foreclosure should be backdated to when token was in foreclosed state.
        await verifyExpectedForeclosureTime(
          monthlyContract,
          token,
          shouldForecloseAt
        );

        // Trigger foreclosure
        await monthlyContract._collectTax(token);

        expect(await monthlyContract.ownerOf(token)).to.equal(
          monthlyContractAddress
        );

        // Value should remain within +/- 1s after foreclosure has taken place
        await verifyExpectedForeclosureTime(
          monthlyContract,
          token,
          shouldForecloseAt
        );
      });

      it("annual: returns backdated time if foreclosed", async function () {
        const token = TOKENS.ONE;

        await buy(
          contract,
          alice,
          token,
          ETH1,
          ETH0,
          ETH1.add(AnnualTenMinDue), // Deposit a surplus 10 min of patronage
          365
        );

        await time.increase(time.duration.minutes(10));
        const shouldForecloseAt = await now();

        // Foreclosure should be backdated to when token was in foreclosed state.
        await verifyExpectedForeclosureTime(contract, token, shouldForecloseAt);

        // Trigger foreclosure
        await contract._collectTax(token);

        expect(await contract.ownerOf(token)).to.equal(contractAddress);

        // Value should remain within +/- 1s after foreclosure has taken place
        await verifyExpectedForeclosureTime(contract, token, shouldForecloseAt);
      });
    });
  });

  describe("#buy()", async function () {
    context("fails", async function () {
      it("Attempting to buy an un-minted token", async function () {
        await expect(
          alice.contract.buy(INVALID_TOKEN_ID, ETH1, ETH1, { value: ETH1 })
        ).to.be.revertedWith(ErrorMessages.NONEXISTENT_TOKEN);
      });
      it("Verifying incorrect Current Price", async function () {
        await expect(
          alice.contract.buy(
            TOKENS.ONE,
            ETH1, // Purchase price of 1
            ETH1, // current price of 1 [should be ETH0]
            { value: ETH1 }
          )
        ).to.be.revertedWith(ErrorMessages.BUY_INCORRECT_CURRENT_PRICE);
      });
      it("Attempting to buy with 0 Wei", async function () {
        await expect(
          alice.contract.buy(
            TOKENS.ONE,
            ETH0, // [must be greater than 0]
            ETH0,
            { value: ETH0 } // [must be greater than 0]
          )
        ).to.be.revertedWith(ErrorMessages.BUY_ZERO_PRICE);
      });
      it("When purchase price is less than message value", async function () {
        await expect(
          alice.contract.buy(
            TOKENS.ONE,
            ETH0, // Purchase price of zero
            ETH0, // Current Price [correct]
            { value: ETH1 } // Send 1 Eth
          )
        ).to.be.revertedWith(ErrorMessages.BUY_ZERO_PRICE);
      });
      it("Attempting to buy with price less than current price", async function () {
        // Purchase as Bob for 2 ETH
        await buy(contract, bob, TOKENS.TWO, ETH2, ETH0, ETH3, 365);

        await expect(
          alice.contract.buy(
            TOKENS.TWO, // owned by Bob
            ETH1, // [should be ETH2]
            ETH2, // Correct
            { value: ETH1 } // [should be ETH2]
          )
        ).to.be.revertedWith(ErrorMessages.BUY_PRICE_BELOW_CURRENT);
      });
      it("Attempting to buy without surplus value for deposit", async function () {
        await expect(
          alice.contract.buy(TOKENS.ONE, ETH1, ETH0, { value: ETH1 }) // [should be greater than ETH1]
        ).to.be.revertedWith(ErrorMessages.BUY_LACKS_SURPLUS_VALUE);
      });
      it("Attempting to purchase a token it already owns", async function () {
        // Purchase
        await buy(contract, bob, TOKENS.TWO, ETH2, ETH0, ETH3, 365);
        // Re-purchase
        await expect(
          bob.contract.buy(TOKENS.TWO, ETH3, ETH2, { value: ETH4 })
        ).to.be.revertedWith(ErrorMessages.BUY_ALREADY_OWNED);
      });
    });
    context("succeeds", async function () {
      it("Purchasing token for the first-time (from contract)", async function () {
        await buy(contract, alice, TOKENS.ONE, ETH1, ETH0, ETH2, 365);
      });

      it("30d: Purchasing token from current owner", async function () {
        const token = TOKENS.ONE;

        await buy(monthlyContract, monthlyAlice, token, ETH1, ETH0, ETH2, 30);

        await time.increase(time.duration.minutes(10));

        await buy(monthlyContract, monthlyBob, token, ETH2, ETH1, ETH3, 30);
      });

      it("annual: Purchasing token from current owner", async function () {
        const token = TOKENS.ONE;

        await buy(contract, alice, token, ETH1, ETH0, ETH2, 365);

        await time.increase(time.duration.minutes(10));

        await buy(contract, bob, token, ETH2, ETH1, ETH3, 365);
      });

      it("Purchasing token from foreclosure", async function () {
        const token = TOKENS.ONE;

        await buy(contract, alice, token, ETH1, ETH0, ETH2, 365);

        // Exhaust deposit
        await time.increase(time.duration.days(366));

        // Trigger foreclosure & buy it out of foreclosure
        expect(
          await bob.contract.buy(token, ETH1, ETH0, {
            value: ETH2,
          })
        )
          .to.emit(contract, Events.FORECLOSURE)
          .withArgs(token, alice.address);

        expect(await contract.ownerOf(token)).to.equal(bob.address);
      });

      it("Purchasing token from current owner who purchased from foreclosure", async function () {
        const token = TOKENS.ONE;

        await buy(contract, alice, token, ETH1, ETH0, ETH2, 365);

        // Exhaust deposit
        await time.increase(time.duration.days(366));

        // Buy out of foreclosure
        await buy(contract, bob, token, ETH1, ETH0, ETH2, 365);

        await buy(contract, alice, token, ETH2, ETH1, ETH3, 365);
      });

      it("Owner prior to foreclosure re-purchases", async function () {
        const token = TOKENS.ONE;

        await buy(contract, alice, token, ETH1, ETH0, ETH2, 365);

        // Exhaust deposit
        await time.increase(time.duration.days(366));

        // Buy out of foreclosure
        await buy(contract, alice, token, ETH1, ETH0, ETH2, 365);
      });

      it("Updating chain of title", async function () {
        const token = TOKENS.ONE;

        const { block: block1 } = await buy(
          contract,
          bob,
          token,
          ETH1,
          ETH0,
          ETH2,
          365
        );

        const { block: block2 } = await buy(
          contract,
          alice,
          token,
          ETH2,
          ETH1,
          ETH3,
          365
        );

        const chainOfTitle = await contract.titleChainOf(token);

        expect(chainOfTitle[0].from).to.equal(contractAddress);
        expect(chainOfTitle[0].to).to.equal(bob.address);
        expect(chainOfTitle[0].price).to.equal(ETH1);
        expect(chainOfTitle[0].timestamp).to.equal(
          ethers.BigNumber.from(block1.timestamp)
        );
        expect(chainOfTitle[1].from).to.equal(bob.address);
        expect(chainOfTitle[1].to).to.equal(alice.address);
        expect(chainOfTitle[1].price).to.equal(ETH2);
        expect(chainOfTitle[1].timestamp).to.equal(
          ethers.BigNumber.from(block2.timestamp)
        );
      });
    });
  });

  describe("#depositWei()", async function () {
    context("fails", async function () {
      it("is not deposited by owner", async function () {
        await expect(
          alice.contract.depositWei(TOKENS.ONE, {
            value: ethers.utils.parseEther("1"),
          })
        ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
      });
    });
    context("succeeds", async function () {
      it("owner can deposit", async function () {
        const token = TOKENS.ONE;

        await buy(contract, alice, token, ETH1, ETH0, ETH2, 365);

        await expect(
          alice.contract.depositWei(token, { value: ETH1 })
        ).to.not.reverted;
      });
    });
  });

  describe("#changePrice()", async function () {
    context("fails", async function () {
      it("only owner can update price", async function () {
        await expect(
          alice.contract.changePrice(TOKENS.ONE, 500)
        ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
      });
      it("cannot have a new price of zero", async function () {
        const token = TOKENS.ONE;

        await buy(contract, alice, token, ETH1, ETH0, ETH2, 365);
        await expect(
          alice.contract.changePrice(token, ETH0)
        ).to.be.revertedWith(ErrorMessages.NEW_PRICE_ZERO);
      });
      it("cannot have price set to same amount", async function () {
        const token = TOKENS.ONE;

        await buy(contract, alice, token, ETH1, ETH0, ETH2, 365);
        await expect(
          alice.contract.changePrice(token, ETH1)
        ).to.be.revertedWith(ErrorMessages.NEW_PRICE_SAME);
      });
    });
    context("succeeds", async function () {
      it("owner can increase price", async function () {
        const token = TOKENS.ONE;

        await buy(contract, alice, token, ETH1, ETH0, ETH2, 365);

        expect(await alice.contract.changePrice(token, ETH2))
          .to.emit(contract, Events.PRICE_CHANGE)
          .withArgs(TOKENS.ONE, ETH2);

        expect(await contract.priceOf(token)).to.equal(ETH2);
      });

      it("owner can decrease price", async function () {
        const token = TOKENS.ONE;

        await buy(contract, alice, token, ETH2, ETH0, ETH3, 365);

        expect(await alice.contract.changePrice(token, ETH1))
          .to.emit(contract, Events.PRICE_CHANGE)
          .withArgs(TOKENS.ONE, ETH1);

        expect(await contract.priceOf(token)).to.equal(ETH1);
      });
    });
  });

  describe("#withdrawDeposit()", async function () {
    context("fails", async function () {
      it("Non-owner", async function () {
        await expect(
          alice.contract.withdrawDeposit(TOKENS.ONE, 10)
        ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
      });

      it("Cannot withdraw more than deposited", async function () {
        const token = TOKENS.ONE;

        await buy(contract, alice, token, ETH1, ETH0, ETH2, 365);

        await expect(
          alice.contract.withdrawDeposit(token, ETH2)
        ).to.be.revertedWith(ErrorMessages.CANNOT_WITHDRAW_MORE_THAN_DEPOSITED);
      });
    });

    context("succeeds", async function () {
      it("30d: Withdraws expected amount", async function () {
        const token = TOKENS.ONE;
        const price = ETH1;

        await buy(monthlyContract, monthlyAlice, token, price, ETH0, ETH3, 30);

        // Necessary to determine tax due on exit
        const lastCollectionTime = await monthlyContract.lastCollectionTimes(
          token
        );

        const trx = await monthlyAlice.contract.withdrawDeposit(token, ETH1);
        const { timestamp } = await provider.getBlock(trx.blockNumber);

        // Emits
        expect(trx)
          .to.emit(monthlyContract, Events.DEPOSIT_WITHDRAWAL)
          .withArgs(token, ETH1);

        // current deposit - tax on exit
        const taxedAmt = getTaxDue(
          price,
          ethers.BigNumber.from(timestamp),
          lastCollectionTime,
          30,
          taxRate
        );

        // Deposit should be 1 ETH - taxed amount.
        expect(await monthlyContract.depositOf(token)).to.equal(
          ETH1.sub(taxedAmt)
        );

        // Alice's balance should reflect returned deposit [1 ETH] minus fees
        const { delta, fees } = await monthlyAlice.balanceDelta();

        const expectedRemittanceMinusGas = ETH1.sub(fees);

        expect(delta).to.equal(expectedRemittanceMinusGas);
      });

      it("annual: Withdraws expected amount", async function () {
        const token = TOKENS.ONE;
        const price = ETH1;

        await buy(contract, alice, token, price, ETH0, ETH3, 30);

        // Necessary to determine tax due on exit
        const lastCollectionTime = await contract.lastCollectionTimes(token);

        const trx = await alice.contract.withdrawDeposit(token, ETH1);
        const { timestamp } = await provider.getBlock(trx.blockNumber);

        // Emits
        expect(trx)
          .to.emit(contract, Events.DEPOSIT_WITHDRAWAL)
          .withArgs(token, ETH1);

        // current deposit - tax on exit
        const taxedAmt = getTaxDue(
          price,
          ethers.BigNumber.from(timestamp),
          lastCollectionTime,
          365,
          taxRate
        );

        // Deposit should be 1 ETH - taxed amount.
        expect(await contract.depositOf(token)).to.equal(ETH1.sub(taxedAmt));

        // Alice's balance should reflect returned deposit [1 ETH] minus fees
        const { delta, fees } = await alice.balanceDelta();

        const expectedRemittanceMinusGas = ETH1.sub(fees);

        expect(delta).to.equal(expectedRemittanceMinusGas);
      });
    });
  });

  describe("#exit()", async function () {
    context("fails", async function () {
      it("Non-owner", async function () {
        await expect(
          alice.contract.withdrawDeposit(TOKENS.ONE, 10)
        ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
      });
    });

    context("succeeds", async function () {
      it("30d: Withdraws entire deposit", async function () {
        const token = TOKENS.ONE;

        await buy(monthlyContract, monthlyAlice, token, ETH1, ETH0, ETH2, 30);

        // Determine tax due on exit
        const lastCollectionTime = await monthlyContract.lastCollectionTimes(
          token
        );

        const trx = await monthlyAlice.contract.exit(token);
        const { timestamp } = await provider.getBlock(trx.blockNumber);

        // current deposit - tax on exit
        const taxedAmt = getTaxDue(
          ETH1,
          ethers.BigNumber.from(timestamp),
          lastCollectionTime,
          30,
          taxRate
        );

        const expectedRemittance = ETH1.sub(taxedAmt);

        // Emits
        expect(trx)
          .to.emit(monthlyContract, Events.DEPOSIT_WITHDRAWAL)
          .withArgs(token, expectedRemittance);

        // Alice's balance should reflect returned deposit minus fees
        const { delta, fees } = await monthlyAlice.balanceDelta();

        const expectedRemittanceMinusGas = expectedRemittance.sub(fees);

        expect(delta).to.equal(expectedRemittanceMinusGas);

        // Deposit should be zero
        expect(await monthlyContract.depositOf(token)).to.equal(0);

        // Token should foreclose
        expect(await monthlyContract.priceOf(token)).to.equal(0);
      });

      it("annual: Withdraws entire deposit", async function () {
        const token = TOKENS.ONE;

        await buy(contract, alice, token, ETH1, ETH0, ETH2, 365);

        // Determine tax due on exit
        const lastCollectionTime = await contract.lastCollectionTimes(token);

        const trx = await alice.contract.exit(token);
        const { timestamp } = await provider.getBlock(trx.blockNumber);

        // current deposit - tax on exit
        const taxedAmt = getTaxDue(
          ETH1,
          ethers.BigNumber.from(timestamp),
          lastCollectionTime,
          365,
          taxRate
        );

        const expectedRemittance = ETH1.sub(taxedAmt);

        // Emits
        expect(trx)
          .to.emit(contract, Events.DEPOSIT_WITHDRAWAL)
          .withArgs(token, expectedRemittance);

        // Alice's balance should reflect returned deposit minus fees
        const { delta, fees } = await alice.balanceDelta();

        const expectedRemittanceMinusGas = expectedRemittance.sub(fees);

        expect(delta).to.equal(expectedRemittanceMinusGas);

        // Deposit should be zero
        expect(await contract.depositOf(token)).to.equal(0);

        // Token should foreclose
        expect(await contract.priceOf(token)).to.equal(0);
      });
    });
  });

  describe("#withdrawOutstandingRemittance()", async function () {
    context("fails", async function () {
      it("when no outstanding remittance", async function () {
        await expect(
          alice.contract.withdrawOutstandingRemittance()
        ).to.be.revertedWith(ErrorMessages.NO_OUTSTANDING_REMITTANCE);
      });
    });
    // TODO: Add force buy remittance to fail with a blocker contract.
    context("succeeds", async function () {});
  });

  describe("#transferToken()", async function () {
    context("fails", async function () {
      it("it's an internal method", async function () {
        try {
          await contract.transferToken();
        } catch (error) {
          expect(error).instanceOf(TypeError);
          expect(error.message).to.equal(
            "contract.transferToken is not a function"
          );
        }
      });
    });
  });
}

export default tests;
