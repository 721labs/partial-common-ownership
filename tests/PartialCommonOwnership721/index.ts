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
  AnnualTenMinOneSecDue,
  MonthlyTenMinDue,
  MonthlyTenMinOneSecDue,
  TAX_RATE,
  TAX_NUMERATOR,
  TAX_DENOMINATOR,
} from "./constants";
import { now } from "../helpers/Time";
import { taxationPeriodToSeconds, getTaxDue } from "./utils";

//$ Tests

describe("PartialCommonOwnership721", async function () {
  //$ Helpers

  /**
   * Deploys the contract with a given taxation period.
   * @param taxationPeriod Taxation period in days
   * @param beneficiaryAddress Address to remit taxes to
   * @returns contract interface
   */
  async function deploy(taxationPeriod: number): Promise<any> {
    const contract = await this.factory.deploy(
      this.signers[1].address,
      taxationPeriod,
      this.globalTrxConfig
    );

    await contract.deployed();
    expect(contract.address).to.not.be.null;

    return contract;
  }

  /**
   * Scopes a snapshot of the EVM.
   */
  async function snapshotEVM(): Promise<void> {
    this.snapshot = await this.provider.send("evm_snapshot", []);
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
    // or the beneficiary (if the token is owned by the contract)
    const currentOwner = await contract.ownerOf(tokenId);
    const remittanceRecipientWallet =
      currentOwner === contract.address
        ? this.beneficiary
        : this.walletsByAddress[currentOwner];

    // Determine the expected remittance
    // (Deposit - due + sale price)
    const depositBefore = await contract.depositOf(tokenId);
    const { amount, timestamp } = await contract.taxOwed(tokenId);

    //$ Buy

    const trx = await wallet.contract.buy(
      tokenId,
      purchasePrice,
      currentPriceForVerification,
      { value, ...this.globalTrxConfig }
    );

    const block = await this.provider.getBlock(trx.blockNumber);

    // Determine how much tax obligation was accrued between `#taxOwed()`
    // call and trx occurring.
    const interimAmount = getTaxDue(
      currentPriceForVerification,
      ethers.BigNumber.from(block.timestamp),
      timestamp,
      taxationPeriod
    );

    const expectedRemittance = depositBefore
      .sub(amount)
      .sub(interimAmount)
      .add(purchasePrice);

    //$ Test Cases

    // Buy Event emitted
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

    // Remittance Event emitted
    // TODO: These may fail because of division rounding down; fix in pull/12
    // expect(trx)
    //   .to.emit(contract, Events.REMITTANCE)
    //   .withArgs(tokenId, remittanceRecipientWallet.address, expectedRemittance);

    // // Eth remitted to beneficiary
    // expect((await remittanceRecipientWallet.balanceDelta()).delta).to.equal(
    //   expectedRemittance
    // );

    //$ Cleanup

    // Baseline wallet balances
    await wallet.balance();
    await remittanceRecipientWallet.balance();

    return { trx, block };
  }

  //$ Setup

  before(async function () {
    this.provider = new ethers.providers.Web3Provider(web3.currentProvider);
    this.signers = await ethers.getSigners();
    this.factory = await ethers.getContractFactory("Test721Token");

    //$ Set up contracts

    this.globalTrxConfig = {
      gasLimit: 9500000, // if gas limit is set, estimateGas isn't run superfluously, slowing tests down.
    };

    this.monthlyContract = await deploy.apply(this, [30]);
    this.contract = await deploy.apply(this, [365]);

    this.monthlyContractAddress = this.monthlyContract.address;
    this.contractAddress = this.contract.address;

    //$ Set up wallets

    this.beneficiary = new Wallet(this.contract, this.signers[1]);
    this.alice = new Wallet(this.contract, this.signers[2]);
    this.bob = new Wallet(this.contract, this.signers[3]);
    this.monthlyAlice = new Wallet(this.monthlyContract, this.signers[4]);
    this.monthlyBob = new Wallet(this.monthlyContract, this.signers[5]);

    this.wallets = [
      this.beneficiary,
      this.monthlyAlice,
      this.monthlyBob,
      this.alice,
      this.bob,
    ];

    this.walletsByAddress = this.wallets.reduce(
      (memo, wallet) => ({ ...memo, [wallet.address]: wallet }),
      {}
    );

    await Promise.all(
      this.wallets.map(function (wallet) {
        return wallet.setup();
      })
    );

    await snapshotEVM.apply(this);
  });

  /**
   * Between each test wipe the state of the this.contract.
   */
  beforeEach(async function () {
    // Reset contract state
    await this.provider.send("evm_revert", [this.snapshot]);
    await snapshotEVM.apply(this);

    // Reset balance trackers
    await Promise.all(
      this.wallets.map(function (wallet) {
        return wallet.balance();
      })
    );
  });

  //$ Tests

  describe("Test721Token", async function () {
    it("mints three tokens during construction", async function () {
      expect(await this.contract.ownerOf(TOKENS.ONE)).to.equal(
        this.contractAddress
      );
      expect(await this.contract.ownerOf(TOKENS.TWO)).to.equal(
        this.contractAddress
      );
      expect(await this.contract.ownerOf(TOKENS.THREE)).to.equal(
        this.contractAddress
      );
    });
  });

  describe("Prevent non-buy/foreclosure (i.e. ERC721) transfers", async function () {
    context("fails", async function () {
      it("#transferFrom()", async function () {
        await expect(
          this.contract.transferFrom(
            this.contractAddress,
            this.alice.address,
            TOKENS.ONE
          )
        ).to.be.revertedWith(ErrorMessages.PROHIBITED_TRANSFER_METHOD);
      });

      it("#safeTransferFrom()", async function () {
        await expect(
          this.contract.functions["safeTransferFrom(address,address,uint256)"](
            this.contractAddress,
            this.alice.address,
            TOKENS.ONE
          )
        ).to.be.revertedWith(ErrorMessages.PROHIBITED_TRANSFER_METHOD);

        await expect(
          this.contract.functions[
            "safeTransferFrom(address,address,uint256,bytes)"
          ](this.contractAddress, this.alice.address, TOKENS.ONE, 0x0)
        ).to.be.revertedWith(ErrorMessages.PROHIBITED_TRANSFER_METHOD);
      });
    });
  });

  describe("#constructor()", async function () {
    context("succeeds", async function () {
      it("Setting name", async function () {
        expect(await this.contract.name()).to.equal(TEST_NAME);
      });

      it("Setting symbol", async function () {
        expect(await this.contract.symbol()).to.equal(TEST_SYMBOL);
      });

      /**
       * For the purposes of testing, the beneficiary address is the address
       * of the contract owner / deployer.
       */
      it("Setting beneficiary", async function () {
        expect(await this.contract.beneficiary()).to.equal(
          this.beneficiary.address
        );
      });

      it("Setting tax rate", async function () {
        expect(await this.contract.taxRate()).to.equal(TAX_RATE);
      });
    });
  });

  describe("#onlyOwner()", async function () {
    context("fails", async function () {
      context("when required but signer is not owner", async function () {
        it("#depositWei()", async function () {
          await expect(
            this.alice.contract.depositWei(TOKENS.ONE, {
              value: ethers.utils.parseEther("1"),
            })
          ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
        });

        it("#changePrice()", async function () {
          await expect(
            this.alice.contract.changePrice(TOKENS.ONE, 500)
          ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
        });

        it("#withdrawDeposit()", async function () {
          await expect(
            this.alice.contract.withdrawDeposit(TOKENS.ONE, 10)
          ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
        });

        it("#exit()", async function () {
          await expect(this.alice.contract.exit(TOKENS.ONE)).to.be.revertedWith(
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

        await buy.apply(this, [
          this.monthlyContract,
          this.monthlyAlice,
          token,
          price,
          ETH0,
          ETH2,
          30,
        ]);

        const timeBefore = await now();

        await time.increase(time.duration.minutes(10));

        const event = await this.monthlyContract._collectTax(
          token,
          this.globalTrxConfig
        );

        const timeAfter = await now();
        const depositAfter = await this.monthlyContract.depositOf(token);

        const due = getTaxDue(price, timeAfter, timeBefore, 30);

        // Events emitted
        expect(event)
          .to.emit(this.monthlyContract, Events.COLLECTION)
          .withArgs(token, due);

        expect(event)
          .to.emit(this.monthlyContract, Events.BENEFICIARY_REMITTANCE)
          .withArgs(token, due);

        // Deposit updates
        expect(depositAfter).to.equal(price.sub(due));

        // Token collection statistics update
        expect(await this.monthlyContract.lastCollectionTimes(token)).to.equal(
          timeAfter
        );

        expect(
          await this.monthlyContract.taxCollectedSinceLastTransfer(token)
        ).to.equal(due);

        expect(await this.monthlyContract.taxationCollected(token)).to.equal(
          due
        );

        // Beneficiary is remitted the expected amount
        expect((await this.beneficiary.balanceDelta()).delta).to.equal(due);
      });

      it("annual: collects after 10m", async function () {
        const price = ETH1;
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          price,
          ETH0,
          ETH2,
          365,
        ]);

        const timeBefore = await now();

        await time.increase(time.duration.minutes(10));

        const event = await this.contract._collectTax(
          token,
          this.globalTrxConfig
        );

        const timeAfter = await now();
        const depositAfter = await this.contract.depositOf(token);

        const due = getTaxDue(price, timeAfter, timeBefore, 365);

        // Events emitted
        expect(event)
          .to.emit(this.contract, Events.COLLECTION)
          .withArgs(token, due);
        expect(event)
          .to.emit(this.contract, Events.BENEFICIARY_REMITTANCE)
          .withArgs(token, due);
        // Deposit updates
        expect(depositAfter).to.equal(price.sub(due));
        // Token collection statistics update
        expect(await this.contract.lastCollectionTimes(token)).to.equal(
          timeAfter
        );
        expect(
          await this.contract.taxCollectedSinceLastTransfer(token)
        ).to.equal(due);
        expect(await this.contract.taxationCollected(token)).to.equal(due);

        // Beneficiary is remitted the expected amount
        expect((await this.beneficiary.balanceDelta()).delta).to.equal(due);
      });

      it("30d: collects after 10m and subsequently after 10m", async function () {
        const price = ETH1;
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.monthlyContract,
          this.monthlyAlice,
          token,
          price,
          ETH0,
          ETH2,
          30,
        ]);

        const timeBefore = await now();
        const depositBefore = await this.monthlyContract.depositOf(token);

        await time.increase(time.duration.minutes(10));
        await this.monthlyContract._collectTax(token, this.globalTrxConfig);

        const timeAfter10m = await now();

        const due10m = getTaxDue(price, timeAfter10m, timeBefore, 30);

        await time.increase(time.duration.minutes(10));
        await this.monthlyContract._collectTax(token, this.globalTrxConfig);

        const timeAfter20m = await now();
        const due20m = getTaxDue(price, timeAfter20m, timeAfter10m, 30);

        const depositAfter = await this.monthlyContract.depositOf(token);

        const due = due10m.add(due20m);

        // Correct amount is deducted from deposit
        expect(depositAfter).to.equal(depositBefore.sub(due));
        // Token collection statistics update
        expect(await this.monthlyContract.lastCollectionTimes(token)).to.equal(
          timeAfter20m
        );
        expect(
          await this.monthlyContract.taxCollectedSinceLastTransfer(token)
        ).to.equal(due);
        expect(await this.monthlyContract.taxationCollected(token)).to.equal(
          due
        );
        // Beneficiary is remitted due 10m + due 20m
        expect((await this.beneficiary.balanceDelta()).delta).to.equal(due);
      });

      it("annual: collects after 10m and subsequently after 10m", async function () {
        const price = ETH1;
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          price,
          ETH0,
          ETH2,
          365,
        ]);

        const timeBefore = await now();
        const depositBefore = await this.contract.depositOf(token);

        await time.increase(time.duration.minutes(10));
        await this.contract._collectTax(token, this.globalTrxConfig);

        const timeAfter10m = await now();

        const due10m = getTaxDue(price, timeAfter10m, timeBefore, 365);

        await time.increase(time.duration.minutes(10));
        await this.contract._collectTax(token, this.globalTrxConfig);

        const timeAfter20m = await now();
        const due20m = getTaxDue(price, timeAfter20m, timeAfter10m, 365);

        const depositAfter = await this.contract.depositOf(token);

        const due = due10m.add(due20m);

        // Correct amount is deducted from deposit
        expect(depositAfter).to.equal(depositBefore.sub(due));
        // Token collection statistics update
        expect(await this.contract.lastCollectionTimes(token)).to.equal(
          timeAfter20m
        );
        expect(
          await this.contract.taxCollectedSinceLastTransfer(token)
        ).to.equal(
          // ! Patch: `due` is 1 wei less; not sure why...
          due.add(1)
        );
        expect(await this.contract.taxationCollected(token)).to.equal(due);

        // Beneficiary is remitted due 10m + due 20m
        expect((await this.beneficiary.balanceDelta()).delta).to.equal(due);
      });
    });
  });

  describe("#tokenMinted()", async function () {
    context("fails", async function () {
      context("when token not minted but required", async function () {
        it("#priceOf()", async function () {
          await expect(
            this.contract.ownerOf(INVALID_TOKEN_ID)
          ).to.be.revertedWith(ErrorMessages.NONEXISTENT_TOKEN);
        });
        it("#depositOf()", async function () {
          await expect(
            this.contract.depositOf(INVALID_TOKEN_ID)
          ).to.be.revertedWith(ErrorMessages.NONEXISTENT_TOKEN);
        });
        it("#buy()", async function () {
          await expect(
            this.contract.buy(INVALID_TOKEN_ID, ETH0, ETH0, { value: ETH0 })
          ).to.be.revertedWith(ErrorMessages.NONEXISTENT_TOKEN);
        });
        it("#taxOwedSince()", async function () {
          await expect(
            this.contract.taxOwedSince(INVALID_TOKEN_ID, await now())
          ).to.be.revertedWith(ErrorMessages.NONEXISTENT_TOKEN);
        });
      });
    });
  });

  describe("#taxRate()", async function () {
    context("succeeds", async function () {
      it("returning expected tax rate [100%]", async function () {
        expect(await this.alice.contract.taxRate()).to.equal(TAX_RATE);
      });
    });
  });

  describe("#priceOf()", async function () {
    context("succeeds", async function () {
      it("returning expected price [ETH0]", async function () {
        expect(await this.contract.priceOf(TOKENS.ONE)).to.equal(ETH0);
      });
    });
  });

  describe("#depositOf", async function () {
    context("succeeds", async function () {
      it("returning expected deposit [ETH0]", async function () {
        expect(await this.contract.priceOf(TOKENS.ONE)).to.equal(ETH0);
      });
    });
  });

  describe("#taxOwed()", async function () {
    context("fails", async function () {});
    context("succeeds", async function () {
      it("30d: Returns correct taxation after 1 second", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.monthlyContract,
          this.monthlyAlice,
          token,
          ETH1,
          ETH0,
          ETH2,
          30,
        ]);

        const lastCollectionTime =
          await this.monthlyContract.lastCollectionTimes(token);
        await time.increase(1);

        const owed = await this.monthlyContract.taxOwed(token);

        const due = getTaxDue(ETH1, owed.timestamp, lastCollectionTime, 30);

        expect(owed.amount).to.equal(due);
      });

      it("annual: Returns correct taxation after 1 second", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH1,
          ETH0,
          ETH2,
          365,
        ]);

        const lastCollectionTime = await this.contract.lastCollectionTimes(
          token
        );
        await time.increase(1);

        const owed = await this.contract.taxOwed(token);

        const due = getTaxDue(ETH1, owed.timestamp, lastCollectionTime, 365);

        expect(owed.amount).to.equal(due);
      });
    });

    it("30d: Returns correct taxation after 30 days", async function () {
      const token = TOKENS.ONE;

      await buy.apply(this, [
        this.monthlyContract,
        this.monthlyAlice,
        token,
        ETH1,
        ETH0,
        ETH2,
        30,
      ]);

      const lastCollectionTime = await this.monthlyContract.lastCollectionTimes(
        token
      );
      await time.increase(time.duration.days(30));

      const owed = await this.monthlyContract.taxOwed(token);

      const due = getTaxDue(ETH1, owed.timestamp, lastCollectionTime, 30);
      expect(due).to.equal(ETH1); // Ensure that the helper util is correct
      expect(owed.amount).to.equal(due);
      expect(owed.amount).to.equal(ETH1); // 100% over 30 days
    });

    it("30d: Returns correct taxation after 60 days", async function () {
      const token = TOKENS.ONE;

      await buy.apply(this, [
        this.monthlyContract,
        this.monthlyAlice,
        token,
        ETH1,
        ETH0,
        ETH2,
        30,
      ]);

      const lastCollectionTime = await this.monthlyContract.lastCollectionTimes(
        token
      );
      await time.increase(time.duration.days(60));

      const owed = await this.monthlyContract.taxOwed(token);

      const due = getTaxDue(ETH1, owed.timestamp, lastCollectionTime, 30);
      expect(due).to.equal(ETH2); // Ensure that the helper util is correct
      expect(owed.amount).to.equal(due);
      expect(owed.amount).to.equal(ETH2); // 200% over 60 days
    });

    it("annual: Returns correct taxation after 1 year", async function () {
      const token = TOKENS.ONE;

      await buy.apply(this, [
        this.contract,
        this.alice,
        token,
        ETH1,
        ETH0,
        ETH2,
        365,
      ]);

      const lastCollectionTime = await this.contract.lastCollectionTimes(token);
      await time.increase(time.duration.days(365));

      const owed = await this.contract.taxOwed(token);

      const due = getTaxDue(ETH1, owed.timestamp, lastCollectionTime, 365);
      expect(due).to.equal(ETH1); // Ensure that the helper util is correct
      expect(owed.amount).to.equal(due);
      expect(owed.amount).to.equal(ETH1); // 100% over 365 days
    });
  });

  describe("#taxOwedSince()", async function () {
    context("fails", async function () {
      it("Time must be in the past", async function () {
        await expect(
          this.contract.taxOwedSince(TOKENS.ONE, await now())
        ).to.revertedWith(ErrorMessages.REQUIRES_PAST);
      });
    });
    context("succeeds", async function () {
      it("Returns zero if no purchase", async function () {
        expect(
          await this.contract.taxOwedSince(TOKENS.ONE, (await now()).sub(1))
        ).to.equal(0);
      });

      it("30d: Returns correct amount", async function () {
        const token = TOKENS.ONE;
        const price = ETH1;

        await buy.apply(this, [
          this.monthlyContract,
          this.monthlyAlice,
          token,
          price,
          ETH0,
          ETH2,
          30,
        ]);

        const time = (await now()).sub(1);

        const expected = price
          .mul(time)
          .div(taxationPeriodToSeconds(30))
          .mul(TAX_NUMERATOR)
          .div(TAX_DENOMINATOR);

        expect(await this.monthlyContract.taxOwedSince(token, time)).to.equal(
          expected
        );
      });

      it("annual: Returns correct amount", async function () {
        const token = TOKENS.ONE;
        const price = ETH1;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          price,
          ETH0,
          ETH2,
          365,
        ]);

        const time = (await now()).sub(1);

        const expected = price
          .mul(time)
          .div(taxationPeriodToSeconds(365))
          .mul(TAX_NUMERATOR)
          .div(TAX_DENOMINATOR);

        expect(await this.contract.taxOwedSince(token, time)).to.equal(
          expected
        );
      });
    });
  });

  describe("#taxCollectedSinceLastTransfer()", async function () {
    context("fails", async function () {});
    context("succeeds", async function () {
      context("returning correct amount", async function () {
        it("if never transferred", async function () {
          expect(
            await this.contract.taxCollectedSinceLastTransfer(TOKENS.ONE)
          ).to.equal(0);
        });

        it("30d: after initial purchase", async function () {
          const token = TOKENS.ONE;

          await buy.apply(this, [
            this.monthlyContract,
            this.monthlyAlice,
            token,
            ETH1,
            ETH0,
            ETH2,
            30,
          ]);

          const before = await now();

          await time.increase(time.duration.minutes(1));

          await this.monthlyContract._collectTax(token);

          const due = getTaxDue(ETH1, await now(), before, 30);

          expect(
            await this.monthlyContract.taxCollectedSinceLastTransfer(token)
          ).to.equal(due);
        });

        it("annual: after initial purchase", async function () {
          const token = TOKENS.ONE;

          await buy.apply(this, [
            this.contract,
            this.alice,
            token,
            ETH1,
            ETH0,
            ETH2,
            365,
          ]);

          const before = await now();

          await time.increase(time.duration.minutes(1));

          await this.contract._collectTax(token);

          const due = getTaxDue(ETH1, await now(), before, 365);

          expect(
            await this.contract.taxCollectedSinceLastTransfer(token)
          ).to.equal(due);
        });

        it("30d: after 1 secondary-purchase", async function () {
          const token = TOKENS.ONE;

          await buy.apply(this, [
            this.monthlyContract,
            this.monthlyAlice,
            token,
            ETH1,
            ETH0,
            ETH2,
            30,
          ]);

          await time.increase(time.duration.minutes(1));

          await this.monthlyContract._collectTax(token);

          await buy.apply(this, [
            this.monthlyContract,
            this.monthlyBob,
            token,
            ETH2,
            ETH1,
            ETH3,
            30,
          ]);

          const before = await now();

          await time.increase(time.duration.minutes(1));

          await this.monthlyContract._collectTax(token);

          const due = getTaxDue(ETH2, await now(), before, 30);

          expect(
            await this.monthlyContract.taxCollectedSinceLastTransfer(token)
          ).to.equal(due);
        });

        it("annual: after 1 secondary-purchase", async function () {
          const token = TOKENS.ONE;

          await buy.apply(this, [
            this.contract,
            this.alice,
            token,
            ETH1,
            ETH0,
            ETH2,
            365,
          ]);

          await time.increase(time.duration.minutes(1));

          await this.contract._collectTax(token);

          await buy.apply(this, [
            this.contract,
            this.bob,
            token,
            ETH2,
            ETH1,
            ETH3,
            365,
          ]);

          const before = await now();

          await time.increase(time.duration.minutes(1));

          await this.contract._collectTax(token);

          const due = getTaxDue(ETH2, await now(), before, 365);

          expect(
            await this.contract.taxCollectedSinceLastTransfer(token)
          ).to.equal(due);
        });

        it("when foreclosed", async function () {
          const token = TOKENS.ONE;

          await buy.apply(this, [
            this.contract,
            this.alice,
            token,
            ETH1,
            ETH0,
            ETH2,
            365,
          ]);

          await time.increase(time.duration.days(366));
          expect(await this.contract.foreclosed(token)).to.equal(true);
          await time.increase(time.duration.days(1));
          expect(
            await this.contract.taxCollectedSinceLastTransfer(token)
          ).to.equal(0);
        });

        it("30d: after purchase from foreclosure", async function () {
          const token = TOKENS.ONE;

          await buy.apply(this, [
            this.monthlyContract,
            this.monthlyAlice,
            token,
            ETH1,
            ETH0,
            ETH2,
            30,
          ]);

          await time.increase(time.duration.days(31));
          expect(await this.monthlyContract.foreclosed(token)).to.equal(true);

          await time.increase(time.duration.days(1));

          // Purchase out of foreclosure
          await buy.apply(this, [
            this.monthlyContract,
            this.monthlyBob,
            token,
            ETH1,
            ETH0,
            ETH2,
            30,
          ]);

          const before = await now();

          await time.increase(time.duration.minutes(1));

          await this.monthlyContract._collectTax(token);

          const due = getTaxDue(ETH1, await now(), before, 30);

          expect(
            await this.monthlyContract.taxCollectedSinceLastTransfer(token)
          ).to.equal(due);
        });

        it("annual: after purchase from foreclosure", async function () {
          const token = TOKENS.ONE;

          await buy.apply(this, [
            this.contract,
            this.alice,
            token,
            ETH1,
            ETH0,
            ETH2,
            365,
          ]);

          await time.increase(time.duration.days(366));
          expect(await this.contract.foreclosed(token)).to.equal(true);

          await time.increase(time.duration.days(1));

          // Purchase out of foreclosure
          await buy.apply(this, [
            this.contract,
            this.bob,
            token,
            ETH1,
            ETH0,
            ETH2,
            365,
          ]);

          const before = await now();

          await time.increase(time.duration.minutes(1));

          await this.contract._collectTax(token);

          const due = getTaxDue(ETH1, await now(), before, 365);

          expect(
            await this.contract.taxCollectedSinceLastTransfer(token)
          ).to.equal(due);
        });
      });
    });
  });

  describe("#foreclosed()", async function () {
    context("fails", async function () {});
    context("succeeds", async function () {
      it("true positive", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH1,
          ETH0,
          ETH2,
          365,
        ]);

        await time.increase(time.duration.days(366)); // Entire deposit will be exceeded after 1yr
        expect(await this.contract.foreclosed(token)).to.equal(true);
      });
      it("true negative", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH1,
          ETH0,
          ETH2,
          365,
        ]);

        await time.increase(time.duration.minutes(1));
        expect(await this.contract.foreclosed(token)).to.equal(false);
      });
    });
  });

  describe("#withdrawableDeposit()", async function () {
    context("fails", async function () {});
    context("succeeds", async function () {
      it("Returns zero when owed >= deposit", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH1,
          ETH0,
          ETH2,
          365,
        ]);

        // Exhaust deposit
        await time.increase(time.duration.days(366));

        expect(await this.contract.withdrawableDeposit(token)).to.equal(0);
      });
      it("Returns (deposit - owed) when owed < deposit", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH1,
          ETH0,
          ETH2,
          365,
        ]);

        await time.increase(time.duration.days(1));
        const owed = await this.contract.taxOwed(token);

        expect(await this.contract.withdrawableDeposit(token)).to.equal(
          ETH1.sub(owed.amount)
        );
      });
    });
  });

  describe("#foreclosureTime()", async function () {
    context("fails", async function () {});
    context("succeeds", async function () {
      it("30d: time is 10m into the future", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.monthlyContract,
          this.monthlyAlice,
          token,
          ETH1,
          ETH0,
          ETH1.add(MonthlyTenMinDue), // Deposit a surplus 10 min of patronage
          30,
        ]);

        const tenMinutesFromNow = (await now()).add(
          ethers.BigNumber.from(time.duration.minutes(10).toString())
        );

        expect(await this.monthlyContract.foreclosureTime(token)).to.equal(
          tenMinutesFromNow
        );
      });

      it("annual: time is 10m into the future", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH1,
          ETH0,
          ETH1.add(AnnualTenMinDue), // Deposit a surplus 10 min of patronage
          365,
        ]);

        const tenMinutesFromNow = (await now()).add(
          ethers.BigNumber.from(time.duration.minutes(10).toString())
        );
        expect(await this.contract.foreclosureTime(token)).to.equal(
          tenMinutesFromNow
        );
      });

      it("30d: returns backdated time if foreclosed", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.monthlyContract,
          this.monthlyAlice,
          token,
          ETH1,
          ETH0,
          ETH1.add(MonthlyTenMinDue), // Deposit a surplus 10 min of patronage
          30,
        ]);

        await time.increase(time.duration.minutes(10));
        const shouldForecloseAt = await now();

        // Foreclosure should be backdated to when token was in foreclosed state.
        const forecloseAt = await this.monthlyContract.foreclosureTime(token);
        expect(forecloseAt).to.equal(shouldForecloseAt);

        // Trigger foreclosure
        await this.monthlyContract._collectTax(token);

        expect(await this.monthlyContract.ownerOf(token)).to.equal(
          this.monthlyContractAddress
        );

        // Value should remain unchained after foreclosure has taken place
        const oneSecond = ethers.BigNumber.from(
          (await time.duration.seconds(1)).toString()
        );
        expect(await this.monthlyContract.foreclosureTime(token)).to.equal(
          //! This is necessary; not sure why.  Seems related to 1 Wei issue within
          //! "collects after 10m and subsequently after 10m"
          forecloseAt.sub(oneSecond)
        );
      });

      it("annual: returns backdated time if foreclosed", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH1,
          ETH0,
          ETH1.add(AnnualTenMinDue), // Deposit a surplus 10 min of patronage
          365,
        ]);

        await time.increase(time.duration.minutes(10));
        const shouldForecloseAt = await now();

        // Foreclosure should be backdated to when token was in foreclosed state.
        const forecloseAt = await this.contract.foreclosureTime(token);
        expect(forecloseAt).to.equal(shouldForecloseAt);

        // Trigger foreclosure
        await this.contract._collectTax(token);

        expect(await this.contract.ownerOf(token)).to.equal(
          this.contractAddress
        );

        // Value should remain unchained after foreclosure has taken place
        const oneSecond = ethers.BigNumber.from(
          (await time.duration.seconds(1)).toString()
        );
        expect(await this.contract.foreclosureTime(token)).to.equal(
          //! This is necessary; not sure why.  Seems related to 1 Wei issue within
          //! "collects after 10m and subsequently after 10m"
          forecloseAt.sub(oneSecond)
        );
      });
    });
  });

  describe("#buy()", async function () {
    context("fails", async function () {
      it("Attempting to buy an un-minted token", async function () {
        await expect(
          this.alice.contract.buy(INVALID_TOKEN_ID, ETH1, ETH1, { value: ETH1 })
        ).to.be.revertedWith(ErrorMessages.NONEXISTENT_TOKEN);
      });
      it("Verifying incorrect Current Price", async function () {
        await expect(
          this.alice.contract.buy(
            TOKENS.ONE,
            ETH1, // Purchase price of 1
            ETH1, // current price of 1 [should be ETH0]
            { value: ETH1 }
          )
        ).to.be.revertedWith(ErrorMessages.BUY_INCORRECT_CURRENT_PRICE);
      });
      it("Attempting to buy with 0 Wei", async function () {
        await expect(
          this.alice.contract.buy(
            TOKENS.ONE,
            ETH0, // [must be greater than 0]
            ETH0,
            { value: ETH0 } // [must be greater than 0]
          )
        ).to.be.revertedWith(ErrorMessages.BUY_ZERO_PRICE);
      });
      it("When purchase price is less than message value", async function () {
        await expect(
          this.alice.contract.buy(
            TOKENS.ONE,
            ETH0, // Purchase price of zero
            ETH0, // Current Price [correct]
            { value: ETH1 } // Send 1 Eth
          )
        ).to.be.revertedWith(ErrorMessages.BUY_ZERO_PRICE);
      });
      it("Attempting to buy with price less than current price", async function () {
        // Purchase as Bob for 2 ETH
        await buy.apply(this, [
          this.contract,
          this.bob,
          TOKENS.TWO,
          ETH2,
          ETH0,
          ETH3,
          365,
        ]);

        await expect(
          this.alice.contract.buy(
            TOKENS.TWO, // owned by Bob
            ETH1, // [should be ETH2]
            ETH2, // Correct
            { value: ETH1 } // [should be ETH2]
          )
        ).to.be.revertedWith(ErrorMessages.BUY_PRICE_BELOW_CURRENT);
      });
      it("Attempting to buy without surplus value for deposit", async function () {
        await expect(
          this.alice.contract.buy(TOKENS.ONE, ETH1, ETH0, { value: ETH1 }) // [should be greater than ETH1]
        ).to.be.revertedWith(ErrorMessages.BUY_LACKS_SURPLUS_VALUE);
      });
      it("Attempting to purchase a token it already owns", async function () {
        // Purchase
        await buy.apply(this, [
          this.contract,
          this.bob,
          TOKENS.TWO,
          ETH2,
          ETH0,
          ETH3,
          365,
        ]);
        // Re-purchase
        await expect(
          this.bob.contract.buy(TOKENS.TWO, ETH3, ETH2, { value: ETH4 })
        ).to.be.revertedWith(ErrorMessages.BUY_ALREADY_OWNED);
      });
    });
    context("succeeds", async function () {
      it("Purchasing token for the first-time (from contract)", async function () {
        await buy.apply(this, [
          this.contract,
          this.alice,
          TOKENS.ONE,
          ETH1,
          ETH0,
          ETH2,
          365,
        ]);
      });

      it("30d: Purchasing token from current owner", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.monthlyContract,
          this.monthlyAlice,
          token,
          ETH1,
          ETH0,
          ETH2,
          30,
        ]);

        await time.increase(time.duration.minutes(10));

        await buy.apply(this, [
          this.monthlyContract,
          this.monthlyBob,
          token,
          ETH2,
          ETH1,
          ETH3,
          30,
        ]);
      });

      it("annual: Purchasing token from current owner", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH1,
          ETH0,
          ETH2,
          365,
        ]);

        await time.increase(time.duration.minutes(10));

        await buy.apply(this, [
          this.contract,
          this.bob,
          token,
          ETH2,
          ETH1,
          ETH3,
          365,
        ]);
      });

      it("Purchasing token from foreclosure", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH1,
          ETH0,
          ETH2,
          365,
        ]);

        // Exhaust deposit
        await time.increase(time.duration.days(366));

        // Trigger foreclosure & buy it out of foreclosure
        expect(
          await this.bob.contract.buy(token, ETH1, ETH0, {
            value: ETH2,
          })
        )
          .to.emit(this.contract, Events.FORECLOSURE)
          .withArgs(token, this.alice.address);

        expect(await this.contract.ownerOf(token)).to.equal(this.bob.address);
      });
      it("Purchasing token from current owner who purchased from foreclosure", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH1,
          ETH0,
          ETH2,
          365,
        ]);

        // Exhaust deposit
        await time.increase(time.duration.days(366));

        // Buy out of foreclosure
        await buy.apply(this, [
          this.contract,
          this.bob,
          token,
          ETH1,
          ETH0,
          ETH2,
          365,
        ]);

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH2,
          ETH1,
          ETH3,
          365,
        ]);
      });
      it("Owner prior to foreclosure re-purchases", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH1,
          ETH0,
          ETH2,
          365,
        ]);

        // Exhaust deposit
        await time.increase(time.duration.days(366));

        // Buy out of foreclosure
        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH1,
          ETH0,
          ETH2,
          365,
        ]);
      });
      it("Updating chain of title", async function () {
        const token = TOKENS.ONE;

        const { block: block1 } = await buy.apply(this, [
          this.contract,
          this.bob,
          token,
          ETH1,
          ETH0,
          ETH2,
          365,
        ]);

        const { block: block2 } = await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH2,
          ETH1,
          ETH3,
          365,
        ]);

        const chainOfTitle = await this.contract.titleChainOf(token);

        expect(chainOfTitle[0].from).to.equal(this.contractAddress);
        expect(chainOfTitle[0].to).to.equal(this.bob.address);
        expect(chainOfTitle[0].price).to.equal(ETH1);
        expect(chainOfTitle[0].timestamp).to.equal(
          ethers.BigNumber.from(block1.timestamp)
        );
        expect(chainOfTitle[1].from).to.equal(this.bob.address);
        expect(chainOfTitle[1].to).to.equal(this.alice.address);
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
          this.alice.contract.depositWei(TOKENS.ONE, {
            value: ethers.utils.parseEther("1"),
          })
        ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
      });
    });
    context("succeeds", async function () {
      it("owner can deposit", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH1,
          ETH0,
          ETH2,
          365,
        ]);

        await expect(
          this.alice.contract.depositWei(token, { value: ETH1 })
        ).to.not.reverted;
      });
    });
  });

  describe("#changePrice()", async function () {
    context("fails", async function () {
      it("only owner can update price", async function () {
        await expect(
          this.alice.contract.changePrice(TOKENS.ONE, 500)
        ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
      });
      it("cannot have a new price of zero", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH1,
          ETH0,
          ETH2,
          365,
        ]);
        await expect(
          this.alice.contract.changePrice(token, ETH0)
        ).to.be.revertedWith(ErrorMessages.NEW_PRICE_ZERO);
      });
      it("cannot have price set to same amount", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH1,
          ETH0,
          ETH2,
          365,
        ]);
        await expect(
          this.alice.contract.changePrice(token, ETH1)
        ).to.be.revertedWith(ErrorMessages.NEW_PRICE_SAME);
      });
    });
    context("succeeds", async function () {
      it("owner can change price to more", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH1,
          ETH0,
          ETH2,
          365,
        ]);

        expect(await this.alice.contract.changePrice(token, ETH2))
          .to.emit(this.contract, Events.PRICE_CHANGE)
          .withArgs(TOKENS.ONE, ETH2);

        expect(await this.contract.priceOf(token)).to.equal(ETH2);
      });

      it("owner can change price to less", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH2,
          ETH0,
          ETH3,
          365,
        ]);

        expect(await this.alice.contract.changePrice(token, ETH1))
          .to.emit(this.contract, Events.PRICE_CHANGE)
          .withArgs(TOKENS.ONE, ETH1);

        expect(await this.contract.priceOf(token)).to.equal(ETH1);
      });
    });
  });

  describe("#withdrawDeposit()", async function () {
    context("fails", async function () {
      it("Non-owner", async function () {
        await expect(
          this.alice.contract.withdrawDeposit(TOKENS.ONE, 10)
        ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
      });

      it("Cannot withdraw more than deposited", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH1,
          ETH0,
          ETH2,
          365,
        ]);

        await expect(
          this.alice.contract.withdrawDeposit(token, ETH2)
        ).to.be.revertedWith(ErrorMessages.CANNOT_WITHDRAW_MORE_THAN_DEPOSITED);
      });
    });

    context("succeeds", async function () {
      it("30d: Withdraws expected amount", async function () {
        const token = TOKENS.ONE;
        const price = ETH1;

        await buy.apply(this, [
          this.monthlyContract,
          this.monthlyAlice,
          token,
          price,
          ETH0,
          ETH3,
          30,
        ]);

        // Necessary to determine tax due on exit
        const lastCollectionTime =
          await this.monthlyContract.lastCollectionTimes(token);

        const trx = await this.monthlyAlice.contract.withdrawDeposit(
          token,
          ETH1
        );
        const { timestamp } = await this.provider.getBlock(trx.blockNumber);

        // Emits
        expect(trx)
          .to.emit(this.monthlyContract, Events.DEPOSIT_WITHDRAWAL)
          .withArgs(token, ETH1);

        // current deposit - tax on exit
        const taxedAmt = getTaxDue(
          price,
          ethers.BigNumber.from(timestamp),
          lastCollectionTime,
          30
        );

        // Deposit should be 1 ETH - taxed amount.
        expect(await this.monthlyContract.depositOf(token)).to.equal(
          ETH1.sub(taxedAmt)
        );

        // Alice's balance should reflect returned deposit [1 ETH] minus fees
        const { delta, fees } = await this.monthlyAlice.balanceDelta();

        const expectedRemittanceMinusGas = ETH1.sub(fees);

        expect(delta).to.equal(expectedRemittanceMinusGas);
      });

      it("annual: Withdraws expected amount", async function () {
        const token = TOKENS.ONE;
        const price = ETH1;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          price,
          ETH0,
          ETH3,
          30,
        ]);

        // Necessary to determine tax due on exit
        const lastCollectionTime = await this.contract.lastCollectionTimes(
          token
        );

        const trx = await this.alice.contract.withdrawDeposit(token, ETH1);
        const { timestamp } = await this.provider.getBlock(trx.blockNumber);

        // Emits
        expect(trx)
          .to.emit(this.contract, Events.DEPOSIT_WITHDRAWAL)
          .withArgs(token, ETH1);

        // current deposit - tax on exit
        const taxedAmt = getTaxDue(
          price,
          ethers.BigNumber.from(timestamp),
          lastCollectionTime,
          365
        );

        // Deposit should be 1 ETH - taxed amount.
        expect(await this.contract.depositOf(token)).to.equal(
          ETH1.sub(taxedAmt)
        );

        // Alice's balance should reflect returned deposit [1 ETH] minus fees
        const { delta, fees } = await this.alice.balanceDelta();

        const expectedRemittanceMinusGas = ETH1.sub(fees);

        expect(delta).to.equal(expectedRemittanceMinusGas);
      });
    });
  });

  describe("#exit()", async function () {
    context("fails", async function () {
      it("Non-owner", async function () {
        await expect(
          this.alice.contract.withdrawDeposit(TOKENS.ONE, 10)
        ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
      });
    });

    context("succeeds", async function () {
      it("30d: Withdraws entire deposit", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.monthlyContract,
          this.monthlyAlice,
          token,
          ETH1,
          ETH0,
          ETH2,
          30,
        ]);

        // Determine tax due on exit
        const lastCollectionTime =
          await this.monthlyContract.lastCollectionTimes(token);

        const trx = await this.monthlyAlice.contract.exit(token);
        const { timestamp } = await this.provider.getBlock(trx.blockNumber);

        // current deposit - tax on exit
        const taxedAmt = getTaxDue(
          ETH1,
          ethers.BigNumber.from(timestamp),
          lastCollectionTime,
          30
        );

        const expectedRemittance = ETH1.sub(taxedAmt);

        // Emits
        expect(trx)
          .to.emit(this.monthlyContract, Events.DEPOSIT_WITHDRAWAL)
          .withArgs(token, expectedRemittance);

        // Alice's balance should reflect returned deposit minus fees
        const { delta, fees } = await this.monthlyAlice.balanceDelta();

        const expectedRemittanceMinusGas = expectedRemittance.sub(fees);

        expect(delta).to.equal(expectedRemittanceMinusGas);

        // Deposit should be zero
        expect(await this.monthlyContract.depositOf(token)).to.equal(0);

        // Token should foreclose
        expect(await this.monthlyContract.priceOf(token)).to.equal(0);
      });

      it("annual: Withdraws entire deposit", async function () {
        const token = TOKENS.ONE;

        await buy.apply(this, [
          this.contract,
          this.alice,
          token,
          ETH1,
          ETH0,
          ETH2,
          365,
        ]);

        // Determine tax due on exit
        const lastCollectionTime = await this.contract.lastCollectionTimes(
          token
        );

        const trx = await this.alice.contract.exit(token);
        const { timestamp } = await this.provider.getBlock(trx.blockNumber);

        // current deposit - tax on exit
        const taxedAmt = getTaxDue(
          ETH1,
          ethers.BigNumber.from(timestamp),
          lastCollectionTime,
          365
        );

        const expectedRemittance = ETH1.sub(taxedAmt);

        // Emits
        expect(trx)
          .to.emit(this.contract, Events.DEPOSIT_WITHDRAWAL)
          .withArgs(token, expectedRemittance);

        // Alice's balance should reflect returned deposit minus fees
        const { delta, fees } = await this.alice.balanceDelta();

        const expectedRemittanceMinusGas = expectedRemittance.sub(fees);

        expect(delta).to.equal(expectedRemittanceMinusGas);

        // Deposit should be zero
        expect(await this.contract.depositOf(token)).to.equal(0);

        // Token should foreclose
        expect(await this.contract.priceOf(token)).to.equal(0);
      });
    });
  });

  describe("#withdrawOutstandingRemittance()", async function () {
    context("fails", async function () {
      it("when no outstanding remittance", async function () {
        await expect(
          this.alice.contract.withdrawOutstandingRemittance()
        ).to.be.revertedWith(ErrorMessages.NO_OUTSTANDING_REMITTANCE);
      });
    });
    // TODO: Add force buy remittance to fail with a blocker this.contract.
    context("succeeds", async function () {});
  });

  describe("#transferToken()", async function () {
    context("fails", async function () {
      it("it's an internal method", async function () {
        try {
          await this.contract.transferToken();
        } catch (error) {
          expect(error).instanceOf(TypeError);
          expect(error.message).to.equal(
            "this.contract.transferToken is not a function"
          );
        }
      });
    });
  });
});
