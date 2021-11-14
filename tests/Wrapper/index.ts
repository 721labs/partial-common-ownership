//@ts-nocheck

import { expect } from "chai";

describe("Wrapper.sol", async () => {
  let provider;
  let signers;
  let factory;
  let contract;

  before(async () => {
    provider = new ethers.providers.Web3Provider(web3.currentProvider);
    signers = await ethers.getSigners();
    factory = await ethers.getContractFactory("Wrapper");

    contract = await factory.deploy(signers[1].address, 50000000000, 365);

    await contract.deployed();
  });

  describe("Wrapper", async () => {
    it("deploys", async () => {
      expect(contract.address).to.not.be.null;
      expect(await contract.name()).to.equal(
        "Partial Common Ownership Token Wrapper"
      );
      expect(await contract.symbol()).to.equal("wPCO");
    });
  });
});
