#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { verifySafetyBaselines } = require("./check-safety-baselines");

const ROOT = path.resolve(__dirname, "..");
const FORGE_BIN = process.env.FORGE_BIN || "forge";
const BASELINE = path.join(ROOT, "coverage", "lcov.info");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with status ${result.status}`
    );
  }
}

function main() {
  verifySafetyBaselines();
  if (!fs.existsSync(BASELINE)) {
    throw new Error(`Missing checked-in Forge LCOV baseline: ${BASELINE}`);
  }
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "pco-coverage-")
  );
  const current = path.join(temporaryDirectory, "lcov.info");
  try {
    run(FORGE_BIN, [
      "coverage",
      "--report",
      "lcov",
      "--report-file",
      current,
      "--exclude-tests",
    ]);
    run(process.execPath, [
      path.join(ROOT, "scripts", "check-coverage.js"),
      BASELINE,
      current,
    ]);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
