#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BASELINE_PATH = path.join(ROOT, "compatibility", "baseline.json");
const FORGE_BIN = process.env.FORGE_BIN || "forge";
const HARDHAT_CONFIG = path.join(
  ROOT,
  "compatibility",
  "hardhat.capture.config.ts"
);

const TARGETS = [
  ["contracts/Wrapper.sol", "Wrapper"],
  [
    "contracts/token/PartialCommonOwnership.sol",
    "PartialCommonOwnership",
  ],
  [
    "contracts/token/modules/interfaces/IBeneficiary.sol",
    "IBeneficiary",
  ],
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
      `${command} ${args.join(" ")} failed with status ${result.status}\n${output}`
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

  throw new Error("No Hardhat build-info file contains every compatibility target");
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
  return `(${(parameter.components || []).map(canonicalAbiType).join(",")})${suffix}`;
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
    if (types[normalizedId] && stableJson(types[normalizedId]) !== stableJson(normalized)) {
      throw new Error(`Storage type normalization collision for ${normalizedId}`);
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
    const name = OPCODES[opcode] || `UNKNOWN_0x${opcode.toString(16).padStart(2, "0")}`;
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
    selectorsFor(contractOutput).map((entry) => [entry.signature, entry.selector])
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
  if (!contractOutput) throw new Error(`Missing compiler output ${source}:${contractName}`);
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
    if (source !== "contracts/Wrapper.sol" && !source.startsWith("contracts/token/")) {
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
  return enums.sort((a, b) => `${a.source}:${a.name}`.localeCompare(`${b.source}:${b.name}`));
}

function xorInterfaceId(selectors) {
  let value = 0;
  for (const selector of selectors) value ^= Number.parseInt(selector.slice(2), 16);
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
    `partial-common-ownership-${process.pid}-${crypto.randomBytes(6).toString("hex")}-${name}`
  );
}

function captureHardhatTests() {
  const outputPath = temporaryFile("hardhat-tests.json");
  try {
    run(
      hardhatBinary(),
      ["--config", HARDHAT_CONFIG, "test", "--no-compile"],
      { env: { COMPAT_HARDHAT_RESULTS: outputPath } }
    );
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
  const firstJsonLine = lines.findIndex((line) => line.trimStart().startsWith("{"));
  if (firstJsonLine < 0) throw new Error("Forge did not emit JSON test discovery output");
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

  run(FORGE_BIN, ["test"]);
  return { count: names.length, names };
}

function captureGasSnapshot() {
  const outputPath = temporaryFile("gas-snapshot.txt");
  try {
    run(FORGE_BIN, [
      "snapshot",
      "--fuzz-seed",
      "0x721",
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
  ].sort((a, b) => `${a.name}:${a.interfaceId}`.localeCompare(`${b.name}:${b.interfaceId}`));

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
    baselineSourceCommit: "ca72ca7f13dd0a2103d592b39a4fcaa749e9045f",
    toolchain: {
      forge: run(FORGE_BIN, ["--version"]).stdout.trim().split(/\r?\n/),
    },
    compiler: compilerSettings(buildInfo, compilerInput),
    contracts,
    enums: enumSummary(output),
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

function collectDifferences(expected, actual, location = "$", differences = []) {
  if (differences.length >= 50) return differences;
  if (Object.is(expected, actual)) return differences;

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      differences.push(`${location}.length: ${expected.length} != ${actual.length}`);
    }
    const length = Math.min(expected.length, actual.length);
    for (let i = 0; i < length; i += 1) {
      collectDifferences(expected[i], actual[i], `${location}[${i}]`, differences);
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
      collectDifferences(expected[key], actual[key], `${location}.${key}`, differences);
    }
    return differences;
  }

  differences.push(`${location}: ${preview(expected)} != ${preview(actual)}`);
  return differences;
}

async function main() {
  const command = process.argv[2];
  if (!["capture", "check"].includes(command)) {
    console.error("Usage: node scripts/compatibility.js <capture|check>");
    process.exitCode = 2;
    return;
  }

  const manifest = await generateManifest();
  if (command === "capture") {
    fs.writeFileSync(BASELINE_PATH, stableJson(manifest));
    console.log(
      `Captured ${manifest.tests.hardhat.count} Hardhat and ${manifest.tests.forge.count} Forge tests in ${path.relative(ROOT, BASELINE_PATH)}`
    );
    return;
  }

  if (!fs.existsSync(BASELINE_PATH)) {
    throw new Error("Compatibility baseline is missing; run the capture command once");
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  const differences = collectDifferences(baseline, manifest);
  if (differences.length > 0) {
    console.error("Compatibility check failed. First differences:");
    for (const difference of differences) console.error(`- ${difference}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Compatibility check passed: ${manifest.tests.hardhat.count} Hardhat + ${manifest.tests.forge.count} Forge tests`
  );
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
