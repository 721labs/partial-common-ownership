// Import Hardhat extensions
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-web3";
import "hardhat-gas-reporter";
import "solidity-coverage";

// Dependencies
import { subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } from "hardhat/builtin-tasks/task-names";
import path from "path";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

// Type compilation can be turned off.  This is useful when compiling for
// coverage determination.
if (process.env.TYPE_COMPILATION !== "false") {
  require("@typechain/hardhat");
}

// Ignore Forge test files during compilation; otherwise these will throw exceptions
// due to their using the alternative dependency system.
subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS).setAction(
  async (_, __, runSuper) => {
    const paths = await runSuper();
    return paths.filter((p: string) => !p.endsWith(".t.sol"));
  }
);

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
export default {
  // defaultNetwork: "",
  // networks: {},
  solidity: {
    version: "0.8.12",
    settings: {
      optimizer: {
        // Dev: Turn on for production compilations
        enabled: false,
        runs: 200,
      },
    },
  },
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
  // Docs: https://github.com/cgewecke/hardhat-gas-reporter
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
  typechain: {
    outDir: "types",
    target: "ethers-v5",
  },
};
