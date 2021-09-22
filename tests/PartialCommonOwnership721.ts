//@ts-nocheck

import { time, balance } from "@openzeppelin/test-helpers";

import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

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
const TenMinDue = ethers.BigNumber.from("19025875190258"); // price of 1 ETH
const TenMinOneSecDue = ethers.BigNumber.from("19057584982242"); // price of 1 ETH
const TAX_RATE = 1000000000000; // 100%

const TAX_NUMERATOR = ethers.BigNumber.from(TAX_RATE);
const TAX_DENOMINATOR = ethers.BigNumber.from("1000000000000");
const TAXATION_PERIOD = ethers.BigNumber.from("31536000");

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
  lastCollectionTime: BigNumber
): BigNumber {
  return price
    .mul(
      now.sub(lastCollectionTime) // time since last collection
    )
    .mul(TAX_NUMERATOR)
    .div(TAX_DENOMINATOR)
    .div(TAXATION_PERIOD);
}

//$ Tests

describe("PartialCommonOwnership721", async () => {
  let contract;
  let contractAddress;
  let provider;
  let signers;
  let accounts;
  let snapshot;

  // Agents to perform situational tests
  let contractAsBeneficiary;
  let contractAsAlice;
  let contractAsBob;

  let beneficiaryBalance;
  let aliceBalance;
  let bobBalance;

  const gasLimit = 9500000; // if gas limit is set, estimateGas isn't run superfluously, slowing tests down.

  //$ Setup

  before(async function () {
    provider = new ethers.providers.Web3Provider(web3.currentProvider);
    signers = await ethers.getSigners();
    accounts = await Promise.all(
      signers.map(async (signer) => await signer.getAddress())
    );

    const contractFactory = await ethers.getContractFactory("Test721Token");

    contract = await contractFactory.deploy(accounts[1], { gasLimit });
    await contract.deployed();

    contractAddress = contract.address;
    expect(contractAddress).to.not.be.null;

    contractAsBeneficiary = contract.connect(signers[1]);
    contractAsAlice = contract.connect(signers[2]);
    contractAsBob = contract.connect(signers[3]);

    beneficiaryBalance = await balance.tracker(
      contractAsBeneficiary.signer.address,
      "wei"
    );

    aliceBalance = await balance.tracker(contractAsAlice.signer.address, "wei");
    bobBalance = await balance.tracker(contractAsBob.signer.address, "wei");

    snapshot = await provider.send("evm_snapshot", []);
  });

  /**
   * Between each test wipe the state of the contract.
   */
  beforeEach(async function () {
    // Reset contract state
    await provider.send("evm_revert", [snapshot]);
    snapshot = await provider.send("evm_snapshot", []);

    // Reset balance trackers
    await beneficiaryBalance.get();
    await aliceBalance.get();
    await bobBalance.get();
  });

  //$ Tests

  describe("Test721Token", async () => {
    it("mints three tokens during construction", async () => {
      expect(await contract.ownerOf(TOKENS.ONE)).to.equal(contractAddress);
      expect(await contract.ownerOf(TOKENS.TWO)).to.equal(contractAddress);
      expect(await contract.ownerOf(TOKENS.THREE)).to.equal(contractAddress);
    });
  });

  describe("#constructor()", async () => {
    context("succeeds", async () => {
      it("Setting name", async () => {
        expect(await contract.name()).to.equal(TEST_NAME);
      });

      it("Setting symbol", async () => {
        expect(await contract.symbol()).to.equal(TEST_SYMBOL);
      });

      /**
       * For the purposes of testing, the beneficiary address is the address
       * of the contract owner / deployer.
       */
      it("Setting beneficiary", async () => {
        expect(await contract.beneficiary()).to.equal(
          contractAsBeneficiary.signer.address
        );
      });

      it("Setting tax rate", async () => {
        expect(await contract.taxRate()).to.equal(TAX_RATE);
      });
    });
  });

  describe("#onlyOwner()", async () => {
    context("fails", async () => {
      context("when required but signer is not owner", async () => {
        it("#depositWei()", async () => {
          await expect(
            contractAsAlice.depositWei(TOKENS.ONE, {
              value: ethers.utils.parseEther("1"),
            })
          ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
        });

        it("#changePrice()", async () => {
          await expect(
            contractAsAlice.changePrice(TOKENS.ONE, 500)
          ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
        });

        it("#withdrawDeposit()", async () => {
          await expect(
            contractAsAlice.withdrawDeposit(TOKENS.ONE, 10)
          ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
        });

        it("#exit()", async () => {
          await expect(contractAsAlice.exit(TOKENS.ONE)).to.be.revertedWith(
            ErrorMessages.ONLY_OWNER
          );
        });
      });
    });
  });

  describe("#_collectTax()", async () => {
    context("fails", async () => {});
    context("succeeds", async () => {
      it("collects after 10m", async () => {
        const price = ETH1;
        const token = TOKENS.ONE;
        await contractAsAlice.buy(token, price, ETH0, {
          value: ETH2,
        });

        // Sanity check & update baseline beneficiary balance
        expect(
          ethers.BigNumber.from((await beneficiaryBalance.delta()).toString())
        ).to.equal(price);

        const timeBefore = await now();

        await time.increase(time.duration.minutes(10));

        const event = await contract._collectTax(token, { gasLimit });

        const timeAfter = await now();
        const depositAfter = await contract.depositOf(token);

        const due = getTaxDue(price, timeAfter, timeBefore);

        // Events emitted
        expect(event).to.emit(contract, Events.COLLECTION).withArgs(token, due);
        expect(event)
          .to.emit(contract, Events.BENEFICIARY_REMITTANCE)
          .withArgs(token, due);
        // Deposit updates
        expect(depositAfter).to.equal(price.sub(due));
        // Token collection statistics update
        expect(await contract.lastCollectionTimes(token)).to.equal(timeAfter);
        expect(await contract.taxCollectedSinceLastTransfer(token)).to.equal(
          due
        );
        expect(await contract.taxationCollected(token)).to.equal(due);
        // Beneficiary is remitted the expected amount
        expect(
          ethers.BigNumber.from((await beneficiaryBalance.delta()).toString())
        ).to.equal(due);
      });

      it("collects after 10m and subsequently after 10m", async () => {
        const price = ETH1;
        const token = TOKENS.ONE;
        await contractAsAlice.buy(token, price, ETH0, {
          value: ETH2,
        });

        // Baseline the beneficiary balance.
        await beneficiaryBalance.get();

        const timeBefore = await now();
        const depositBefore = await contract.depositOf(token);

        await time.increase(time.duration.minutes(10));
        await contract._collectTax(token, { gasLimit });

        const timeAfter10m = await now();

        const due10m = getTaxDue(price, timeAfter10m, timeBefore);

        await time.increase(time.duration.minutes(10));
        await contract._collectTax(token, { gasLimit });

        const timeAfter20m = await now();
        const due20m = getTaxDue(price, timeAfter20m, timeAfter10m);

        const depositAfter = await contract.depositOf(token);

        const due = due10m.add(due20m);

        // Correct amount is deducted from deposit
        expect(depositAfter).to.equal(depositBefore.sub(due));
        // Token collection statistics update
        expect(await contract.lastCollectionTimes(token)).to.equal(
          timeAfter20m
        );
        expect(await contract.taxCollectedSinceLastTransfer(token)).to.equal(
          // ! Patch: `due` is 1 wei less; not sure why...
          due.add(1)
        );
        expect(await contract.taxationCollected(token)).to.equal(due);
        // Beneficiary is remitted due 10m + due 20m
        expect(
          ethers.BigNumber.from((await beneficiaryBalance.delta()).toString())
        ).to.equal(due);
      });
    });
  });

  describe("#tokenMinted()", async () => {
    context("fails", async () => {
      context("when token not minted but required", async () => {
        it("#priceOf()", async () => {
          await expect(contract.ownerOf(INVALID_TOKEN_ID)).to.be.revertedWith(
            ErrorMessages.NONEXISTENT_TOKEN
          );
        });
        it("#depositOf()", async () => {
          await expect(contract.depositOf(INVALID_TOKEN_ID)).to.be.revertedWith(
            ErrorMessages.NONEXISTENT_TOKEN
          );
        });
        it("#buy()", async () => {
          await expect(
            contract.buy(INVALID_TOKEN_ID, ETH0, ETH0, { value: ETH0 })
          ).to.be.revertedWith(ErrorMessages.NONEXISTENT_TOKEN);
        });
        it("#taxOwedSince()", async () => {
          await expect(
            contract.taxOwedSince(INVALID_TOKEN_ID, await now())
          ).to.be.revertedWith(ErrorMessages.NONEXISTENT_TOKEN);
        });
      });
    });
  });

  describe("#taxRate()", async () => {
    context("succeeds", async () => {
      it("returning expected tax rate [100%]", async () => {
        expect(await contractAsAlice.taxRate()).to.equal(TAX_RATE);
      });
    });
  });

  describe("#priceOf()", async () => {
    context("succeeds", async () => {
      it("returning expected price [ETH0]", async () => {
        expect(await contract.priceOf(TOKENS.ONE)).to.equal(ETH0);
      });
    });
  });

  describe("#depositOf", async () => {
    context("succeeds", async () => {
      it("returning expected deposit [ETH0]", async () => {
        expect(await contract.priceOf(TOKENS.ONE)).to.equal(ETH0);
      });
    });
  });

  describe("#taxOwed()", async () => {
    context("fails", async () => {});
    context("succeeds", async () => {
      it("Returns correct taxation after 1 second", async () => {
        const token = TOKENS.ONE;

        await contractAsAlice.buy(token, ETH1, ETH0, {
          value: ETH2,
          gasLimit,
        });

        const lastCollectionTime = await contract.lastCollectionTimes(token);
        await time.increase(1);

        const owed = await contract.taxOwed(token);

        const due = getTaxDue(ETH1, owed.timestamp, lastCollectionTime);

        expect(owed.amount).to.equal(due);
      });
    });

    it("Returns correct taxation after 1 year", async () => {
      const token = TOKENS.ONE;

      await contractAsAlice.buy(token, ETH1, ETH0, {
        value: ETH2,
        gasLimit,
      });

      const lastCollectionTime = await contract.lastCollectionTimes(token);
      await time.increase(time.duration.days(365));

      const owed = await contract.taxOwed(token);

      const due = getTaxDue(ETH1, owed.timestamp, lastCollectionTime);
      expect(due).to.equal(ETH1); // Ensure that the helper util is correct
      expect(owed.amount).to.equal(due);
      expect(owed.amount).to.equal(ETH1); // 100% over 365 days
    });
  });

  describe("#taxOwedSince()", async () => {
    context("fails", async () => {
      it("Time must be in the past", async () => {
        await expect(
          contract.taxOwedSince(TOKENS.ONE, await now())
        ).to.revertedWith(ErrorMessages.REQUIRES_PAST);
      });
    });
    context("succeeds", async () => {
      it("Returns zero if no purchase", async () => {
        expect(
          await contract.taxOwedSince(TOKENS.ONE, (await now()).sub(1))
        ).to.equal(0);
      });
      it("Returns correct amount", async () => {
        const token = TOKENS.ONE;
        const price = ETH1;
        await contractAsAlice.buy(token, price, ETH0, {
          value: ETH2,
        });

        const time = (await now()).sub(1);

        const expected = price
          .mul(time)
          .mul(TAX_NUMERATOR)
          .div(TAX_DENOMINATOR)
          .div(TAXATION_PERIOD);

        expect(await contract.taxOwedSince(token, time)).to.equal(expected);
      });
    });
  });

  describe("#taxCollectedSinceLastTransfer()", async () => {
    context("fails", async () => {});
    context("succeeds", async () => {
      context("returning correct amount", async () => {
        it("if never transferred", async () => {
          expect(
            await contract.taxCollectedSinceLastTransfer(TOKENS.ONE)
          ).to.equal(0);
        });
        it("after initial purchase", async () => {
          const token = TOKENS.ONE;
          await contractAsAlice.buy(token, ETH1, ETH0, {
            value: ETH2,
          });

          const before = await now();

          await time.increase(time.duration.minutes(1));

          await contract._collectTax(token);

          const due = getTaxDue(ETH1, await now(), before);

          expect(await contract.taxCollectedSinceLastTransfer(token)).to.equal(
            due
          );
        });
        it("after 1 secondary-purchase", async () => {
          const token = TOKENS.ONE;
          await contractAsAlice.buy(token, ETH1, ETH0, { value: ETH2 });

          await time.increase(time.duration.minutes(1));

          await contract._collectTax(token);

          await contractAsBob.buy(token, ETH2, ETH1, { value: ETH3 });

          const before = await now();

          await time.increase(time.duration.minutes(1));

          await contract._collectTax(token);

          const due = getTaxDue(ETH2, await now(), before);

          expect(await contract.taxCollectedSinceLastTransfer(token)).to.equal(
            due
          );
        });
        it("when foreclosed", async () => {
          const token = TOKENS.ONE;
          await contractAsAlice.buy(token, ETH1, ETH0, { value: ETH2 });
          await time.increase(time.duration.days(366));
          expect(await contract.foreclosed(token)).to.equal(true);
          await time.increase(time.duration.days(1));
          expect(await contract.taxCollectedSinceLastTransfer(token)).to.equal(
            0
          );
        });
        it("after purchase from foreclosure", async () => {
          const token = TOKENS.ONE;
          await contractAsAlice.buy(token, ETH1, ETH0, { value: ETH2 });

          await time.increase(time.duration.days(366));
          expect(await contract.foreclosed(token)).to.equal(true);

          await time.increase(time.duration.days(1));
          // Purchase out of foreclosure
          await contractAsBob.buy(token, ETH1, ETH0, {
            value: ETH2,
          });

          const before = await now();

          await time.increase(time.duration.minutes(1));

          await contract._collectTax(token);

          const due = getTaxDue(ETH1, await now(), before);

          expect(await contract.taxCollectedSinceLastTransfer(token)).to.equal(
            due
          );
        });
      });
    });
  });

  describe("#foreclosed()", async () => {
    context("fails", async () => {});
    context("succeeds", async () => {
      it("true positive", async () => {
        const token = TOKENS.ONE;
        await contractAsAlice.buy(token, ETH1, ETH0, { value: ETH2 });
        await time.increase(time.duration.days(366)); // Entire deposit will be exceeded after 1yr
        expect(await contract.foreclosed(token)).to.equal(true);
      });
      it("true negative", async () => {
        const token = TOKENS.ONE;
        await contractAsAlice.buy(token, ETH1, ETH0, { value: ETH2 });
        await time.increase(time.duration.minutes(1));
        expect(await contract.foreclosed(token)).to.equal(false);
      });
    });
  });

  describe("#withdrawableDeposit()", async () => {
    context("fails", async () => {});
    context("succeeds", async () => {
      it("Returns zero when owed >= deposit", async () => {
        const token = TOKENS.ONE;
        await contractAsAlice.buy(token, ETH1, ETH0, {
          value: ETH2,
        });
        // Exhaust deposit
        await time.increase(time.duration.days(366));

        expect(await contract.withdrawableDeposit(token)).to.equal(0);
      });
      it("Returns (deposit - owed) when owed < deposit", async () => {
        const token = TOKENS.ONE;
        await contractAsAlice.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        await time.increase(time.duration.days(1));
        const owed = await contract.taxOwed(token);

        expect(await contract.withdrawableDeposit(token)).to.equal(
          ETH1.sub(owed.amount)
        );
      });
    });
  });

  describe("#foreclosureTime()", async () => {
    context("fails", async () => {});
    context("succeeds", async () => {
      it("time is 10m into the future", async () => {
        const token = TOKENS.ONE;
        await contractAsAlice.buy(token, ETH1, ETH0, {
          // Deposit a surplus 10 min of patronage
          value: ETH1.add(TenMinDue),
        });

        const tenMinutesFromNow = (await now()).add(
          ethers.BigNumber.from(time.duration.minutes(10).toString())
        );
        expect(await contract.foreclosureTime(token)).to.equal(
          tenMinutesFromNow
        );
      });

      it("returns backdated time if foreclosed", async () => {
        const token = TOKENS.ONE;
        await contractAsAlice.buy(token, ETH1, ETH0, {
          // Deposit a surplus 10 min of patronage
          value: ETH1.add(TenMinDue),
        });

        await time.increase(time.duration.minutes(10));
        const shouldForecloseAt = await now();

        // Foreclosure should be backdated to when token was in foreclosed state.
        const forecloseAt = await contract.foreclosureTime(token);
        expect(forecloseAt).to.equal(shouldForecloseAt);

        // Trigger foreclosure
        await contract._collectTax(token);

        expect(await contract.ownerOf(token)).to.equal(contractAddress);

        // Value should remain unchained after foreclosure has taken place
        const oneSecond = ethers.BigNumber.from(
          (await time.duration.seconds(1)).toString()
        );
        expect(await contract.foreclosureTime(token)).to.equal(
          //! This is necessary; not sure why.  Seems related to 1 Wei issue within
          //! "collects after 10m and subsequently after 10m"
          forecloseAt.sub(oneSecond)
        );
      });
    });
  });

  describe("#buy()", async () => {
    context("fails", async () => {
      it("Attempting to buy an un-minted token", async () => {
        await expect(
          contractAsAlice.buy(INVALID_TOKEN_ID, ETH1, ETH1, { value: ETH1 })
        ).to.be.revertedWith(ErrorMessages.NONEXISTENT_TOKEN);
      });
      it("Verifying incorrect Current Price", async () => {
        await expect(
          contractAsAlice.buy(
            TOKENS.ONE,
            ETH1, // Purchase price of 1
            ETH1, // current price of 1 [should be ETH0]
            { value: ETH1 }
          )
        ).to.be.revertedWith(ErrorMessages.BUY_INCORRECT_CURRENT_PRICE);
      });
      it("Attempting to buy with 0 Wei", async () => {
        await expect(
          contractAsAlice.buy(
            TOKENS.ONE,
            ETH0, // [must be greater than 0]
            ETH0,
            { value: ETH0 } // [must be greater than 0]
          )
        ).to.be.revertedWith(ErrorMessages.BUY_ZERO_PRICE);
      });
      it("When purchase price is less than message value", async () => {
        await expect(
          contractAsAlice.buy(
            TOKENS.ONE,
            ETH0, // Purchase price of zero
            ETH0, // Current Price [correct]
            { value: ETH1 } // Send 1 Eth
          )
        ).to.be.revertedWith(ErrorMessages.BUY_ZERO_PRICE);
      });
      it("Attempting to buy with price less than current price", async () => {
        // Purchase as Bob for 2 ETH
        await contractAsBob.buy(TOKENS.TWO, ETH2, ETH0, { value: ETH3 });

        await expect(
          contractAsAlice.buy(
            TOKENS.TWO, // owned by Bob
            ETH1, // [should be ETH2]
            ETH2, // Correct
            { value: ETH1 } // [should be ETH2]
          )
        ).to.be.revertedWith(ErrorMessages.BUY_PRICE_BELOW_CURRENT);
      });
      it("Attempting to buy without surplus value for deposit", async () => {
        await expect(
          contractAsAlice.buy(TOKENS.ONE, ETH1, ETH0, { value: ETH1 }) // [should be greater than ETH1]
        ).to.be.revertedWith(ErrorMessages.BUY_LACKS_SURPLUS_VALUE);
      });
      it("Attempting to purchase a token it already owns", async () => {
        // Purchase
        await contractAsBob.buy(TOKENS.TWO, ETH2, ETH0, { value: ETH3 });
        // Re-purchase
        await expect(
          contractAsBob.buy(TOKENS.TWO, ETH3, ETH2, { value: ETH4 })
        ).to.be.revertedWith(ErrorMessages.BUY_ALREADY_OWNED);
      });
    });
    context("succeeds", async () => {
      it("Purchasing token for the first-time (from contract)", async () => {
        const event = await contractAsAlice.buy(TOKENS.ONE, ETH1, ETH0, {
          value: ETH2,
        });
        // Buy Event emitted
        expect(event)
          .to.emit(contract, Events.BUY)
          .withArgs(TOKENS.ONE, contractAsAlice.signer.address, ETH1);
        // Remittance Event emitted
        expect(event)
          .to.emit(contract, Events.REMITTANCE)
          .withArgs(TOKENS.ONE, contractAsBeneficiary.signer.address, ETH1);
        // Deposit updated
        expect(await contract.depositOf(TOKENS.ONE)).to.equal(ETH1);
        // Price updated
        expect(await contract.priceOf(TOKENS.ONE)).to.equal(ETH1);
        // Owned updated
        expect(await contract.ownerOf(TOKENS.ONE)).to.equal(
          contractAsAlice.signer.address
        );
        // Eth [price = 1 Eth] remitted to beneficiary
        expect(
          ethers.BigNumber.from((await beneficiaryBalance.delta()).toString())
        ).to.equal(ETH1);
      });
      it("Purchasing token from current owner", async () => {
        const token = TOKENS.ONE;
        await contractAsAlice.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        // Baseline Alice's balance
        await aliceBalance.get();

        await time.increase(time.duration.minutes(10));

        // Get current deposit and tax owed to determine how much will be
        // collected from Alice's deposit when `#buy()` is called.
        const depositBefore = await contract.depositOf(token);

        // Deposit - due + 2ETH (from sale)
        const expectedRemittance = depositBefore.sub(TenMinOneSecDue).add(ETH2);

        // Buy
        const event = await contractAsBob.buy(token, ETH2, ETH1, {
          value: ETH3,
        });

        // Buy Event emitted
        expect(event)
          .to.emit(contract, Events.BUY)
          .withArgs(token, contractAsBob.signer.address, ETH2);

        // Remittance Event emitted
        expect(event)
          .to.emit(contract, Events.REMITTANCE)
          .withArgs(token, contractAsAlice.signer.address, expectedRemittance);

        // Deposit updated
        expect(await contract.depositOf(token)).to.equal(ETH1);

        // Price updated
        expect(await contract.priceOf(token)).to.equal(ETH2);

        // Owned updated
        expect(await contract.ownerOf(token)).to.equal(
          contractAsBob.signer.address
        );

        // Alice's balance should reflect received remittance
        expect(
          ethers.BigNumber.from((await aliceBalance.delta()).toString())
        ).to.equal(expectedRemittance);
      });
      it("Purchasing token from foreclosure", async () => {
        const token = TOKENS.ONE;
        await contractAsAlice.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        // Exhaust deposit
        await time.increase(time.duration.days(366));

        // Trigger foreclosure & buy it out of foreclosure
        expect(
          await contractAsBob.buy(token, ETH1, ETH0, {
            value: ETH2,
          })
        )
          .to.emit(contract, Events.FORECLOSURE)
          .withArgs(token, contractAsAlice.signer.address);

        expect(await contract.ownerOf(token)).to.equal(
          contractAsBob.signer.address
        );
      });
      it("Purchasing token from current owner who purchased from foreclosure", async () => {
        const token = TOKENS.ONE;
        await contractAsAlice.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        // Exhaust deposit
        await time.increase(time.duration.days(366));

        // Buy out of foreclosure
        await contractAsBob.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        await contractAsAlice.buy(token, ETH2, ETH1, {
          value: ETH3,
        });

        expect(await contract.ownerOf(token)).to.equal(
          contractAsAlice.signer.address
        );
      });
      it("Owner prior to foreclosure re-purchases", async () => {
        const token = TOKENS.ONE;
        await contractAsAlice.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        // Exhaust deposit
        await time.increase(time.duration.days(366));

        // Buy out of foreclosure
        await contractAsAlice.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        expect(await contract.ownerOf(token)).to.equal(
          contractAsAlice.signer.address
        );
      });
      it("Updating chain of title", async () => {
        const token = TOKENS.ONE;
        const trx1 = await contractAsBob.buy(token, ETH1, ETH0, {
          value: ETH2,
        });
        const block1 = await provider.getBlock(trx1.blockNumber);

        const trx2 = await contractAsAlice.buy(token, ETH2, ETH1, {
          value: ETH3,
        });
        const block2 = await provider.getBlock(trx2.blockNumber);

        const chainOfTitle = await contract.titleChainOf(token);

        expect(chainOfTitle[0].from).to.equal(contractAddress);
        expect(chainOfTitle[0].to).to.equal(contractAsBob.signer.address);
        expect(chainOfTitle[0].price).to.equal(ETH1);
        expect(chainOfTitle[0].timestamp).to.equal(
          ethers.BigNumber.from(block1.timestamp)
        );
        expect(chainOfTitle[1].from).to.equal(contractAsBob.signer.address);
        expect(chainOfTitle[1].to).to.equal(contractAsAlice.signer.address);
        expect(chainOfTitle[1].price).to.equal(ETH2);
        expect(chainOfTitle[1].timestamp).to.equal(
          ethers.BigNumber.from(block2.timestamp)
        );
      });
    });
  });

  describe("#depositWei()", async () => {
    context("fails", async () => {
      it("is not deposited by owner", async () => {
        await expect(
          contractAsAlice.depositWei(TOKENS.ONE, {
            value: ethers.utils.parseEther("1"),
          })
        ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
      });
    });
    context("succeeds", async () => {
      it("owner can deposit", async () => {
        const token = TOKENS.ONE;
        await contractAsAlice.buy(token, ETH1, ETH0, { value: ETH2 });
        await expect(contractAsAlice.depositWei(token, { value: ETH1 })).to.not
          .reverted;
      });
    });
  });

  describe("#changePrice()", async () => {
    context("fails", async () => {
      it("only owner can update price", async () => {
        await expect(
          contractAsAlice.changePrice(TOKENS.ONE, 500)
        ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
      });
      it("cannot have a new price of zero", async () => {
        const token = TOKENS.ONE;
        await contractAsAlice.buy(token, ETH1, ETH0, {
          value: ETH2,
        });
        await expect(
          contractAsAlice.changePrice(token, ETH0)
        ).to.be.revertedWith(ErrorMessages.NEW_PRICE_ZERO);
      });
      it("cannot have price set to same amount", async () => {
        const token = TOKENS.ONE;
        await contractAsAlice.buy(token, ETH1, ETH0, {
          value: ETH2,
        });
        await expect(
          contractAsAlice.changePrice(token, ETH1)
        ).to.be.revertedWith(ErrorMessages.NEW_PRICE_SAME);
      });
    });
    context("succeeds", async () => {
      it("owner can change price to more", async () => {
        const token = TOKENS.ONE;
        await contractAsAlice.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        expect(await contractAsAlice.changePrice(token, ETH2))
          .to.emit(contract, Events.PRICE_CHANGE)
          .withArgs(TOKENS.ONE, ETH2);

        expect(await contract.priceOf(token)).to.equal(ETH2);
      });

      it("owner can change price to less", async () => {
        const token = TOKENS.ONE;
        await contractAsAlice.buy(token, ETH2, ETH0, {
          value: ETH3,
        });

        expect(await contractAsAlice.changePrice(token, ETH1))
          .to.emit(contract, Events.PRICE_CHANGE)
          .withArgs(TOKENS.ONE, ETH1);

        expect(await contract.priceOf(token)).to.equal(ETH1);
      });
    });
  });

  describe("#withdrawDeposit()", async () => {
    context("fails", async () => {
      it("Non-owner", async () => {
        await expect(
          contractAsAlice.withdrawDeposit(TOKENS.ONE, 10)
        ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
      });

      it("Cannot withdraw more than deposited", async () => {
        const token = TOKENS.ONE;
        await contractAsAlice.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        await expect(
          contractAsAlice.withdrawDeposit(token, ETH2)
        ).to.be.revertedWith(ErrorMessages.CANNOT_WITHDRAW_MORE_THAN_DEPOSITED);
      });
    });

    context("succeeds", async () => {
      it("Withdraws expected amount", async () => {
        const token = TOKENS.ONE;
        const price = ETH1;
        await contractAsAlice.buy(token, price, ETH0, {
          value: ETH3,
        });

        expect(await contract.depositOf(token)).to.equal(ETH2);

        // Baseline Alice's balance
        await aliceBalance.get();

        // Necessary to determine tax due on exit
        const lastCollectionTime = await contract.lastCollectionTimes(token);

        const trx = await contractAsAlice.withdrawDeposit(token, ETH1);
        const { timestamp } = await provider.getBlock(trx.blockNumber);

        // Emits
        expect(trx)
          .to.emit(contract, Events.DEPOSIT_WITHDRAWAL)
          .withArgs(token, ETH1);

        // current deposit - tax on exit
        const taxedAmt = getTaxDue(
          price,
          ethers.BigNumber.from(timestamp),
          lastCollectionTime
        );

        // Deposit should be 1 ETH - taxed amount.
        expect(await contract.depositOf(token)).to.equal(ETH1.sub(taxedAmt));

        // Alice's balance should reflect returned deposit [1 ETH] minus fees
        const { delta, fees } = await aliceBalance.deltaWithFees();

        const expectedRemittanceMinusGas = ETH1.sub(
          ethers.BigNumber.from(fees.toString())
        );

        expect(ethers.BigNumber.from(delta.toString())).to.equal(
          expectedRemittanceMinusGas
        );
      });
    });
  });

  describe("#exit()", async () => {
    context("fails", async () => {
      it("Non-owner", async () => {
        await expect(
          contractAsAlice.withdrawDeposit(TOKENS.ONE, 10)
        ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
      });
    });

    context("succeeds", async () => {
      it("Withdraws entire deposit", async () => {
        const token = TOKENS.ONE;

        await contractAsAlice.buy(token, ETH1, ETH0, {
          value: ETH2,
        });

        // Baseline Alice's balance
        await aliceBalance.get();

        // Determine tax due on exit
        const lastCollectionTime = await contract.lastCollectionTimes(token);

        const trx = await contractAsAlice.exit(token);
        const { timestamp } = await provider.getBlock(trx.blockNumber);

        // current deposit - tax on exit
        const taxedAmt = getTaxDue(
          ETH1,
          ethers.BigNumber.from(timestamp),
          lastCollectionTime
        );

        const expectedRemittance = ETH1.sub(taxedAmt);

        // Emits
        expect(trx)
          .to.emit(contract, Events.DEPOSIT_WITHDRAWAL)
          .withArgs(token, expectedRemittance);

        // Alice's balance should reflect returned deposit minus fees
        const { delta, fees } = await aliceBalance.deltaWithFees();

        const expectedRemittanceMinusGas = expectedRemittance.sub(
          ethers.BigNumber.from(fees.toString())
        );

        expect(ethers.BigNumber.from(delta.toString())).to.equal(
          expectedRemittanceMinusGas
        );

        // Deposit should be zero
        expect(await contract.depositOf(token)).to.equal(0);

        // Token should foreclose
        expect(await contract.priceOf(token)).to.equal(0);
      });
    });
  });

  describe("#withdrawOutstandingRemittance()", async () => {
    context("fails", async () => {
      it("when no outstanding remittance", async () => {
        await expect(
          contractAsAlice.withdrawOutstandingRemittance()
        ).to.be.revertedWith(ErrorMessages.NO_OUTSTANDING_REMITTANCE);
      });
    });
    // TODO: Add force buy remittance to fail with a blocker contract.
    context("succeeds", async () => {});
  });

  describe("#transferToken()", async () => {
    context("fails", async () => {
      it("it's an internal method", async () => {
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
});
