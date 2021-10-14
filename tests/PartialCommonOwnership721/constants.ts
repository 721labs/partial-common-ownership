import { ethers } from "hardhat";

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

export {
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
};
