const fs = require("fs");

class CompatibilityReporter {
  constructor(runner) {
    const results = {
      passed: [],
      failed: [],
      pending: [],
    };

    runner.on("pass", (test) => results.passed.push(test.fullTitle()));
    runner.on("fail", (test) => results.failed.push(test.fullTitle()));
    runner.on("pending", (test) => results.pending.push(test.fullTitle()));

    runner.once("end", () => {
      for (const names of Object.values(results)) names.sort();

      const outputPath = process.env.COMPAT_HARDHAT_RESULTS;
      if (!outputPath) {
        throw new Error("COMPAT_HARDHAT_RESULTS must name the reporter output file");
      }

      fs.writeFileSync(outputPath, `${JSON.stringify(results)}\n`);
    });
  }
}

module.exports = CompatibilityReporter;
