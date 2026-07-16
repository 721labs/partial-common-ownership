#!/usr/bin/env node

const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BUILD_INFO_DIRECTORY = path.join(ROOT, "artifacts", "build-info");
const ALLOWLIST_PATH = path.join(
  ROOT,
  "compatibility",
  "compiler-warning-allowlist.json"
);
const FORGE_MAX_BUFFER = 128 * 1024 * 1024;
const WARNING_KEYS = ["code", "end", "message", "source", "start"];

function walkSolidityFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  const files = [];
  for (const entry of fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSolidityFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".sol")) {
      files.push(entryPath);
    }
  }
  return files;
}

function repositoryPath(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function assertEqual(actual, expected, description) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${description} differs from the reviewed value.\nExpected: ${JSON.stringify(
        expected,
        null,
        2
      )}\nActual: ${JSON.stringify(actual, null, 2)}`
    );
  }
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function pragmaConstraint(file) {
  const source = fs.readFileSync(file, "utf8");
  const match = source.match(/^\s*pragma\s+solidity\s+([^;]+);/m);
  if (!match) {
    throw new Error(`Missing Solidity pragma: ${repositoryPath(file)}`);
  }
  return match[1].trim();
}

function verifyPragmas() {
  const productionFiles = [
    path.join(ROOT, "contracts", "Wrapper.sol"),
    ...walkSolidityFiles(path.join(ROOT, "contracts", "token")),
  ];
  const testFiles = [
    ...walkSolidityFiles(path.join(ROOT, "contracts", "test")),
    ...walkSolidityFiles(path.join(ROOT, "test", "solidity")),
  ];

  if (productionFiles.length !== 13) {
    throw new Error(
      `Expected 13 production Solidity sources; found ${productionFiles.length}. Review the compiler-warning root inventory.`
    );
  }
  if (testFiles.length === 0) {
    throw new Error("No Solidity test sources were found.");
  }

  for (const file of productionFiles) {
    const constraint = pragmaConstraint(file);
    if (constraint !== "^0.8.12") {
      throw new Error(
        `${repositoryPath(
          file
        )} must retain the compatible production pragma ^0.8.12; received ${constraint}.`
      );
    }
  }
  for (const file of testFiles) {
    const constraint = pragmaConstraint(file);
    if (constraint !== "0.8.36") {
      throw new Error(
        `${repositoryPath(
          file
        )} must use the exact test pragma 0.8.36; received ${constraint}.`
      );
    }
  }
}

function diskSourcePath(kind, source) {
  if (source === "<global>") return null;
  if (path.isAbsolute(source) || source.includes("\\")) {
    throw new Error(
      `${kind} returned an unsafe compiler source path: ${source}`
    );
  }

  let relative = source;
  if (kind === "Hardhat" && source.startsWith("@openzeppelin/")) {
    relative = path.posix.join("node_modules", source);
  }

  const allowed =
    kind === "Hardhat"
      ? ["contracts/", "node_modules/@openzeppelin/"]
      : [
          "contracts/",
          "test/solidity/",
          "lib/forge-std/",
          "node_modules/@openzeppelin/",
        ];
  if (!allowed.some((prefix) => relative.startsWith(prefix))) {
    throw new Error(
      `${kind} returned an unsupported compiler source: ${source}`
    );
  }

  const file = path.resolve(ROOT, relative);
  const relativeToRoot = path.relative(ROOT, file);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error(
      `${kind} compiler source escapes the repository: ${source}`
    );
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`${kind} compiler source is missing on disk: ${source}`);
  }
  return file;
}

function validateRange(bytes, source, start, end) {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > bytes.length
  ) {
    throw new Error(
      `Invalid compiler-warning byte range for ${source}: ${start}:${end} of ${bytes.length}.`
    );
  }
}

function warningKey(warning) {
  return JSON.stringify([
    warning.source,
    warning.start,
    warning.end,
    warning.code,
    warning.message,
  ]);
}

function compareWarnings(left, right) {
  return warningKey(left).localeCompare(warningKey(right));
}

function assertUniqueWarnings(warnings, description) {
  const keys = warnings.map(warningKey);
  if (new Set(keys).size !== keys.length) {
    throw new Error(`${description} contains duplicate compiler warnings.`);
  }
}

function validateExpectedWarnings(section, description) {
  if (!Array.isArray(section.warnings) || section.warnings.length === 0) {
    throw new Error(`${description} warning inventory is missing.`);
  }
  if (
    !section.sourceSha256 ||
    typeof section.sourceSha256 !== "object" ||
    Array.isArray(section.sourceSha256)
  ) {
    throw new Error(`${description} warning-source hashes are missing.`);
  }

  for (const warning of section.warnings) {
    assertEqual(
      Object.keys(warning).sort(),
      WARNING_KEYS,
      `${description} warning schema`
    );
    if (
      typeof warning.code !== "string" ||
      typeof warning.source !== "string" ||
      typeof warning.message !== "string"
    ) {
      throw new Error(`${description} warning fields must be strings.`);
    }
  }
  assertUniqueWarnings(section.warnings, `${description} allowlist`);

  const warningSources = [
    ...new Set(
      section.warnings
        .map((warning) => warning.source)
        .filter((source) => source !== "<global>")
    ),
  ].sort();
  assertEqual(
    Object.keys(section.sourceSha256).sort(),
    warningSources,
    `${description} warning-source hash inventory`
  );
  for (const [source, hash] of Object.entries(section.sourceSha256)) {
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      throw new Error(`${description} has an invalid SHA-256 for ${source}.`);
    }
  }
}

function normalizeWarnings(
  diagnostics,
  section,
  diagnosticShape,
  sourceBytes,
  description
) {
  const warnings = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning"
  );

  const normalized = warnings.map((warning) => {
    assertEqual(
      {
        component: warning.component,
        severity: warning.severity,
        type: warning.type,
      },
      diagnosticShape,
      `${description} diagnostic shape`
    );

    const source = warning.sourceLocation?.file || "<global>";
    const start = warning.sourceLocation?.start ?? null;
    const end = warning.sourceLocation?.end ?? null;
    if (source !== "<global>") {
      const bytes = sourceBytes(source);
      validateRange(bytes, source, start, end);
      const expectedHash = section.sourceSha256[source];
      if (!expectedHash) {
        throw new Error(
          `${description} emitted a warning from an unreviewed source: ${source}.`
        );
      }
      assertEqual(
        sha256(bytes),
        expectedHash,
        `${description} warning-source bytes for ${source}`
      );
    } else if (start !== null || end !== null) {
      throw new Error(`${description} returned a ranged global warning.`);
    }

    return {
      code: String(warning.errorCode || ""),
      source,
      start,
      end,
      message: String(warning.message || ""),
    };
  });

  assertUniqueWarnings(normalized, `${description} output`);
  const expected = [...section.warnings].sort(compareWarnings);
  const actual = normalized.sort(compareWarnings);
  assertEqual(actual, expected, `${description} compiler-warning inventory`);
  return actual.length;
}

function hardhatSourceBytes(buildInfo, source) {
  const content = buildInfo.input?.sources?.[source]?.content;
  if (typeof content !== "string") {
    throw new Error(
      `Hardhat build input is missing source bytes for ${source}.`
    );
  }
  const bytes = Buffer.from(content, "utf8");
  const file = diskSourcePath("Hardhat", source);
  assertEqual(
    bytes.toString("hex"),
    fs.readFileSync(file).toString("hex"),
    `Hardhat build input source bytes for ${source}`
  );
  return bytes;
}

function loadHardhatBuildInfo(allowlist) {
  if (!fs.existsSync(BUILD_INFO_DIRECTORY)) {
    throw new Error(
      "Hardhat build info is missing. Run a forced Hardhat compile before checking compiler warnings."
    );
  }

  const candidates = fs
    .readdirSync(BUILD_INFO_DIRECTORY)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const value = JSON.parse(
        fs.readFileSync(path.join(BUILD_INFO_DIRECTORY, file), "utf8")
      );
      return { file, value };
    })
    .filter(
      ({ value }) =>
        value.solcVersion === allowlist.compiler.version &&
        value.solcLongVersion === allowlist.compiler.longVersion &&
        Object.keys(value.input?.sources || {}).every((source) => {
          try {
            hardhatSourceBytes(value, source);
            return true;
          } catch (_) {
            return false;
          }
        })
    );

  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one complete Hardhat ${allowlist.compiler.longVersion} build-info file; found ${candidates.length}. Run a clean, forced Hardhat compile.`
    );
  }
  return candidates[0].value;
}

function runHardhatGate(allowlist) {
  const installedVersion = require(path.join(
    ROOT,
    "node_modules",
    "hardhat",
    "package.json"
  )).version;
  assertEqual(
    installedVersion,
    allowlist.tools.hardhat.version,
    "Hardhat version"
  );

  const buildInfo = loadHardhatBuildInfo(allowlist);
  assertEqual(
    buildInfo.input.settings,
    allowlist.hardhat.settings,
    "Hardhat compiler settings"
  );
  for (const source of Object.keys(buildInfo.input.sources)) {
    hardhatSourceBytes(buildInfo, source);
  }

  const warningCount = normalizeWarnings(
    buildInfo.output.errors || [],
    allowlist.hardhat,
    allowlist.diagnostic,
    (source) => hardhatSourceBytes(buildInfo, source),
    "Hardhat"
  );
  console.log(
    `Hardhat compiler-warning gate passed: Hardhat ${installedVersion}, Solidity ${allowlist.compiler.version}, ${warningCount} exact warnings.`
  );
}

function runForge(args, description) {
  const result = childProcess.spawnSync("forge", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: FORGE_MAX_BUFFER,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${description} failed with exit code ${result.status}.\n${result.stderr}`
    );
  }
  return result;
}

function parseJson(text, description) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${description} did not return valid JSON: ${error.message}`
    );
  }
}

function forgeCompilerSettings(config) {
  return {
    roots: {
      src: config.src,
      test: config.test,
      libs: config.libs,
    },
    solc: config.solc,
    autoDetectSolc: config.auto_detect_solc,
    autoDetectRemappings: config.auto_detect_remappings,
    evmVersion: config.evm_version,
    optimizer: {
      enabled: config.optimizer,
      runs: config.optimizer_runs,
      details: config.optimizer_details,
    },
    viaIR: config.via_ir,
    metadata: {
      bytecodeHash: config.bytecode_hash,
      cbor: config.cbor_metadata,
      useLiteralContent: config.use_literal_content,
    },
    remappings: [...config.remappings].sort(),
    libraries: config.libraries,
    ignoredErrorCodes: config.ignored_error_codes,
    ignoredErrorCodesFrom: config.ignored_error_codes_from,
    ignoredWarningsFrom: config.ignored_warnings_from,
    modelChecker: config.model_checker,
    revertStrings: config.revert_strings,
    sparseMode: config.sparse_mode,
    additionalCompilerProfiles: config.additional_compiler_profiles,
    compilationRestrictions: config.compilation_restrictions,
  };
}

function forgeMetadataSettings(settings) {
  return {
    evmVersion: settings.evmVersion,
    optimizer: settings.optimizer,
    viaIR: settings.viaIR ?? false,
    metadata: settings.metadata,
    libraries: settings.libraries,
    remappings: [...settings.remappings].sort(),
  };
}

function validateForgeVersion(output, expected) {
  const match = output.match(
    /^forge Version: ([^\n]+)\nCommit SHA: ([0-9a-f]{40})\nBuild Timestamp: [^\n]+\nBuild Profile: ([^\n]+)$/m
  );
  if (!match) {
    throw new Error(`Unexpected forge --version output:\n${output}`);
  }
  assertEqual(
    {
      version: match[1],
      commitSha: match[2],
      buildProfile: match[3],
    },
    expected,
    "Forge version"
  );
}

function validateForgeBuild(output, allowlist) {
  if (!Array.isArray(output.build_infos) || output.build_infos.length !== 1) {
    throw new Error(
      `Expected exactly one Forge build info; found ${output.build_infos?.length}.`
    );
  }
  const buildInfo = output.build_infos[0];
  const compiledSources = Object.values(buildInfo.source_id_to_path || {});
  if (new Set(compiledSources).size !== compiledSources.length) {
    throw new Error("Forge build info contains duplicate compiler sources.");
  }

  const profile = allowlist.forge.compilerProfile;
  let artifactCount = 0;
  for (const contracts of Object.values(output.contracts || {})) {
    for (const builds of Object.values(contracts)) {
      if (!Array.isArray(builds) || builds.length !== 1) {
        throw new Error("Forge returned an ambiguous contract build.");
      }
      const build = builds[0];
      artifactCount += 1;
      assertEqual(
        build.version,
        allowlist.compiler.version,
        "Forge artifact solc"
      );
      assertEqual(build.build_id, buildInfo.id, "Forge artifact build ID");
      assertEqual(build.profile, profile, "Forge artifact profile");

      const metadata = parseJson(
        build.contract?.metadata,
        "Forge contract metadata"
      );
      assertEqual(
        metadata.compiler?.version,
        allowlist.compiler.longVersion,
        "Forge metadata compiler"
      );
      assertEqual(
        forgeMetadataSettings(metadata.settings),
        allowlist.forge.metadataSettings,
        "Forge metadata compiler settings"
      );
    }
  }
  if (artifactCount === 0) {
    throw new Error("Forge returned no compiled contract artifacts.");
  }

  for (const source of compiledSources) {
    const absolute = path.resolve(ROOT, source);
    const builds = output.sources?.[absolute];
    if (!Array.isArray(builds) || builds.length !== 1) {
      throw new Error(
        `Forge output is missing compiled source data for ${source}.`
      );
    }
    assertEqual(
      builds[0].version,
      allowlist.compiler.version,
      "Forge source solc"
    );
    assertEqual(builds[0].build_id, buildInfo.id, "Forge source build ID");
    assertEqual(builds[0].profile, profile, "Forge source profile");
  }

  return new Set(compiledSources);
}

function validateForgeStderr(stderr) {
  const lines = stderr.split("\n").filter((line) => line.trim() !== "");
  for (const line of lines) {
    const diagnostic = parseJson(line, "Forge stderr diagnostic");
    if (
      diagnostic.$message_type !== "diagnostic" ||
      typeof diagnostic.code?.code !== "string"
    ) {
      throw new Error(
        "Forge stderr contained output other than a structured Forge lint diagnostic."
      );
    }
  }
  return lines.length;
}

function runForgeGate(allowlist) {
  const version = runForge(["--version"], "forge --version");
  validateForgeVersion(version.stdout.trim(), allowlist.tools.forge);

  const configResult = runForge(["config", "--json"], "forge config");
  const config = parseJson(configResult.stdout, "forge config");
  assertEqual(
    forgeCompilerSettings(config),
    allowlist.forge.settings,
    "Forge compiler settings"
  );

  const buildResult = runForge(
    ["build", "--force", "--json"],
    "forge build --force --json"
  );
  const output = parseJson(buildResult.stdout, "forge build --force --json");
  const compiledSources = validateForgeBuild(output, allowlist);
  const lintDiagnosticCount = validateForgeStderr(buildResult.stderr);

  const diagnostics = output.errors || [];
  if (!Array.isArray(diagnostics)) {
    throw new Error("Forge compiler diagnostics are missing.");
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity !== "warning")) {
    throw new Error("Forge compiler output contains a non-warning diagnostic.");
  }
  for (const warning of diagnostics) {
    const source = warning.sourceLocation?.file;
    if (source && !compiledSources.has(source)) {
      throw new Error(
        `Forge compiler warning source is absent from build info: ${source}.`
      );
    }
  }

  const warningCount = normalizeWarnings(
    diagnostics,
    allowlist.forge,
    allowlist.diagnostic,
    (source) => fs.readFileSync(diskSourcePath("Forge", source)),
    "Forge"
  );
  console.log(
    `Forge compiler-warning gate passed: Forge ${allowlist.tools.forge.version}, Solidity ${allowlist.compiler.version}, ${warningCount} exact compiler warnings; ${lintDiagnosticCount} separate Forge lint diagnostics excluded.`
  );
}

function loadAllowlist() {
  const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8"));
  if (
    allowlist.schemaVersion !== 2 ||
    !allowlist.compiler ||
    !allowlist.diagnostic ||
    !allowlist.tools?.hardhat ||
    !allowlist.tools?.forge ||
    !allowlist.hardhat ||
    !allowlist.forge ||
    typeof allowlist.forge.compilerProfile !== "string"
  ) {
    throw new Error("Compiler-warning allowlist has an invalid schema.");
  }
  validateExpectedWarnings(allowlist.hardhat, "Hardhat");
  validateExpectedWarnings(allowlist.forge, "Forge");
  return allowlist;
}

function main() {
  const target = process.argv[2];
  if (target !== "hardhat" && target !== "forge") {
    throw new Error(
      "Usage: node scripts/check-compiler-warnings.js <hardhat|forge>"
    );
  }

  const allowlist = loadAllowlist();
  verifyPragmas();
  if (target === "hardhat") {
    runHardhatGate(allowlist);
  } else {
    runForgeGate(allowlist);
  }
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
