import { ethers } from "hardhat";
import { BigNumber } from "ethers";

/**
 * Converts a taxation period, in days to seconds, as a big number.
 * @param period Period, as integer, in days.
 * @returns Period, as BigNumber, in seconds.
 */
function taxationPeriodToSeconds(period: number): BigNumber {
  return ethers.BigNumber.from(period * 86400); // 86,400 seconds in a day
}

export { taxationPeriodToSeconds };
