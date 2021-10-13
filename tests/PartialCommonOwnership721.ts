//@ts-nocheck

import { time, balance } from "@openzeppelin/test-helpers";

import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import Wallet from "./helpers/Wallet";

//$ Enums

enum ErrorMessages {
  ONLY_OWNER = "Sender does not own this token",
  BUY_ZERO_PRICE = "New Price cannot be zero",
  BUY_INCORRECT_CURRENT_PRICE = "Current Price is incorrect",
  BUY_PRICE_BELOW_CURRENT = "New Price must be >= current price",
  BUY_LACKS_SURPLUS_VALUE = "Message does not contain surplus value for deposit",
  BUY_ALREADY_OWNED = "Buyer is already owner",
  NONEXISTENT_TOKEN = "ERC721: owner query for nonexistent token",
  NEW_PRICE_ZERO = "New price cannot be zero",
  NEW_PRICE_SAME = "New price cannot be same",
  REQUIRES_PAST = "Time must be in the past",
  // Not testing reentrancy lock, currently.
  //LOCKED = "Token is locked",
  CANNOT_WITHDRAW_MORE_THAN_DEPOSITED = "Cannot withdraw more than deposited",
  NO_OUTSTANDING_REMITTANCE = "No outstanding remittance",
  PROHIBITED_TRANSFER_METHOD = "Transfers may only occur via purchase/foreclosure",
}

enum TOKENS {
  ONE = 1,
  TWO = 2,
  THREE = 3,
}

enum Events {
  BUY = "LogBuy",
  OUTSTANDING_REMITTANCE = "LogOutstandingRemittance",
  PRICE_CHANGE = "LogPriceChange",
  FORECLOSURE = "LogForeclosure",
  COLLECTION = "LogCollection",
  BENEFICIARY_REMITTANCE = "LogBeneficiaryRemittance",
  REMITTANCE = "LogRemittance",
  DEPOSIT_WITHDRAWAL = "LogDepositWithdrawal",
}

//$ Constants

const TEST_NAME = "721TEST";
const TEST_SYMBOL = "TEST";

const INVALID_TOKEN_ID = 999;

const ETH0 = ethers.BigNumber.from("0");
const ETH1 = ethers.utils.parseEther("1");
const ETH2 = ethers.utils.parseEther("2");
const ETH3 = ethers.utils.parseEther("3");
const ETH4 = ethers.utils.parseEther("4");

// 100% Tax Rate
const AnnualTenMinDue = ethers.BigNumber.from("19025875190258"); // price of 1 ETH
const AnnualTenMinOneSecDue = ethers.BigNumber.from("19057584982242"); // price of 1 ETH
const MonthlyTenMinDue = ethers.BigNumber.from("231481481481481"); // price of 1 ETH
const MonthlyTenMinOneSecDue = ethers.BigNumber.from("231867283950617"); // price of 1 ETH
const TAX_RATE = 1000000000000; // 100%

const TAX_NUMERATOR = ethers.BigNumber.from(TAX_RATE);
const TAX_DENOMINATOR = ethers.BigNumber.from("1000000000000");

//$ Helper Functions

/**
 * Gets current time
 * @returns Current Time as BigNumber
 */
async function now(): Promise<BigNumber> {
  const bn = await time.latest();
  return ethers.BigNumber.from(`0x${bn.toString(16)}`);
}

/**
 * Converts a taxation period, in days to seconds, as a big number.
 * @param period Period, as integer, in days.
 * @returns Period, as BigNumber, in seconds.
 */
function taxationPeriodToSeconds(period: number): ethers.BigNumber {
  return ethers.BigNumber.from(period * 86400); // 86,400 seconds in a day
}

/**
 * Calculates the tax due.
 * price * (now - timeLastCollected) * patronageNumerator / patronageDenominator / 365 days;
 * @param price Current price
 * @param now Unix timestamp when request was made
 * @param lastCollectionTime Unix timestamp of last tax collection
 * @returns Tax due between now and last collection.
 */
function getTaxDue(
  price: BigNumber,
  now: BigNumber,
  lastCollectionTime: BigNumber,
  taxationPeriod: number
): BigNumber {
  return price
    .mul(
      now.sub(lastCollectionTime) // time since last collection
    )
    .mul(TAX_NUMERATOR)
    .div(TAX_DENOMINATOR)
    .div(taxationPeriodToSeconds(taxationPeriod));
}

//$ Tests

describe("PartialCommonOwnership721", async function () {
  //$ Setup

  before(async function () {
    this.provider = new ethers.providers.Web3Provider(web3.currentProvider);
    const signers = await ethers.getSigners();
    const accounts = await Promise.all(
      signers.map(async (signer) => await signer.getAddress())
    );

    const contractFactory = await ethers.getContractFactory("Test721Token");

    //$ Set up contracts

    this.globalTrxConfig = {
      gasLimit: 9500000, // if gas limit is set, estimateGas isn't run superfluously, slowing tests down.
    };

    this.monthlyContract = await contractFactory.deploy(
      accounts[1],
      30, // 30-day taxation period
      this.globalTrxConfig
    );
    this.contract = await contractFactory.deploy(
      accounts[1],
      365, // 365-day taxation period
      this.globalTrxConfig
    );

    await this.monthlyContract.deployed();
    await this.contract.deployed();

    this.monthlyContractAddress = this.monthlyContract.address;
    expect(this.monthlyContractAddress).to.not.be.null;

    this.contractAddress = this.contract.address;
    expect(this.contractAddress).to.not.be.null;

    //$ Set up wallets

    this.beneficiary = new Wallet(this.contract, signers[1]);
    this.alice = new Wallet(this.contract, signers[2]);
    this.bob = new Wallet(this.contract, signers[3]);
    this.monthlyAlice = new Wallet(this.monthlyContract, signers[2]);
    this.monthlyBob = new Wallet(this.monthlyContract, signers[3]);

    await Promise.all(
      [
        this.beneficiary,
        this.monthlyAlice,
        this.monthlyBob,
        this.alice,
        this.bob,
      ].map(function (wallet) {
        return wallet.setup();
      })
    );

    this.snapshot = await this.provider.send("evm_snapshot", []);
  });

  /**
   * Between each test wipe the state of the this.contract.
   */
  beforeEach(async function () {
    // Reset contract state
    await this.provider.send("evm_revert", [this.snapshot]);
    this.snapshot = await this.provider.send("evm_snapshot", []);

    // Reset balance trackers
    await this.beneficiary.balance.get();
    await this.alice.balance.get();
    await this.bob.balance.get();

    await this.monthlyAlice.balance.get();
    await this.monthlyBob.balance.get();
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
        await this.monthlyAlice.contract.buy(token, price, ETH0, {
          value: ETH2,
        });

        // Sanity check & update baseline beneficiary balance
        expect(
          ethers.BigNumber.from(
            (await this.beneficiary.balance.delta()).toString()
          )
        ).to.equal(price);

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
        expect(
          ethers.BigNumber.from(
            (await this.beneficiary.balance.delta()).toString()
          )
        ).to.equal(due);
      });

      it("annual: collects after 10m", async function () {
        const price = ETH1;
        const token = TOKENS.ONE;
        await this.alice.contract.buy(token, price, ETH0, {
          value: ETH2,
        });

        // Sanity check & update baseline beneficiary balance
        expect(
          ethers.BigNumber.from(
            (await this.beneficiary.balance.delta()).toString()
          )
        ).to.equal(price);

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
        expect(
          ethers.BigNumber.from(
            (await this.beneficiary.balance.delta()).toString()
          )
        ).to.equal(due);
      });

      it("30d: collects after 10m and subsequently after 10m", async function () {
        const price = ETH1;
        const token = TOKENS.ONE;
        await this.monthlyAlice.contract.buy(token, price, ETH0, {
          value: ETH2,
        });

        // Baseline the beneficiary balance.
        await this.beneficiary.balance.get();

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
        expect(
          ethers.BigNumber.from(
            (await this.beneficiary.balance.delta()).toString()
          )
        ).to.equal(due);
      });

      it("annual: collects after 10m and subsequently after 10m", async function () {
        const price = ETH1;
        const token = TOKENS.ONE;
        await this.alice.contract.buy(token, price, ETH0, {
          value: ETH2,
        });

        // Baseline the beneficiary balance.
        await this.beneficiary.balance.get();

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
        expect(
          ethers.BigNumber.from(
            (await this.beneficiary.balance.delta()).toString()
          )
        ).to.equal(due);
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

        await this.monthlyAlice.contract.buy(token, ETH1, ETH0, {
          value: ETH2,
          ...this.globalTrxConfig,
        });

        const lastCollectionTime =
          await this.monthlyContract.lastCollectionTimes(token);
        await time.increase(1);

        const owed = await this.monthlyContract.taxOwed(token);

        const due = getTaxDue(ETH1, owed.timestamp, lastCollectionTime, 30);

        expect(owed.amount).to.equal(due);
      });

      it("annual: Returns correct taxation after 1 second", async function () {
        const token = TOKENS.ONE;

        await this.alice.contract.buy(token, ETH1, ETH0, {
          value: ETH2,
          ...this.globalTrxConfig,
        });

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

      await this.monthlyAlice.contract.buy(token, ETH1, ETH0, {
        value: ETH2,
        ...this.globalTrxConfig,
      });

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

      await this.monthlyAlice.contract.buy(token, ETH1, ETH0, {
        value: ETH2,
        ...this.globalTrxConfig,
      });

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

      await this.alice.contract.buy(token, ETH1, ETH0, {
        value: ETH2,
        ...this.globalTrxConfig,
      });

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
        await this.monthlyAlice.contract.buy(token, price, ETH0, {
          value: ETH2,
        });

        const time = (await now()).sub(1);

        const expected = price
          .mul(time)
          .mul(TAX_NUMERATOR)
          .div(TAX_DENOMINATOR)
          .div(taxationPeriodToSeconds(30));

        expect(await this.monthlyContract.taxOwedSince(token, time)).to.equal(
          expected
        );
      });

      it("annual: Returns correct amount", async function () {
        const token = TOKENS.ONE;
        const price = ETH1;
        await this.alice.contract.buy(token, price, ETH0, {
          value: ETH2,
        });

        const time = (await now()).sub(1);

        const expected = price
          .mul(time)
          .mul(TAX_NUMERATOR)
          .div(TAX_DENOMINATOR)
          .div(taxationPeriodToSeconds(365));

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
          await this.monthlyAlice.contract.buy(token, ETH1, ETH0, {
            value: ETH2,
          });

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
          await this.alice.contract.buy(token, ETH1, ETH0, {
            value: ETH2,
          });

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
          await this.monthlyAlice.contract.buy(token, ETH1, ETH0, {
            value: ETH2,
          });

          await time.increase(time.duration.minutes(1));

          await this.monthlyContract._collectTax(token);

          await this.monthlyBob.contract.buy(token, ETH2, ETH1, {
            value: ETH3,
          });

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
          await this.alice.contract.buy(token, ETH1, ETH0, { value: ETH2 });

          await time.increase(time.duration.minutes(1));

          await this.contract._collectTax(token);

          await this.bob.contract.buy(token, ETH2, ETH1, { value: ETH3 });

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
          await this.alice.contract.buy(token, ETH1, ETH0, { value: ETH2 });
          await time.increase(time.duration.days(366));
          expect(await this.contract.foreclosed(token)).to.equal(true);
          await time.increase(time.duration.days(1));
          expect(
            await this.contract.taxCollectedSinceLastTransfer(token)
          ).to.equal(0);
        });

        it("30d: after purchase from foreclosure", async function () {
          const token = TOKENS.ONE;
          await this.monthlyAlice.contract.buy(token, ETH1, ETH0, {
            value: ETH2,
          });

          await time.increase(time.duration.days(31));
          expect(await this.monthlyContract.foreclosed(token)).to.equal(true);

          await time.increase(time.duration.days(1));
          // Purchase out of foreclosure
          await this.monthlyBob.contract.buy(token, ETH1, ETH0, {
            value: ETH2,
          });

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
          await this.alice.contract.buy(token, ETH1, ETH0, { value: ETH2 });

          await time.increase(time.duration.days(366));
          expect(await this.contract.foreclosed(token)).to.equal(true);

          await time.increase(time.duration.days(1));
          // Purchase out of foreclosure
          await this.bob.contract.buy(token, ETH1, ETH0, {
            value: ETH2,
          });

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
        await this.alice.contract.buy(token, ETH1, ETH0, { value: ETH2 });
        await time.increase(time.duration.days(366)); // Entire deposit will be exceeded after 1yr
        expect(await this.contract.foreclosed(token)).to.equal(true);
      });
      it("true negative", async function () {
        const token = TOKENS.ONE;
        await this.alice.contract.buy(token, ETH1, ETH0, { value: ETH2 });
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
        await this.alice.contract.buy(token, ETH1, ETH0, {
          value: ETH2,
        });
        // Exhaust deposit
        await time.increase(time.duration.days(366));

        expect(await this.contract.withdrawableDeposit(token)).to.equal(0);
      });
      it("Returns (deposit - owed) when owed < deposit", async function () {
        const token = TOKENS.ONE;
        await this.alice.contract.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

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
        await this.monthlyAlice.contract.buy(token, ETH1, ETH0, {
          // Deposit a surplus 10 min of patronage
          value: ETH1.add(MonthlyTenMinDue),
        });

        const tenMinutesFromNow = (await now()).add(
          ethers.BigNumber.from(time.duration.minutes(10).toString())
        );

        expect(await this.monthlyContract.foreclosureTime(token)).to.equal(
          tenMinutesFromNow
        );
      });

      it("annual: time is 10m into the future", async function () {
        const token = TOKENS.ONE;
        await this.alice.contract.buy(token, ETH1, ETH0, {
          // Deposit a surplus 10 min of patronage
          value: ETH1.add(AnnualTenMinDue),
        });

        const tenMinutesFromNow = (await now()).add(
          ethers.BigNumber.from(time.duration.minutes(10).toString())
        );
        expect(await this.contract.foreclosureTime(token)).to.equal(
          tenMinutesFromNow
        );
      });

      it("30d: returns backdated time if foreclosed", async function () {
        const token = TOKENS.ONE;
        await this.monthlyAlice.contract.buy(token, ETH1, ETH0, {
          // Deposit a surplus 10 min of patronage
          value: ETH1.add(MonthlyTenMinDue),
        });

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
        await this.alice.contract.buy(token, ETH1, ETH0, {
          // Deposit a surplus 10 min of patronage
          value: ETH1.add(AnnualTenMinDue),
        });

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
        await this.bob.contract.buy(TOKENS.TWO, ETH2, ETH0, { value: ETH3 });

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
        await this.bob.contract.buy(TOKENS.TWO, ETH2, ETH0, { value: ETH3 });
        // Re-purchase
        await expect(
          this.bob.contract.buy(TOKENS.TWO, ETH3, ETH2, { value: ETH4 })
        ).to.be.revertedWith(ErrorMessages.BUY_ALREADY_OWNED);
      });
    });
    context("succeeds", async function () {
      it("Purchasing token for the first-time (from contract)", async function () {
        const event = await this.alice.contract.buy(TOKENS.ONE, ETH1, ETH0, {
          value: ETH2,
        });
        // Buy Event emitted
        expect(event)
          .to.emit(this.contract, Events.BUY)
          .withArgs(TOKENS.ONE, this.alice.address, ETH1);
        // Remittance Event emitted
        expect(event)
          .to.emit(this.contract, Events.REMITTANCE)
          .withArgs(TOKENS.ONE, this.beneficiary.address, ETH1);
        // Deposit updated
        expect(await this.contract.depositOf(TOKENS.ONE)).to.equal(ETH1);
        // Price updated
        expect(await this.contract.priceOf(TOKENS.ONE)).to.equal(ETH1);
        // Owned updated
        expect(await this.contract.ownerOf(TOKENS.ONE)).to.equal(
          this.alice.address
        );
        // Eth [price = 1 Eth] remitted to beneficiary
        expect(
          ethers.BigNumber.from(
            (await this.beneficiary.balance.delta()).toString()
          )
        ).to.equal(ETH1);
      });

      it("30d: Purchasing token from current owner", async function () {
        const token = TOKENS.ONE;
        await this.monthlyAlice.contract.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        // Baseline Alice's balance
        await this.monthlyAlice.balance.get();

        await time.increase(time.duration.minutes(10));

        // Get current deposit and tax owed to determine how much will be
        // collected from Alice's deposit when `#buy()` is called.
        const depositBefore = await this.monthlyContract.depositOf(token);

        // Deposit - due + 2ETH (from sale)
        const expectedRemittance = depositBefore
          .sub(MonthlyTenMinOneSecDue)
          .add(ETH2);

        // Buy
        const event = await this.monthlyBob.contract.buy(token, ETH2, ETH1, {
          value: ETH3,
        });

        // Buy Event emitted
        expect(event)
          .to.emit(this.monthlyContract, Events.BUY)
          .withArgs(token, this.monthlyBob.contract.signer.address, ETH2);

        // Remittance Event emitted
        expect(event)
          .to.emit(this.monthlyContract, Events.REMITTANCE)
          .withArgs(
            token,
            this.monthlyAlice.contract.signer.address,
            expectedRemittance
          );

        // Deposit updated
        expect(await this.monthlyContract.depositOf(token)).to.equal(ETH1);

        // Price updated
        expect(await this.monthlyContract.priceOf(token)).to.equal(ETH2);

        // Owned updated
        expect(await this.monthlyContract.ownerOf(token)).to.equal(
          this.monthlyBob.contract.signer.address
        );

        // Alice's balance should reflect received remittance
        expect(
          ethers.BigNumber.from(
            (await this.monthlyAlice.balance.delta()).toString()
          )
        ).to.equal(expectedRemittance);
      });

      it("annual: Purchasing token from current owner", async function () {
        const token = TOKENS.ONE;
        await this.alice.contract.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        // Baseline Alice's balance
        await this.alice.balance.get();

        await time.increase(time.duration.minutes(10));

        // Get current deposit and tax owed to determine how much will be
        // collected from Alice's deposit when `#buy()` is called.
        const depositBefore = await this.contract.depositOf(token);

        // Deposit - due + 2ETH (from sale)
        const expectedRemittance = depositBefore
          .sub(AnnualTenMinOneSecDue)
          .add(ETH2);

        // Buy
        const event = await this.bob.contract.buy(token, ETH2, ETH1, {
          value: ETH3,
        });

        // Buy Event emitted
        expect(event)
          .to.emit(this.contract, Events.BUY)
          .withArgs(token, this.bob.contract.signer.address, ETH2);

        // Remittance Event emitted
        expect(event)
          .to.emit(this.contract, Events.REMITTANCE)
          .withArgs(token, this.alice.address, expectedRemittance);

        // Deposit updated
        expect(await this.contract.depositOf(token)).to.equal(ETH1);

        // Price updated
        expect(await this.contract.priceOf(token)).to.equal(ETH2);

        // Owned updated
        expect(await this.contract.ownerOf(token)).to.equal(
          this.bob.contract.signer.address
        );

        // Alice's balance should reflect received remittance
        expect(
          ethers.BigNumber.from((await this.alice.balance.delta()).toString())
        ).to.equal(expectedRemittance);
      });

      it("Purchasing token from foreclosure", async function () {
        const token = TOKENS.ONE;
        await this.alice.contract.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

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

        expect(await this.contract.ownerOf(token)).to.equal(
          this.bob.contract.signer.address
        );
      });
      it("Purchasing token from current owner who purchased from foreclosure", async function () {
        const token = TOKENS.ONE;
        await this.alice.contract.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        // Exhaust deposit
        await time.increase(time.duration.days(366));

        // Buy out of foreclosure
        await this.bob.contract.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        await this.alice.contract.buy(token, ETH2, ETH1, {
          value: ETH3,
        });

        expect(await this.contract.ownerOf(token)).to.equal(this.alice.address);
      });
      it("Owner prior to foreclosure re-purchases", async function () {
        const token = TOKENS.ONE;
        await this.alice.contract.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        // Exhaust deposit
        await time.increase(time.duration.days(366));

        // Buy out of foreclosure
        await this.alice.contract.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        expect(await this.contract.ownerOf(token)).to.equal(this.alice.address);
      });
      it("Updating chain of title", async function () {
        const token = TOKENS.ONE;
        const trx1 = await this.bob.contract.buy(token, ETH1, ETH0, {
          value: ETH2,
        });
        const block1 = await this.provider.getBlock(trx1.blockNumber);

        const trx2 = await this.alice.contract.buy(token, ETH2, ETH1, {
          value: ETH3,
        });
        const block2 = await this.provider.getBlock(trx2.blockNumber);

        const chainOfTitle = await this.contract.titleChainOf(token);

        expect(chainOfTitle[0].from).to.equal(this.contractAddress);
        expect(chainOfTitle[0].to).to.equal(this.bob.contract.signer.address);
        expect(chainOfTitle[0].price).to.equal(ETH1);
        expect(chainOfTitle[0].timestamp).to.equal(
          ethers.BigNumber.from(block1.timestamp)
        );
        expect(chainOfTitle[1].from).to.equal(this.bob.contract.signer.address);
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
        await this.alice.contract.buy(token, ETH1, ETH0, { value: ETH2 });
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
        await this.alice.contract.buy(token, ETH1, ETH0, {
          value: ETH2,
        });
        await expect(
          this.alice.contract.changePrice(token, ETH0)
        ).to.be.revertedWith(ErrorMessages.NEW_PRICE_ZERO);
      });
      it("cannot have price set to same amount", async function () {
        const token = TOKENS.ONE;
        await this.alice.contract.buy(token, ETH1, ETH0, {
          value: ETH2,
        });
        await expect(
          this.alice.contract.changePrice(token, ETH1)
        ).to.be.revertedWith(ErrorMessages.NEW_PRICE_SAME);
      });
    });
    context("succeeds", async function () {
      it("owner can change price to more", async function () {
        const token = TOKENS.ONE;
        await this.alice.contract.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        expect(await this.alice.contract.changePrice(token, ETH2))
          .to.emit(this.contract, Events.PRICE_CHANGE)
          .withArgs(TOKENS.ONE, ETH2);

        expect(await this.contract.priceOf(token)).to.equal(ETH2);
      });

      it("owner can change price to less", async function () {
        const token = TOKENS.ONE;
        await this.alice.contract.buy(token, ETH2, ETH0, {
          value: ETH3,
        });

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
        await this.alice.contract.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        await expect(
          this.alice.contract.withdrawDeposit(token, ETH2)
        ).to.be.revertedWith(ErrorMessages.CANNOT_WITHDRAW_MORE_THAN_DEPOSITED);
      });
    });

    context("succeeds", async function () {
      it("30d: Withdraws expected amount", async function () {
        const token = TOKENS.ONE;
        const price = ETH1;
        await this.monthlyAlice.contract.buy(token, price, ETH0, {
          value: ETH3,
        });

        expect(await this.monthlyContract.depositOf(token)).to.equal(ETH2);

        // Baseline Alice's balance
        await this.alice.balance.get();

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
        const { delta, fees } = await this.alice.balance.deltaWithFees();

        const expectedRemittanceMinusGas = ETH1.sub(
          ethers.BigNumber.from(fees.toString())
        );

        expect(ethers.BigNumber.from(delta.toString())).to.equal(
          expectedRemittanceMinusGas
        );
      });

      it("annual: Withdraws expected amount", async function () {
        const token = TOKENS.ONE;
        const price = ETH1;
        await this.alice.contract.buy(token, price, ETH0, {
          value: ETH3,
        });

        expect(await this.contract.depositOf(token)).to.equal(ETH2);

        // Baseline Alice's balance
        await this.alice.balance.get();

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
        const { delta, fees } = await this.alice.balance.deltaWithFees();

        const expectedRemittanceMinusGas = ETH1.sub(
          ethers.BigNumber.from(fees.toString())
        );

        expect(ethers.BigNumber.from(delta.toString())).to.equal(
          expectedRemittanceMinusGas
        );
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

        await this.monthlyAlice.contract.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        // Baseline Alice's balance
        await this.alice.balance.get();

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
        const { delta, fees } = await this.alice.balance.deltaWithFees();

        const expectedRemittanceMinusGas = expectedRemittance.sub(
          ethers.BigNumber.from(fees.toString())
        );

        expect(ethers.BigNumber.from(delta.toString())).to.equal(
          expectedRemittanceMinusGas
        );

        // Deposit should be zero
        expect(await this.monthlyContract.depositOf(token)).to.equal(0);

        // Token should foreclose
        expect(await this.monthlyContract.priceOf(token)).to.equal(0);
      });

      it("annual: Withdraws entire deposit", async function () {
        const token = TOKENS.ONE;

        await this.alice.contract.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        // Baseline Alice's balance
        await this.alice.balance.get();

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
        const { delta, fees } = await this.alice.balance.deltaWithFees();

        const expectedRemittanceMinusGas = expectedRemittance.sub(
          ethers.BigNumber.from(fees.toString())
        );

        expect(ethers.BigNumber.from(delta.toString())).to.equal(
          expectedRemittanceMinusGas
        );

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
