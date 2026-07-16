const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createRequire } = require("module");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PACKAGE_NAME = "@721labs/partial-common-ownership";
const PNPM_VERSION = "11.13.1";
const HARDHAT_VERSION = "2.28.6";
const FOUNDRY_VERSION = "1.7.1";
const SOLC_VERSION = "0.8.36";
const OPENZEPPELIN_VERSION = "5.6.1";
const PRODUCTION_PRAGMA = "^0.8.20";
const PRODUCTION_SOURCE_COUNT = 13;

const pnpm =
  process.env.PNPM_BIN || (process.platform === "win32" ? "pnpm.cmd" : "pnpm");
const forge =
  process.env.FORGE_BIN ||
  (process.platform === "win32" ? "forge.exe" : "forge");

function run(command, args, options = {}) {
  const capture = options.capture === true;
  const result = spawnSync(command, args, {
    cwd: options.cwd || PROJECT_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "true",
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
      ...options.env,
    },
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.error) {
    throw new Error(
      `Unable to run ${command} ${args.join(" ")}: ${result.error.message}`
    );
  }

  if (result.status !== 0) {
    const details = capture
      ? `\n${[result.stdout, result.stderr].filter(Boolean).join("\n").trim()}`
      : "";
    throw new Error(
      `${command} ${args.join(" ")} exited with status ${
        result.status
      }.${details}`
    );
  }

  return capture ? result.stdout.trim() : "";
}

function writeFile(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents.endsWith("\n") ? contents : `${contents}\n`);
}

function writeJson(file, value) {
  writeFile(file, JSON.stringify(value, null, 2));
}

function listFiles(root, filter = () => true) {
  if (!fs.existsSync(root)) {
    throw new Error(`Required package path is missing: ${root}`);
  }

  const files = [];
  const visit = (directory) => {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(
          `Package inputs may not be symbolic links: ${absolute}`
        );
      }
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile() && filter(absolute)) {
        files.push(absolute);
      }
    }
  };

  visit(root);
  return files;
}

function projectRelative(file) {
  return path.relative(PROJECT_ROOT, file).split(path.sep).join("/");
}

function solidityPragma(file) {
  const source = fs.readFileSync(file, "utf8");
  const match = source.match(/^\s*pragma\s+solidity\s+([^;]+);/m);
  if (!match) {
    throw new Error(`Packed Solidity source has no pragma: ${file}`);
  }
  return match[1].trim();
}

function expectedPackageFiles() {
  const required = [
    "contracts/Wrapper.sol",
    "README.md",
    "LICENSE",
    "package.json",
  ];
  for (const file of required) {
    if (!fs.statSync(path.join(PROJECT_ROOT, file)).isFile()) {
      throw new Error(`Required package file is missing: ${file}`);
    }
  }

  const tokenFiles = listFiles(
    path.join(PROJECT_ROOT, "contracts", "token"),
    (file) => file.endsWith(".sol")
  ).map(projectRelative);
  const docs = listFiles(path.join(PROJECT_ROOT, "docs")).map(projectRelative);

  if (tokenFiles.length === 0) {
    throw new Error("No production contracts/token Solidity files were found.");
  }
  if (docs.length === 0) {
    throw new Error("No documentation files were found.");
  }

  return [...new Set([...required, ...tokenFiles, ...docs])].sort();
}

function inspectTarball(tarball, extractionDirectory) {
  const listing = run("tar", ["-tzf", tarball], { capture: true });
  const entries = listing.split(/\r?\n/).filter(Boolean);
  const actual = [];
  const seen = new Set();

  for (const entry of entries) {
    if (!entry.startsWith("package/")) {
      throw new Error(`Tarball entry is outside package/: ${entry}`);
    }
    if (entry.endsWith("/")) continue;

    const relative = entry.slice("package/".length);
    if (!relative || relative.includes("..") || path.isAbsolute(relative)) {
      throw new Error(`Unsafe tarball entry: ${entry}`);
    }
    if (seen.has(relative)) {
      throw new Error(`Duplicate tarball entry: ${relative}`);
    }
    seen.add(relative);
    actual.push(relative);
  }

  const expected = expectedPackageFiles();
  actual.sort();

  const missing = expected.filter((file) => !seen.has(file));
  const unexpected = actual.filter((file) => !expected.includes(file));
  if (missing.length || unexpected.length) {
    const messages = ["Packed tarball contents do not match the allowlist."];
    if (missing.length) messages.push(`Missing: ${missing.join(", ")}`);
    if (unexpected.length) {
      messages.push(`Unexpected: ${unexpected.join(", ")}`);
    }
    throw new Error(messages.join("\n"));
  }

  const forbidden = actual.filter(
    (file) =>
      /(^|\/)(test|tests|fixtures?|artifacts?|cache(?:-hh)?|out|lib|scripts)(\/|$)/.test(
        file
      ) ||
      /(^|\/).*\.t\.sol$/.test(file) ||
      /(^|\/)(foundry\.toml|hardhat\.config\.[^/]+|remappings\.txt|pnpm-lock\.yaml|yarn\.lock)$/.test(
        file
      )
  );
  if (forbidden.length) {
    throw new Error(`Forbidden package entries: ${forbidden.join(", ")}`);
  }

  fs.mkdirSync(extractionDirectory, { recursive: true });
  run("tar", ["-xzf", tarball, "-C", extractionDirectory]);

  const packedRoot = path.join(extractionDirectory, "package");
  const productionSources = actual.filter(
    (file) =>
      file === "contracts/Wrapper.sol" ||
      /^contracts\/token\/.+\.sol$/.test(file)
  );
  if (productionSources.length !== PRODUCTION_SOURCE_COUNT) {
    throw new Error(
      `Packed package must contain exactly ${PRODUCTION_SOURCE_COUNT} production Solidity sources; found ${productionSources.length}.`
    );
  }
  for (const source of productionSources) {
    const pragma = solidityPragma(path.join(packedRoot, source));
    if (pragma !== PRODUCTION_PRAGMA) {
      throw new Error(
        `Packed production source ${source} must use pragma ${PRODUCTION_PRAGMA}; received ${pragma}.`
      );
    }
  }

  const packedManifest = JSON.parse(
    fs.readFileSync(path.join(packedRoot, "package.json"), "utf8")
  );
  if (packedManifest.name !== PACKAGE_NAME) {
    throw new Error(
      `Packed package name is ${packedManifest.name}; expected ${PACKAGE_NAME}.`
    );
  }

  const installScripts = ["preinstall", "install", "postinstall"].filter(
    (script) => packedManifest.scripts && packedManifest.scripts[script]
  );
  if (installScripts.length) {
    throw new Error(
      `Packed package must not run consumer install scripts: ${installScripts.join(
        ", "
      )}`
    );
  }

  const openZeppelinVersion =
    packedManifest.dependencies &&
    packedManifest.dependencies["@openzeppelin/contracts"];
  if (openZeppelinVersion !== OPENZEPPELIN_VERSION) {
    throw new Error(
      `@openzeppelin/contracts must be the exact regular dependency ${OPENZEPPELIN_VERSION} in the packed package; received ${
        openZeppelinVersion || "<missing>"
      }.`
    );
  }
  const duplicateDependencySections = [
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ].filter(
    (section) =>
      packedManifest[section] &&
      packedManifest[section]["@openzeppelin/contracts"]
  );
  if (duplicateDependencySections.length) {
    throw new Error(
      `@openzeppelin/contracts must have one canonical declaration, not duplicates in ${duplicateDependencySections.join(
        ", "
      )}.`
    );
  }

  return {
    fileCount: actual.length,
    openZeppelinVersion,
    productionSourceCount: productionSources.length,
    productionPragma: PRODUCTION_PRAGMA,
  };
}

function consumerSource() {
  return `// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Wrapper} from "${PACKAGE_NAME}/contracts/Wrapper.sol";
import {PartialCommonOwnership} from "${PACKAGE_NAME}/contracts/token/PartialCommonOwnership.sol";

contract ConsumerWrapper is Wrapper {}

contract ConsumerPCO is PartialCommonOwnership {
  function mintForConsumer(
    uint256 tokenId_,
    address owner_,
    address payable beneficiary_
  ) external payable {
    _mint(
      tokenId_,
      owner_,
      msg.value,
      1 ether,
      beneficiary_,
      1,
      1 days
    );
  }
}`;
}

function prepareCleanConsumer(
  directory,
  tarball,
  manifest,
  workspaceConfiguration = ""
) {
  fs.mkdirSync(directory, { recursive: true });
  fs.copyFileSync(tarball, path.join(directory, "package.tgz"));
  writeJson(path.join(directory, "package.json"), manifest);
  if (workspaceConfiguration) {
    writeFile(
      path.join(directory, "pnpm-workspace.yaml"),
      workspaceConfiguration
    );
  }

  run(pnpm, ["install", "--lockfile-only", "--ignore-scripts"], {
    cwd: directory,
  });

  // The compile is deliberately performed after a fresh, frozen install.
  fs.rmSync(path.join(directory, "node_modules"), {
    recursive: true,
    force: true,
  });
  run(pnpm, ["install", "--frozen-lockfile"], { cwd: directory });
}

function assertArtifacts(directory, relativePaths, tool) {
  const missing = relativePaths.filter(
    (relative) => !fs.existsSync(path.join(directory, relative))
  );
  if (missing.length) {
    throw new Error(
      `${tool} did not produce expected consumer artifacts: ${missing.join(
        ", "
      )}`
    );
  }
}

function buildHardhatConsumer(directory, tarball) {
  prepareCleanConsumer(
    directory,
    tarball,
    {
      name: "pco-hardhat-package-consumer",
      version: "0.0.0",
      private: true,
      packageManager: `pnpm@${PNPM_VERSION}`,
      dependencies: {
        [PACKAGE_NAME]: "file:./package.tgz",
      },
      devDependencies: {
        hardhat: HARDHAT_VERSION,
      },
    },
    // Hardhat 2 resolves Solidity libraries from the project root, so expose
    // only the package's declared OpenZeppelin dependency there. Its legacy
    // keccak dependency has a JS fallback and does not need a native build.
    `publicHoistPattern:
  - "@openzeppelin/contracts"
allowBuilds:
  keccak@3.0.4: false`
  );

  writeFile(
    path.join(directory, "contracts", "Consumer.sol"),
    consumerSource()
  );
  writeFile(
    path.join(directory, "hardhat.config.cjs"),
    `module.exports = {
  solidity: {
    version: "${SOLC_VERSION}",
    settings: {
      evmVersion: "london",
      optimizer: { enabled: false, runs: 200 },
      viaIR: false,
      metadata: { bytecodeHash: "ipfs", useLiteralContent: false }
    }
  },
  paths: {
    sources: "./contracts",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};`
  );

  run(pnpm, ["exec", "hardhat", "compile"], { cwd: directory });
  assertArtifacts(
    directory,
    [
      "artifacts/contracts/Consumer.sol/ConsumerWrapper.json",
      "artifacts/contracts/Consumer.sol/ConsumerPCO.json",
    ],
    "Hardhat"
  );
}

function resolveInstalledPackage(fromDirectory, packageName) {
  const resolver = createRequire(path.join(fromDirectory, "package.json"));
  return path.dirname(resolver.resolve(`${packageName}/package.json`));
}

function tomlString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildForgeConsumer(directory, tarball) {
  prepareCleanConsumer(directory, tarball, {
    name: "pco-forge-package-consumer",
    version: "0.0.0",
    private: true,
    packageManager: `pnpm@${PNPM_VERSION}`,
    dependencies: {
      [PACKAGE_NAME]: "file:./package.tgz",
    },
  });

  const packageRoot = resolveInstalledPackage(directory, PACKAGE_NAME);
  const openZeppelinRoot = resolveInstalledPackage(
    packageRoot,
    "@openzeppelin/contracts"
  );

  writeFile(path.join(directory, "src", "Consumer.sol"), consumerSource());
  writeFile(
    path.join(directory, "foundry.toml"),
    `[profile.default]
src = "src"
out = "out"
libs = ["node_modules"]
solc_version = "${SOLC_VERSION}"
auto_detect_solc = false
auto_detect_remappings = false
evm_version = "london"
optimizer = false
optimizer_runs = 200
via_ir = false
bytecode_hash = "ipfs"
cbor_metadata = true
use_literal_content = false
remappings = [
  "${PACKAGE_NAME}/=${tomlString(packageRoot)}/",
  "@openzeppelin/=${tomlString(path.dirname(openZeppelinRoot))}/"
]`
  );

  run(forge, ["build", "--root", directory], {
    cwd: directory,
    env: { FOUNDRY_DISABLE_NIGHTLY_WARNING: "1" },
  });
  assertArtifacts(
    directory,
    [
      "out/Consumer.sol/ConsumerWrapper.json",
      "out/Consumer.sol/ConsumerPCO.json",
    ],
    "Forge"
  );
}

function verifyToolVersions() {
  const actualPnpmVersion = run(pnpm, ["--version"], { capture: true });
  if (actualPnpmVersion !== PNPM_VERSION) {
    throw new Error(
      `pnpm ${PNPM_VERSION} is required; found ${actualPnpmVersion}.`
    );
  }

  const actualForgeVersion = run(forge, ["--version"], { capture: true });
  if (
    !new RegExp(`\\b${FOUNDRY_VERSION.replace(/\./g, "\\.")}\\b`).test(
      actualForgeVersion
    )
  ) {
    throw new Error(
      `Forge ${FOUNDRY_VERSION} is required; found ${actualForgeVersion}. Set FORGE_BIN to the pinned binary.`
    );
  }
}

function main() {
  verifyToolVersions();
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "partial-common-ownership-package-")
  );
  let preserveTemporaryRoot = process.env.KEEP_PACKAGE_TEST_TEMP === "1";

  try {
    const packDirectory = path.join(temporaryRoot, "pack");
    fs.mkdirSync(packDirectory, { recursive: true });
    run(pnpm, ["pack", "--pack-destination", packDirectory], {
      cwd: PROJECT_ROOT,
    });

    const tarballs = fs
      .readdirSync(packDirectory)
      .filter((file) => file.endsWith(".tgz"));
    if (tarballs.length !== 1) {
      throw new Error(
        `Expected pnpm pack to create one tarball; found ${tarballs.length}.`
      );
    }
    const tarball = path.join(packDirectory, tarballs[0]);
    const packageResult = inspectTarball(
      tarball,
      path.join(temporaryRoot, "unpacked")
    );

    buildHardhatConsumer(path.join(temporaryRoot, "hardhat-consumer"), tarball);
    buildForgeConsumer(path.join(temporaryRoot, "forge-consumer"), tarball);

    console.log(
      `Package gate passed: ${packageResult.fileCount} allowlisted files, ${packageResult.productionSourceCount} production sources at ${packageResult.productionPragma}, OpenZeppelin ${packageResult.openZeppelinVersion}, Hardhat ${HARDHAT_VERSION}, and Forge ${FOUNDRY_VERSION}.`
    );
  } catch (error) {
    if (process.env.KEEP_PACKAGE_TEST_TEMP === "1") {
      console.error(`Package test files retained at ${temporaryRoot}`);
    }
    throw error;
  } finally {
    if (!preserveTemporaryRoot) {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
