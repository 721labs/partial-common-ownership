import { BigNumber } from "ethers";
import { ethers } from "hardhat";

const WAD1 = ethers.BigNumber.from(10).pow(18);
const RAY1 = ethers.BigNumber.from(10).pow(27);

/**
 * Converts a given number into a WAD
 * @param number
 * @returns Number as WAD
 */
function toWAD(number: number | BigNumber): BigNumber {
  return WAD1.mul(number);
}

/**
 * Converts a given WAD into a floating point number
 * @param number Number as WAD
 * @returns Number as BigNumber
 */
function fromWAD(number: BigNumber): BigNumber {
  return number.div(WAD1);
}

/**
 * Converts a given number into a RAY
 * @param number
 * @returns Number as RAY
 */
function toRAY(number: number | BigNumber): BigNumber {
  return RAY1.mul(number);
}

/**
 * Converts a given RAY into a floating point number
 * @param number Number as WAD
 * @returns Number as BigNumber
 */
function fromRAY(number: BigNumber): BigNumber {
  return number.div(RAY1);
}

export { toWAD, fromWAD, toRAY, fromRAY };
