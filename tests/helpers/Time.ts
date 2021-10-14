import { BigNumber } from "ethers";
import { ethers } from "hardhat";
//@ts-ignore
import { time } from "@openzeppelin/test-helpers";

/**
 * Gets current time
 * @returns Current Time as BigNumber
 */
async function now(): Promise<BigNumber> {
  const bn = await time.latest();
  return ethers.BigNumber.from(`0x${bn.toString(16)}`);
}

export { now };
