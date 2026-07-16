#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { verifySafetyBaselines } = require("./check-safety-baselines");

const ROOT = path.resolve(__dirname, "..");
const BASELINE_PATH = path.join(ROOT, "gas", "key-flows.snap");
const FORGE_BIN = process.env.FORGE_BIN || "forge";
const KEY_TESTS = [
  "test_takeoverLease_succeeds_firstPurchaseFromContract",
  "test_takeoverLease_succeeds_purchaseFromCurrentOwner",
  "test_takeoverLease_succeeds_purchaseFromForeclosure",
  "test_deposit_succeeds_ownerCanDeposit",
  "test_selfAssess_succeeds_ownerIncreasesValuation",
  "test_withdrawDeposit_succeeds_expectedAmount",
  "test_exit_succeeds_withdrawsEntireDeposit",
  "test_parity_013_collectTax_collectsAfterTenMinutes",
  "test_wrap_tokenOwnerCanWrap",
  "test_unwrap_afterBeneficiaryWrap",
  "test_unwrap_afterNonBeneficiaryWrap",
  "test_unwrap_collectsTaxAndReturnsDeposit",
];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with status ${result.status}\n${
        result.stdout || ""
      }${result.stderr || ""}`
    );
  }
}

function parseSnapshot(filePath) {
  const entries = new Map();
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line) continue;
    const match = line.match(/^(.*) \(gas: (\d+)\)$/);
    if (!match)
      throw new Error(`Key-flow gas entry is not deterministic: ${line}`);
    if (entries.has(match[1]))
      throw new Error(`Duplicate gas entry: ${match[1]}`);
    entries.set(match[1], Number(match[2]));
  }
  return entries;
}

function main() {
  verifySafetyBaselines();
  if (!fs.existsSync(BASELINE_PATH)) {
    throw new Error(`Missing checked-in gas baseline: ${BASELINE_PATH}`);
  }

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pco-gas-"));
  const currentPath = path.join(temporaryDirectory, "key-flows.snap");
  try {
    // Forge matches against the canonical Solidity signature, including its
    // parenthesized arguments, rather than the display name from `--list`.
    const matchTest = `^(${KEY_TESTS.join("|")})\\(.*\\)$`;
    run(FORGE_BIN, [
      "snapshot",
      "--fuzz-seed",
      "0x721",
      "--match-test",
      matchTest,
      "--snap",
      currentPath,
    ]);

    const baseline = parseSnapshot(BASELINE_PATH);
    const current = parseSnapshot(currentPath);
    if (baseline.size !== KEY_TESTS.length || current.size !== baseline.size) {
      throw new Error(
        `Expected ${KEY_TESTS.length} key-flow gas entries; baseline=${baseline.size}, current=${current.size}`
      );
    }

    const baselineNames = [...baseline.keys()].sort();
    const currentNames = [...current.keys()].sort();
    if (JSON.stringify(baselineNames) !== JSON.stringify(currentNames)) {
      throw new Error(
        "Key-flow gas inventory differs from its checked-in baseline"
      );
    }

    const regressions = [];
    for (const name of baselineNames) {
      const before = baseline.get(name);
      const after = current.get(name);
      const allowance = Math.floor(Math.max(before * 0.03, 2_000));
      if (after > before + allowance) {
        regressions.push(
          `${name}: ${before} -> ${after} (limit ${before + allowance})`
        );
      }
    }
    if (regressions.length > 0) {
      throw new Error(
        `Key-flow gas regressions exceeded policy:\n${regressions.join("\n")}`
      );
    }
    console.log(
      `Gas gate passed: ${baseline.size} key flows are within max(3%, 2,000 gas).`
    );
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
