import { BigNumber } from "ethers";
import { ethers } from "hardhat";

/**
 * Converts a BN.js number to BigNumber
 * @param number BN.js number
 * @returns BigNumber
 */
function bnToBigNumber(number: any): BigNumber {
  return ethers.BigNumber.from(number.toString());
}

export { bnToBigNumber };
