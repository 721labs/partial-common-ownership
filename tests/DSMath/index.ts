//@ts-nocheck
import { expect } from "chai";
import { ethers } from "hardhat";
import { toWAD, toRAY } from "./utils";

describe("DSMath", async () => {
  let contract;

  before(async () => {
    const contractFactory = await ethers.getContractFactory("TestDSMath");

    contract = await contractFactory.deploy();

    expect(contract).to.not.be.null;
  });

  describe("#add()", async () => {
    it("1 + 2 = 3", async () => {
      expect(await contract.add(1, 2)).to.equal(3);
    });
  });

  describe("#mul()", async () => {
    it("5 * 6 = 30", async () => {
      expect(await contract.mul(5, 6)).to.equal(30);
    });
  });

  describe("#wmul()", async () => {
    it("5 * 6 = 0", async () => {
      expect(await contract.wmul(5, 6)).to.equal(0);
    });

    it("2 WAD * 5 = 10", async () => {
      expect(await contract.wmul(toWAD(2), 5)).to.equal(10);
    });

    it("2 WAD * 5 WAD = 10 WAD", async () => {
      expect(await contract.wmul(toWAD(2), toWAD(5))).to.equal(toWAD(10));
    });
  });

  describe("#rmul()", async () => {
    it("5 * 6 = 0", async () => {
      expect(await contract.rmul(5, 6)).to.equal(0);
    });

    it("2 RAY * 5 = 10", async () => {
      expect(await contract.rmul(toRAY(2), 5)).to.equal(10);
    });

    it("2 RAY * 5 RAY = 10 RAY", async () => {
      expect(await contract.rmul(toRAY(2), toRAY(5))).to.equal(toRAY(10));
    });
  });

  describe("#wdiv()", async () => {
    it("100 / 4 = 25", async () => {
      expect(await contract.wdiv(100, 4)).to.equal(toWAD(25));
    });
  });

  describe("#rdiv()", async () => {
    it("100 / 4 = 25", async () => {
      expect(await contract.rdiv(100, 4)).to.equal(toRAY(25));
    });
  });
});
