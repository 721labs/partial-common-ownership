import { ethers } from "hardhat";

const ETH0 = ethers.BigNumber.from("0");
const ETH1 = ethers.utils.parseEther("1");
const ETH2 = ethers.utils.parseEther("2");
const ETH3 = ethers.utils.parseEther("3");
const ETH4 = ethers.utils.parseEther("4");

const GLOBAL_TRX_CONFIG = {
  gasLimit: 9500000, // if gas limit is set, estimateGas isn't run superfluously, slowing tests down.
};

export { ETH0, ETH1, ETH2, ETH3, ETH4, GLOBAL_TRX_CONFIG };
