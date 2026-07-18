#!/usr/bin/env node

"use strict";

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  validateMaintenanceLedger,
} = require("./maintenance-policy.cjs");

const ROOT = path.resolve(__dirname, "..");
const MAP_PATH = path.join(ROOT, "compatibility", "parity-map.json");
const BASELINE_PATH = path.join(ROOT, "compatibility", "baseline.json");
const SAFETY_INVENTORY_PATH = path.join(
  ROOT,
  "compatibility",
  "safety-test-inventory.json"
);
const FORGE_BIN = process.env.FORGE_BIN || "forge";
const profileArgument = process.argv
  .slice(2)
  .find((value) => value.startsWith("--profile="));
const requestedProfile = profileArgument?.slice("--profile=".length);
if (
  process.argv.slice(2).some((value) => value !== profileArgument) ||
  (requestedProfile !== undefined &&
    !["default", "ci", "scheduled"].includes(requestedProfile))
) {
  throw new Error(
    "Usage: node scripts/check-parity.cjs [--profile=default|ci|scheduled]"
  );
}
const FORGE_ENV = requestedProfile
  ? { ...process.env, FOUNDRY_PROFILE: requestedProfile }
  : process.env;
const STAGE_11_INVENTORY_PATH = path.join(
  ROOT,
  "compatibility",
  "stage-11-hardhat-smoke-inventory.json"
);
const STAGE_12A_INVENTORY_PATH = path.join(
  ROOT,
  "compatibility",
  "stage-12a-ethers6-inventory.json"
);
const STAGE_12B_INVENTORY_PATH = path.join(
  ROOT,
  "compatibility",
  "stage-12b-hardhat3-inventory.json"
);
const STAGE_12B_INVENTORY_SHA256 =
  "ce37ec6e86d25aa8bb947a5b62f1885ff7c6541fda0ca2c2560e034b5c682e9e";
const STAGE_12B_CANDIDATE = "stage-12b-hardhat-3";
const STAGE_13_CANDIDATE = "stage-13-ci-security-maintenance";
const STAGE_13_POLICY = "stage-13-stage-12b-exact-equality";
const STAGE_13_BASE_COMMIT = "bfdbcfaf84bd681c823487d1267139353df7ec37";
const STAGE_13_CHECKPOINT_COMMIT =
  "26e1082a21e2ef184253542c1bc8c10b87924d53";
const STAGE_13_INVENTORY_PATH = path.join(
  ROOT,
  "compatibility",
  "stage-13-ci-maintenance-inventory.json"
);
const STAGE_13_EVIDENCE_PATH = path.join(
  ROOT,
  "compatibility",
  "evidence",
  "stage-13-ci-security-maintenance.json"
);
const STAGE_13_REVIEW_PATH = path.join(
  ROOT,
  "compatibility",
  "reviewed-differences.json"
);
const STAGE_13_STAGE_12B_EVIDENCE_SHA256 =
  "d5e4e569dd9698e5dad1326b29461b0fe01d25c13bc8ad72075e5a084bd0e998";
const STAGE_13_STAGE_12B_REVIEW_SHA256 =
  "0429ef8df0361120e485ac8f0ade6f6b4892e3a162287ec61bb8dc69de4b9402";
const STAGE_13_STAGE_12B_INVENTORY_SHA256 = STAGE_12B_INVENTORY_SHA256;
const STAGE_13_STAGE_12B_RUNNER_SHA256 =
  "f8c1a26d90ec696c2b7d317813210dc903cd831d8e978e1861135a1dbfdddab9";
const STAGE_12B_BASE_COMMIT = "9a86ff5d001a4d3a06823712d0e70ad011987ecd";
const STAGE_12A_CANDIDATE = "stage-12a-ethers-6";
const STAGE_12A_BASE_COMMIT = "c84870955d77e82e91ed70591f010233675a6880";
const STAGE_12A_INVENTORY_SHA256 =
  "f9f3e23ccd84236ffca10d2eb79b3c0f737e83efd0692f8a57ea3a0ac98f0cc2";
const STAGE_11_INVENTORY_SHA256 =
  "abea926d3e3cf7928a7693565aa01c2e59c22e442ce97c4a0271c7be46095cf4";
const STAGE_11_SMOKE_NAMES_SHA256 =
  "e82ce4a1063d5334c8a0962747e9bb0797c9e5e82ef6e40dc1905452fb78714f";
const STAGE_11_SMOKE_SOURCE_SHA256 =
  "7fe9df8fca7273886e8eb8cbe96cd8053a9d4061c4034cb46a34831b59ae065a";
const STAGE_11_CANDIDATE = "stage-11-foundry-first-cutover";
const STAGE_11_BASE_COMMIT = "14720718787046af58be50c110be40c18f5b1364";
const STAGE_11_HARDHAT_NAMES_SHA256 =
  "861cda9b6fe70b931fd4c049c2e75585fd53a2ba502a3f89a70980a520f9a3ce";
const STAGE_11_FORGE_NAMES_SHA256 =
  "09b141a8c69c4522288cfdbf67373661052764ab019c865ea850dc5eb645f173";
const STAGE_14_PARITY_PATH = path.join(
  ROOT,
  "compatibility",
  "interoperability-smoke-parity.json"
);
const STAGE_14_PARITY_SHA256 =
  "0c2f481a394fb9e04b9b7346f008c70658240f2e7db7995fe5ff2f8f2d65d658";
const STAGE_14_CANDIDATE = "stage-14-hardhat-retirement";
const STAGE_14_SMOKE_SOURCE_SHA256 =
  "80bc8ba664ae11d9081e73427cde09652cfc7da03bbfa87fd61767400ca9f696";
const STAGE_14_FORGE_COUNT = 143;
const STAGE_14_FORGE_NAMES_SHA256 =
  "ff02c3d8a133d928555279fd30d720afc6d01f8baf78551ff32a9e91367ab990";
const STAGE_14_EXPECTED_MAPPINGS = Object.freeze([
  Object.freeze({
    hardhatName:
      "Hardhat interoperability smokes acquires, collects tax, and exits with ordered events and conserved balances",
    forgeFile: "test/solidity/parity/PCOMutationParity.t.sol",
    forgeFileSha256:
      "6e441bd6209b55f7872404b20a62daf4b164f78a0d8e7fe50049f31807bd5afc",
    forgeContract: "PCOMutationParityTest",
    forgeTest:
      "test_interoperabilitySmoke_acquiresCollectsTaxAndExitsWithOrderedEventsAndConservedBalances",
  }),
  Object.freeze({
    hardhatName:
      "Hardhat interoperability smokes approves, wraps, takes over, and unwraps with custody and metadata cleanup",
    forgeFile: "test/solidity/parity/WrapperParity.t.sol",
    forgeFileSha256:
      "9fa1bcc0b6ffa2ac6c7a619c44162330f64171877048732bdfa7f48675a99d25",
    forgeContract: "WrapperParityTest",
    forgeTest:
      "test_interoperabilitySmoke_approvesWrapsTakesOverAndUnwrapsWithCustodyAndMetadataCleanup",
  }),
  Object.freeze({
    hardhatName:
      "Hardhat interoperability smokes deploys and reads deterministic PCO configuration",
    forgeFile: "test/solidity/parity/PCOReadTaxParity.t.sol",
    forgeFileSha256:
      "dce90b2cf8174271d9cd72e59376dfffd5c84881ca17d843cf9c51e2ba3901c8",
    forgeContract: "PCOReadTaxParityTest",
    forgeTest:
      "test_interoperabilitySmoke_deploysAndReadsDeterministicPCOConfiguration",
  }),
]);
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

function checkpointFile(commit, relativePath) {
  const result = spawnSync("git", ["show", `${commit}:${relativePath}`], {
    cwd: ROOT,
    encoding: null,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`Unable to read checkpoint file ${commit}:${relativePath}`);
  }
  return result.stdout;
}

function checkpointPathExists(commit, relativePath) {
  const result = spawnSync(
    "git",
    ["cat-file", "-e", `${commit}:${relativePath}`],
    { cwd: ROOT, encoding: "utf8" }
  );
  if (result.error) throw result.error;
  return result.status === 0;
}

function repositoryChangedPaths(baseCommit) {
  const changed = new Set();
  for (const args of [
    ["diff", "--no-renames", "--name-only", baseCommit],
    ["ls-files", "--others", "--exclude-standard"],
  ]) {
    const result = spawnSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) fail(`git ${args.join(" ")} failed`);
    for (const relativePath of result.stdout.split(/\r?\n/).filter(Boolean)) {
      changed.add(relativePath);
    }
  }
  return sorted(changed);
}

function repositoryChangedPathsBetween(baseCommit, headCommit) {
  const result = spawnSync(
    "git",
    ["diff", "--no-renames", "--name-only", baseCommit, headCommit],
    {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
    }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`git diff ${baseCommit} ${headCommit} failed`);
  }
  return sorted(result.stdout.split(/\r?\n/).filter(Boolean));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exactKeys(value, expected, label) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !valuesEqual(Object.keys(value).sort(), [...expected].sort())
  ) {
    fail(`${label} has unexpected or missing fields`);
  }
}

function stage11Inventory(baseline) {
  if (!fs.existsSync(STAGE_11_INVENTORY_PATH)) {
    fail("Missing checked-in Stage 11 Hardhat smoke inventory");
  }
  const inventory = readJson(STAGE_11_INVENTORY_PATH);
  if (
    sha256(fs.readFileSync(STAGE_11_INVENTORY_PATH)) !==
      STAGE_11_INVENTORY_SHA256 ||
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
    inventory.activeHardhat.sourceSha256 !== STAGE_11_SMOKE_SOURCE_SHA256 ||
    sha256(stableJson(inventory.activeHardhat.names)) !==
      STAGE_11_SMOKE_NAMES_SHA256 ||
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

function stage12aInventory(stage11) {
  if (!fs.existsSync(STAGE_12A_INVENTORY_PATH)) {
    fail("Missing checked-in Stage 12a ethers 6 smoke/tooling inventory");
  }
  const bytes = fs.readFileSync(STAGE_12A_INVENTORY_PATH);
  const inventory = JSON.parse(bytes);
  if (
    sha256(bytes) !== STAGE_12A_INVENTORY_SHA256 ||
    inventory.schemaVersion !== 1 ||
    inventory.candidate !== STAGE_12A_CANDIDATE ||
    inventory.stage11Checkpoint !== STAGE_12A_BASE_COMMIT ||
    inventory.inheritedStage11?.inventoryPath !==
      "compatibility/stage-11-hardhat-smoke-inventory.json" ||
    inventory.inheritedStage11?.inventorySha256 !== STAGE_11_INVENTORY_SHA256 ||
    inventory.inheritedStage11?.hardhatNamesSha256 !==
      STAGE_11_SMOKE_NAMES_SHA256 ||
    inventory.inheritedStage11?.smokeSourceSha256 !==
      STAGE_11_SMOKE_SOURCE_SHA256 ||
    inventory.activeHardhat?.count !== 3 ||
    !valuesEqual(inventory.activeHardhat?.names, stage11.activeHardhat.names) ||
    inventory.activeHardhat.sourcePath !== "tests/Interoperability.smoke.ts" ||
    inventory.forge?.count !== 140 ||
    inventory.forge?.namesSha256 !== STAGE_11_FORGE_NAMES_SHA256 ||
    inventory.tooling?.hardhat !== "2.28.6" ||
    inventory.tooling?.ethers !== "6.17.0" ||
    inventory.tooling?.hardhatEthers !== "3.1.3" ||
    inventory.parity?.mappedBehaviorCount !== 104 ||
    inventory.parity?.safetyCount !== 36 ||
    JSON.stringify(inventory.parity?.files) !==
      JSON.stringify(STAGE_11_PARITY_FILES)
  ) {
    fail("Stage 12a ethers 6 smoke/tooling inventory has an invalid schema");
  }
  const checkpointFile = (relativePath) => {
    const result = spawnSync(
      "git",
      ["show", `${STAGE_12B_BASE_COMMIT}:${relativePath}`],
      { cwd: ROOT, encoding: null, maxBuffer: 128 * 1024 * 1024 }
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      fail(`Unable to read Stage 12a checkpoint file: ${relativePath}`);
    }
    return result.stdout;
  };
  if (
    sha256(checkpointFile(inventory.activeHardhat.sourcePath)) !==
    inventory.activeHardhat.sourceSha256
  ) {
    fail("Stage 12a checkpoint smoke source digest changed");
  }
  const expectedToolingFiles = [
    "hardhat.config.d.ts",
    "hardhat.config.ts",
    "package.json",
    "pnpm-lock.yaml",
    "tsconfig.json",
  ];
  if (
    JSON.stringify(Object.keys(inventory.tooling.files).sort()) !==
    JSON.stringify(expectedToolingFiles)
  ) {
    fail("Stage 12a tooling inventory paths changed");
  }
  for (const relativePath of expectedToolingFiles) {
    if (
      sha256(checkpointFile(relativePath)) !==
      inventory.tooling.files[relativePath]
    ) {
      fail(`Stage 12a tooling source digest changed: ${relativePath}`);
    }
  }
  return inventory;
}

function stage12bInventory(stage12a) {
  const relativeInventoryPath = path.relative(ROOT, STAGE_12B_INVENTORY_PATH);
  const bytes = checkpointFile(STAGE_13_BASE_COMMIT, relativeInventoryPath);
  const inventory = JSON.parse(bytes);
  if (
    sha256(bytes) !== STAGE_12B_INVENTORY_SHA256 ||
    sha256(fs.readFileSync(STAGE_12B_INVENTORY_PATH)) !==
      STAGE_12B_INVENTORY_SHA256 ||
    inventory.schemaVersion !== 1 ||
    inventory.candidate !== STAGE_12B_CANDIDATE ||
    inventory.stage12aCheckpoint?.commit !== STAGE_12B_BASE_COMMIT ||
    inventory.stage12aCheckpoint?.inventorySha256 !==
      STAGE_12A_INVENTORY_SHA256 ||
    inventory.activeTests?.hardhat?.count !== 3 ||
    !valuesEqual(
      inventory.activeTests.hardhat.names,
      stage12a.activeHardhat.names
    ) ||
    inventory.activeTests.hardhat.namesSha256 !== STAGE_11_SMOKE_NAMES_SHA256 ||
    inventory.activeTests?.forge?.count !== 140 ||
    inventory.activeTests.forge.namesSha256 !== STAGE_11_FORGE_NAMES_SHA256
  ) {
    fail("Stage 12b Hardhat 3 inventory has an invalid schema");
  }
  const packageJson = JSON.parse(
    checkpointFile(STAGE_13_BASE_COMMIT, "package.json")
  );
  if (
    packageJson.type !== inventory.package.type ||
    packageJson.packageManager !== inventory.package.packageManager ||
    !valuesEqual(
      packageJson.dependencies,
      inventory.package.runtimeDependencies
    ) ||
    !valuesEqual(
      packageJson.devDependencies,
      inventory.package.devDependencies
    ) ||
    packageJson.scripts["test:hardhat:smoke"] !==
      inventory.package.smokeRunner ||
    packageJson.scripts.test !== inventory.package.testRunner
  ) {
    fail("Stage 12b package/tooling inventory changed");
  }
  for (const relativePath of inventory.removedFiles) {
    if (checkpointPathExists(STAGE_13_BASE_COMMIT, relativePath)) {
      fail(`Stage 12b checkpoint retained retired file: ${relativePath}`);
    }
  }
  for (const script of inventory.commonJsRenames) {
    if (
      checkpointPathExists(STAGE_13_BASE_COMMIT, `scripts/${script}.js`) ||
      !checkpointPathExists(STAGE_13_BASE_COMMIT, `scripts/${script}.cjs`)
    ) {
      fail(`Stage 12b checkpoint CommonJS rename changed: ${script}`);
    }
  }
  for (const [relativePath, expected] of Object.entries(inventory.boundFiles)) {
    if (
      sha256(checkpointFile(STAGE_13_BASE_COMMIT, relativePath)) !== expected
    ) {
      fail(`Stage 12b checkpoint bound file changed: ${relativePath}`);
    }
  }
  if (
    checkpointPathExists(STAGE_13_BASE_COMMIT, inventory.helperMove.from) ||
    sha256(checkpointFile(STAGE_13_BASE_COMMIT, inventory.helperMove.to)) !==
      inventory.helperMove.sha256
  ) {
    fail("Stage 12b checkpoint Forge helper move changed");
  }
  return inventory;
}

function stage13CheckpointBinding() {
  return {
    commit: STAGE_13_BASE_COMMIT,
    compatibilityRunner: {
      path: "scripts/compatibility.cjs",
      sha256: STAGE_13_STAGE_12B_RUNNER_SHA256,
    },
    evidence: {
      path: "compatibility/evidence/stage-12b-hardhat-3.json",
      sha256: STAGE_13_STAGE_12B_EVIDENCE_SHA256,
    },
    inventory: {
      path: "compatibility/stage-12b-hardhat3-inventory.json",
      sha256: STAGE_13_STAGE_12B_INVENTORY_SHA256,
    },
    review: {
      path: "compatibility/reviewed-differences.json",
      sha256: STAGE_13_STAGE_12B_REVIEW_SHA256,
    },
  };
}

function stage13Inventory(stage12b) {
  const inventoryBytes = checkpointFile(
    STAGE_13_CHECKPOINT_COMMIT,
    path.relative(ROOT, STAGE_13_INVENTORY_PATH)
  );
  const inventory = JSON.parse(inventoryBytes);
  const inventorySha256 = sha256(inventoryBytes);
  const review = JSON.parse(
    checkpointFile(
      STAGE_13_CHECKPOINT_COMMIT,
      path.relative(ROOT, STAGE_13_REVIEW_PATH)
    )
  );
  const evidence = JSON.parse(
    checkpointFile(
      STAGE_13_CHECKPOINT_COMMIT,
      path.relative(ROOT, STAGE_13_EVIDENCE_PATH)
    )
  );
  const checkpoint = stage13CheckpointBinding();
  const flattenedCheckpoint = {
    commit: STAGE_13_BASE_COMMIT,
    evidenceSha256: STAGE_13_STAGE_12B_EVIDENCE_SHA256,
    reviewSha256: STAGE_13_STAGE_12B_REVIEW_SHA256,
    inventorySha256: STAGE_13_STAGE_12B_INVENTORY_SHA256,
    compatibilityRunnerSha256: STAGE_13_STAGE_12B_RUNNER_SHA256,
  };

  for (const [relativePath, expectedSha256] of [
    [checkpoint.evidence.path, checkpoint.evidence.sha256],
    [checkpoint.review.path, checkpoint.review.sha256],
    [checkpoint.inventory.path, checkpoint.inventory.sha256],
    [
      checkpoint.compatibilityRunner.path,
      checkpoint.compatibilityRunner.sha256,
    ],
  ]) {
    if (
      sha256(checkpointFile(STAGE_13_BASE_COMMIT, relativePath)) !==
      expectedSha256
    ) {
      fail(`Stage 13 inherited checkpoint changed: ${relativePath}`);
    }
  }

  if (
    inventory.schemaVersion !== 1 ||
    inventory.candidate !== STAGE_13_CANDIDATE ||
    inventory.baseCommit !== STAGE_13_BASE_COMMIT ||
    !valuesEqual(inventory.stage12bCheckpoint, flattenedCheckpoint) ||
    review.schemaVersion !== 1 ||
    review.candidate !== STAGE_13_CANDIDATE ||
    review.policy !== STAGE_13_POLICY ||
    !Array.isArray(review.allowedDifferences) ||
    review.allowedDifferences.length !== 0 ||
    !valuesEqual(review.stage12bCheckpoint, checkpoint) ||
    review.opcodeEvidence?.mode !== "stage-13-stage-12b-exact-equality" ||
    review.opcodeEvidence?.path !==
      "compatibility/evidence/stage-13-ci-security-maintenance.json" ||
    evidence.schemaVersion !== 1 ||
    evidence.candidate !== STAGE_13_CANDIDATE ||
    evidence.mode !== "stage-13-stage-12b-exact-equality" ||
    !valuesEqual(evidence.inheritedStage12bCheckpoint, checkpoint) ||
    evidence.baselineSha256 !== review.baselineSha256 ||
    evidence.exactStage12bEquality?.exactStage12bEquality !== true
  ) {
    fail("Stage 13 compatibility review/evidence has an invalid schema");
  }

  if (
    review.maintenanceEvidence?.inventory?.path !==
      "compatibility/stage-13-ci-maintenance-inventory.json" ||
    review.maintenanceEvidence.inventory.sha256 !== inventorySha256 ||
    evidence.maintenance?.inventory?.sha256 !== inventorySha256 ||
    !valuesEqual(review.maintenanceEvidence, evidence.maintenance) ||
    review.maintenanceEvidence.compatibilityRunnerSha256 !==
      sha256(
        checkpointFile(
          STAGE_13_CHECKPOINT_COMMIT,
          "scripts/compatibility.cjs"
        )
      )
  ) {
    fail("Stage 13 maintenance evidence is stale");
  }

  const classified = sorted([
    ...inventory.addedFiles,
    ...inventory.modifiedFiles,
  ]);
  const boundPaths = sorted(Object.keys(inventory.boundFiles));
  if (
    duplicateValues(classified).length > 0 ||
    !valuesEqual(classified, boundPaths)
  ) {
    fail("Stage 13 maintenance file classification changed");
  }
  for (const relativePath of inventory.addedFiles) {
    if (
      checkpointPathExists(STAGE_13_BASE_COMMIT, relativePath) ||
      !checkpointPathExists(STAGE_13_CHECKPOINT_COMMIT, relativePath)
    ) {
      fail(`Stage 13 added-file classification changed: ${relativePath}`);
    }
  }
  for (const relativePath of inventory.modifiedFiles) {
    if (
      !checkpointPathExists(STAGE_13_BASE_COMMIT, relativePath) ||
      !checkpointPathExists(STAGE_13_CHECKPOINT_COMMIT, relativePath)
    ) {
      fail(`Stage 13 modified-file classification changed: ${relativePath}`);
    }
  }
  for (const [relativePath, expectedSha256] of Object.entries(
    inventory.boundFiles
  )) {
    if (
      sha256(checkpointFile(STAGE_13_CHECKPOINT_COMMIT, relativePath)) !==
      expectedSha256
    ) {
      fail(`Stage 13 maintenance file changed: ${relativePath}`);
    }
  }

  const expectedChangedPaths = [
    ...boundPaths,
    "compatibility/README.md",
    "compatibility/reviewed-differences.json",
    "compatibility/stage-13-ci-maintenance-inventory.json",
    "compatibility/evidence/stage-13-ci-security-maintenance.json",
    "scripts/compatibility.cjs",
  ].sort();
  compareExact(
    "Stage 13 repository path inventory",
    expectedChangedPaths,
    repositoryChangedPathsBetween(
      STAGE_13_BASE_COMMIT,
      STAGE_13_CHECKPOINT_COMMIT
    )
  );
  if (
    !valuesEqual(
      review.maintenanceEvidence.changedPaths,
      expectedChangedPaths
    ) ||
    !valuesEqual(review.maintenanceEvidence.addedFiles, inventory.addedFiles) ||
    !valuesEqual(
      review.maintenanceEvidence.modifiedFiles,
      inventory.modifiedFiles
    ) ||
    !valuesEqual(review.maintenanceEvidence.boundFiles, inventory.boundFiles)
  ) {
    fail("Stage 13 reviewed maintenance inventory changed");
  }

  const checkpointEvidence = JSON.parse(
    checkpointFile(STAGE_13_BASE_COMMIT, checkpoint.evidence.path)
  );
  const tests = evidence.exactStage12bEquality?.hardCompatibility?.tests;
  if (
    !valuesEqual(tests, checkpointEvidence.hardCompatibility?.tests) ||
    tests?.hardhat?.count !== stage12b.activeTests.hardhat.count ||
    tests.hardhat.namesSha256 !== stage12b.activeTests.hardhat.namesSha256 ||
    tests?.forge?.count !== stage12b.activeTests.forge.count ||
    tests.forge.namesSha256 !== stage12b.activeTests.forge.namesSha256 ||
    tests.total !== 143
  ) {
    fail("Stage 13 changed the inherited 3-Hardhat/140-Forge identity");
  }
  return inventory;
}

function interoperabilitySmokeParity(stage11, stage12b) {
  if (!fs.existsSync(STAGE_14_PARITY_PATH)) {
    fail("Missing Stage 14 interoperability-smoke parity evidence");
  }
  const bytes = fs.readFileSync(STAGE_14_PARITY_PATH);
  const evidence = JSON.parse(bytes);
  if (sha256(bytes) !== STAGE_14_PARITY_SHA256) {
    fail("Stage 14 interoperability-smoke parity evidence changed");
  }

  exactKeys(
    evidence,
    [
      "schemaVersion",
      "candidate",
      "historicalHardhat",
      "forge",
      "mappings",
      "runnerMechanicsReplaced",
    ],
    "Stage 14 interoperability-smoke parity evidence"
  );
  exactKeys(
    evidence.historicalHardhat,
    [
      "count",
      "finalInventoryPath",
      "finalInventorySha256",
      "namesSha256",
      "originalInventoryPath",
      "originalInventorySha256",
      "sourcePath",
      "sourceSha256",
    ],
    "Stage 14 historical Hardhat evidence"
  );
  exactKeys(evidence.forge, ["after", "before"], "Stage 14 Forge evidence");
  exactKeys(
    evidence.forge.before,
    ["count", "namesSha256"],
    "Stage 14 predecessor Forge evidence"
  );
  exactKeys(
    evidence.forge.after,
    ["count", "namesSha256"],
    "Stage 14 successor Forge evidence"
  );

  const historical = evidence.historicalHardhat;
  if (
    evidence.schemaVersion !== 1 ||
    evidence.candidate !== STAGE_14_CANDIDATE ||
    historical.count !== 3 ||
    historical.originalInventoryPath !==
      path.relative(ROOT, STAGE_11_INVENTORY_PATH) ||
    historical.originalInventorySha256 !== STAGE_11_INVENTORY_SHA256 ||
    historical.finalInventoryPath !==
      path.relative(ROOT, STAGE_12B_INVENTORY_PATH) ||
    historical.finalInventorySha256 !== STAGE_12B_INVENTORY_SHA256 ||
    historical.namesSha256 !== STAGE_11_SMOKE_NAMES_SHA256 ||
    historical.sourcePath !== "tests/Interoperability.smoke.ts" ||
    historical.sourceSha256 !== STAGE_14_SMOKE_SOURCE_SHA256 ||
    evidence.forge.before.count !== stage12b.activeTests.forge.count ||
    evidence.forge.before.namesSha256 !==
      stage12b.activeTests.forge.namesSha256 ||
    evidence.forge.after.count !== STAGE_14_FORGE_COUNT ||
    evidence.forge.after.namesSha256 !== STAGE_14_FORGE_NAMES_SHA256
  ) {
    fail("Stage 14 interoperability-smoke parity evidence has an invalid schema");
  }

  for (const [relativePath, expectedSha256] of [
    [historical.originalInventoryPath, historical.originalInventorySha256],
    [historical.finalInventoryPath, historical.finalInventorySha256],
    [historical.sourcePath, historical.sourceSha256],
  ]) {
    if (
      sha256(checkpointFile(STAGE_13_CHECKPOINT_COMMIT, relativePath)) !==
      expectedSha256
    ) {
      fail(`Stage 14 historical checkpoint changed: ${relativePath}`);
    }
  }
  if (
    !valuesEqual(
      stage11.activeHardhat.names,
      stage12b.activeTests.hardhat.names
    ) ||
    historical.namesSha256 !== stage12b.activeTests.hardhat.namesSha256 ||
    historical.sourcePath !== stage12b.activeTests.hardhat.sourcePath ||
    historical.sourceSha256 !== stage12b.activeTests.hardhat.sourceSha256
  ) {
    fail("Stage 14 historical Hardhat identity changed");
  }
  if (fs.existsSync(path.join(ROOT, historical.sourcePath))) {
    fail(`Retired Hardhat smoke source still exists: ${historical.sourcePath}`);
  }

  if (
    !Array.isArray(evidence.mappings) ||
    evidence.mappings.length !== STAGE_14_EXPECTED_MAPPINGS.length
  ) {
    fail("Stage 14 must map exactly three interoperability smokes");
  }
  const expectedByHardhatName = new Map(
    STAGE_14_EXPECTED_MAPPINGS.map((mapping) => [
      mapping.hardhatName,
      mapping,
    ])
  );
  const hardhatNames = [];
  const forgeTargets = [];
  for (const mapping of evidence.mappings) {
    exactKeys(
      mapping,
      [
        "behaviorDimensions",
        "forgeContract",
        "forgeFile",
        "forgeFileSha256",
        "forgeTest",
        "hardhatName",
      ],
      "Stage 14 smoke mapping"
    );
    const expected = expectedByHardhatName.get(mapping.hardhatName);
    if (
      !expected ||
      mapping.forgeFile !== expected.forgeFile ||
      mapping.forgeFileSha256 !== expected.forgeFileSha256 ||
      mapping.forgeContract !== expected.forgeContract ||
      mapping.forgeTest !== expected.forgeTest ||
      !Array.isArray(mapping.behaviorDimensions) ||
      mapping.behaviorDimensions.length === 0 ||
      mapping.behaviorDimensions.some(
        (dimension) => typeof dimension !== "string" || dimension.length === 0
      ) ||
      duplicateValues(mapping.behaviorDimensions).length > 0
    ) {
      fail(`Invalid Stage 14 smoke mapping: ${mapping.hardhatName}`);
    }
    const forgePath = resolveUnder(
      mapping.forgeFile,
      "test/solidity",
      "Stage 14 mapped Forge source"
    );
    if (
      !fs.existsSync(forgePath) ||
      sha256(fs.readFileSync(forgePath)) !== mapping.forgeFileSha256
    ) {
      fail(`Stage 14 mapped Forge source changed: ${mapping.forgeFile}`);
    }
    hardhatNames.push(mapping.hardhatName);
    forgeTargets.push(
      `${mapping.forgeFile}:${mapping.forgeContract}:${mapping.forgeTest}`
    );
  }
  compareExact(
    "Stage 14 retired Hardhat smoke inventory",
    stage12b.activeTests.hardhat.names,
    hardhatNames
  );
  compareExact(
    "Stage 14 Forge successor mapping",
    STAGE_14_EXPECTED_MAPPINGS.map(
      (mapping) =>
        `${mapping.forgeFile}:${mapping.forgeContract}:${mapping.forgeTest}`
    ),
    forgeTargets
  );
  if (
    duplicateValues(hardhatNames).length > 0 ||
    duplicateValues(forgeTargets).length > 0
  ) {
    fail("Stage 14 smoke mappings must be one-to-one");
  }
  if (
    !Array.isArray(evidence.runnerMechanicsReplaced) ||
    evidence.runnerMechanicsReplaced.length !== 3 ||
    evidence.runnerMechanicsReplaced.some(
      (mechanic) => typeof mechanic !== "string" || mechanic.length === 0
    ) ||
    duplicateValues(evidence.runnerMechanicsReplaced).length > 0
  ) {
    fail("Stage 14 runner-mechanics replacement evidence changed");
  }
  return sorted(forgeTargets);
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
    env: FORGE_ENV,
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
    env: FORGE_ENV,
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
  const stage12a = stage12aInventory(stage11);
  const stage12b = stage12bInventory(stage12a);
  stage13Inventory(stage12b);
  const stage14ForgeTargets = interoperabilitySmokeParity(stage11, stage12b);
  validateMaintenanceLedger({ root: ROOT });
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
  if (
    allForgeTargets.length !== stage12b.activeTests.forge.count ||
    sha256(stableJson([...allForgeTargets].sort())) !==
      stage12b.activeTests.forge.namesSha256
  ) {
    fail("Historical Stage 11-13 active 140-Forge inventory changed");
  }
  const activeForgeTargets = sorted([
    ...allForgeTargets,
    ...stage14ForgeTargets,
  ]);
  const duplicateActiveTargets = duplicateValues(activeForgeTargets);
  if (duplicateActiveTargets.length > 0) {
    fail(
      `Stage 14 successor tests overlap the prior Forge inventory: ${duplicateActiveTargets.join(
        ", "
      )}`
    );
  }
  const discoveredForgeTests = discoverForgeTests();
  const priorForgeSet = new Set(allForgeTargets);
  compareExact(
    "Preserved Stage 11-13 Forge inventory",
    allForgeTargets,
    discoveredForgeTests.filter((name) => priorForgeSet.has(name))
  );
  compareExact(
    "Added Stage 14 Forge inventory",
    stage14ForgeTargets,
    discoveredForgeTests.filter((name) => !priorForgeSet.has(name))
  );
  compareExact(
    "Discovered Stage 14 Forge inventory",
    activeForgeTargets,
    discoveredForgeTests
  );
  const executedForgeTests = executeForgeTests();
  compareExact(
    "Successful Stage 14 Forge inventory",
    activeForgeTargets,
    executedForgeTests
  );
  if (
    discoveredForgeTests.length !== STAGE_14_FORGE_COUNT ||
    executedForgeTests.length !== STAGE_14_FORGE_COUNT ||
    sha256(stableJson([...discoveredForgeTests].sort())) !==
      STAGE_14_FORGE_NAMES_SHA256 ||
    sha256(stableJson([...executedForgeTests].sort())) !==
      STAGE_14_FORGE_NAMES_SHA256
  ) {
    fail("Stage 14 active 143-Forge inventory digest changed");
  }

  console.log(
    `Safety inventory passed: ${hardhatEntries.length} historical Hardhat + ${forgeLegacyEntries.length} baseline Forge scenarios map one-to-one to ${forgeTargets.length} behavior tests, plus ${safetyTargets.length} safety tests and ${stage14ForgeTargets.length} interoperability-smoke successor tests (${executedForgeTests.length} successful Forge tests total).`
  );
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
