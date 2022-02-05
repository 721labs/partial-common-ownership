import { ethers } from "hardhat";

const TEST_NAME = "721TEST";
const TEST_SYMBOL = "TEST";

const INVALID_TOKEN_ID = 999;

const ETH0 = ethers.BigNumber.from("0");
const ETH1 = ethers.utils.parseEther("1");
const ETH2 = ethers.utils.parseEther("2");
const ETH3 = ethers.utils.parseEther("3");
const ETH4 = ethers.utils.parseEther("4");

const TAX_DENOMINATOR = ethers.BigNumber.from("1000000000000");

const GLOBAL_TRX_CONFIG = {
  gasLimit: 9500000, // if gas limit is set, estimateGas isn't run superfluously, slowing tests down.
};

export {
  TEST_NAME,
  TEST_SYMBOL,
  INVALID_TOKEN_ID,
  ETH0,
  ETH1,
  ETH2,
  ETH3,
  ETH4,
  TAX_DENOMINATOR,
  GLOBAL_TRX_CONFIG,
};
