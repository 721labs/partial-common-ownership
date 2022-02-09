//@ts-nocheck

import { time } from "@openzeppelin/test-helpers";

import { expect } from "chai";
import { ethers } from "hardhat";

import Wallet from "../helpers/Wallet";
import { ErrorMessages, Events, RemittanceTriggers } from "./types";
import {
  ETH0,
  ETH1,
  ETH2,
  ETH3,
  ETH4,
  GLOBAL_TRX_CONFIG,
} from "../helpers/constants";
import { now } from "../helpers/Time";
import { taxationPeriodToSeconds } from "../helpers/utils";
import { snapshotEVM, revertEVM } from "../helpers/EVM";

// Types
import { ERC721ErrorMessages, TOKENS } from "../helpers/types";

//$ Test-Specific Constants

const TEST_NAME = "721TEST";
const TEST_SYMBOL = "TEST";

const INVALID_TOKEN_ID = 999;

const TAX_DENOMINATOR = ethers.BigNumber.from("1000000000000");

const tokenTaxConfigs = {
  // 5% Quarterly
  [TOKENS.ONE]: { collectionFrequency: 90, taxRate: 50000000000 },
  // 100% Monthly
  [TOKENS.TWO]: { collectionFrequency: 30, taxRate: 1000000000000 },
  // 100% Annually
  [TOKENS.THREE]: { collectionFrequency: 365, taxRate: 1000000000000 },
};

//$ State

let provider;
let signers;
let factory;
let blocker;
let contract;
let contractAddress;
let beneficiary;
let alice;
let bob;
let wallets;
let walletsByAddress;
let snapshot;

let tenMin;
let prior;

//$ Helpers

/**
 * Returns a random token. This implement auto-rotation of tokens during tests,
 * as each token has a different tax rate and collection frequency, thus ensuring the tests
 * are valid for a range of configurations.
 */
function randomToken(): TOKENS {
  const index = Math.floor(Math.random() * 3);
  switch (index) {
    case 0:
      return TOKENS.ONE;
    case 1:
      return TOKENS.TWO;
    case 2:
      return TOKENS.THREE;
  }
}

/**
 * How often are taxes collected? in seconds.
 * @param tokenId id of token
 * @returns seconds as big number
 */
function collectionFrequencyInSeconds(tokenId: TOKENS): BigNumber {
  const { collectionFrequency } = tokenTaxConfigs[tokenId];
  return taxationPeriodToSeconds(collectionFrequency);
}

/**
 * Returns tax numerator for a given token as BigNumber
 * @param tokenId id of token
 * @returns tax rate numerator
 */
function taxNumerator(tokenId: TOKENS): BigNumber {
  const { taxRate } = tokenTaxConfigs[tokenId];
  return ethers.BigNumber.from(taxRate);
}

/**
 * Calculates the tax due.
 * price * % of tax period completed (represented from 0 - 1) * tax rate;
 * @param tokenId Id of token in question
 * @param price Current price
 * @param now Unix timestamp when request was made
 * @param lastCollectionTime Unix timestamp of last tax collection
 * @returns Tax due between now and last collection.
 */
function getTaxDue(
  tokenId: TOKENS,
  price: BigNumber,
  now: BigNumber,
  lastCollectionTime: BigNumber
): BigNumber {
  const secondsSinceLastCollection = now.sub(lastCollectionTime);
  return price
    .mul(secondsSinceLastCollection)
    .div(collectionFrequencyInSeconds(tokenId))
    .mul(taxNumerator(tokenId))
    .div(TAX_DENOMINATOR);
}

/**
 * Executes purchase and verifies expectations.
 * @param wallet Wallet making the purchase
 * @param tokenId Token being purchased
 * @param newValuation Self-assess valuation.
 * @param currentValuation Current owner's self-assessed valuation.
 * @param value Trx value
 * @returns Transaction Receipt
 */
async function takeoverLease(
  wallet: Wallet,
  tokenId: TOKENS,
  newValuation: BigNumber,
  currentValuation: BigNumber,
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
  const ownedByContract = currentOwner === contract.address;
  const willBeOwnedByContract = foreclosed || ownedByContract;

  const depositBefore = await contract.depositOf(tokenId);

  const taxDue = getTaxDue(
    tokenId,
    currentValuation,
    (await now()).add(1), // block timestamp
    await contract.lastCollectionTimeOf(tokenId)
  );

  const depositAfter = depositBefore.sub(taxDue);

  //$ Takeover Lease

  const trx = await wallet.contract.takeoverLease(
    tokenId,
    newValuation,
    currentValuation,
    { value, ...GLOBAL_TRX_CONFIG }
  );

  const block = await provider.getBlock(trx.blockNumber);

  //$ Test Cases

  // Events emitted
  expect(trx).to.emit(contract, Events.APPROVAL);
  expect(trx).to.emit(contract, Events.TRANSFER);
  expect(trx)
    .to.emit(contract, Events.LEASE_TAKEOVER)
    .withArgs(tokenId, wallet.address, newValuation);

  // Beneficiary doesn't put down a deposit
  const purchasedByBeneficiary = wallet.address === beneficiary.address;
  if (purchasedByBeneficiary) {
    expect(await contract.depositOf(tokenId)).to.equal(0);
  } else {
    // Deposit updated
    expect(await contract.depositOf(tokenId)).to.equal(
      // If purchasing will trigger foreclosure or token was already
      // in foreclosure, the deposit will be equal to the entire amount
      // included by the purchaser.
      foreclosed ? value : value.sub(currentValuation)
    );
  }

  // Price updated
  expect(await contract.valuationOf(tokenId)).to.equal(newValuation);

  // Collection timestamp updates
  expect(await contract.lastCollectionTimeOf(tokenId)).to.equal(
    block.timestamp
  );

  // Last transfer time
  expect(await contract.lastTransferTimeOf(tokenId)).to.equal(block.timestamp);

  // Owned updated
  expect(await contract.ownerOf(tokenId)).to.equal(wallet.address);

  // Remittances
  // If purchased by the beneficiary from the contract, the token was purchased from the contract,
  // or the token was purchased from foreclosure, no remittance occurs.
  if (
    !willBeOwnedByContract &&
    !(purchasedByBeneficiary && currentValuation == ETH0)
  ) {
    // Get the balance and then determine how much will be deducted by taxation
    const expectedRemittance = depositAfter.add(currentValuation);

    expect(trx)
      .to.emit(contract, Events.REMITTANCE)
      .withArgs(
        RemittanceTriggers.LeaseTakeover,
        currentOwner,
        expectedRemittance
      );

    // Eth sent to recipient
    const recipient = walletsByAddress[currentOwner];
    const { delta } = await recipient.balanceDelta();
    expect(delta).to.equal(expectedRemittance);
    await recipient.balance(); // cleanup
  }

  //$ Cleanup

  // Baseline wallet balances
  await wallet.balance();

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
  const lastCollectionTime = await contract.lastCollectionTimeOf(tokenId);

  await time.increase(after);

  const owed = await contract.taxOwed(tokenId);

  const price = await contract.valuationOf(tokenId);

  const due = getTaxDue(tokenId, price, owed.timestamp, lastCollectionTime);

  expect(owed.amount).to.equal(due);
}

/**
 * Increases time by a given amount, collects tax, and verifies that the
 * correct amount of tax was collected.
 * NOTE: Function assumes that the current owner is the not the beneficiary;
 * when that is the case no tax is collected; `getTaxDue()` does not account
 * for this!
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
    await contract.taxCollectedSinceLastTransferOf(tokenId);
  const taxCollectedBefore = await contract.taxationCollected(tokenId);

  //$ Collect

  const before = await now();

  await time.increase(time.duration.minutes(after));

  const trx = await contract.collectTax(tokenId);

  const timeAfter = await now();
  const due = getTaxDue(tokenId, currentPrice, timeAfter, before);

  //$ Expectations

  // Events emitted
  expect(trx).to.emit(contract, Events.COLLECTION).withArgs(tokenId, due);

  // Remittance emitted
  expect(trx)
    .to.emit(contract, Events.REMITTANCE)
    .withArgs(RemittanceTriggers.TaxCollection, beneficiary.address, due);

  // Deposit updates
  expect(await contract.depositOf(tokenId)).to.equal(depositBefore.sub(due));

  // Token collection statistics update
  expect(await contract.lastCollectionTimeOf(tokenId)).to.equal(timeAfter);

  expect(await contract.taxCollectedSinceLastTransferOf(tokenId)).to.equal(
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

//$ Tests

describe("PartialCommonOwnership.sol", async function () {
  before(async function () {
    // Used for computing 10 min prior
    tenMin = await now();
    prior = tenMin.sub(600);

    provider = new ethers.providers.Web3Provider(web3.currentProvider);
    signers = await ethers.getSigners();
    factory = await ethers.getContractFactory("TestPCOToken");

    // Set up contracts
    contract = await factory.deploy(
      TEST_NAME,
      TEST_SYMBOL,
      signers[1].address,
      GLOBAL_TRX_CONFIG
    );

    await contract.deployed();
    contractAddress = contract.address;

    // Set up blocker
    const blockerFactory = await ethers.getContractFactory("Blocker");
    blocker = await blockerFactory.deploy(contractAddress);
    await blocker.deployed();

    // Set up wallets

    beneficiary = new Wallet(contract, signers[1]);
    alice = new Wallet(contract, signers[2]);
    bob = new Wallet(contract, signers[3]);

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

    snapshot = await snapshotEVM(provider);
  });

  /**
   * Between each test wipe the state of the contract.
   */
  beforeEach(async function () {
    // Reset contract state
    await revertEVM(provider, snapshot);
    snapshot = await snapshotEVM(provider);

    // Reset balance trackers
    await Promise.all(
      wallets.map(function (wallet) {
        return wallet.balance();
      })
    );
  });

  describe("TestPCOToken", async function () {
    context("construction", async function () {
      it("mints three tokens", async function () {
        expect(await contract.ownerOf(TOKENS.ONE)).to.equal(contractAddress);
        expect(await contract.ownerOf(TOKENS.TWO)).to.equal(contractAddress);
        expect(await contract.ownerOf(TOKENS.THREE)).to.equal(contractAddress);
      });

      it("sets beneficiaries", async function () {
        expect(await contract.beneficiaryOf(TOKENS.ONE)).to.equal(
          beneficiary.address
        );
        expect(await contract.beneficiaryOf(TOKENS.TWO)).to.equal(
          beneficiary.address
        );
        expect(await contract.beneficiaryOf(TOKENS.THREE)).to.equal(
          beneficiary.address
        );
      });

      it("sets tax rate", async function () {
        expect(await contract.taxRateOf(TOKENS.ONE)).to.equal(
          taxNumerator(TOKENS.ONE)
        );
        expect(await contract.taxRateOf(TOKENS.TWO)).to.equal(
          taxNumerator(TOKENS.TWO)
        );
        expect(await contract.taxRateOf(TOKENS.THREE)).to.equal(
          taxNumerator(TOKENS.THREE)
        );
      });

      it("sets tax period", async function () {
        expect(await contract.taxPeriodOf(TOKENS.ONE)).to.equal(
          collectionFrequencyInSeconds(TOKENS.ONE)
        );
        expect(await contract.taxPeriodOf(TOKENS.TWO)).to.equal(
          collectionFrequencyInSeconds(TOKENS.TWO)
        );
        expect(await contract.taxPeriodOf(TOKENS.THREE)).to.equal(
          collectionFrequencyInSeconds(TOKENS.THREE)
        );
      });
    });
  });

  describe("Prevent non-takeover/foreclosure (i.e. ERC721) transfers", async function () {
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
    });
  });

  describe("#setBeneficiary", async function () {
    context("succeeds", async function () {
      it("current beneficiary can set new beneficiary", async function () {
        const trx = await beneficiary.contract.setBeneficiary(
          TOKENS.ONE,
          alice.address
        );

        expect(await contract.beneficiaryOf(TOKENS.ONE)).to.equal(
          alice.address
        );

        expect(trx)
          .to.emit(contract, Events.BENEFICIARY_UPDATED)
          .withArgs(TOKENS.ONE, alice.address);
      });
    });
    context("fails", async function () {
      it("when token is not minted", async function () {
        await expect(
          contract.setBeneficiary(4, alice.address)
        ).to.be.revertedWith(ErrorMessages.NONEXISTENT_TOKEN);
      });

      it("When non-beneficiary attempts to update", async function () {
        await expect(
          alice.contract.setBeneficiary(1, alice.address)
        ).to.be.revertedWith(ErrorMessages.BENEFICIARY_ONLY);
      });
    });
  });

  describe("#beneficiaryOf", async function () {
    context("fails", async function () {
      it("when no beneficiary is set", async function () {
        await expect(contract.beneficiaryOf(4)).to.be.revertedWith(
          ErrorMessages.NONEXISTENT_TOKEN
        );
      });
    });
    context("succeeds", async function () {
      it("displays correct beneficiary after set", async function () {
        await beneficiary.contract.setBeneficiary(TOKENS.ONE, bob.address);
        expect(await contract.beneficiaryOf(TOKENS.ONE)).to.equal(bob.address);
      });
    });
  });

  describe("#onlyOwner()", async function () {
    context("fails", async function () {
      context("when required but signer is not owner", async function () {
        it("#deposit()", async function () {
          await expect(
            alice.contract.deposit(TOKENS.ONE, { value: ETH1 })
          ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
        });

        it("#selfAssess()", async function () {
          await expect(
            alice.contract.selfAssess(TOKENS.ONE, 500)
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

  describe("#collectTax()", async function () {
    context("fails", async function () {});
    context("succeeds", async function () {
      it("no tax collected if token is owned by its beneficiary", async function () {
        const tokenId = randomToken();
        await takeoverLease(beneficiary, tokenId, ETH1, ETH0, ETH0);
        const trx = await contract.collectTax(tokenId);

        // Todo: There are other conditions which would true that we're not checking for,
        // e.g. deposit and beneficiary balance are unchanged.  This test *should* verify
        // that all effects from `owed > 0` have not fired.
        expect(trx).to.not.emit(contract, Events.COLLECTION);
      });

      it("collects after 10m", async function () {
        const price = ETH1;
        const token = randomToken();

        await takeoverLease(alice, token, price, ETH0, ETH2);

        await collectTax(token, 10, price);
      });

      it("collects after 10m and subsequently after 10m", async function () {
        const price = ETH1;
        const token = randomToken();

        await takeoverLease(alice, token, price, ETH0, ETH2);

        await collectTax(token, 10, price);
        await collectTax(token, 10, price);
      });
    });
  });

  describe("#tokenMinted()", async function () {
    context("fails", async function () {
      context("when token not minted but required", async function () {
        it("#valuationOf()", async function () {
          await expect(contract.ownerOf(INVALID_TOKEN_ID)).to.be.revertedWith(
            ERC721ErrorMessages.NONEXISTENT_TOKEN
          );
        });
        it("#depositOf()", async function () {
          await expect(contract.depositOf(INVALID_TOKEN_ID)).to.be.revertedWith(
            ErrorMessages.NONEXISTENT_TOKEN
          );
        });
        it("#takeoverLease()", async function () {
          await expect(
            contract.takeoverLease(INVALID_TOKEN_ID, ETH0, ETH0, {
              value: ETH0,
            })
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

  describe("#taxRateOf()", async function () {
    context("succeeds", async function () {
      it(`returning expected tax rate`, async function () {
        expect(await alice.contract.taxRateOf(TOKENS.ONE)).to.equal(
          taxNumerator(TOKENS.ONE)
        );
      });
    });
  });

  describe("#valuationOf()", async function () {
    context("succeeds", async function () {
      it("returning expected price [ETH0]", async function () {
        expect(await contract.valuationOf(TOKENS.ONE)).to.equal(ETH0);
      });
    });
  });

  describe("#depositOf()", async function () {
    context("succeeds", async function () {
      it("returning expected deposit [ETH0]", async function () {
        expect(await contract.valuationOf(TOKENS.ONE)).to.equal(ETH0);
      });
    });
  });

  describe("#taxOwed()", async function () {
    context("fails", async function () {});
    context("succeeds", async function () {
      it("Returns correct taxation after 1 day", async function () {
        const token = randomToken();
        await takeoverLease(alice, token, ETH1, ETH0, ETH2);
        await verifyCorrectTaxOwed(token, 1);
      });

      it("no tax owed if token is owned by its beneficiary", async function () {
        const token = randomToken();
        await takeoverLease(beneficiary, token, ETH1, ETH0, ETH0);
        const [owed] = await contract.taxOwed(token);
        expect(owed).to.equal(0);
      });
    });

    it("Returns correct taxation after 1 year", async function () {
      const token = randomToken();
      await takeoverLease(alice, token, ETH1, ETH0, ETH2);
      await verifyCorrectTaxOwed(token, 365);
    });

    it("Returns correct taxation after 2 years", async function () {
      const token = randomToken();
      await takeoverLease(alice, token, ETH1, ETH0, ETH2);
      await verifyCorrectTaxOwed(token, 730);
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

      it("Returns correct amount", async function () {
        const token = randomToken();
        const price = ETH1;

        await takeoverLease(alice, token, price, ETH0, ETH2);

        const time = (await now()).sub(1);

        const collectionFrequency = tokenTaxConfigs[token].collectionFrequency;

        const expected = price
          .mul(time)
          .div(taxationPeriodToSeconds(collectionFrequency))
          .mul(taxNumerator(token))
          .div(TAX_DENOMINATOR);

        expect(await contract.taxOwedSince(token, time)).to.equal(expected);
      });
    });
  });

  describe("#taxCollectedSinceLastTransferOf()", async function () {
    context("fails", async function () {});
    context("succeeds", async function () {
      context("returning correct amount", async function () {
        it("if never transferred", async function () {
          expect(
            await contract.taxCollectedSinceLastTransferOf(TOKENS.ONE)
          ).to.equal(0);
        });

        it("after initial purchase", async function () {
          const token = randomToken();
          const price = ETH1;

          await takeoverLease(alice, token, price, ETH0, ETH2);

          await collectTax(token, 1, price);
        });

        it("after 1 secondary-purchase", async function () {
          const token = randomToken();
          const price = ETH1;

          await takeoverLease(alice, token, price, ETH0, ETH2);

          await collectTax(token, 1, price);

          const secondaryPrice = ETH2;

          await takeoverLease(bob, token, secondaryPrice, ETH1, ETH3);

          await collectTax(token, 1, secondaryPrice);
        });

        it("when foreclosed", async function () {
          const token = randomToken();

          await takeoverLease(alice, token, ETH1, ETH0, ETH2);

          // How many days until foreclosure?
          const timeTillForeclosure = await contract.foreclosureTime(token);
          await time.increaseTo(timeTillForeclosure.add(1).toNumber());

          expect(await contract.foreclosed(token)).to.equal(true);

          await time.increase(time.duration.days(1));
          expect(
            await contract.taxCollectedSinceLastTransferOf(token)
          ).to.equal(0);
        });

        it("after purchase from foreclosure", async function () {
          const token = randomToken();

          await takeoverLease(alice, token, ETH1, ETH0, ETH2);

          // How many days until foreclosure?
          const timeTillForeclosure = await contract.foreclosureTime(token);
          await time.increaseTo(timeTillForeclosure.add(1).toNumber());

          expect(await contract.foreclosed(token)).to.equal(true);

          await time.increase(time.duration.days(1));

          // Purchasing will trigger foreclosure and ownership transfer.
          const price = ETH1;
          await takeoverLease(bob, token, price, ETH1, ETH2);

          await collectTax(token, 1, price);
        });
      });
    });
  });

  describe("#foreclosed()", async function () {
    context("fails", async function () {});
    context("succeeds", async function () {
      it("true positive", async function () {
        const token = randomToken();

        const { block, trx } = await takeoverLease(
          alice,
          token,
          ETH1,
          ETH0,
          ETH2
        );

        // How many days until foreclosure?
        const timeTillForeclosure = await contract.foreclosureTime(token);
        await time.increaseTo(timeTillForeclosure.add(1).toNumber());

        // Entire deposit will be exceeded after 1yr
        expect(await contract.foreclosed(token)).to.equal(true);

        expect(trx).to.emit(contract, Events.TRANSFER);

        // Transfer time is set during foreclosure
        expect(await contract.lastTransferTimeOf(token)).to.equal(
          block.timestamp
        );
      });
      it("true negative", async function () {
        const token = randomToken();

        await takeoverLease(alice, token, ETH1, ETH0, ETH2);

        await time.increase(time.duration.minutes(1));
        expect(await contract.foreclosed(token)).to.equal(false);
      });
    });
  });

  describe("#withdrawableDeposit()", async function () {
    context("fails", async function () {});
    context("succeeds", async function () {
      it("Returns zero when owed >= deposit", async function () {
        const token = randomToken();

        await takeoverLease(alice, token, ETH1, ETH0, ETH2);

        // Exhaust deposit
        // How many days until foreclosure?
        const timeTillForeclosure = await contract.foreclosureTime(token);
        await time.increaseTo(timeTillForeclosure.add(1).toNumber());

        expect(await contract.withdrawableDeposit(token)).to.equal(0);
      });
      it("Returns (deposit - owed) when owed < deposit", async function () {
        const token = randomToken();

        await takeoverLease(alice, token, ETH1, ETH0, ETH2);

        await time.increase(time.duration.days(1));
        const owed = await contract.taxOwed(token);

        expect(await contract.withdrawableDeposit(token)).to.equal(
          ETH2.sub(owed.amount)
        );
      });
    });
  });

  describe("#foreclosureTime()", async function () {
    context("fails", async function () {});
    context("succeeds", async function () {
      it("consistently returns within +/- 1s", async function () {
        const token = randomToken();
        const price = ETH1;
        const tenMinDue = getTaxDue(token, price, tenMin, prior);
        await takeoverLease(alice, token, price, ETH0, tenMinDue);

        // Future:

        const tenMinutes = time.duration.minutes(10);

        const shouldForecloseAt = (await now()).add(
          ethers.BigNumber.from(tenMinutes.toString())
        );

        await verifyExpectedForeclosureTime(token, shouldForecloseAt);

        // Present:

        await time.increase(tenMinutes);

        // Foreclosure should be backdated to when token was in foreclosed state.
        await verifyExpectedForeclosureTime(token, shouldForecloseAt);

        // Trigger foreclosure
        await contract.collectTax(token);

        // Past:

        await time.increase(tenMinutes);

        await verifyExpectedForeclosureTime(token, shouldForecloseAt);
      });

      it("time is 10m into the future", async function () {
        const token = randomToken();
        const price = ETH1;
        const tenMinDue = getTaxDue(token, price, tenMin, prior);

        await takeoverLease(
          alice,
          token,
          price,
          ETH0,
          tenMinDue // Deposit 10 min of patronage
        );

        const tenMinutesFromNow = (await now()).add(
          ethers.BigNumber.from(time.duration.minutes(10).toString())
        );

        await verifyExpectedForeclosureTime(token, tenMinutesFromNow);
      });

      it("returns backdated time if foreclosed", async function () {
        const token = randomToken();
        const price = ETH1;
        const tenMinDue = getTaxDue(token, price, tenMin, prior);

        await takeoverLease(
          alice,
          token,
          price,
          ETH0,
          tenMinDue // Deposit 10 min of patronage
        );

        await time.increase(time.duration.minutes(10));
        const shouldForecloseAt = await now();

        // Foreclosure should be backdated to when token was in foreclosed state.
        await verifyExpectedForeclosureTime(token, shouldForecloseAt);

        // Trigger foreclosure
        await contract.collectTax(token);

        expect(await contract.ownerOf(token)).to.equal(contractAddress);

        // Value should remain within +/- 1s after foreclosure has taken place
        await verifyExpectedForeclosureTime(token, shouldForecloseAt);
      });
    });
  });

  describe("#takeoverLease()", async function () {
    context("fails", async function () {
      it("Owner cannot prevent foreclosure by re-calling with new deposit", async function () {
        const token = randomToken();

        await takeoverLease(alice, token, ETH1, ETH0, ETH1);

        // Exhaust deposit
        // How many days until foreclosure?
        const timeTillForeclosure = await contract.foreclosureTime(token);
        await time.increaseTo(timeTillForeclosure.add(1).toNumber());

        // The tax collection that puts the token into foreclosure occurs after
        // ownership assertion.
        await expect(
          alice.contract.takeoverLease(token, ETH1, ETH1, { value: ETH2 })
        ).to.be.revertedWith(ErrorMessages.LEASE_TAKEOVER_ALREADY_OWNED);
      });
      it("Attempting to takeover lease of an un-minted token", async function () {
        await expect(
          alice.contract.takeoverLease(INVALID_TOKEN_ID, ETH1, ETH1, {
            value: ETH1,
          })
        ).to.be.revertedWith(ErrorMessages.NONEXISTENT_TOKEN);
      });
      it("Verifying incorrect Current Price", async function () {
        await expect(
          alice.contract.takeoverLease(
            TOKENS.ONE,
            ETH1, // Purchase price of 1
            ETH1, // current price of 1 [should be ETH0]
            { value: ETH1 }
          )
        ).to.be.revertedWith(
          ErrorMessages.LEASE_TAKEOVER_INCORRECT_CURRENT_PRICE
        );
      });
      it("Attempting to takeover lease of with 0 Wei", async function () {
        await expect(
          alice.contract.takeoverLease(
            TOKENS.ONE,
            ETH0, // [must be greater than 0]
            ETH0,
            { value: ETH0 } // [must be greater than 0]
          )
        ).to.be.revertedWith(ErrorMessages.LEASE_TAKEOVER_ZERO_PRICE);
      });
      it("When purchase price is less than message value", async function () {
        await expect(
          alice.contract.takeoverLease(
            TOKENS.ONE,
            ETH0, // Purchase price of zero
            ETH0, // Current Price [correct]
            { value: ETH1 } // Send 1 Eth
          )
        ).to.be.revertedWith(ErrorMessages.LEASE_TAKEOVER_ZERO_PRICE);
      });
      it("Attempting to takeover lease of with price less than current price", async function () {
        // Purchase as Bob for 2 ETH
        await takeoverLease(bob, TOKENS.TWO, ETH2, ETH0, ETH3);

        await expect(
          alice.contract.takeoverLease(
            TOKENS.TWO, // owned by Bob
            ETH1, // [should be ETH2]
            ETH2, // Correct
            { value: ETH1 } // [should be ETH2]
          )
        ).to.be.revertedWith(ErrorMessages.LEASE_TAKEOVER_PRICE_BELOW_CURRENT);
      });
      it("Attempting to takeover lease of without surplus value for payment", async function () {
        const tokenId = TOKENS.ONE;
        await takeoverLease(bob, tokenId, ETH1, ETH0, ETH1);

        await expect(
          alice.contract.takeoverLease(tokenId, ETH2, ETH1, { value: ETH1 }) // [should be greater than ETH1]
        ).to.be.revertedWith(ErrorMessages.LEASE_TAKEOVER_LACKS_SURPLUS_VALUE);
      });
      it("Attempting to purchase a token it already owns", async function () {
        // Purchase
        await takeoverLease(bob, TOKENS.TWO, ETH2, ETH0, ETH3);
        // Re-purchase
        await expect(
          bob.contract.takeoverLease(TOKENS.TWO, ETH3, ETH2, { value: ETH4 })
        ).to.be.revertedWith(ErrorMessages.LEASE_TAKEOVER_ALREADY_OWNED);
      });
      it("Beneficiary is purchasing from contract and msg includes value", async function () {
        await expect(
          takeoverLease(beneficiary, randomToken(), ETH1, ETH0, ETH2)
        ).to.be.revertedWith(ErrorMessages.PROHIBITED_VALUE);
      });
      it("Beneficiary is purchasing from Alice and msg includes surplus value for deposit", async function () {
        const tokenId = randomToken();
        await takeoverLease(alice, tokenId, ETH1, ETH0, ETH2);

        await expect(
          takeoverLease(beneficiary, tokenId, ETH4, ETH1, ETH2)
        ).to.be.revertedWith(ErrorMessages.PROHIBITED_SURPLUS_VALUE);
      });
    });
    context("succeeds", async function () {
      it("Purchasing token for the first-time (from contract)", async function () {
        await takeoverLease(alice, TOKENS.ONE, ETH1, ETH0, ETH2);
      });

      it("Purchasing token from current owner", async function () {
        const token = randomToken();
        await takeoverLease(alice, token, ETH1, ETH0, ETH2);
        await takeoverLease(bob, token, ETH2, ETH1, ETH3);
      });

      it("Purchasing token from foreclosure", async function () {
        const token = randomToken();

        await takeoverLease(alice, token, ETH1, ETH0, ETH2);

        // Exhaust deposit
        // How many days until foreclosure?
        const timeTillForeclosure = await contract.foreclosureTime(token);
        await time.increaseTo(timeTillForeclosure.add(1).toNumber());

        // Trigger foreclosure & takeover lease out of foreclosure
        expect(
          await bob.contract.takeoverLease(token, ETH1, ETH1, {
            value: ETH2,
          })
        )
          .to.emit(contract, Events.FORECLOSURE)
          .withArgs(token, alice.address);

        expect(await contract.ownerOf(token)).to.equal(bob.address);
      });

      it("Purchasing token from current owner who purchased from foreclosure", async function () {
        const token = randomToken();

        await takeoverLease(alice, token, ETH1, ETH0, ETH2);

        // Exhaust deposit
        // How many days until foreclosure?
        const timeTillForeclosure = await contract.foreclosureTime(token);
        await time.increaseTo(timeTillForeclosure.add(1).toNumber());

        // Foreclose
        await contract.collectTax(token);

        // takeover lease out of foreclosure
        await takeoverLease(bob, token, ETH1, ETH0, ETH2);

        await takeoverLease(alice, token, ETH2, ETH1, ETH3);
      });

      it("Owner prior to foreclosure re-purchases", async function () {
        const token = randomToken();

        await takeoverLease(alice, token, ETH1, ETH0, ETH2);

        // Exhaust deposit
        // How many days until foreclosure?
        const timeTillForeclosure = await contract.foreclosureTime(token);
        await time.increaseTo(timeTillForeclosure.add(1).toNumber());

        // Trigger foreclosure
        await contract.collectTax(token);

        // takeover lease out of foreclosure
        await takeoverLease(alice, token, ETH1, ETH0, ETH2);
      });

      it("Updating chain of title", async function () {
        const token = randomToken();

        const { block: block1 } = await takeoverLease(
          bob,
          token,
          ETH1,
          ETH0,
          ETH2
        );

        const { block: block2 } = await takeoverLease(
          alice,
          token,
          ETH2,
          ETH1,
          ETH3
        );

        const chainOfTitle = await contract.titleChainOf(token);

        expect(chainOfTitle[0].from).to.equal(contractAddress);
        expect(chainOfTitle[0].to).to.equal(bob.address);
        expect(chainOfTitle[0].valuation).to.equal(ETH1);
        expect(chainOfTitle[0].timestamp).to.equal(
          ethers.BigNumber.from(block1.timestamp)
        );
        expect(chainOfTitle[1].from).to.equal(bob.address);
        expect(chainOfTitle[1].to).to.equal(alice.address);
        expect(chainOfTitle[1].valuation).to.equal(ETH2);
        expect(chainOfTitle[1].timestamp).to.equal(
          ethers.BigNumber.from(block2.timestamp)
        );
      });

      it("Beneficiary doesn't pay anything if buying from contract", async function () {
        await takeoverLease(beneficiary, randomToken(), ETH1, ETH0, ETH0);
      });

      it("Beneficiary only pays purchase price if buying from Alice", async function () {
        const tokenId = randomToken();
        await takeoverLease(alice, tokenId, ETH1, ETH0, ETH2);
        await takeoverLease(beneficiary, tokenId, ETH4, ETH1, ETH1);
      });

      /**
       * Bugfix e890718185d982a329f7898bc4dd959787372f47
       * If Alice takes over the token lease with a very small deposit, and Bob purchasing the token
       * exhausts that deposit, the token will be foreclosed and the valuation will be set to
       * 0.  If Bob doesn't realize this will happen, his `currentValuation_` param will be
       * incorrect and the token will not be purchasable until Bob resubmits with a current valuation of 0.
       * This is unintended behavior.
       *
       * As such, https://github.com/721labs/partial-common-ownership/issues/53 changes the tax collection
       * to occur only after the assertions have passed.  Prior to this, this test would fail.
       */
      it("Collects taxes after assertions success", async function () {
        const token = randomToken();
        const aliceValuation = ETH1;

        await takeoverLease(
          alice,
          token,
          aliceValuation,
          ETH0,
          // 10 minutes worth of deposit
          getTaxDue(token, aliceValuation, tenMin, prior)
        );

        // 10 min goes by...
        const elevenMinutes = time.duration.minutes(10);
        await time.increase(elevenMinutes);

        // Bob attempts to purchases the token, triggering foreclosure.
        await takeoverLease(bob, token, ETH2, aliceValuation, ETH2);
      });
    });
  });

  describe("#deposit()", async function () {
    context("fails", async function () {
      it("is not deposited by owner", async function () {
        await expect(
          alice.contract.deposit(TOKENS.ONE, {
            value: ethers.utils.parseEther("1"),
          })
        ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
      });
    });
    context("succeeds", async function () {
      it("owner can deposit", async function () {
        const token = randomToken();

        await takeoverLease(alice, token, ETH1, ETH0, ETH2);

        await expect(
          alice.contract.deposit(token, { value: ETH1 })
        ).to.not.reverted;
      });
    });
  });

  describe("#selfAssess()", async function () {
    context("fails", async function () {
      it("only owner can update price", async function () {
        await expect(
          alice.contract.selfAssess(TOKENS.ONE, 500)
        ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
      });
      it("cannot have a new price of zero", async function () {
        const token = randomToken();

        await takeoverLease(alice, token, ETH1, ETH0, ETH2);
        await expect(alice.contract.selfAssess(token, ETH0)).to.be.revertedWith(
          ErrorMessages.NEW_PRICE_ZERO
        );
      });
      it("cannot have price set to same amount", async function () {
        const token = randomToken();

        await takeoverLease(alice, token, ETH1, ETH0, ETH2);
        await expect(alice.contract.selfAssess(token, ETH1)).to.be.revertedWith(
          ErrorMessages.NEW_PRICE_SAME
        );
      });
    });
    context("succeeds", async function () {
      it("owner can increase price", async function () {
        const token = randomToken();

        await takeoverLease(alice, token, ETH1, ETH0, ETH2);

        expect(await alice.contract.selfAssess(token, ETH2))
          .to.emit(contract, Events.VALUATION_REASSESSMENT)
          .withArgs(token, ETH2);

        expect(await contract.valuationOf(token)).to.equal(ETH2);
      });

      it("owner can decrease price", async function () {
        const token = randomToken();

        await takeoverLease(alice, token, ETH2, ETH0, ETH3);

        expect(await alice.contract.selfAssess(token, ETH1))
          .to.emit(contract, Events.VALUATION_REASSESSMENT)
          .withArgs(token, ETH1);

        expect(await contract.valuationOf(token)).to.equal(ETH1);
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
        const token = randomToken();

        await takeoverLease(alice, token, ETH1, ETH0, ETH2);

        await expect(
          alice.contract.withdrawDeposit(token, ETH2)
        ).to.be.revertedWith(ErrorMessages.CANNOT_WITHDRAW_MORE_THAN_DEPOSITED);
      });
    });

    context("succeeds", async function () {
      it("Withdraws expected amount", async function () {
        const token = randomToken();
        const price = ETH1;

        await takeoverLease(alice, token, price, ETH0, ETH3);

        // Necessary to determine tax due on exit
        const lastCollectionTime = await contract.lastCollectionTimeOf(token);

        const trx = await alice.contract.withdrawDeposit(token, ETH1);
        const { timestamp } = await provider.getBlock(trx.blockNumber);

        // Emits
        expect(trx)
          .to.emit(contract, Events.REMITTANCE)
          .withArgs(RemittanceTriggers.WithdrawnDeposit, alice.address, ETH1);

        // current deposit - tax on exit
        const taxedAmt = getTaxDue(
          token,
          price,
          ethers.BigNumber.from(timestamp),
          lastCollectionTime
        );

        // Deposit should be 2 ETH - taxed amount.
        expect(await contract.depositOf(token)).to.equal(ETH2.sub(taxedAmt));

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
      it("Withdraws entire deposit", async function () {
        const token = randomToken();

        await takeoverLease(alice, token, ETH1, ETH0, ETH2);

        // Determine tax due on exit
        const lastCollectionTime = await contract.lastCollectionTimeOf(token);

        const trx = await alice.contract.exit(token);
        const { timestamp } = await provider.getBlock(trx.blockNumber);

        // current deposit - tax on exit
        const taxedAmt = getTaxDue(
          token,
          ETH1,
          ethers.BigNumber.from(timestamp),
          lastCollectionTime
        );

        const expectedRemittance = ETH2.sub(taxedAmt);

        // Emits
        expect(trx)
          .to.emit(contract, Events.REMITTANCE)
          .withArgs(
            RemittanceTriggers.WithdrawnDeposit,
            alice.address,
            expectedRemittance
          );

        // Alice's balance should reflect returned deposit minus fees
        const { delta, fees } = await alice.balanceDelta();

        const expectedRemittanceMinusGas = expectedRemittance.sub(fees);

        expect(delta).to.equal(expectedRemittanceMinusGas);

        // Deposit should be zero
        expect(await contract.depositOf(token)).to.equal(0);

        // Token should foreclose
        expect(await contract.valuationOf(token)).to.equal(0);
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

    it("Allows withdrawal", async function () {
      const blockerAlice = new Wallet(blocker, signers[2]);
      await blockerAlice.setup();

      // 1. takeover lease as Blocker Alice
      const token = randomToken();
      await blockerAlice.contract.takeoverLease(token, ETH1, ETH0, {
        value: ETH2,
        ...GLOBAL_TRX_CONFIG,
      });

      expect(await contract.ownerOf(token)).to.equal(blocker.address);

      // 2. takeover lease from Blocker Alice as Bob
      const trx = await bob.contract.takeoverLease(token, ETH2, ETH1, {
        value: ETH3,
        ...GLOBAL_TRX_CONFIG,
      });

      const expectedRemittance = await contract.outstandingRemittances(
        blocker.address
      );
      expect(expectedRemittance).to.be.gt(0);

      await expect(trx)
        .to.emit(contract, Events.OUTSTANDING_REMITTANCE)
        .withArgs(blocker.address);

      // 3. Collect as blocker
      const collectionTrx = await blockerAlice.contract.collect();

      // Emits
      await expect(collectionTrx)
        .to.emit(contract, Events.REMITTANCE)
        .withArgs(
          RemittanceTriggers.OutstandingRemittance,
          blocker.address,
          expectedRemittance
        );
    });
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
});
