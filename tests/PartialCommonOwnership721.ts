//@ts-nocheck

import { time, balance } from "@openzeppelin/test-helpers";

import { expect } from "chai";
import { loadFixture } from "ethereum-waffle";
import { ethers } from "hardhat";
import { getABI } from "../utils/abi";

enum ErrorMessages {
  ONLY_OWNER = "Sender does not own this token",
  BUY_ZERO_PRICE = "New Price cannot be zero",
  BUY_INCORRECT_CURRENT_PRICE = "Current Price is incorrect",
  BUY_PRICE_BELOW_CURRENT = "New Price must be >= current price",
  BUY_LACKS_SURPLUS_VALUE = "Message does not contain surplus value for deposit",
  BUY_ALREADY_OWNED = "Buyer is already owner",
  NONEXISTENT_TOKEN = "ERC721: owner query for nonexistent token",
}

enum TOKENS {
  ONE = 1,
  TWO = 2,
  THREE = 3,
}

const INVALID_TOKEN_ID = 999;

enum Events {
  BUY = "LogBuy",
  OUTSTANDING_REMITTANCE = "LogOutstandingRemittance",
  PRICE_CHANGE = "LogPriceChange",
  FORECLOSURE = "LogForeclosure",
  COLLECTION = "LogCollection",
  BENEFICIARY_REMITTANCE = "LogBeneficiaryRemittance",
}

const TEST_NAME = "721TEST";
const TEST_SYMBOL = "TEST";

const TAX_RATE = 1000000000000; // 100%

const ETH0 = ethers.BigNumber.from("0");
const ETH1 = ethers.utils.parseEther("1");
const ETH2 = ethers.utils.parseEther("2");
const ETH3 = ethers.utils.parseEther("3");
const ETH4 = ethers.utils.parseEther("4");

// for 5% patronage
// const TenMinDue = ethers.BigNumber.from('951293759512'); // price of 1 ETH
// const TenMinOneSecDue = ethers.BigNumber.from('952879249112'); // price of 1 ETH

const TenMinDue = ethers.BigNumber.from("19025875190258"); // price of 1 ETH
const TenMinOneSecDue = ethers.BigNumber.from("19057584982242"); // price of 1 ETH
const numerator = ethers.BigNumber.from("1000000000000");
const denominator = ethers.BigNumber.from("1000000000000");
const year = ethers.BigNumber.from("31536000"); // 365 days

async function stringTimeLatest() {
  const timeBN = await time.latest();
  return timeBN.toString();
}

async function bigTimeLatest() {
  const STL = await stringTimeLatest();
  return ethers.BigNumber.from(STL);
}

function calculateDue(price, initTime, endTime) {
  // price * (now - timeLastCollected) * patronageNumerator/ patronageDenominator / 365 days;
  const due = price.mul(endTime.sub(initTime)).div(year);
  return due;
}

describe("PartialCommonOwnership721", async () => {
  let contract;
  let contractAddress;
  let provider;
  let signers;
  let accounts;
  let snapshot;

  // Agents to perform situational tests
  let contractAsOwner;
  let contractAsBeneficiary;
  let contractAsAlice;
  let contractAsBob;

  const gasLimit = 9500000; // if gas limit is set, estimateGas isn't run superfluously, slowing tests down.

  /**
   * Setup
   */
  before(async function () {
    provider = new ethers.providers.Web3Provider(web3.currentProvider);
    signers = await ethers.getSigners();
    accounts = await Promise.all(
      signers.map(async (signer) => await signer.getAddress())
    );

    const contractFactory = await ethers.getContractFactory("Test721Token");

    contract = await contractFactory.deploy({ gasLimit });
    await contract.deployed();

    contractAddress = contract.address;
    expect(contractAddress).to.not.be.null;

    contractAsOwner = contract.connect(signers[0]);
    contractAsBeneficiary = contract.connect(signers[0]);
    contractAsAlice = contract.connect(signers[1]);
    contractAsBob = contract.connect(signers[2]);

    snapshot = await provider.send("evm_snapshot", []);
  });

  /**
   * Between each test wipe the state of the contract.
   */
  beforeEach(async function () {
    await provider.send("evm_revert", [snapshot]);
    snapshot = await provider.send("evm_snapshot", []);
  });

  it("Test contract mints three tokens during construction", async () => {
    expect(await contract.ownerOf(TOKENS.ONE)).to.equal(contractAddress);
    expect(await contract.ownerOf(TOKENS.TWO)).to.equal(contractAddress);
    expect(await contract.ownerOf(TOKENS.THREE)).to.equal(contractAddress);
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
        const beneficiary = await contract.beneficiary();
        const ownerAddress = contractAsOwner.signer.address;
        const beneficiaryAddress = contractAsBeneficiary.signer.address;
        expect(ownerAddress).to.equal(beneficiaryAddress);
        expect(beneficiary).to.equal(ownerAddress);
        expect(beneficiary).to.equal(beneficiaryAddress);
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

  describe("#collectText()", async () => {});

  describe("#tokenMinted()", async () => {
    context("fails", async () => {
      context("when token not minted but required", async () => {
        it("#priceOf()", async () => {
          await expect(contract.ownerOf(INVALID_TOKEN_ID)).to.be.revertedWith(
            ErrorMessages.NONEXISTENT_TOKEN
          );
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

  describe("#taxOwed()", async () => {});

  describe("#taxOwedSince()", async () => {});

  describe("#taxOwedWithTimestamp()", async () => {});

  describe("#currentCollected()", async () => {});

  describe("#foreclosed()", async () => {});

  describe("#withdrawableDeposit()", async () => {});

  describe("#foreclosureTime()", async () => {});

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
    // context("succeeds", async () => {
    //   it("buy with 2 ether, price of 1 success [price = 1 eth, deposit = 1 eth]", async () => {
    //     await expect(
    //       contract.connect(signers[2]).buy(TOKENS.ONE, ETH1, ETH0, {
    //         value: ETH1,
    //       })
    //     )
    //       .to.emit(contract, Events.BUY)
    //       .withArgs(accounts[2], ETH1);
    //     expect(await contract.deposit()).to.equal(ETH1);
    //     expect(await contract.price()).to.equal(ETH1);
    //     expect(await contract.pullFunds(accounts[2])).to.equal(ETH0);
    //   });
    // });
  });

  describe("#depositWei()", async () => {});

  describe("#changePrice()", async () => {});

  describe("#withdrawDeposit()", async () => {});

  describe("#exit()", async () => {});

  describe("#withdrawOutstandingRemittance()", async () => {});

  /**
   * IGNORE FOR NOW
   */

  // it("token+blocker: withdraw pull funds fail", async () => {
  //   blocker = await Blocker.deploy(token.address, { gasLimit });
  //   await blocker.deployed();
  //   await blocker.buy(ETH0, { value: ETH1, gasLimit });
  //   await expect(blocker.withdrawPullFunds({ gasLimit })).to.be.reverted; // couldn't receive back funds due to blocking
  // });

  // it("token+blocker: buy with blocker then buy from another account", async () => {
  //   blocker = await Blocker.deploy(token.address, { gasLimit });
  //   await blocker.deployed();

  //   // blocker will buy at price of 1 ETH (0 in contract)
  //   // thus: deposit should be ETH1.
  //   await blocker.buy(ETH0, { value: ETH1, gasLimit });

  //   const currentOwner = await token.ownerOf(TOKEN_ID);
  //   const currentDeposit = await token.deposit();
  //   expect(currentOwner).to.equal(blocker.address);
  //   expect(currentDeposit).to.equal(ETH1);

  //   // new buyer buys with 2 ETH, with price at 1 ETH.
  //   // thus: 2-1 = deposit should be 1 ETH.
  //   await token
  //     .connect(signers[2])
  //     .buy(ETH1, ETH1, { value: ETH2, gasLimit });

  //   const finalOwner = await token.ownerOf(TOKEN_ID);
  //   const deposit = await token.deposit();
  //   const pullFunds = await token.pullFunds(blocker.address);

  //   const oneSecDue = calculateDue(
  //     ETH1,
  //     ethers.BigNumber.from("0"),
  //     ethers.BigNumber.from("1")
  //   );

  //   expect(finalOwner).to.equal(accounts[2]);
  //   expect(deposit).to.equal(ETH1);
  //   expect(pullFunds).to.equal(ETH2.sub(oneSecDue));
  // });

  // it("token+blocker: failed to receive funds. correct it. receive withdrawpullfunds", async () => {
  //   blocker = await Blocker2.deploy(token.address, { gasLimit });
  //   await blocker.deployed();
  //   await blocker.buy(ETH0, { value: ETH1, gasLimit });
  //   await token
  //     .connect(signers[2])
  //     .buy(ETH1, ETH1, { value: ETH2, gasLimit }); // new buyer

  //   const deposit = await token.deposit();
  //   const pullFunds = await token.pullFunds(blocker.address);
  //   const oneSecDue = calculateDue(
  //     ETH1,
  //     ethers.BigNumber.from("0"),
  //     ethers.BigNumber.from("1")
  //   );
  //   expect(deposit).to.equal(ETH1);
  //   expect(pullFunds).to.equal(ETH2.sub(oneSecDue));

  //   await expect(blocker.withdrawPullFunds({ gasLimit })).to.be.revertedWith(
  //     "blocked"
  //   ); // couldn't receive back funds due to blocking

  //   await blocker.setBlock(false);

  //   expect(await blocker.toBlock()).to.equal(false);

  //   await blocker.withdrawPullFunds({ gasLimit });

  //   const b = await balance.current(blocker.address);
  //   expect(b.toString()).to.equal(pullFunds.toString());
  // });

  // it("token+blocker: double pull funds additions", async () => {
  //   blocker = await Blocker.deploy(token.address, { gasLimit });
  //   await blocker.deployed();
  //   await blocker.buy(ETH0, { value: ETH1, gasLimit });

  //   // 1 second should pass
  //   // new buyer buys with 2 ETH, with price at 1 ETH.
  //   // thus: 2-1 = deposit should be 1 ETH.
  //   await token
  //     .connect(signers[2])
  //     .buy(ETH1, ETH1, { value: ETH2, gasLimit });

  //   // new buyer buys with 2 ETH, with price at 1 ETH.
  //   // thus: 2-1 = deposit should be 1 ETH.
  //   await blocker.buy(ETH1, { value: ETH2, gasLimit });

  //   // 1 second should pass
  //   // new buyer buys with 2 ETH, with price at 1 ETH.
  //   // thus: 2-1 = deposit should be 1 ETH.
  //   await token
  //     .connect(signers[2])
  //     .buy(ETH1, ETH1, { value: ETH2, gasLimit });

  //   const pullFunds = await token.pullFunds(blocker.address);
  //   // because it was bought TWICE from the blocker
  //   const oneSecDue = calculateDue(
  //     ETH1,
  //     ethers.BigNumber.from("0"),
  //     ethers.BigNumber.from("1")
  //   );
  //   const twoSecDue = oneSecDue.add(oneSecDue); // due to rounding, it needs to be separate as the contract does collections, twice

  //   // 1st buy: 0 ETH old price. 1 ETH new price. 1 ETH value (1 ETH DEPOSIT).
  //   // 1st sale: pullFunds = 2 ETH - oneSecDue.
  //   // 2nd buy: 1 ETH old price. 1 ETH new price. 2 ETH value (1 ETH DEPOSIT).
  //   // 2nd sale: pullFunds = (2 ETH - oneSecDue) + (2 ETH - oneSecDue)
  //   expect(pullFunds).to.equal(ETH4.sub(twoSecDue));
  // });

  /**
   * TESTS CONTINUE.
   */

  // it("token: owned. transfer without token (fail)", async () => {
  //   await expect(
  //     token
  //       .connect(signers[2])
  //       .transferFrom(accounts[2], accounts[1], TOKEN_ID, { gasLimit })
  //   ).to.be.revertedWith("ERC721: transfer caller is not token.");
  // });

  // it("token: owned. check patronage owed after 1 second.", async () => {
  //   await token.buy(ETH1, ETH0, { value: ETH1, gasLimit });

  //   const timeLastCollected = await token.timeLastCollected();
  //   await time.increase(1);
  //   const owed = await token.patronageOwedWithTimestamp();

  //   // price * (now - timeLastCollected) * patronageNumerator/ patronageDenominator / 365 days;
  //   const due = ETH1.mul(owed.timestamp.sub(timeLastCollected))
  //     .mul(numerator)
  //     .div(denominator)
  //     .div(year);

  //   expect(owed.patronageDue).to.equal(due);
  // });

  // it("token: owned. check patronage owed after 1 year.", async () => {
  //   await token.buy(ETH1, ETH0, { value: ETH1, gasLimit });

  //   const timeLastCollected = await token.timeLastCollected();
  //   await time.increase(time.duration.days(365));
  //   const owed = await token.patronageOwedWithTimestamp();

  //   // price * (now - timeLastCollected) * patronageNumerator/ patronageDenominator / 365 days;
  //   const due = ETH1.mul(owed.timestamp.sub(timeLastCollected))
  //     .mul(numerator)
  //     .div(denominator)
  //     .div(year);

  //   expect(owed.patronageDue).to.equal(due);
  //   expect(owed.patronageDue).to.equal("1000000000000000000"); // 100% over 365 days. //todo: change rate
  // });

  // it("token: owned. buy with incorrect current price [fail].", async () => {
  //   await expect(
  //     token.buy(ETH1, ETH1, { value: ETH1, gasLimit })
  //   ).to.be.revertedWith("Current Price incorrect");
  // });

  // it("token: owned. collect patronage successfully after 10 minutes.", async () => {
  //   await token.buy(ETH1, ETH0, { value: ETH1, gasLimit });

  //   const preTime = await bigTimeLatest();

  //   const preDeposit = await token.deposit();
  //   await time.increase(time.duration.minutes(10));

  //   const owed = await token.patronageOwedWithTimestamp();
  //   await token._collectPatronage({ gasLimit });
  //   const latestTime = await bigTimeLatest();

  //   const deposit = await token.deposit();
  //   const artistFund = await token.artistFund();
  //   const timeLastCollected = await token.timeLastCollected();
  //   const currentCollected = await token.currentCollected();
  //   const totalCollected = await token.totalCollected();

  //   const due = preDeposit
  //     .mul(latestTime.sub(preTime))
  //     .mul(numerator)
  //     .div(denominator)
  //     .div(year);

  //   const calcDeposit = ETH1.sub(due);
  //   expect(deposit).to.equal(calcDeposit);
  //   expect(artistFund).to.equal(due);
  //   expect(timeLastCollected).to.equal(latestTime);
  //   expect(currentCollected).to.equal(due);
  //   expect(totalCollected).to.equal(due);
  // });

  // it("token: owned. collect patronage successfully after 10min and again after 10min.", async () => {
  //   await token.buy(ETH1, ETH0, { value: ETH1, gasLimit });

  //   const preTime1 = await bigTimeLatest();

  //   await time.increase(time.duration.minutes(10));
  //   await token._collectPatronage({ gasLimit });

  //   const postTime1 = await bigTimeLatest();
  //   const d1 = calculateDue(ETH1, preTime1, postTime1);

  //   await time.increase(time.duration.minutes(10));
  //   await token._collectPatronage({ gasLimit });

  //   const postTime2 = await bigTimeLatest();
  //   const d2 = calculateDue(ETH1, postTime1, postTime2);

  //   const deposit = await token.deposit();
  //   const artistFund = await token.artistFund();
  //   const timeLastCollected = await token.timeLastCollected();
  //   const currentCollected = await token.currentCollected();
  //   const totalCollected = await token.totalCollected();

  //   const due = d1.add(d2);
  //   const calcDeposit = ETH1.sub(due);

  //   expect(deposit).to.equal(calcDeposit);
  //   expect(artistFund).to.equal(due);
  //   expect(timeLastCollected).to.equal(postTime2);
  //   expect(totalCollected).to.equal(due);
  // });

  // it("token: owned. collect patronage that forecloses precisely after 10min.", async () => {
  //   // 10min+1 of patronage
  //   const initDeposit = TenMinOneSecDue; // wei
  //   await token
  //     .connect(signers[2])
  //     .buy(ETH1, ETH0, { value: initDeposit, gasLimit });
  //   const preTime = await bigTimeLatest();
  //   await time.increase(time.duration.minutes(10));
  //   await expect(token._collectPatronage({ gasLimit }))
  //     .to.emit(token, "LogForeclosure")
  //     .withArgs(accounts[2]); // will foreclose

  //   const deposit = await token.deposit();
  //   const artistFund = await token.artistFund();
  //   const timeLastCollected = await token.timeLastCollected();
  //   const currentCollected = await token.currentCollected();
  //   const totalCollected = await token.totalCollected();
  //   const price = await token.price();

  //   const latestTime = await bigTimeLatest();
  //   const due = calculateDue(ETH1, preTime, latestTime);

  //   const currentOwner = await token.ownerOf(TOKEN_ID);

  //   const timeHeld = await token.timeHeld(accounts[2]);

  //   const tenMinOneSec = time.duration
  //     .minutes(10)
  //     .add(time.duration.seconds(1));

  //   expect(timeHeld.toString()).to.equal(tenMinOneSec.toString());
  //   expect(currentOwner).to.equal(token.address);
  //   expect(deposit).to.equal(ETH0);
  //   expect(artistFund).to.equal(due);
  //   expect(timeLastCollected).to.equal(latestTime);
  //   expect(currentCollected).to.equal(ETH0);
  //   expect(totalCollected).to.equal(due);
  //   expect(price).to.equal(0);
  // });

  // it("token: owned. Deposit zero after 10min of patronage (after 10min) [success].", async () => {
  //   // 10min of patronage
  //   const initDeposit = ethers.BigNumber.from("951293759512"); // wei
  //   await token
  //     .connect(signers[2])
  //     .buy(ETH1, ETH0, { value: initDeposit, gasLimit });

  //   await time.increase(time.duration.minutes(10));
  //   const deposit = await token.deposit();
  //   const availableToWithdraw = await token.depositAbleToWithdraw();

  //   expect(deposit.toString()).to.equal(initDeposit.toString());
  //   expect(availableToWithdraw.toString()).to.equal("0");
  // });

  // it("token: owned. Foreclose Time is 10min into future on 10min patronage deposit [success].", async () => {
  //   // 10min of patronage
  //   const initDeposit = TenMinDue; // wei
  //   await token
  //     .connect(signers[2])
  //     .buy(ETH1, ETH0, { value: initDeposit, gasLimit });

  //   const forecloseTime = await token.foreclosureTime();
  //   const previousBlockTime = await time.latest();
  //   const finalTime = previousBlockTime.add(time.duration.minutes(10));
  //   expect(forecloseTime.toString()).to.equal(finalTime.toString());
  // });

  // it("token: owned. buy from person that forecloses precisely after 10min.", async () => {
  //   // 10min+1 of patronage
  //   const initDeposit = TenMinOneSecDue; // wei
  //   await token
  //     .connect(signers[2])
  //     .buy(ETH1, ETH0, { value: initDeposit, gasLimit });

  //   const preTime = await bigTimeLatest();

  //   await time.increase(time.duration.minutes(10));

  //   const preTimeBought = await token.timeAcquired();

  //   await expect(
  //     token.connect(signers[3]).buy(ethers.utils.parseEther("2"), ETH0, {
  //       value: initDeposit,
  //       gasLimit,
  //     })
  //   )
  //     .to.emit(token, "LogForeclosure")
  //     .withArgs(accounts[2])
  //     .and.to.emit(token, "LogBuy")
  //     .withArgs(accounts[3], ethers.utils.parseEther("2")); // will foreclose + buy

  //   const deposit = await token.deposit();
  //   const artistFund = await token.artistFund();
  //   const timeLastCollected = await token.timeLastCollected();
  //   const latestTime = await time.latest();
  //   const latestTimeBR = await bigTimeLatest();
  //   const currentCollected = await token.currentCollected();
  //   const totalCollected = await token.totalCollected();
  //   const price = await token.price();

  //   const due = calculateDue(ETH1, preTime, latestTimeBR);

  //   const currentOwner = await token.ownerOf(TOKEN_ID);

  //   const timeHeld = await token.timeHeld(accounts[2]);
  //   const calcTH = timeLastCollected.sub(preTimeBought);

  //   expect(timeHeld.toString()).to.equal(calcTH.toString());
  //   expect(currentOwner).to.equal(accounts[3]);
  //   expect(deposit).to.equal(initDeposit);
  //   expect(artistFund).to.equal(due);
  //   expect(timeLastCollected).to.equal(latestTimeBR);
  //   expect(currentCollected.toString()).to.equal("0");
  //   expect(totalCollected).to.equal(due);
  //   expect(price).to.equal(ETH2); //owned by 3
  // });

  // it("token: owned. collect funds by artist after 10min.", async () => {
  //   // 10min+1of patronage
  //   const totalToBuy = TenMinOneSecDue;
  //   await token
  //     .connect(signers[2])
  //     .buy(ETH1, ETH0, { value: totalToBuy, gasLimit });
  //   await time.increase(time.duration.minutes(10));
  //   await token._collectPatronage(); // will foreclose

  //   const balTrack = await balance.tracker(accounts[0]);

  //   const tx = await token.connect(signers[0]).withdrawArtistFunds({
  //     gasPrice: ethers.BigNumber.from("1000000000"),
  //     gasLimit,
  //   }); // 1 gwei gas
  //   const txReceipt = await provider.getTransactionReceipt(tx.hash);
  //   const txCost = ethers.uti.BigNumber.from(txReceipt.gasUsed).mul(
  //     ethers.BigNumber.from("1000000000")
  //   ); // gas used * gas price
  //   const calcDiff = totalToBuy.sub(txCost); // should receive

  //   const artistFund = await token.artistFund();

  //   expect(artistFund.toString()).to.equal("0");
  //   const delta = await balTrack.delta();
  //   expect(delta.toString()).to.equal(calcDiff.toString());
  // });

  // it("token: owned. collect patronage. 10min deposit. 20min Foreclose.", async () => {
  //   // 10min+1sec of patronage
  //   const totalToBuy = TenMinOneSecDue;
  //   await token
  //     .connect(signers[2])
  //     .buy(ETH1, ETH0, { value: totalToBuy, gasLimit });

  //   const preTime = await bigTimeLatest();
  //   await time.increase(time.duration.minutes(20));
  //   // 20min owed patronage
  //   // 10min due
  //   const preForeclosed = await token.foreclosed();
  //   const preTLC = await token.timeLastCollected();
  //   const preDeposit = await token.deposit();
  //   const preTimeBought = await token.timeAcquired();
  //   const preForeclosureTime = await token.foreclosureTime();
  //   await token._collectPatronage(); // will foreclose

  //   const postCollectionTime = await bigTimeLatest();

  //   // based on what was supposed to be due (10min+1), not 20min
  //   const due = calculateDue(
  //     ETH1,
  //     preTime,
  //     preTime.add(ethers.BigNumber.from("601"))
  //   ); // 10m + 1 sec

  //   // collection, however, will be 20min (foreclosure happened AFTER deposit defacto ran out)
  //   const collection = calculateDue(ETH1, preTime, postCollectionTime);

  //   const deposit = await token.deposit();
  //   const artistFund = await token.artistFund();
  //   const timeLastCollected = await token.timeLastCollected();

  //   // timeLastCollected = timeLastCollected.add(((now.sub(timeLastCollected)).mul(deposit).div(collection)));
  //   // Collection will > deposit based on 20min.
  //   const tlcCheck = preTLC.add(
  //     postCollectionTime.sub(preTLC).mul(preDeposit).div(collection)
  //   );
  //   const currentCollected = await token.currentCollected();
  //   const totalCollected = await token.totalCollected();
  //   const price = await token.price();

  //   const currentOwner = await token.ownerOf(TOKEN_ID);

  //   const timeHeld = await token.timeHeld(accounts[2]);
  //   const calcTH = timeLastCollected.sub(preTimeBought);

  //   expect(preForeclosed.toString()).to.equal("true");
  //   expect(token.address).to.equal(currentOwner);
  //   expect(timeHeld.toString()).to.equal(calcTH.toString());
  //   expect(deposit.toString()).to.equal("0");
  //   expect(artistFund).to.equal(due);
  //   expect(timeLastCollected.toString()).to.equal(tlcCheck.toString());
  //   expect(preForeclosureTime.toString()).to.equal(
  //     timeLastCollected.toString()
  //   );
  //   expect(currentCollected.toString()).to.equal("0");
  //   expect(totalCollected).to.equal(due);
  //   expect(price).to.equal(ETH0);
  // });

  // it("token: owned. deposit wei fail from not patron", async () => {
  //   await token.connect(signers[2]).buy(ETH1, ETH0, { value: ETH2, gasLimit });
  //   await expect(
  //     token.connect(signers[3]).depositWei({ value: ETH2, gasLimit })
  //   ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
  // });

  // it("token: owned. change price to zero [fail]", async () => {
  //   await token.connect(signers[2]).buy(ETH1, ETH0, { value: ETH2, gasLimit });
  //   await expect(
  //     token.connect(signers[2]).changePrice(0, { gasLimit })
  //   ).to.be.revertedWith("Price is zero");
  // });

  // it("token: owned. change price to more [success]", async () => {
  //   await token.connect(signers[2]).buy(ETH1, ETH0, { value: ETH2, gasLimit });
  //   await expect(token.connect(signers[2]).changePrice(ETH3, { gasLimit }))
  //     .to.emit(token, "LogPriceChange")
  //     .withArgs(ETH3);
  //   const postPrice = await token.price();
  //   expect(ETH3).to.equal(postPrice);
  // });

  // it("token: owned. change price to less [success]", async () => {
  //   await token.connect(signers[2]).buy(ETH1, ETH0, { value: ETH2, gasLimit });
  //   await token
  //     .connect(signers[2])
  //     .changePrice(ethers.utils.parseEther("0.5"), { gasLimit });
  //   const postPrice = await token.price();
  //   expect(ethers.utils.parseEther("0.5")).to.equal(postPrice);
  // });

  // it("token: owned. change price to less with another account [fail]", async () => {
  //   await token.connect(signers[2]).buy(ETH1, ETH0, { value: ETH2, gasLimit });
  //   await expect(
  //     token.connect(signers[3]).changePrice(ETH2, { gasLimit })
  //   ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
  // });

  // it("token: owned. withdraw whole deposit into foreclosure [succeed]", async () => {
  //   await token.connect(signers[2]).buy(ETH1, ETH0, { value: ETH2, gasLimit });
  //   const deposit = await token.deposit();
  //   const collected = calculateDue(
  //     ETH1,
  //     ethers.BigNumber.from("0"),
  //     ethers.BigNumber.from("1")
  //   ); // 1 second of patronage is collected when issuing the tx
  //   await token
  //     .connect(signers[2])
  //     .withdrawDeposit(deposit.sub(collected), { gasLimit });
  //   const price = await token.price();
  //   expect(price).to.equal(ETH0);
  // });

  // it("token: owned. withdraw whole deposit through exit into foreclosure after 10min [succeed]", async () => {
  //   await token.connect(signers[2]).buy(ETH1, ETH0, { value: ETH2, gasLimit });
  //   await time.increase(time.duration.minutes(10));
  //   await token.connect(signers[2]).exit({ gasLimit });
  //   const price = await token.price();
  //   expect(price).to.equal(ETH0);
  // });

  // it("token: owned. withdraw some deposit [succeeds]", async () => {
  //   await token.connect(signers[2]).buy(ETH1, ETH0, { value: ETH2, gasLimit });
  //   await token.connect(signers[2]).withdrawDeposit(ETH1, { gasLimit });
  //   const deposit = await token.deposit();
  //   const collected = calculateDue(
  //     ETH1,
  //     ethers.BigNumber.from("0"),
  //     ethers.BigNumber.from("1")
  //   ); // 1 second of patronage is collected when issuing the tx
  //   expect(deposit).to.equal(ETH2.sub(ETH1).sub(collected));
  // });

  // it("token: owned. withdraw more than exists [fail]", async () => {
  //   await token.connect(signers[2]).buy(ETH1, ETH0, { value: ETH2, gasLimit });
  //   await expect(
  //     token.connect(signers[2]).withdrawDeposit(ETH3, { gasLimit })
  //   ).to.be.revertedWith("Withdrawing too much");
  // });

  // it("token: owned. withdraw some deposit from another account [fails]", async () => {
  //   await token.connect(signers[2]).buy(ETH1, ETH0, { value: ETH2, gasLimit });
  //   await expect(
  //     token.connect(signers[3]).withdrawDeposit(ETH1, { gasLimit })
  //   ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
  // });

  // it("token: bought once, bought again from same account [success]", async () => {
  //   await token.connect(signers[2]).buy(ETH1, ETH0, { value: ETH2, gasLimit });
  //   await token.connect(signers[2]).buy(ETH1, ETH1, { value: ETH2, gasLimit });
  //   const deposit2 = await token.deposit();
  //   const price2 = await token.price();
  //   const currentOwner2 = await token.ownerOf(TOKEN_ID);
  //   const cc = await token.currentCollected();
  //   expect(deposit2).to.equal(ETH1);
  //   expect(price2).to.equal(ETH1);
  //   expect(cc.toString()).to.equal("0");
  //   expect(currentOwner2).to.equal(accounts[2]);
  // });

  // it("token: bought once, bought again from another account [success]", async () => {
  //   await token.connect(signers[2]).buy(ETH1, ETH0, { value: ETH2, gasLimit });
  //   await token.connect(signers[3]).buy(ETH1, ETH1, { value: ETH2, gasLimit });
  //   const deposit2 = await token.deposit();
  //   const price2 = await token.price();
  //   const currentOwner2 = await token.ownerOf(TOKEN_ID);
  //   expect(deposit2).to.equal(ETH1);
  //   expect(price2).to.equal(ETH1);
  //   expect(currentOwner2).to.equal(accounts[3]);
  // });

  // it("token: bought once, bought again from another account after 10min [success]", async () => {
  //   await token.connect(signers[2]).buy(ETH1, ETH0, { value: ETH2, gasLimit });

  //   await time.increase(time.duration.minutes(10));

  //   const balTrack = await balance.tracker(accounts[2]);
  //   const preBuy = await balTrack.get();
  //   const preDeposit = await token.deposit();
  //   await token.connect(signers[3]).buy(ETH1, ETH1, {
  //     value: ETH2,
  //     gasLimit,
  //     gasPrice: ethers.BigNumber.from("1000000000"),
  //   });

  //   // deposit - due + 1 (from sale)
  //   const calcDiff = preDeposit.sub(TenMinOneSecDue).add(ETH1);

  //   const delta = await balTrack.delta();
  //   expect(delta.toString()).to.equal(calcDiff.toString());
  //   const deposit2 = await token.deposit();
  //   const price2 = await token.price();
  //   const currentOwner2 = await token.ownerOf(TOKEN_ID);
  //   expect(deposit2).to.equal(ETH1);
  //   expect(price2).to.equal(ETH1);
  //   expect(currentOwner2).to.equal(accounts[3]);
  // });

  // it("token: owned: deposit wei, change price, withdrawing deposit in foreclosure state [fail]", async () => {
  //   // 10min of patronage
  //   await token
  //     .connect(signers[2])
  //     .buy(ETH1, ETH0, { value: TenMinOneSecDue, gasLimit });
  //   await time.increase(time.duration.minutes(20)); // into foreclosure state

  //   await expect(
  //     token.connect(signers[2]).depositWei({ value: ETH1, gasLimit })
  //   ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);

  //   await expect(
  //     token.connect(signers[2]).changePrice(ETH2, { gasLimit })
  //   ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);

  //   await expect(
  //     token.connect(signers[2]).withdrawDeposit(ETH1, { gasLimit })
  //   ).to.be.revertedWith(ErrorMessages.ONLY_OWNER);
  // });

  // it("token: owned: goes into foreclosure state & bought from another account [success]", async () => {
  //   // 10min of patronage
  //   await token
  //     .connect(signers[2])
  //     .buy(ETH1, ETH0, { value: TenMinOneSecDue, gasLimit });
  //   await time.increase(time.duration.minutes(20)); // into foreclosure state

  //   // price should be zero, thus totalToBuy should primarily going into the deposit [as if from init]
  //   await token
  //     .connect(signers[3])
  //     .buy(ETH2, ETH0, { value: TenMinOneSecDue, gasLimit });

  //   const deposit = await token.deposit();
  //   const totalCollected = await token.totalCollected();
  //   const currentCollected = await token.currentCollected();
  //   const previousBlockTime = await bigTimeLatest();
  //   const timeLastCollected = await token.timeLastCollected(); // on buy.
  //   const price = await token.price();
  //   const owner = await token.ownerOf(TOKEN_ID);
  //   const wasPatron1 = await token.patrons(accounts[2]);
  //   const wasPatron2 = await token.patrons(accounts[3]);

  //   expect(deposit).to.equal(TenMinOneSecDue);
  //   expect(price).to.equal(ETH2);
  //   expect(totalCollected).to.equal(TenMinOneSecDue);
  //   expect(currentCollected.toString()).to.equal("0");
  //   expect(timeLastCollected).to.equal(previousBlockTime);
  //   expect(owner).to.equal(accounts[3]);
  //   expect(wasPatron1).to.equal(true);
  //   expect(wasPatron2).to.equal(true);
  // });

  // it("token: owned: goes into foreclosure state & bought from same account [success]", async () => {
  //   // 10min of patronage
  //   await token
  //     .connect(signers[2])
  //     .buy(ETH1, ETH0, { value: TenMinOneSecDue, gasLimit });
  //   await time.increase(time.duration.minutes(20)); // into foreclosure state

  //   // price should be zero, thus totalToBuy should primarily going into the deposit [as if from init]
  //   await token
  //     .connect(signers[2])
  //     .buy(ETH2, ETH0, { value: TenMinOneSecDue, gasLimit });

  //   const deposit = await token.deposit();
  //   const totalCollected = await token.totalCollected();
  //   const currentCollected = await token.currentCollected();
  //   const previousBlockTime = await bigTimeLatest();
  //   const timeLastCollected = await token.timeLastCollected(); // on buy.
  //   const price = await token.price();
  //   const owner = await token.ownerOf(TOKEN_ID);

  //   expect(deposit).to.equal(TenMinOneSecDue);
  //   expect(price).to.equal(ETH2);
  //   expect(totalCollected).to.equal(TenMinOneSecDue);
  //   expect(currentCollected.toString()).to.equal("0");
  //   expect(timeLastCollected).to.equal(previousBlockTime);
  //   expect(owner).to.equal(accounts[2]);
  // });

  // it("token: init timeHeld is zero", async () => {
  //   const th = await token.timeHeld(token.address);

  //   expect(th.toString()).to.equal("0");
  // });

  // it("token: init. foreClosureTime is zero, 1970,", async () => {
  //   const ft = await token.foreclosureTime();
  //   expect(ft.toString()).to.equal("0");
  // });
});
