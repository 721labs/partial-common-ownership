import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatEthers],
  solidity: {
    version: "0.8.36",
    settings: {
      evmVersion: "london",
      optimizer: {
        enabled: false,
        runs: 200,
      },
      viaIR: false,
      metadata: {
        bytecodeHash: "ipfs",
        useLiteralContent: false,
      },
      outputSelection: {
        "*": {
          "*": ["storageLayout"],
        },
      },
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
      hardfork: "london",
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./tests",
    cache: "./cache-hh",
    artifacts: "./artifacts",
  },
});
