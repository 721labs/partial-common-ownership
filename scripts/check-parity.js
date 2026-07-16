#!/usr/bin/env node

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const MAP_PATH = path.join(ROOT, "compatibility", "parity-map.json");
const BASELINE_PATH = path.join(ROOT, "compatibility", "baseline.json");
const SAFETY_INVENTORY_PATH = path.join(
  ROOT,
  "compatibility",
  "safety-test-inventory.json"
);
const FORGE_BIN = process.env.FORGE_BIN || "forge";
const STAGE_11_INVENTORY_PATH = path.join(
  ROOT,
  "compatibility",
  "stage-11-hardhat-smoke-inventory.json"
);
const STAGE_11_CANDIDATE = "stage-11-foundry-first-cutover";
const STAGE_11_BASE_COMMIT = "14720718787046af58be50c110be40c18f5b1364";
const STAGE_11_HARDHAT_NAMES_SHA256 =
  "861cda9b6fe70b931fd4c049c2e75585fd53a2ba502a3f89a70980a520f9a3ce";
const STAGE_11_FORGE_NAMES_SHA256 =
  "09b141a8c69c4522288cfdbf67373661052764ab019c865ea850dc5eb645f173";
const STAGE_11_DELETED_LEGACY_FILES = Object.freeze({
  "tests/PartialCommonOwnership/index.ts":
    "729d6297377a6be11ebb122a8413a27985da990c108e70522512c70d98e7c134",
  "tests/Wrapper.ts":
    "35377ba00ea68479a517bcfe3873552a13e07563a040091c3b436345111b6a1c",
});
const STAGE_11_PARITY_FILES = Object.freeze({
  "compatibility/parity-map.json":
    "72f66deac5693d553a681afa755856cc87f2d52d4b109938862ba731da9443b4",
  "compatibility/parity/cohort-0-existing-forge.json":
    "3384ae9039fad21bb7800d61f181bd4ca6b68a8e1e8525815c3cc8ecd434df69",
  "compatibility/parity/cohort-1-pco-read-tax.json":
    "632c07354ab5f4e0d71290e2631da59bacad8cc3c0bc1d22cc129674098891fc",
  "compatibility/parity/cohort-2-pco-mutations.json":
    "47b93d5ecd3734b09533c8af0c514274ad4ff3c90185a6724364060bf5eef5c1",
  "compatibility/parity/cohort-3-wrapper.json":
    "4932bd7dd4da1cf55b2723e98cbe865737c9e735528ad70f05f8de85c2baecca",
  "compatibility/safety-test-inventory.json":
    "52f7c77b9ebec5093ad484f6695e46194b3ed0b9e737943946843e4f19c4d83a",
});

function fail(message) {
  throw new Error(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function stage11Inventory(baseline) {
  if (!fs.existsSync(STAGE_11_INVENTORY_PATH)) {
    fail("Missing checked-in Stage 11 Hardhat smoke inventory");
  }
  const inventory = readJson(STAGE_11_INVENTORY_PATH);
  if (
    inventory.schemaVersion !== 1 ||
    inventory.candidate !== STAGE_11_CANDIDATE ||
    inventory.stage10Checkpoint !== STAGE_11_BASE_COMMIT ||
    inventory.historicalHardhat?.count !== 89 ||
    inventory.historicalHardhat?.namesSha256 !==
      STAGE_11_HARDHAT_NAMES_SHA256 ||
    inventory.activeHardhat?.count !== 3 ||
    !Array.isArray(inventory.activeHardhat?.names) ||
    inventory.activeHardhat.names.length !== 3 ||
    inventory.activeHardhat.sourcePath !== "tests/Interoperability.smoke.ts" ||
    inventory.forge?.count !== 140 ||
    inventory.forge?.namesSha256 !== STAGE_11_FORGE_NAMES_SHA256 ||
    inventory.parity?.mappedBehaviorCount !== 104 ||
    inventory.parity?.safetyCount !== 36 ||
    JSON.stringify(inventory.parity?.files) !==
      JSON.stringify(STAGE_11_PARITY_FILES) ||
    JSON.stringify(inventory.deletedLegacyFiles) !==
      JSON.stringify(STAGE_11_DELETED_LEGACY_FILES)
  ) {
    fail("Stage 11 Hardhat smoke inventory has an invalid schema");
  }
  const names = sorted(inventory.activeHardhat.names);
  if (
    duplicateValues(names).length > 0 ||
    JSON.stringify(names) !== JSON.stringify(inventory.activeHardhat.names)
  ) {
    fail(
      "Stage 11 Hardhat smoke names must be exactly three unique sorted IDs"
    );
  }
  const smokePath = resolveUnder(
    inventory.activeHardhat.sourcePath,
    "tests",
    "Stage 11 Hardhat smoke source"
  );
  if (!fs.existsSync(smokePath))
    fail("Stage 11 Hardhat smoke source is missing");
  if (
    sha256(fs.readFileSync(smokePath)) !== inventory.activeHardhat.sourceSha256
  ) {
    fail("Stage 11 Hardhat smoke source digest changed");
  }
  if (
    baseline.tests.hardhat.count !== 89 ||
    baseline.tests.hardhat.names.length !== 89 ||
    sha256(stableJson(baseline.tests.hardhat.names)) !==
      STAGE_11_HARDHAT_NAMES_SHA256
  ) {
    fail("Historical 89-Hardhat baseline provenance changed");
  }
  for (const [relativePath, expectedSha256] of Object.entries(
    STAGE_11_DELETED_LEGACY_FILES
  )) {
    if (fs.existsSync(path.join(ROOT, relativePath))) {
      fail(`Retired legacy behavior source still exists: ${relativePath}`);
    }
    if (inventory.deletedLegacyFiles[relativePath] !== expectedSha256) {
      fail(`Historical legacy behavior source anchor changed: ${relativePath}`);
    }
  }
  for (const [relativePath, expectedSha256] of Object.entries(
    STAGE_11_PARITY_FILES
  )) {
    if (
      sha256(fs.readFileSync(path.join(ROOT, relativePath))) !== expectedSha256
    ) {
      fail(`Frozen parity/safety provenance changed: ${relativePath}`);
    }
  }
  return inventory;
}

function resolveUnder(relativePath, rootDirectory, label) {
  if (path.isAbsolute(relativePath)) {
    fail(`${label} must be repository-relative: ${relativePath}`);
  }
  const resolved = path.resolve(ROOT, relativePath);
  const allowedRoot = `${path.join(ROOT, rootDirectory)}${path.sep}`;
  if (!resolved.startsWith(allowedRoot)) {
    fail(`${label} must be stored under ${rootDirectory}: ${relativePath}`);
  }
  return resolved;
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return sorted(duplicates);
}

function compareExact(label, expected, actual) {
  const expectedSorted = sorted(expected);
  const actualSorted = sorted(actual);
  if (JSON.stringify(expectedSorted) === JSON.stringify(actualSorted)) return;

  const expectedSet = new Set(expectedSorted);
  const actualSet = new Set(actualSorted);
  const missing = expectedSorted.filter((value) => !actualSet.has(value));
  const unexpected = actualSorted.filter((value) => !expectedSet.has(value));
  fail(
    `${label} does not match. Missing: ${JSON.stringify(
      missing
    )}; unexpected: ${JSON.stringify(unexpected)}`
  );
}

function parseForgeDiscovery(stdout) {
  const lines = stdout.split(/\r?\n/);
  const firstJsonLine = lines.findIndex((line) =>
    line.trimStart().startsWith("{")
  );
  if (firstJsonLine < 0) fail("Forge did not emit JSON test discovery output");
  return JSON.parse(lines.slice(firstJsonLine).join("\n"));
}

function discoverForgeTests() {
  const result = spawnSync(FORGE_BIN, ["test", "--list", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(
      `Forge test discovery failed with status ${result.status}:\n${
        result.stdout || ""
      }${result.stderr || ""}`
    );
  }

  const discovery = parseForgeDiscovery(result.stdout);
  const names = [];
  for (const source of Object.keys(discovery).sort()) {
    for (const contractName of Object.keys(discovery[source]).sort()) {
      for (const testName of discovery[source][contractName].slice().sort()) {
        names.push(`${source}:${contractName}:${testName}`);
      }
    }
  }
  return names;
}

function executeForgeTests() {
  const result = spawnSync(FORGE_BIN, ["test", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(
      `Forge execution failed with status ${result.status}:\n${
        result.stdout || ""
      }${result.stderr || ""}`
    );
  }

  const execution = parseForgeDiscovery(result.stdout);
  const names = [];
  const unsuccessful = [];
  for (const [suiteName, suite] of Object.entries(execution)) {
    const separator = suiteName.lastIndexOf(":");
    if (separator < 0 || !suite.test_results) {
      fail(`Forge emitted an invalid execution suite: ${suiteName}`);
    }
    const source = suiteName.slice(0, separator);
    const contractName = suiteName.slice(separator + 1);
    for (const [signature, testResult] of Object.entries(suite.test_results)) {
      const testName = signature.replace(/\(.*$/, "");
      const fullName = `${source}:${contractName}:${testName}`;
      names.push(fullName);
      if (testResult.status !== "Success") {
        unsuccessful.push(`${fullName}: ${testResult.status}`);
      }
    }
  }
  if (unsuccessful.length > 0) {
    fail(
      `Forge suite contains failed or skipped tests:\n${unsuccessful.join(
        "\n"
      )}`
    );
  }
  return sorted(names);
}

function safetyForgeTests() {
  if (!fs.existsSync(SAFETY_INVENTORY_PATH)) {
    fail("Missing checked-in Stage 7 safety-test inventory");
  }
  const inventory = readJson(SAFETY_INVENTORY_PATH);
  if (
    inventory.schemaVersion !== 1 ||
    inventory.candidate !== "stage-07-foundry-safety" ||
    !Array.isArray(inventory.names) ||
    inventory.names.length !== inventory.expectedCount
  ) {
    fail("Stage 7 safety-test inventory has an invalid schema");
  }
  const names = sorted(inventory.names);
  const duplicates = duplicateValues(names);
  if (duplicates.length > 0) {
    fail(`Safety tests are duplicated: ${duplicates.join(", ")}`);
  }
  for (const name of names) {
    const separator = name.indexOf(":");
    const source = separator < 0 ? "" : name.slice(0, separator);
    if (!/^test\/solidity\/(?:fuzz|invariant)\/.+\.t\.sol$/.test(source)) {
      fail(`Safety test is outside fuzz/invariant directories: ${name}`);
    }
    const sourcePath = resolveUnder(
      source,
      "test/solidity",
      "Safety-test source"
    );
    if (!fs.existsSync(sourcePath))
      fail(`Safety-test source is missing: ${source}`);
  }
  return names;
}

function main() {
  const map = readJson(MAP_PATH);
  const baseline = readJson(BASELINE_PATH);
  const stage11 = stage11Inventory(baseline);
  if (map.schemaVersion !== 1) fail("Unsupported parity-map schema");
  if (!Array.isArray(map.fragments) || map.fragments.length === 0) {
    fail("Parity map must list its cohort fragments");
  }

  const entries = [];
  for (const relativePath of map.fragments) {
    const fragmentPath = path.resolve(ROOT, relativePath);
    const parityRoot = `${path.join(ROOT, "compatibility", "parity")}${
      path.sep
    }`;
    if (!fragmentPath.startsWith(parityRoot)) {
      fail(
        `Parity fragment must be stored under compatibility/parity: ${relativePath}`
      );
    }
    if (!fs.existsSync(fragmentPath))
      fail(`Missing parity fragment: ${relativePath}`);

    const fragment = readJson(fragmentPath);
    if (fragment.schemaVersion !== 1) {
      fail(`Unsupported parity fragment schema: ${relativePath}`);
    }
    if (!fragment.cohort || typeof fragment.cohort !== "string") {
      fail(`Parity fragment must name its cohort: ${relativePath}`);
    }
    if (!Array.isArray(fragment.entries)) {
      fail(`Parity fragment must contain entries: ${relativePath}`);
    }
    if (fragment.entries.length !== fragment.expectedCount) {
      fail(
        `${relativePath} contains ${fragment.entries.length} entries; expected ${fragment.expectedCount}`
      );
    }
    const legacySuite = fragment.legacySuite || "hardhat";
    if (!["hardhat", "forge"].includes(legacySuite)) {
      fail(`Invalid legacy suite in ${relativePath}: ${legacySuite}`);
    }
    for (const entry of fragment.entries) {
      entries.push({ ...entry, cohort: fragment.cohort, legacySuite });
    }
  }

  if (entries.length !== map.expectedEntries) {
    fail(
      `Parity map contains ${entries.length} entries; expected ${map.expectedEntries}`
    );
  }

  const requiredFields = [
    "legacyId",
    "legacyFile",
    "legacyTitle",
    "forgeFile",
    "forgeContract",
    "forgeTest",
  ];
  for (const entry of entries) {
    for (const field of requiredFields) {
      if (!entry[field] || typeof entry[field] !== "string") {
        fail(`${entry.cohort} parity entry is missing ${field}`);
      }
    }
    const legacyRoot =
      entry.legacySuite === "hardhat" ? "tests" : "test/solidity";
    const legacyPath = resolveUnder(
      entry.legacyFile,
      legacyRoot,
      "Mapped legacy file"
    );
    const forgePath = resolveUnder(
      entry.forgeFile,
      "test/solidity",
      "Mapped Forge file"
    );
    if (entry.legacySuite === "hardhat") {
      if (!(entry.legacyFile in STAGE_11_DELETED_LEGACY_FILES)) {
        fail(
          `Mapped historical Hardhat source is not an approved Stage 11 retirement: ${entry.legacyFile}`
        );
      }
      if (fs.existsSync(legacyPath)) {
        fail(`Retired mapped Hardhat source still exists: ${entry.legacyFile}`);
      }
    } else if (!fs.existsSync(legacyPath)) {
      fail(`Mapped baseline Forge file does not exist: ${entry.legacyFile}`);
    }
    if (!fs.existsSync(forgePath)) {
      fail(`Mapped Forge file does not exist: ${entry.forgeFile}`);
    }
  }

  const ids = entries.map((entry) => entry.legacyId);
  const duplicateIds = duplicateValues(ids);
  if (duplicateIds.length > 0) {
    fail(`Parity legacy IDs are not unique: ${duplicateIds.join(", ")}`);
  }

  const legacyKeys = entries.map(
    (entry) => `${entry.legacySuite}:${entry.legacyTitle}`
  );
  const duplicateLegacyKeys = duplicateValues(legacyKeys);
  if (duplicateLegacyKeys.length > 0) {
    fail(
      `Legacy scenarios are mapped more than once: ${duplicateLegacyKeys.join(
        ", "
      )}`
    );
  }

  const hardhatEntries = entries.filter(
    (entry) => entry.legacySuite === "hardhat"
  );
  const forgeLegacyEntries = entries.filter(
    (entry) => entry.legacySuite === "forge"
  );
  if (hardhatEntries.length !== map.expectedLegacyCounts.hardhat) {
    fail(
      `Mapped ${hardhatEntries.length} Hardhat scenarios; expected ${map.expectedLegacyCounts.hardhat}`
    );
  }
  if (forgeLegacyEntries.length !== map.expectedLegacyCounts.forge) {
    fail(
      `Mapped ${forgeLegacyEntries.length} baseline Forge scenarios; expected ${map.expectedLegacyCounts.forge}`
    );
  }

  compareExact(
    "Legacy Hardhat inventory",
    baseline.tests.hardhat.names,
    hardhatEntries.map((entry) => entry.legacyTitle)
  );
  compareExact(
    "Baseline Forge inventory",
    baseline.tests.forge.names,
    forgeLegacyEntries.map((entry) => entry.legacyTitle)
  );

  const forgeTargets = entries.map(
    (entry) => `${entry.forgeFile}:${entry.forgeContract}:${entry.forgeTest}`
  );
  const duplicateForgeTargets = duplicateValues(forgeTargets);
  if (duplicateForgeTargets.length > 0) {
    fail(
      `Forge tests are mapped more than once: ${duplicateForgeTargets.join(
        ", "
      )}`
    );
  }
  if (forgeTargets.length !== map.expectedForgeTests) {
    fail(
      `Mapped ${forgeTargets.length} Forge tests; expected ${map.expectedForgeTests}`
    );
  }

  const safetyTargets = safetyForgeTests();
  const allForgeTargets = sorted([...forgeTargets, ...safetyTargets]);
  const duplicateAllTargets = duplicateValues(allForgeTargets);
  if (duplicateAllTargets.length > 0) {
    fail(
      `Safety and parity targets overlap: ${duplicateAllTargets.join(", ")}`
    );
  }
  const discoveredForgeTests = discoverForgeTests();
  compareExact(
    "Discovered Forge inventory",
    allForgeTargets,
    discoveredForgeTests
  );
  const executedForgeTests = executeForgeTests();
  compareExact(
    "Successful Forge inventory",
    allForgeTargets,
    executedForgeTests
  );
  if (
    discoveredForgeTests.length !== stage11.forge.count ||
    sha256(stableJson([...discoveredForgeTests].sort())) !==
      stage11.forge.namesSha256 ||
    sha256(stableJson([...executedForgeTests].sort())) !==
      stage11.forge.namesSha256
  ) {
    fail("Stage 11 active 140-Forge inventory digest changed");
  }

  console.log(
    `Safety inventory passed: ${hardhatEntries.length} Hardhat + ${forgeLegacyEntries.length} baseline Forge scenarios map one-to-one to ${forgeTargets.length} behavior tests, plus ${safetyTargets.length} successful safety tests.`
  );
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
