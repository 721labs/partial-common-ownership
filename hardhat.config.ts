// Import Hardhat extensions
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-web3";

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
export default {
  //defaultNetwork: "",
  //networks: {},
  solidity: "0.8.7",
  paths: {
    sources: "./contracts",
    tests: "./tests",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 0,
    // ! Will not do anything until Mocha upgraded to v8.
    // parallel: true,
  },
};
