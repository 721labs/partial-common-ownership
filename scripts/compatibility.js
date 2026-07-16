#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { verifySafetyBaselines } = require("./check-safety-baselines");

const ROOT = path.resolve(__dirname, "..");
const BASELINE_PATH = path.join(ROOT, "compatibility", "baseline.json");
const REVIEW_PATH = process.env.COMPATIBILITY_REVIEW
  ? path.resolve(ROOT, process.env.COMPATIBILITY_REVIEW)
  : path.join(ROOT, "compatibility", "reviewed-differences.json");
const FORGE_BIN = process.env.FORGE_BIN || "forge";
const HARDHAT_CONFIG = path.join(
  ROOT,
  "compatibility",
  "hardhat.capture.config.ts"
);

const TARGETS = [
  ["contracts/Wrapper.sol", "Wrapper"],
  ["contracts/token/PartialCommonOwnership.sol", "PartialCommonOwnership"],
  ["contracts/token/modules/interfaces/IBeneficiary.sol", "IBeneficiary"],
  ["contracts/token/modules/interfaces/ILease.sol", "ILease"],
  ["contracts/token/modules/interfaces/IRemittance.sol", "IRemittance"],
  ["contracts/token/modules/interfaces/ITaxation.sol", "ITaxation"],
  ["contracts/token/modules/interfaces/IValuation.sol", "IValuation"],
];

const PROJECT_INTERFACES = TARGETS.slice(2);
const REQUIRED_OUTPUTS = [
  "abi",
  "evm.bytecode",
  "evm.deployedBytecode",
  "evm.methodIdentifiers",
  "metadata",
  "storageLayout",
];

const STAGE_04_RAW_BYTECODE_HASH_PATHS = new Set([
  "$.contracts.contracts/Wrapper.sol:Wrapper.creationBytecode.keccak256",
  "$.contracts.contracts/Wrapper.sol:Wrapper.runtimeBytecode.keccak256",
  "$.contracts.contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership.creationBytecode.keccak256",
  "$.contracts.contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership.runtimeBytecode.keccak256",
]);

const STAGE_05_RAW_BYTECODE_HASH_PATHS = new Set([
  "$.contracts.contracts/Wrapper.sol:Wrapper.creationBytecode.keccak256",
  "$.contracts.contracts/Wrapper.sol:Wrapper.runtimeBytecode.keccak256",
  "$.contracts.contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership.creationBytecode.keccak256",
  "$.contracts.contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership.runtimeBytecode.keccak256",
]);

const STAGE_06_FORGE_TEST_PATH =
  /^\$\.tests\.forge\.(?:count|names(?:\.length|\[\d+\]))$/;
const STAGE_07_SAFETY_ARTIFACTS = Object.freeze([
  "compatibility/safety-baselines.json",
  "compatibility/safety-test-inventory.json",
  "coverage/lcov.info",
  "gas/key-flows.snap",
]);

const STAGE_08_COMPILER_VERSION = "0.8.36";
const STAGE_08_COMPILER_LONG_VERSION = "0.8.36+commit.8a079791";
const STAGE_08_OPCODE_EVIDENCE_PATH =
  "compatibility/evidence/stage-08-solidity-0-8-36.json";
const STAGE_08_PRODUCTION_CONTRACTS = Object.freeze([
  "contracts/Wrapper.sol:Wrapper",
  "contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership",
]);
const STAGE_08_BYTECODE_PATH =
  /^\$\.contracts\.(?:contracts\/Wrapper\.sol:Wrapper|contracts\/token\/PartialCommonOwnership\.sol:PartialCommonOwnership)\.(?:creationBytecode|runtimeBytecode)\.(?:keccak256|metadataBytes|metadataStrippedKeccak256|metadataStrippedOpcodes|metadataStrippedSizeBytes|sizeBytes)$/;
const STAGE_08_GAS_SNAPSHOT_PATH = /^\$\.gasSnapshot\.entries\[\d+\]$/;
const STAGE_08_KEY_FLOW_GAS_PATH = path.join(ROOT, "gas", "key-flows.snap");
const PROJECT_REVERT_STRINGS_PATH = path.join(
  ROOT,
  "compatibility",
  "project-revert-strings.json"
);
const PROJECT_REVERT_STRINGS_SHA256 =
  "027be662c5a30bc124afd2f8965e39fcd18c3681bd76fddd659bf78396190b68";
const BASELINE_SOURCE_COMMIT = "ca72ca7f13dd0a2103d592b39a4fcaa749e9045f";

function stage06ParityForgeTests() {
  const mapPath = path.join(ROOT, "compatibility", "parity-map.json");
  const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  if (map.schemaVersion !== 1 || !Array.isArray(map.fragments)) {
    throw new Error("Stage 6 parity map has an invalid schema");
  }
  const parityRoot = `${path.join(ROOT, "compatibility", "parity")}${path.sep}`;
  const forgeTestRoot = `${path.join(ROOT, "test", "solidity")}${path.sep}`;
  const names = [];
  const legacyIds = [];
  const legacyKeys = [];
  const legacyTitles = { hardhat: [], forge: [] };
  for (const fragmentPath of map.fragments) {
    if (path.isAbsolute(fragmentPath)) {
      throw new Error(
        `Stage 6 parity fragment must be relative: ${fragmentPath}`
      );
    }
    const resolvedFragmentPath = path.resolve(ROOT, fragmentPath);
    if (!resolvedFragmentPath.startsWith(parityRoot)) {
      throw new Error(
        `Stage 6 parity fragment must be stored under compatibility/parity: ${fragmentPath}`
      );
    }
    const fragment = JSON.parse(fs.readFileSync(resolvedFragmentPath, "utf8"));
    if (
      fragment.schemaVersion !== 1 ||
      !Array.isArray(fragment.entries) ||
      fragment.entries.length !== fragment.expectedCount ||
      !["hardhat", "forge"].includes(fragment.legacySuite)
    ) {
      throw new Error(`Stage 6 parity fragment is invalid: ${fragmentPath}`);
    }
    for (const entry of fragment.entries) {
      if (path.isAbsolute(entry.forgeFile)) {
        throw new Error(
          `Stage 6 Forge target must be repository-relative: ${entry.forgeFile}`
        );
      }
      const resolvedForgeFile = path.resolve(ROOT, entry.forgeFile);
      if (!resolvedForgeFile.startsWith(forgeTestRoot)) {
        throw new Error(
          `Stage 6 Forge target must be stored under test/solidity: ${entry.forgeFile}`
        );
      }
      legacyIds.push(entry.legacyId);
      legacyKeys.push(`${fragment.legacySuite}:${entry.legacyTitle}`);
      legacyTitles[fragment.legacySuite].push(entry.legacyTitle);
      names.push(
        `${entry.forgeFile}:${entry.forgeContract}:${entry.forgeTest}`
      );
    }
  }
  const uniqueNames = [...new Set(names)].sort();
  const uniqueLegacyIds = new Set(legacyIds);
  const uniqueLegacyKeys = new Set(legacyKeys);
  if (
    names.length !== map.expectedEntries ||
    uniqueNames.length !== map.expectedForgeTests ||
    uniqueLegacyIds.size !== names.length ||
    uniqueLegacyKeys.size !== names.length ||
    legacyTitles.hardhat.length !== map.expectedLegacyCounts.hardhat ||
    legacyTitles.forge.length !== map.expectedLegacyCounts.forge
  ) {
    throw new Error(
      `Stage 6 parity map must contain ${map.expectedEntries} unique legacy and Forge targets`
    );
  }
  return {
    forgeNames: uniqueNames,
    hardhatLegacyTitles: legacyTitles.hardhat.sort(),
    forgeLegacyTitles: legacyTitles.forge.sort(),
  };
}

function validateStage06Candidate(baseline, candidate) {
  if (!valuesEqual(candidate.tests.hardhat, baseline.tests.hardhat)) {
    throw new Error(
      "Stage 6 must preserve the exact 89-test Hardhat oracle inventory"
    );
  }
  const parity = stage06ParityForgeTests();
  if (
    !valuesEqual(
      parity.hardhatLegacyTitles,
      [...baseline.tests.hardhat.names].sort()
    ) ||
    !valuesEqual(
      parity.forgeLegacyTitles,
      [...baseline.tests.forge.names].sort()
    )
  ) {
    throw new Error(
      "Stage 6 parity map must cover every baseline behavior scenario exactly once"
    );
  }
  const expectedForgeNames = parity.forgeNames;
  if (!valuesEqual(candidate.tests.forge.names, expectedForgeNames)) {
    throw new Error(
      "Stage 6 Forge inventory must exactly match the checked-in 104-entry parity map"
    );
  }
  if (candidate.tests.forge.count !== expectedForgeNames.length) {
    throw new Error("Stage 6 Forge test count does not match its parity map");
  }
  if (
    candidate.tests.total !==
    baseline.tests.hardhat.count + expectedForgeNames.length
  ) {
    throw new Error("Stage 6 combined behavior-test count is inconsistent");
  }
}

function stage07SafetyForgeTests() {
  const inventoryPath = path.join(
    ROOT,
    "compatibility",
    "safety-test-inventory.json"
  );
  if (!fs.existsSync(inventoryPath)) {
    throw new Error("Stage 7 safety-test inventory is missing");
  }
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  if (
    inventory.schemaVersion !== 1 ||
    inventory.candidate !== "stage-07-foundry-safety" ||
    !Array.isArray(inventory.names) ||
    inventory.names.length !== inventory.expectedCount
  ) {
    throw new Error("Stage 7 safety-test inventory has an invalid schema");
  }
  const names = [...new Set(inventory.names)].sort();
  if (names.length !== inventory.names.length) {
    throw new Error("Stage 7 safety-test inventory contains duplicates");
  }
  for (const name of names) {
    const separator = name.indexOf(":");
    const source = separator < 0 ? "" : name.slice(0, separator);
    if (!/^test\/solidity\/(?:fuzz|invariant)\/.+\.t\.sol$/.test(source)) {
      throw new Error(
        `Stage 7 safety test is outside its owned directories: ${name}`
      );
    }
    const resolvedSource = path.resolve(ROOT, source);
    const safetyRoot = `${path.join(ROOT, "test", "solidity")}${path.sep}`;
    if (
      !resolvedSource.startsWith(safetyRoot) ||
      !fs.existsSync(resolvedSource)
    ) {
      throw new Error(`Stage 7 safety-test source is missing: ${source}`);
    }
  }
  return names;
}

function stage07SafetyArtifacts() {
  verifySafetyBaselines();
  const artifacts = {};
  for (const relativePath of STAGE_07_SAFETY_ARTIFACTS) {
    const artifactPath = path.resolve(ROOT, relativePath);
    if (!artifactPath.startsWith(`${ROOT}${path.sep}`)) {
      throw new Error(
        `Stage 7 safety artifact escapes the repository: ${relativePath}`
      );
    }
    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Stage 7 safety artifact is missing: ${relativePath}`);
    }
    const bytes = fs.readFileSync(artifactPath);
    artifacts[relativePath] = {
      sha256: sha256(bytes),
      sizeBytes: bytes.length,
    };
  }
  return sorted({
    candidate: "stage-07-foundry-safety",
    artifacts,
  });
}

function validateStage07Candidate(baseline, candidate) {
  if (!valuesEqual(candidate.tests.hardhat, baseline.tests.hardhat)) {
    throw new Error(
      "Stage 7 must preserve the exact 89-test Hardhat oracle inventory"
    );
  }
  const parity = stage06ParityForgeTests();
  if (
    !valuesEqual(
      parity.hardhatLegacyTitles,
      [...baseline.tests.hardhat.names].sort()
    ) ||
    !valuesEqual(
      parity.forgeLegacyTitles,
      [...baseline.tests.forge.names].sort()
    )
  ) {
    throw new Error(
      "Stage 7 parity map must preserve every baseline behavior scenario"
    );
  }
  const safetyNames = stage07SafetyForgeTests();
  const expectedForgeNames = [...parity.forgeNames, ...safetyNames].sort();
  if (new Set(expectedForgeNames).size !== expectedForgeNames.length) {
    throw new Error("Stage 7 safety tests overlap mapped behavior tests");
  }
  if (!valuesEqual(candidate.tests.forge.names, expectedForgeNames)) {
    throw new Error(
      "Stage 7 Forge inventory must exactly match parity plus safety inventories"
    );
  }
  if (
    candidate.tests.forge.count !== expectedForgeNames.length ||
    candidate.tests.total !==
      baseline.tests.hardhat.count + expectedForgeNames.length
  ) {
    throw new Error("Stage 7 combined test counts are inconsistent");
  }
}

function validateStage08Candidate(baseline, candidate) {
  validateStage07Candidate(baseline, candidate);

  if (
    candidate.compiler.version !== STAGE_08_COMPILER_VERSION ||
    candidate.compiler.longVersion !== STAGE_08_COMPILER_LONG_VERSION
  ) {
    throw new Error(
      `Stage 8 requires exact Solidity ${STAGE_08_COMPILER_LONG_VERSION}`
    );
  }
  if (!valuesEqual(candidate.compiler.settings, baseline.compiler.settings)) {
    throw new Error(
      "Stage 8 may change only the compiler version; all compiler settings must remain identical"
    );
  }
}

const REVIEW_POLICIES = Object.freeze({
  "stage-04-source-path-metadata-and-gas": Object.freeze({
    candidate: "stage-04-package-canonical-openzeppelin",
    requiredOpcodeEvidence: Object.freeze({
      mode: "metadata-stripped-equality",
      path: "compatibility/evidence/stage-04-package-canonical-openzeppelin.json",
      contracts: Object.freeze([
        "contracts/Wrapper.sol:Wrapper",
        "contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership",
      ]),
    }),
    permits(reviewPath) {
      return (
        STAGE_04_RAW_BYTECODE_HASH_PATHS.has(reviewPath) ||
        /^\$\.gasSnapshot\.entries\[\d+\]$/.test(reviewPath)
      );
    },
  }),
  "stage-05-openzeppelin-4-9-6-metadata-bytecode": Object.freeze({
    candidate: "stage-05-openzeppelin-4-9-6",
    requiredOpcodeEvidence: Object.freeze({
      mode: "metadata-stripped-equality",
      path: "compatibility/evidence/stage-05-openzeppelin-4-9-6.json",
      contracts: Object.freeze([
        "contracts/Wrapper.sol:Wrapper",
        "contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership",
      ]),
    }),
    permits(reviewPath) {
      return (
        STAGE_05_RAW_BYTECODE_HASH_PATHS.has(reviewPath) ||
        reviewPath === "$.gasSnapshot.entries[11]"
      );
    },
  }),
  "stage-06-forge-parity-expansion": Object.freeze({
    candidate: "stage-06-forge-parity",
    requiredOpcodeEvidence: Object.freeze({
      mode: "metadata-stripped-equality",
      path: "compatibility/evidence/stage-06-forge-parity.json",
      contracts: Object.freeze([
        "contracts/Wrapper.sol:Wrapper",
        "contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership",
      ]),
    }),
    permits(reviewPath) {
      return (
        STAGE_05_RAW_BYTECODE_HASH_PATHS.has(reviewPath) ||
        reviewPath === "$.gasSnapshot.entries[11]" ||
        reviewPath === "$.tests.total" ||
        STAGE_06_FORGE_TEST_PATH.test(reviewPath)
      );
    },
    permitsProtectedPath(reviewPath) {
      return (
        reviewPath === "$.tests.total" ||
        STAGE_06_FORGE_TEST_PATH.test(reviewPath)
      );
    },
    validateCandidate: validateStage06Candidate,
  }),
  "stage-07-foundry-safety-expansion": Object.freeze({
    candidate: "stage-07-foundry-safety",
    requiredOpcodeEvidence: Object.freeze({
      mode: "metadata-stripped-equality",
      path: "compatibility/evidence/stage-07-foundry-safety.json",
      contracts: Object.freeze([
        "contracts/Wrapper.sol:Wrapper",
        "contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership",
      ]),
    }),
    requiredSafetyEvidence: Object.freeze({
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    }),
    permits(reviewPath) {
      return (
        STAGE_05_RAW_BYTECODE_HASH_PATHS.has(reviewPath) ||
        reviewPath === "$.gasSnapshot.entries[11]" ||
        reviewPath === "$.toolchain.forge[2]" ||
        reviewPath === "$.tests.total" ||
        STAGE_06_FORGE_TEST_PATH.test(reviewPath)
      );
    },
    permitsProtectedPath(reviewPath) {
      return (
        reviewPath === "$.tests.total" ||
        STAGE_06_FORGE_TEST_PATH.test(reviewPath)
      );
    },
    validateCandidate: validateStage07Candidate,
  }),
  "stage-08-solidity-0-8-36-compiler": Object.freeze({
    candidate: "stage-08-solidity-0-8-36",
    requiredOpcodeEvidence: Object.freeze({
      mode: "metadata-stripped-full-diff",
      path: STAGE_08_OPCODE_EVIDENCE_PATH,
      contracts: STAGE_08_PRODUCTION_CONTRACTS,
    }),
    requiredSafetyEvidence: Object.freeze({
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    }),
    permits(reviewPath) {
      return (
        reviewPath === "$.compiler.version" ||
        reviewPath === "$.compiler.longVersion" ||
        STAGE_08_BYTECODE_PATH.test(reviewPath) ||
        STAGE_08_GAS_SNAPSHOT_PATH.test(reviewPath) ||
        reviewPath === "$.toolchain.forge[2]" ||
        reviewPath === "$.tests.total" ||
        STAGE_06_FORGE_TEST_PATH.test(reviewPath)
      );
    },
    permitsProtectedPath(reviewPath) {
      return (
        reviewPath === "$.tests.total" ||
        STAGE_06_FORGE_TEST_PATH.test(reviewPath)
      );
    },
    validateCandidate: validateStage08Candidate,
  }),
});

const NON_WAIVABLE_REVIEW_PATHS = [
  {
    name: "contract ABI, functions, events, errors, or storage layout",
    pattern:
      /^\$\.contracts\..+\.(?:abi|functions|events|errors|storageLayout)(?:\.|\[|$)/,
  },
  {
    name: "interfaces, enums, or ERC165 results",
    pattern: /^\$\.(?:interfaces|enums|erc165)(?:\.|\[|$)/,
  },
  {
    name: "project-owned revert strings",
    pattern: /^\$\.projectRevertStrings(?:\.|\[|$)/,
  },
  {
    name: "the executed behavior-test inventory",
    pattern: /^\$\.tests(?:\.|\[|$)/,
  },
];

const OPCODES = {
  0x00: "STOP",
  0x01: "ADD",
  0x02: "MUL",
  0x03: "SUB",
  0x04: "DIV",
  0x05: "SDIV",
  0x06: "MOD",
  0x07: "SMOD",
  0x08: "ADDMOD",
  0x09: "MULMOD",
  0x0a: "EXP",
  0x0b: "SIGNEXTEND",
  0x10: "LT",
  0x11: "GT",
  0x12: "SLT",
  0x13: "SGT",
  0x14: "EQ",
  0x15: "ISZERO",
  0x16: "AND",
  0x17: "OR",
  0x18: "XOR",
  0x19: "NOT",
  0x1a: "BYTE",
  0x1b: "SHL",
  0x1c: "SHR",
  0x1d: "SAR",
  0x20: "KECCAK256",
  0x30: "ADDRESS",
  0x31: "BALANCE",
  0x32: "ORIGIN",
  0x33: "CALLER",
  0x34: "CALLVALUE",
  0x35: "CALLDATALOAD",
  0x36: "CALLDATASIZE",
  0x37: "CALLDATACOPY",
  0x38: "CODESIZE",
  0x39: "CODECOPY",
  0x3a: "GASPRICE",
  0x3b: "EXTCODESIZE",
  0x3c: "EXTCODECOPY",
  0x3d: "RETURNDATASIZE",
  0x3e: "RETURNDATACOPY",
  0x3f: "EXTCODEHASH",
  0x40: "BLOCKHASH",
  0x41: "COINBASE",
  0x42: "TIMESTAMP",
  0x43: "NUMBER",
  0x44: "PREVRANDAO",
  0x45: "GASLIMIT",
  0x46: "CHAINID",
  0x47: "SELFBALANCE",
  0x48: "BASEFEE",
  0x49: "BLOBHASH",
  0x4a: "BLOBBASEFEE",
  0x50: "POP",
  0x51: "MLOAD",
  0x52: "MSTORE",
  0x53: "MSTORE8",
  0x54: "SLOAD",
  0x55: "SSTORE",
  0x56: "JUMP",
  0x57: "JUMPI",
  0x58: "PC",
  0x59: "MSIZE",
  0x5a: "GAS",
  0x5b: "JUMPDEST",
  0x5c: "TLOAD",
  0x5d: "TSTORE",
  0x5e: "MCOPY",
  0x5f: "PUSH0",
  0xf0: "CREATE",
  0xf1: "CALL",
  0xf2: "CALLCODE",
  0xf3: "RETURN",
  0xf4: "DELEGATECALL",
  0xf5: "CREATE2",
  0xfa: "STATICCALL",
  0xfd: "REVERT",
  0xfe: "INVALID",
  0xff: "SELFDESTRUCT",
};

for (let i = 1; i <= 32; i += 1) OPCODES[0x5f + i] = `PUSH${i}`;
for (let i = 1; i <= 16; i += 1) OPCODES[0x7f + i] = `DUP${i}`;
for (let i = 1; i <= 16; i += 1) OPCODES[0x8f + i] = `SWAP${i}`;
for (let i = 0; i <= 4; i += 1) OPCODES[0xa0 + i] = `LOG${i}`;

function hardhatBinary() {
  if (process.env.HARDHAT_BIN) return process.env.HARDHAT_BIN;
  const extension = process.platform === "win32" ? ".cmd" : "";
  return path.join(ROOT, "node_modules", ".bin", `hardhat${extension}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
    maxBuffer: 128 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    throw new Error(
      `${command} ${args.join(" ")} failed with status ${
        result.status
      }\n${output}`
    );
  }

  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sorted(value[key])])
    );
  }
  return value;
}

function stableJson(value) {
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function protectedProjectRevertStrings() {
  if (!fs.existsSync(PROJECT_REVERT_STRINGS_PATH)) {
    throw new Error("Project revert-string baseline is missing");
  }
  const bytes = fs.readFileSync(PROJECT_REVERT_STRINGS_PATH);
  const digest = sha256(bytes);
  if (digest !== PROJECT_REVERT_STRINGS_SHA256) {
    throw new Error(
      `Project revert-string baseline digest changed: expected ${PROJECT_REVERT_STRINGS_SHA256}, received ${digest}`
    );
  }
  const baseline = JSON.parse(bytes);
  if (
    baseline.schemaVersion !== 1 ||
    baseline.baselineSourceCommit !== BASELINE_SOURCE_COMMIT ||
    !Array.isArray(baseline.entries) ||
    baseline.entries.length !== 35
  ) {
    throw new Error("Project revert-string baseline has an invalid schema");
  }
  return baseline.entries;
}

function findBuildInfo() {
  const directory = path.join(ROOT, "artifacts", "build-info");
  const candidates = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const filename = path.join(directory, name);
      return {
        filename,
        modified: fs.statSync(filename).mtimeMs,
      };
    })
    .sort((a, b) => b.modified - a.modified);

  for (const candidate of candidates) {
    const buildInfo = JSON.parse(fs.readFileSync(candidate.filename, "utf8"));
    const hasTargets = TARGETS.every(
      ([source, contract]) => buildInfo.output.contracts[source]?.[contract]
    );
    if (hasTargets) return buildInfo;
  }

  throw new Error(
    "No Hardhat build-info file contains every compatibility target"
  );
}

function normalizeCompilerInput(buildInfo) {
  const input = deepClone(buildInfo.input);
  const selection = input.settings.outputSelection || {};
  selection["*"] = selection["*"] || {};
  selection["*"]["*"] = Array.from(
    new Set([...(selection["*"]["*"] || []), ...REQUIRED_OUTPUTS])
  ).sort();
  selection["*"][""] = Array.from(
    new Set([...(selection["*"][""] || []), "ast"])
  ).sort();
  input.settings.outputSelection = selection;

  // hardhat-preprocessor uses this unused library to invalidate its cache. It
  // changes on every compile and affects only the CBOR compiler metadata.
  const emptySourceLibraries = input.settings.libraries?.[""];
  if (emptySourceLibraries) {
    delete emptySourceLibraries.__CACHE_BREAKER__;
    if (Object.keys(emptySourceLibraries).length === 0) {
      delete input.settings.libraries[""];
    }
    if (Object.keys(input.settings.libraries).length === 0) {
      delete input.settings.libraries;
    }
  }

  return input;
}

async function compileExtended(buildInfo, input) {
  const { getCompilersDir } = require("hardhat/internal/util/global-dir");
  const {
    CompilerDownloader,
    CompilerPlatform,
  } = require("hardhat/internal/solidity/compiler/downloader");
  const {
    Compiler,
    NativeCompiler,
  } = require("hardhat/internal/solidity/compiler");

  const compilersDir = await getCompilersDir();
  const platform = CompilerDownloader.getCompilerPlatform();
  const nativeDownloader = CompilerDownloader.getConcurrencySafeDownloader(
    platform,
    compilersDir
  );
  let compiler = await nativeDownloader.getCompiler(buildInfo.solcVersion);

  if (!compiler) {
    const wasmDownloader = CompilerDownloader.getConcurrencySafeDownloader(
      CompilerPlatform.WASM,
      compilersDir
    );
    compiler = await wasmDownloader.getCompiler(buildInfo.solcVersion);
  }

  if (!compiler) {
    throw new Error(
      `Solidity ${buildInfo.solcVersion} was not available after Hardhat compilation`
    );
  }

  const runner = compiler.isSolcJs
    ? new Compiler(compiler.compilerPath)
    : new NativeCompiler(compiler.compilerPath, buildInfo.solcVersion);
  const output = await runner.compile(input);
  const errors = (output.errors || []).filter(
    (diagnostic) => diagnostic.severity === "error"
  );
  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.formattedMessage).join("\n"));
  }

  return output;
}

function ethersKeccak(hexValue) {
  const imported = require("ethers");
  const ethers = imported.ethers || imported;
  const keccak256 = ethers.keccak256 || ethers.utils?.keccak256;
  if (!keccak256) throw new Error("Unable to locate ethers.keccak256");
  return keccak256(hexValue);
}

function ethersId(value) {
  const imported = require("ethers");
  const ethers = imported.ethers || imported;
  const id = ethers.id || ethers.utils?.id;
  if (!id) throw new Error("Unable to locate ethers.id");
  return id(value);
}

function canonicalAbiType(parameter) {
  if (!parameter.type.startsWith("tuple")) return parameter.type;
  const suffix = parameter.type.slice("tuple".length);
  return `(${(parameter.components || [])
    .map(canonicalAbiType)
    .join(",")})${suffix}`;
}

function abiSignature(entry) {
  const inputs = (entry.inputs || []).map(canonicalAbiType).join(",");
  return entry.name ? `${entry.name}(${inputs})` : entry.type;
}

function normalizeAbi(abi) {
  return abi
    .map((entry) => sorted(entry))
    .sort((a, b) => {
      const left = `${a.type}:${abiSignature(a)}`;
      const right = `${b.type}:${abiSignature(b)}`;
      return left.localeCompare(right);
    });
}

function normalizeTypeId(typeId) {
  return typeId.replace(/\)(\d+)(?=_(?:storage|memory|calldata)|\b)/g, ")");
}

function normalizeStorageMember(member) {
  return {
    label: member.label,
    offset: member.offset,
    slot: member.slot,
    type: normalizeTypeId(member.type),
  };
}

function normalizeStorageLayout(layout) {
  const types = {};
  for (const [typeId, description] of Object.entries(layout.types || {})) {
    const normalizedId = normalizeTypeId(typeId);
    const normalized = {};
    for (const [key, value] of Object.entries(description)) {
      if (key === "members") {
        normalized.members = value.map(normalizeStorageMember);
      } else if (["base", "key", "value"].includes(key)) {
        normalized[key] = normalizeTypeId(value);
      } else {
        normalized[key] = value;
      }
    }
    if (
      types[normalizedId] &&
      stableJson(types[normalizedId]) !== stableJson(normalized)
    ) {
      throw new Error(
        `Storage type normalization collision for ${normalizedId}`
      );
    }
    types[normalizedId] = normalized;
  }

  return sorted({
    storage: (layout.storage || []).map(normalizeStorageMember),
    types,
  });
}

function stripMetadata(hex) {
  if (!hex || hex.length < 4) return { code: hex || "", metadataBytes: 0 };
  const metadataLength = Number.parseInt(hex.slice(-4), 16);
  const metadataHexLength = (metadataLength + 2) * 2;
  if (!Number.isFinite(metadataLength) || metadataHexLength > hex.length) {
    return { code: hex, metadataBytes: 0 };
  }
  return {
    code: hex.slice(0, -metadataHexLength),
    metadataBytes: metadataLength + 2,
  };
}

function disassemble(hex) {
  const bytes = Buffer.from(hex, "hex");
  const instructions = [];
  for (let pc = 0; pc < bytes.length; pc += 1) {
    const opcode = bytes[pc];
    const name =
      OPCODES[opcode] || `UNKNOWN_0x${opcode.toString(16).padStart(2, "0")}`;
    if (opcode >= 0x60 && opcode <= 0x7f) {
      const width = opcode - 0x5f;
      const immediate = bytes.subarray(pc + 1, pc + 1 + width).toString("hex");
      instructions.push(`${name} 0x${immediate}`);
      pc += width;
    } else {
      instructions.push(name);
    }
  }
  return instructions.join(" ");
}

function normalizeReferences(references) {
  const normalized = [];
  for (const [source, libraries] of Object.entries(references || {})) {
    for (const [library, offsets] of Object.entries(libraries)) {
      normalized.push({ source, library, offsets });
    }
  }
  return normalized.sort((a, b) =>
    `${a.source}:${a.library}`.localeCompare(`${b.source}:${b.library}`)
  );
}

function bytecodeSummary(bytecode) {
  const raw = bytecode.object || "";
  if (raw.length === 0) return { available: false, sizeBytes: 0 };
  if (!/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error("Unlinked bytecode cannot be hashed deterministically");
  }

  const { code, metadataBytes } = stripMetadata(raw);
  return {
    available: true,
    sizeBytes: raw.length / 2,
    metadataBytes,
    keccak256: ethersKeccak(`0x${raw}`),
    metadataStrippedSizeBytes: code.length / 2,
    metadataStrippedKeccak256: ethersKeccak(`0x${code}`),
    metadataStrippedOpcodes: disassemble(code),
    linkReferences: normalizeReferences(bytecode.linkReferences),
    immutableReferences: sorted(bytecode.immutableReferences || {}),
  };
}

function selectorsFor(contractOutput) {
  return Object.entries(contractOutput.evm.methodIdentifiers || {})
    .map(([signature, selector]) => ({
      signature,
      selector: `0x${selector}`,
    }))
    .sort((a, b) => a.signature.localeCompare(b.signature));
}

function abiDetails(abi, contractOutput) {
  const selectors = new Map(
    selectorsFor(contractOutput).map((entry) => [
      entry.signature,
      entry.selector,
    ])
  );
  const functions = [];
  const events = [];
  const errors = [];

  for (const entry of abi) {
    const signature = abiSignature(entry);
    if (entry.type === "function") {
      functions.push({ signature, selector: selectors.get(signature) });
    } else if (entry.type === "event") {
      events.push({ signature, topic0: ethersId(signature) });
    } else if (entry.type === "error") {
      errors.push({ signature, selector: ethersId(signature).slice(0, 10) });
    }
  }

  const bySignature = (a, b) => a.signature.localeCompare(b.signature);
  return {
    functions: functions.sort(bySignature),
    events: events.sort(bySignature),
    errors: errors.sort(bySignature),
  };
}

function contractSummary(output, source, contractName) {
  const contractOutput = output.contracts[source]?.[contractName];
  if (!contractOutput)
    throw new Error(`Missing compiler output ${source}:${contractName}`);
  const abi = normalizeAbi(contractOutput.abi || []);

  const summary = {
    abi,
    ...abiDetails(abi, contractOutput),
    storageLayout: normalizeStorageLayout(contractOutput.storageLayout || {}),
    creationBytecode: bytecodeSummary(contractOutput.evm.bytecode),
    runtimeBytecode: bytecodeSummary(contractOutput.evm.deployedBytecode),
  };
  if (summary.runtimeBytecode.sizeBytes > 24_576) {
    throw new Error(`${contractName} exceeds the EIP-170 runtime size limit`);
  }
  return summary;
}

function walkAst(value, visitor) {
  if (Array.isArray(value)) {
    for (const item of value) walkAst(item, visitor);
  } else if (value && typeof value === "object") {
    visitor(value);
    for (const child of Object.values(value)) walkAst(child, visitor);
  }
}

function enumSummary(output) {
  const enums = [];
  for (const [source, sourceOutput] of Object.entries(output.sources || {})) {
    if (
      source !== "contracts/Wrapper.sol" &&
      !source.startsWith("contracts/token/")
    ) {
      continue;
    }
    walkAst(sourceOutput.ast, (node) => {
      if (node.nodeType !== "EnumDefinition") return;
      enums.push({
        source,
        name: node.canonicalName || node.name,
        members: node.members.map((member, ordinal) => ({
          name: member.name,
          ordinal,
        })),
      });
    });
  }
  return enums.sort((a, b) =>
    `${a.source}:${a.name}`.localeCompare(`${b.source}:${b.name}`)
  );
}

function callableSignature(node, prefix = "") {
  const name = node.kind === "constructor" ? "constructor" : node.name;
  const parameters = (node.parameters?.parameters || []).map((parameter) => {
    const type = parameter.typeDescriptions?.typeString;
    if (!type) {
      throw new Error(
        `Missing compiler type for ${prefix}${name || node.kind} parameter`
      );
    }
    return type;
  });
  return `${prefix}${name || node.kind}(${parameters.join(",")})`;
}

function projectRevertStringSummary(output) {
  const discovered = [];

  function visit(value, context) {
    if (Array.isArray(value)) {
      for (const child of value) visit(child, context);
      return;
    }
    if (!value || typeof value !== "object") return;

    let nextContext = context;
    if (value.nodeType === "ContractDefinition") {
      nextContext = { ...context, contract: value.name };
    } else if (value.nodeType === "FunctionDefinition") {
      nextContext = {
        ...context,
        callable: callableSignature(value),
      };
    } else if (value.nodeType === "ModifierDefinition") {
      nextContext = {
        ...context,
        callable: callableSignature(value, "modifier "),
      };
    }

    if (
      value.nodeType === "FunctionCall" &&
      value.expression?.nodeType === "Identifier" &&
      ["require", "revert"].includes(value.expression.name)
    ) {
      const callKind = value.expression.name;
      const message =
        callKind === "require" ? value.arguments?.[1] : value.arguments?.[0];
      if (message?.nodeType === "Literal" && message.kind === "string") {
        if (!nextContext.contract || !nextContext.callable) {
          throw new Error(
            `Project revert string is outside a contract callable in ${context.source}`
          );
        }
        const sourceOffset = Number.parseInt(
          String(value.src).split(":")[0],
          10
        );
        if (!Number.isInteger(sourceOffset)) {
          throw new Error(`Invalid AST source location in ${context.source}`);
        }
        discovered.push({
          source: context.source,
          contract: nextContext.contract,
          callable: nextContext.callable,
          callKind,
          sourceOffset,
          value: message.value,
        });
      }
    }

    for (const child of Object.values(value)) visit(child, nextContext);
  }

  for (const source of Object.keys(output.sources || {}).sort()) {
    if (
      source !== "contracts/Wrapper.sol" &&
      !source.startsWith("contracts/token/")
    ) {
      continue;
    }
    const ast = output.sources[source]?.ast;
    if (!ast) throw new Error(`Missing AST for project source ${source}`);
    visit(ast, { source, contract: null, callable: null });
  }

  discovered.sort((left, right) => {
    const sourceOrder = left.source.localeCompare(right.source);
    if (sourceOrder !== 0) return sourceOrder;
    return left.sourceOffset - right.sourceOffset;
  });

  const ordinals = new Map();
  return discovered.map(({ sourceOffset: _sourceOffset, ...entry }) => {
    const key = `${entry.source}:${entry.contract}:${entry.callable}:${entry.callKind}`;
    const ordinal = ordinals.get(key) || 0;
    ordinals.set(key, ordinal + 1);
    return { ...entry, ordinal };
  });
}

function xorInterfaceId(selectors) {
  let value = 0;
  for (const selector of selectors)
    value ^= Number.parseInt(selector.slice(2), 16);
  return `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
}

function interfaceSummary(output) {
  const interfaces = {};
  for (const [source, contractName] of PROJECT_INTERFACES) {
    const contractOutput = output.contracts[source][contractName];
    const functions = selectorsFor(contractOutput);
    interfaces[`${source}:${contractName}`] = {
      interfaceId: xorInterfaceId(functions.map((entry) => entry.selector)),
      functions,
    };
  }
  return sorted(interfaces);
}

function temporaryFile(name) {
  return path.join(
    os.tmpdir(),
    `partial-common-ownership-${process.pid}-${crypto
      .randomBytes(6)
      .toString("hex")}-${name}`
  );
}

function captureHardhatTests() {
  const outputPath = temporaryFile("hardhat-tests.json");
  try {
    run(hardhatBinary(), ["--config", HARDHAT_CONFIG, "test", "--no-compile"], {
      env: { COMPAT_HARDHAT_RESULTS: outputPath },
    });
    const results = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (results.failed.length > 0 || results.pending.length > 0) {
      throw new Error(
        `Hardhat suite was not completely green: ${results.failed.length} failed, ${results.pending.length} pending`
      );
    }
    return {
      count: results.passed.length,
      names: results.passed,
    };
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
}

function parseJsonAfterCompilerOutput(stdout) {
  const lines = stdout.split(/\r?\n/);
  const firstJsonLine = lines.findIndex((line) =>
    line.trimStart().startsWith("{")
  );
  if (firstJsonLine < 0)
    throw new Error("Forge did not emit JSON test discovery output");
  return JSON.parse(lines.slice(firstJsonLine).join("\n"));
}

function captureForgeTests() {
  const discovery = run(FORGE_BIN, ["test", "--list", "--json"]);
  const listed = parseJsonAfterCompilerOutput(discovery.stdout);
  const names = [];
  for (const source of Object.keys(listed).sort()) {
    for (const contractName of Object.keys(listed[source]).sort()) {
      for (const testName of listed[source][contractName].slice().sort()) {
        names.push(`${source}:${contractName}:${testName}`);
      }
    }
  }

  const execution = parseJsonAfterCompilerOutput(
    run(FORGE_BIN, ["test", "--json"]).stdout
  );
  const executedNames = [];
  const unsuccessful = [];
  for (const [suiteName, suite] of Object.entries(execution)) {
    const separator = suiteName.lastIndexOf(":");
    if (separator < 0 || !suite.test_results) {
      throw new Error(`Forge emitted an invalid execution suite: ${suiteName}`);
    }
    const source = suiteName.slice(0, separator);
    const contractName = suiteName.slice(separator + 1);
    for (const [signature, result] of Object.entries(suite.test_results)) {
      const testName = signature.replace(/\(.*$/, "");
      const fullName = `${source}:${contractName}:${testName}`;
      executedNames.push(fullName);
      if (result.status !== "Success") {
        unsuccessful.push(`${fullName}: ${result.status}`);
      }
    }
  }
  executedNames.sort();
  if (!valuesEqual(executedNames, names)) {
    throw new Error("Forge executed inventory differs from test discovery");
  }
  if (unsuccessful.length > 0) {
    throw new Error(
      `Forge suite contains failed or skipped tests:\n${unsuccessful.join(
        "\n"
      )}`
    );
  }
  return { count: names.length, names };
}

function captureGasSnapshot() {
  const outputPath = temporaryFile("gas-snapshot.txt");
  try {
    run(FORGE_BIN, [
      "snapshot",
      "--fuzz-seed",
      "0x721",
      "--fuzz-runs",
      "256",
      "--match-contract",
      "^(BeneficiaryTest|RemittanceTest|ValuationTest)$",
      "--snap",
      outputPath,
    ]);
    return {
      fuzzSeed: "0x721",
      entries: fs
        .readFileSync(outputPath, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .sort(),
    };
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
}

function captureErc165(interfaces) {
  const probes = [
    { name: "IERC165", interfaceId: "0x01ffc9a7" },
    { name: "IERC721", interfaceId: "0x80ac58cd" },
    { name: "IERC721Metadata", interfaceId: "0x5b5e139f" },
    ...Object.entries(interfaces).map(([qualifiedName, description]) => ({
      name: qualifiedName,
      interfaceId: description.interfaceId,
    })),
    { name: "invalid", interfaceId: "0xffffffff" },
  ].sort((a, b) =>
    `${a.name}:${a.interfaceId}`.localeCompare(`${b.name}:${b.interfaceId}`)
  );

  const outputPath = temporaryFile("erc165.json");
  try {
    run(
      hardhatBinary(),
      ["run", "--no-compile", "compatibility/erc165.capture.ts"],
      {
        env: {
          COMPAT_ERC165_RESULTS: outputPath,
          COMPAT_ERC165_PROBES: JSON.stringify(probes),
        },
      }
    );
    return JSON.parse(fs.readFileSync(outputPath, "utf8"));
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
}

function compilerSettings(buildInfo, input) {
  return {
    version: buildInfo.solcVersion,
    longVersion: buildInfo.solcLongVersion,
    settings: sorted(input.settings),
  };
}

function forgeVersionSummary() {
  return run(FORGE_BIN, ["--version"])
    .stdout.trim()
    .split(/\r?\n/)
    .map((line) =>
      line.startsWith("Build Timestamp:")
        ? "Build Timestamp: <platform-specific>"
        : line
    );
}

async function generateManifest() {
  run(hardhatBinary(), ["compile", "--force"]);
  const buildInfo = findBuildInfo();
  const compilerInput = normalizeCompilerInput(buildInfo);
  const output = await compileExtended(buildInfo, compilerInput);
  const contracts = {};
  for (const [source, contractName] of TARGETS) {
    contracts[`${source}:${contractName}`] = contractSummary(
      output,
      source,
      contractName
    );
  }
  const interfaces = interfaceSummary(output);
  const hardhat = captureHardhatTests();
  const forge = captureForgeTests();

  return sorted({
    schemaVersion: 1,
    baselineSourceCommit: BASELINE_SOURCE_COMMIT,
    toolchain: {
      forge: forgeVersionSummary(),
    },
    compiler: compilerSettings(buildInfo, compilerInput),
    contracts,
    enums: enumSummary(output),
    projectRevertStrings: projectRevertStringSummary(output),
    interfaces,
    erc165: {
      contract: "contracts/Wrapper.sol:Wrapper",
      probes: captureErc165(interfaces),
    },
    tests: {
      hardhat,
      forge,
      total: hardhat.count + forge.count,
    },
    gasSnapshot: captureGasSnapshot(),
  });
}

function preview(value) {
  const rendered = JSON.stringify(value);
  if (rendered === undefined) return "undefined";
  return rendered.length <= 180 ? rendered : `${rendered.slice(0, 177)}...`;
}

function collectDifferences(
  expected,
  actual,
  location = "$",
  differences = []
) {
  if (Object.is(expected, actual)) return differences;

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      differences.push({
        path: `${location}.length`,
        baselineValue: expected.length,
        candidateValue: actual.length,
      });
    }
    const length = Math.min(expected.length, actual.length);
    for (let i = 0; i < length; i += 1) {
      collectDifferences(
        expected[i],
        actual[i],
        `${location}[${i}]`,
        differences
      );
    }
    return differences;
  }

  if (
    expected &&
    actual &&
    typeof expected === "object" &&
    typeof actual === "object" &&
    !Array.isArray(expected) &&
    !Array.isArray(actual)
  ) {
    const keys = Array.from(
      new Set([...Object.keys(expected), ...Object.keys(actual)])
    ).sort();
    for (const key of keys) {
      collectDifferences(
        expected[key],
        actual[key],
        `${location}.${key}`,
        differences
      );
    }
    return differences;
  }

  differences.push({
    path: location,
    baselineValue: expected,
    candidateValue: actual,
  });
  return differences;
}

function formatDifference(difference) {
  return `${difference.path}: ${preview(difference.baselineValue)} != ${preview(
    difference.candidateValue
  )}`;
}

function valuesEqual(left, right) {
  return stableJson(left) === stableJson(right);
}

function readReviewedDifferences() {
  if (!fs.existsSync(REVIEW_PATH)) return null;
  const review = JSON.parse(fs.readFileSync(REVIEW_PATH, "utf8"));
  if (review.schemaVersion !== 1) {
    throw new Error(
      `Unsupported compatibility review schema in ${REVIEW_PATH}`
    );
  }
  if (!Array.isArray(review.allowedDifferences)) {
    throw new Error("Compatibility review must contain allowedDifferences");
  }
  if (!review.candidate || typeof review.candidate !== "string") {
    throw new Error("Compatibility review must name its candidate");
  }
  if (!review.policy || typeof review.policy !== "string") {
    throw new Error("Compatibility review must name an enumerated policy");
  }
  return review;
}

function reviewPolicy(review) {
  const policy = REVIEW_POLICIES[review.policy];
  if (!policy) {
    throw new Error(
      `Unknown compatibility review policy: ${review.policy}. Add a named policy to scripts/compatibility.js before reviewing a new class of change.`
    );
  }
  if (policy.candidate !== review.candidate) {
    throw new Error(
      `Compatibility review policy ${review.policy} is restricted to ${policy.candidate}, not ${review.candidate}`
    );
  }
  if (policy.requiredOpcodeEvidence) {
    const required = policy.requiredOpcodeEvidence;
    const supplied = review.opcodeEvidence;
    if (!supplied || typeof supplied !== "object") {
      throw new Error(
        `Compatibility review policy ${review.policy} requires opcode evidence`
      );
    }
    if (supplied.mode !== required.mode) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires opcode evidence mode ${required.mode}`
      );
    }
    if (supplied.path !== required.path) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires checked-in opcode evidence at ${required.path}`
      );
    }
    if (!Array.isArray(supplied.contracts)) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires an exact opcode evidence contract set`
      );
    }
    const requiredContracts = [...required.contracts].sort();
    const suppliedContracts = [...new Set(supplied.contracts)].sort();
    if (
      suppliedContracts.length !== supplied.contracts.length ||
      !valuesEqual(suppliedContracts, requiredContracts)
    ) {
      throw new Error(
        `Compatibility review policy ${
          review.policy
        } requires opcode evidence for exactly: ${requiredContracts.join(", ")}`
      );
    }
  }
  if (policy.requiredSafetyEvidence) {
    const required = policy.requiredSafetyEvidence;
    const supplied = review.safetyEvidence;
    if (!supplied || typeof supplied !== "object") {
      throw new Error(
        `Compatibility review policy ${review.policy} requires safety-baseline evidence`
      );
    }
    if (
      supplied.path !== required.path ||
      supplied.sha256 !== required.sha256
    ) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires exact safety evidence ${required.path} at ${required.sha256}`
      );
    }
  }
  return policy;
}

function nonWaivableReviewDomain(reviewPath) {
  return NON_WAIVABLE_REVIEW_PATHS.find(({ pattern }) =>
    pattern.test(reviewPath)
  );
}

function validateReviewedDifferences(review, baselineBytes, differences) {
  if (!review) return;

  const policy = reviewPolicy(review);
  const baselineDigest = sha256(baselineBytes);
  if (review.baselineSha256 !== baselineDigest) {
    throw new Error(
      `Compatibility review targets baseline ${review.baselineSha256}, but the checked-in baseline is ${baselineDigest}`
    );
  }

  const allowedByPath = new Map();
  for (const allowance of review.allowedDifferences) {
    if (!allowance.path || typeof allowance.path !== "string") {
      throw new Error("Every reviewed difference must have an exact path");
    }
    if (allowedByPath.has(allowance.path)) {
      throw new Error(`Duplicate reviewed difference path: ${allowance.path}`);
    }
    const protectedDomain = nonWaivableReviewDomain(allowance.path);
    if (
      protectedDomain &&
      !(
        policy.permitsProtectedPath &&
        policy.permitsProtectedPath(allowance.path, protectedDomain.name)
      )
    ) {
      throw new Error(
        `Reviewed differences may never waive ${protectedDomain.name}: ${allowance.path}`
      );
    }
    if (!policy.permits(allowance.path)) {
      throw new Error(
        `Compatibility review policy ${review.policy} does not permit path: ${allowance.path}`
      );
    }
    if (!Object.prototype.hasOwnProperty.call(allowance, "baselineValue")) {
      throw new Error(
        `Reviewed difference ${allowance.path} is missing baselineValue`
      );
    }
    if (!Object.prototype.hasOwnProperty.call(allowance, "candidateValue")) {
      throw new Error(
        `Reviewed difference ${allowance.path} is missing candidateValue`
      );
    }
    if (!allowance.reason || typeof allowance.reason !== "string") {
      throw new Error(
        `Reviewed difference ${allowance.path} is missing its reason`
      );
    }
    allowedByPath.set(allowance.path, allowance);
  }

  const usedPaths = new Set();
  const rejected = [];
  for (const difference of differences) {
    const allowance = allowedByPath.get(difference.path);
    if (!allowance) {
      rejected.push(`unreviewed: ${formatDifference(difference)}`);
      continue;
    }
    usedPaths.add(difference.path);
    if (
      !valuesEqual(allowance.baselineValue, difference.baselineValue) ||
      !valuesEqual(allowance.candidateValue, difference.candidateValue)
    ) {
      rejected.push(
        `review does not match exact old/new values: ${formatDifference(
          difference
        )}`
      );
    }
  }

  for (const allowance of review.allowedDifferences) {
    if (!usedPaths.has(allowance.path)) {
      rejected.push(`unused reviewed difference: ${allowance.path}`);
    }
  }

  if (rejected.length > 0) {
    throw new Error(
      `Compatibility candidate ${
        review.candidate
      } did not match its review:\n${rejected
        .map((entry) => `- ${entry}`)
        .join("\n")}`
    );
  }
}

function stage08ReviewReason(reviewPath) {
  if (/^\$\.compiler\.(?:version|longVersion)$/.test(reviewPath)) {
    return "Tool configurations are pinned to exact Solidity 0.8.36; every compiler setting other than version remains unchanged.";
  }
  if (STAGE_08_BYTECODE_PATH.test(reviewPath)) {
    return "Solidity 0.8.36 changes compiler-generated bytecode; the checked-in evidence records complete metadata-stripped opcode changes, raw and normalized hashes and sizes, and EIP-170 validation.";
  }
  if (STAGE_08_GAS_SNAPSHOT_PATH.test(reviewPath)) {
    return "Solidity 0.8.36 changes compiler-generated gas; this exact snapshot delta is reviewed with the checked-in PCO and Wrapper key-flow gas evidence.";
  }
  if (reviewPath === "$.toolchain.forge[2]") {
    return "Official Foundry 1.7.1 binaries share the pinned version and commit but embed platform-specific build timestamps; the manifest compares the stable version, commit, and build profile.";
  }
  if (
    reviewPath === "$.tests.total" ||
    STAGE_06_FORGE_TEST_PATH.test(reviewPath)
  ) {
    return "Stage 8 preserves the Stage 7 inventory exactly: 89 Hardhat oracle tests, 104 mapped Forge behaviors, and 36 Forge safety tests.";
  }
  throw new Error(`Stage 8 has no review reason for ${reviewPath}`);
}

function stage08Review(baselineBytes, differences) {
  return {
    schemaVersion: 1,
    candidate: "stage-08-solidity-0-8-36",
    policy: "stage-08-solidity-0-8-36-compiler",
    baselineSha256: sha256(baselineBytes),
    allowedDifferences: differences.map((difference) => ({
      ...difference,
      reason: stage08ReviewReason(difference.path),
    })),
    opcodeEvidence: {
      mode: "metadata-stripped-full-diff",
      path: STAGE_08_OPCODE_EVIDENCE_PATH,
      contracts: [...STAGE_08_PRODUCTION_CONTRACTS],
    },
    safetyEvidence: {
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    },
  };
}

function opcodeInstructions(opcodes) {
  if (!opcodes) return [];
  const words = opcodes.split(" ");
  const instructions = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (/^PUSH(?:[1-9]|[12]\d|3[0-2])$/.test(word)) {
      if (!/^0x[0-9a-f]*$/.test(words[index + 1] || "")) {
        throw new Error(`Malformed disassembly after ${word}`);
      }
      instructions.push(`${word} ${words[index + 1]}`);
      index += 1;
    } else {
      instructions.push(word);
    }
  }
  if (instructions.join(" ") !== opcodes) {
    throw new Error("Opcode disassembly could not be tokenized losslessly");
  }
  return instructions;
}

function unifiedOpcodeDiff(baselineOpcodes, candidateOpcodes) {
  const baseline = opcodeInstructions(baselineOpcodes);
  const candidate = opcodeInstructions(candidateOpcodes);
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "pco-opcode-diff-")
  );
  const baselinePath = path.join(temporaryDirectory, "baseline.opcodes");
  const candidatePath = path.join(temporaryDirectory, "candidate.opcodes");
  try {
    fs.writeFileSync(baselinePath, `${baseline.join("\n")}\n`);
    fs.writeFileSync(candidatePath, `${candidate.join("\n")}\n`);
    const result = spawnSync(
      "git",
      [
        "-c",
        "core.safecrlf=false",
        "diff",
        "--no-index",
        "--no-ext-diff",
        "--no-color",
        "--text",
        "--no-renames",
        "--diff-algorithm=histogram",
        "--unified=3",
        baselinePath,
        candidatePath,
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, LC_ALL: "C" },
        maxBuffer: 128 * 1024 * 1024,
      }
    );
    if (result.error) throw result.error;
    if (![0, 1].includes(result.status)) {
      throw new Error(
        `Unable to generate Stage 8 opcode diff: ${
          result.stderr || result.stdout
        }`
      );
    }
    const changed = !valuesEqual(baseline, candidate);
    if ((result.status === 1) !== changed) {
      throw new Error("Git opcode diff status disagrees with opcode equality");
    }
    const outputLines = (result.stdout || "").split(/\r?\n/);
    const firstHunk = outputLines.findIndex((line) => line.startsWith("@@ "));
    if (changed && firstHunk < 0) {
      throw new Error("Changed opcodes produced no unified diff hunks");
    }
    const hunks =
      firstHunk < 0
        ? ""
        : `${outputLines.slice(firstHunk).join("\n").trimEnd()}\n`;
    return {
      format: "git-histogram-unified-v1",
      contextInstructions: 3,
      baselineInstructionCount: baseline.length,
      candidateInstructionCount: candidate.length,
      hunkCount: (hunks.match(/^@@ /gm) || []).length,
      hunksSha256: sha256(hunks),
      hunks,
    };
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function parseDeterministicGasSnapshot(contents, source) {
  const entries = new Map();
  for (const line of contents.split(/\r?\n/)) {
    if (!line) continue;
    const match = line.match(/^(.*) \(gas: (\d+)\)$/);
    if (!match) {
      throw new Error(
        `Non-deterministic Stage 8 gas entry in ${source}: ${line}`
      );
    }
    if (entries.has(match[1])) {
      throw new Error(`Duplicate Stage 8 gas entry in ${source}: ${match[1]}`);
    }
    entries.set(match[1], Number(match[2]));
  }
  return entries;
}

function stage08GasEvidence() {
  if (!fs.existsSync(STAGE_08_KEY_FLOW_GAS_PATH)) {
    throw new Error(
      "Stage 8 requires the checked-in Stage 7 key-flow gas baseline"
    );
  }
  const baselineBytes = fs.readFileSync(STAGE_08_KEY_FLOW_GAS_PATH);
  const baseline = parseDeterministicGasSnapshot(
    baselineBytes.toString("utf8"),
    path.relative(ROOT, STAGE_08_KEY_FLOW_GAS_PATH)
  );
  const expectedGroups = {
    PartialCommonOwnership: [...baseline.keys()]
      .filter((name) =>
        /^(?:PCOMutationParityTest|PCOReadTaxParityTest):/.test(name)
      )
      .sort(),
    Wrapper: [...baseline.keys()]
      .filter((name) => /^WrapperParityTest:/.test(name))
      .sort(),
  };
  if (
    baseline.size !== 12 ||
    expectedGroups.PartialCommonOwnership.length !== 8 ||
    expectedGroups.Wrapper.length !== 4
  ) {
    throw new Error(
      "Stage 8 gas evidence requires exactly 8 PCO and 4 Wrapper key flows"
    );
  }

  const testNames = [...baseline.keys()].map((name) => {
    const separator = name.indexOf(":");
    return name.slice(separator + 1).replace(/\(.*$/, "");
  });
  if (new Set(testNames).size !== testNames.length) {
    throw new Error("Stage 8 key-flow test names must be unique");
  }
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matchTest = `^(${testNames.map(escapeRegex).join("|")})\\(.*\\)$`;
  const outputPath = temporaryFile("stage-08-gas-snapshot.txt");
  let candidate;
  try {
    run(FORGE_BIN, [
      "snapshot",
      "--fuzz-seed",
      "0x721",
      "--match-test",
      matchTest,
      "--snap",
      outputPath,
    ]);
    candidate = parseDeterministicGasSnapshot(
      fs.readFileSync(outputPath, "utf8"),
      "Stage 8 candidate"
    );
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
  if (!valuesEqual([...candidate.keys()].sort(), [...baseline.keys()].sort())) {
    throw new Error(
      "Stage 8 candidate gas inventory differs from its baseline"
    );
  }

  const groups = {};
  const regressions = [];
  for (const [group, names] of Object.entries(expectedGroups)) {
    groups[group] = names.map((name) => {
      const baselineGas = baseline.get(name);
      const candidateGas = candidate.get(name);
      const allowedIncreaseGas = Math.floor(
        Math.max(baselineGas * 0.03, 2_000)
      );
      const maximumGas = baselineGas + allowedIncreaseGas;
      const withinLimit = candidateGas <= maximumGas;
      if (!withinLimit) {
        regressions.push(`${name}: ${baselineGas} -> ${candidateGas}`);
      }
      return {
        name,
        baselineGas,
        candidateGas,
        deltaGas: candidateGas - baselineGas,
        allowedIncreaseGas,
        maximumGas,
        withinLimit,
      };
    });
  }
  if (regressions.length > 0) {
    throw new Error(
      `Stage 8 gas regressions exceed max(3%, 2,000 gas):\n${regressions.join(
        "\n"
      )}`
    );
  }

  return sorted({
    baselinePath: path.relative(ROOT, STAGE_08_KEY_FLOW_GAS_PATH),
    baselineSha256: sha256(baselineBytes),
    fuzzSeed: "0x721",
    policy: {
      percent: 3,
      absoluteFloorGas: 2_000,
    },
    groups,
  });
}

function reviewedOpcodeEvidence(review, baseline, candidate) {
  const configuration = review.opcodeEvidence;
  if (!configuration) return null;
  if (
    !["metadata-stripped-equality", "metadata-stripped-full-diff"].includes(
      configuration.mode
    )
  ) {
    throw new Error(`Unsupported opcode evidence mode: ${configuration.mode}`);
  }
  if (
    !Array.isArray(configuration.contracts) ||
    configuration.contracts.length === 0
  ) {
    throw new Error("Opcode evidence must list at least one contract");
  }

  const contracts = {};
  for (const qualifiedName of configuration.contracts) {
    const baselineContract = baseline.contracts[qualifiedName];
    const candidateContract = candidate.contracts[qualifiedName];
    if (!baselineContract || !candidateContract) {
      throw new Error(`Opcode evidence contract is missing: ${qualifiedName}`);
    }

    const contractEvidence = {};
    for (const bytecodeKind of ["creationBytecode", "runtimeBytecode"]) {
      const baselineBytecode = baselineContract[bytecodeKind];
      const candidateBytecode = candidateContract[bytecodeKind];
      const opcodesEqual =
        baselineBytecode.metadataStrippedOpcodes ===
        candidateBytecode.metadataStrippedOpcodes;
      if (
        configuration.mode === "metadata-stripped-equality" &&
        !opcodesEqual
      ) {
        throw new Error(
          `${qualifiedName} ${bytecodeKind} has a metadata-stripped opcode change; the equality evidence cannot approve it`
        );
      }
      if (configuration.mode === "metadata-stripped-equality") {
        contractEvidence[bytecodeKind] = {
          rawKeccak256: {
            baseline: baselineBytecode.keccak256,
            candidate: candidateBytecode.keccak256,
            changed: baselineBytecode.keccak256 !== candidateBytecode.keccak256,
          },
          metadataStrippedKeccak256: {
            baseline: baselineBytecode.metadataStrippedKeccak256,
            candidate: candidateBytecode.metadataStrippedKeccak256,
            equal:
              baselineBytecode.metadataStrippedKeccak256 ===
              candidateBytecode.metadataStrippedKeccak256,
          },
          metadataStrippedSizeBytes: {
            baseline: baselineBytecode.metadataStrippedSizeBytes,
            candidate: candidateBytecode.metadataStrippedSizeBytes,
            equal:
              baselineBytecode.metadataStrippedSizeBytes ===
              candidateBytecode.metadataStrippedSizeBytes,
          },
          metadataStrippedOpcodes: {
            baselineSha256: sha256(baselineBytecode.metadataStrippedOpcodes),
            candidateSha256: sha256(candidateBytecode.metadataStrippedOpcodes),
            equal: opcodesEqual,
            diff: [],
          },
        };
      } else {
        contractEvidence[bytecodeKind] = {
          rawBytecode: {
            baselineKeccak256: baselineBytecode.keccak256,
            candidateKeccak256: candidateBytecode.keccak256,
            baselineSizeBytes: baselineBytecode.sizeBytes,
            candidateSizeBytes: candidateBytecode.sizeBytes,
            sizeDeltaBytes:
              candidateBytecode.sizeBytes - baselineBytecode.sizeBytes,
            baselineMetadataBytes: baselineBytecode.metadataBytes,
            candidateMetadataBytes: candidateBytecode.metadataBytes,
          },
          metadataStrippedBytecode: {
            baselineKeccak256: baselineBytecode.metadataStrippedKeccak256,
            candidateKeccak256: candidateBytecode.metadataStrippedKeccak256,
            baselineSizeBytes: baselineBytecode.metadataStrippedSizeBytes,
            candidateSizeBytes: candidateBytecode.metadataStrippedSizeBytes,
            sizeDeltaBytes:
              candidateBytecode.metadataStrippedSizeBytes -
              baselineBytecode.metadataStrippedSizeBytes,
          },
          metadataStrippedOpcodes: {
            baselineSha256: sha256(baselineBytecode.metadataStrippedOpcodes),
            candidateSha256: sha256(candidateBytecode.metadataStrippedOpcodes),
            equal: opcodesEqual,
            fullDiff: unifiedOpcodeDiff(
              baselineBytecode.metadataStrippedOpcodes,
              candidateBytecode.metadataStrippedOpcodes
            ),
          },
        };
      }
    }

    const baselineRuntimeSize = baselineContract.runtimeBytecode.sizeBytes;
    const candidateRuntimeSize = candidateContract.runtimeBytecode.sizeBytes;
    contractEvidence.eip170 = {
      limitBytes: 24_576,
      baselineRuntimeSizeBytes: baselineRuntimeSize,
      candidateRuntimeSizeBytes: candidateRuntimeSize,
      baselineWithinLimit: baselineRuntimeSize <= 24_576,
      candidateWithinLimit: candidateRuntimeSize <= 24_576,
    };
    contracts[qualifiedName] = contractEvidence;
  }

  const evidence = {
    schemaVersion: 1,
    candidate: review.candidate,
    baselineSha256: review.baselineSha256,
    mode: configuration.mode,
    contracts,
  };
  if (configuration.mode === "metadata-stripped-full-diff") {
    evidence.gas = stage08GasEvidence();
  }
  return sorted(evidence);
}

function opcodeEvidencePath(review) {
  if (
    !review.opcodeEvidence.path ||
    typeof review.opcodeEvidence.path !== "string"
  ) {
    throw new Error(
      "Opcode evidence configuration must name its checked-in path"
    );
  }
  const evidencePath = path.resolve(ROOT, review.opcodeEvidence.path);
  const compatibilityRoot = `${path.join(ROOT, "compatibility")}${path.sep}`;
  if (!evidencePath.startsWith(compatibilityRoot)) {
    throw new Error("Opcode evidence must be stored under compatibility/");
  }
  return evidencePath;
}

function writeOpcodeEvidence(review, baseline, candidate) {
  const evidence = reviewedOpcodeEvidence(review, baseline, candidate);
  if (!evidence) {
    throw new Error("Compatibility review does not request opcode evidence");
  }
  const evidencePath = opcodeEvidencePath(review);
  fs.writeFileSync(evidencePath, stableJson(evidence));
  return evidencePath;
}

function validateOpcodeEvidence(review, baseline, candidate) {
  const evidence = reviewedOpcodeEvidence(review, baseline, candidate);
  if (!evidence) return;
  const evidencePath = opcodeEvidencePath(review);
  if (!fs.existsSync(evidencePath)) {
    throw new Error(`Checked-in opcode evidence is missing: ${evidencePath}`);
  }
  const checkedInEvidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  if (!valuesEqual(checkedInEvidence, evidence)) {
    const evidenceDifferences = collectDifferences(checkedInEvidence, evidence);
    throw new Error(
      `Checked-in opcode evidence is stale:\n${evidenceDifferences
        .slice(0, 20)
        .map((difference) => `- ${formatDifference(difference)}`)
        .join("\n")}`
    );
  }
}

function validateSafetyEvidence(review) {
  const configuration = review.safetyEvidence;
  if (!configuration) return;

  const evidencePath = path.resolve(ROOT, configuration.path);
  const compatibilityRoot = `${path.join(ROOT, "compatibility")}${path.sep}`;
  if (!evidencePath.startsWith(compatibilityRoot)) {
    throw new Error("Safety evidence must be stored under compatibility/");
  }
  if (!fs.existsSync(evidencePath)) {
    throw new Error(`Checked-in safety evidence is missing: ${evidencePath}`);
  }

  const evidenceBytes = fs.readFileSync(evidencePath);
  const actualDigest = sha256(evidenceBytes);
  if (actualDigest !== configuration.sha256) {
    throw new Error(
      `Safety evidence digest changed: expected ${configuration.sha256}, received ${actualDigest}`
    );
  }
  const checkedInEvidence = JSON.parse(evidenceBytes);
  const expectedEvidence = stage07SafetyArtifacts();
  if (!valuesEqual(checkedInEvidence, expectedEvidence)) {
    const evidenceDifferences = collectDifferences(
      checkedInEvidence,
      expectedEvidence
    );
    throw new Error(
      `Checked-in safety evidence is stale:\n${evidenceDifferences
        .slice(0, 20)
        .map((difference) => `- ${formatDifference(difference)}`)
        .join("\n")}`
    );
  }
}

async function main() {
  const command = process.argv[2];
  if (
    ![
      "capture",
      "check",
      "diff",
      "revert-strings",
      "write-stage-08-review",
      "write-evidence",
    ].includes(command)
  ) {
    console.error(
      "Usage: node scripts/compatibility.js <capture|check|diff|revert-strings|write-stage-08-review|write-evidence>"
    );
    process.exitCode = 2;
    return;
  }

  if (command === "capture" && fs.existsSync(BASELINE_PATH)) {
    throw new Error(
      `Refusing to overwrite the compatibility baseline at ${BASELINE_PATH}`
    );
  }

  const manifest = await generateManifest();
  if (command === "revert-strings") {
    console.log(
      stableJson({
        schemaVersion: 1,
        baselineSourceCommit: BASELINE_SOURCE_COMMIT,
        entries: manifest.projectRevertStrings,
      })
    );
    return;
  }
  const protectedRevertStrings = protectedProjectRevertStrings();
  if (!valuesEqual(manifest.projectRevertStrings, protectedRevertStrings)) {
    const revertDifferences = collectDifferences(
      protectedRevertStrings,
      manifest.projectRevertStrings,
      "$.projectRevertStrings"
    );
    throw new Error(
      `Project-owned revert strings changed:\n${revertDifferences
        .slice(0, 20)
        .map((difference) => `- ${formatDifference(difference)}`)
        .join("\n")}`
    );
  }
  if (command === "capture") {
    fs.writeFileSync(BASELINE_PATH, stableJson(manifest));
    console.log(
      `Captured ${manifest.tests.hardhat.count} Hardhat and ${
        manifest.tests.forge.count
      } Forge tests in ${path.relative(ROOT, BASELINE_PATH)}`
    );
    return;
  }

  if (!fs.existsSync(BASELINE_PATH)) {
    throw new Error(
      "Compatibility baseline is missing; run the capture command once"
    );
  }
  const baselineBytes = fs.readFileSync(BASELINE_PATH);
  const baseline = JSON.parse(baselineBytes);
  if (
    baseline.projectRevertStrings &&
    !valuesEqual(baseline.projectRevertStrings, protectedRevertStrings)
  ) {
    throw new Error(
      "Compatibility baseline conflicts with the protected revert-string supplement"
    );
  }
  baseline.projectRevertStrings = protectedRevertStrings;
  const differences = collectDifferences(baseline, manifest);
  if (command === "diff") {
    console.log(
      stableJson({
        schemaVersion: 1,
        baselineSha256: sha256(baselineBytes),
        differences,
      })
    );
    return;
  }
  if (command === "write-stage-08-review") {
    const review = stage08Review(baselineBytes, differences);
    validateReviewedDifferences(review, baselineBytes, differences);
    const policy = reviewPolicy(review);
    policy.validateCandidate(baseline, manifest);
    validateSafetyEvidence(review);
    fs.writeFileSync(REVIEW_PATH, stableJson(review));
    console.log(
      `Wrote ${
        differences.length
      } exact Stage 8 reviewed differences to ${path.relative(
        ROOT,
        REVIEW_PATH
      )}`
    );
    return;
  }
  const review = readReviewedDifferences();
  if (command === "write-evidence" && !review) {
    throw new Error(
      "Cannot write evidence without an exact compatibility review"
    );
  }
  if (differences.length > 0 && !review) {
    console.error("Compatibility check failed. First differences:");
    for (const difference of differences.slice(0, 50)) {
      console.error(`- ${formatDifference(difference)}`);
    }
    process.exitCode = 1;
    return;
  }

  validateReviewedDifferences(review, baselineBytes, differences);
  if (review) {
    const policy = reviewPolicy(review);
    if (policy.validateCandidate) policy.validateCandidate(baseline, manifest);
    validateSafetyEvidence(review);
    if (command === "write-evidence") {
      const evidencePath = writeOpcodeEvidence(review, baseline, manifest);
      console.log(
        `Wrote deterministic opcode, bytecode-size, EIP-170, and gas evidence to ${path.relative(
          ROOT,
          evidencePath
        )}`
      );
      return;
    }
    validateOpcodeEvidence(review, baseline, manifest);
  }

  console.log(
    `Compatibility check passed: ${manifest.tests.hardhat.count} Hardhat + ${
      manifest.tests.forge.count
    } Forge tests${
      review
        ? `; ${differences.length} exact reviewed differences for ${review.candidate}`
        : ""
    }`
  );
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
