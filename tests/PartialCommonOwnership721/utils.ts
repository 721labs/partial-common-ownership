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
 * price * (now - timeLastCollected) * patronageNumerator / patronageDenominator / 365 days;
 * @param price Current price
 * @param now Unix timestamp when request was made
 * @param lastCollectionTime Unix timestamp of last tax collection
 * @returns Tax due between now and last collection.
 */
function getTaxDue(
  price: BigNumber,
  now: BigNumber,
  lastCollectionTime: BigNumber,
  taxationPeriod: number
): BigNumber {
  return price
    .mul(
      now.sub(lastCollectionTime) // time since last collection
    )
    .mul(TAX_NUMERATOR)
    .div(TAX_DENOMINATOR)
    .div(taxationPeriodToSeconds(taxationPeriod));
}

export { taxationPeriodToSeconds, getTaxDue };
