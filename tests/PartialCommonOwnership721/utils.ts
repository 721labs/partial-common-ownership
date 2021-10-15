import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { TAX_NUMERATOR, TAX_DENOMINATOR } from "./constants";

/**
 * Converts a taxation period, in days to seconds, as a big number.
 * @param period Period, as integer, in days.
 * @returns Period, as BigNumber, in seconds.
 */
function taxationPeriodToSeconds(period: number): BigNumber {
  return ethers.BigNumber.from(period * 86400); // 86,400 seconds in a day
}

/**
 * Calculates the tax due.
 * price * % of tax period completed (represented from 0 - 1) * tax rate;
 * @param price Current price
 * @param now Unix timestamp when request was made
 * @param lastCollectionTime Unix timestamp of last tax collection
 * @returns Tax due between now and last collection.
 */
function getTaxDue(
  price: BigNumber,
  now: BigNumber,
  lastCollectionTime: BigNumber,
  taxationPeriod: number,
  taxRate: BigNumber
): BigNumber {
  const secondsSinceLastCollection = now.sub(lastCollectionTime);
  const taxPeriodAsSeconds = taxationPeriodToSeconds(taxationPeriod);
  return price
    .mul(secondsSinceLastCollection)
    .div(taxPeriodAsSeconds)
    .mul(taxRate);
}

export { taxationPeriodToSeconds, getTaxDue };
