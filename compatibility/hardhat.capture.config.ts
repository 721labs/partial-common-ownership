import path from "path";

import baseConfig from "../hardhat.config";

export default {
  ...baseConfig,
  paths: {
    ...baseConfig.paths,
    // An explicit --config normally makes its directory Hardhat's project
    // root. Keep every inherited relative path rooted at the repository.
    root: path.resolve(__dirname, ".."),
  },
  mocha: {
    ...baseConfig.mocha,
    reporter: path.resolve(__dirname, "hardhat.reporter.js"),
  },
};
