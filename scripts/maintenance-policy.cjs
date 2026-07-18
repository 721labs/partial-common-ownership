#!/usr/bin/env node

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const STAGE_13_ANCHOR = Object.freeze({
  commit: "26e1082a21e2ef184253542c1bc8c10b87924d53",
  files: Object.freeze({
    "compatibility/baseline.json":
      "4ec069e1cdb046198456b1db9179522b604d8dab062838c79e4cf8aa1e9df55c",
    "compatibility/evidence/stage-13-ci-security-maintenance.json":
      "c7df59ea50e3a374723dd44cd061dc4b9ddd2722d3f3c8f67f8a437b702b5d07",
    "compatibility/reviewed-differences.json":
      "d2cf786e11a28d1a2e661087c2ff4db7bb3accde6302f0e4fa46b550d0032123",
    "compatibility/stage-13-ci-maintenance-inventory.json":
      "1ddf58ff2c58832c82c903b71180add027a18598633f9e39d81e5dffb5f9d420",
    "scripts/check-ci-policy.cjs":
      "007bf6e8b21f1939b1c54c2f032645988dc32c597bcc6b95101514956f805b1c",
    "scripts/check-parity.cjs":
      "7a5cf2140d8fa5e246a064f2dbc69b69ad0353aa1b7fb9ad1653907355222df1",
    "scripts/compatibility.cjs":
      "58f4f84f1fd8b8ab54d98d6c7f8d9364d45fca4dabc3c40382729d1050f4d8ff",
  }),
});

const IMMUTABLE_STAGE_13_FILES = Object.freeze([
  "compatibility/baseline.json",
  "compatibility/evidence/stage-13-ci-security-maintenance.json",
  "compatibility/stage-13-ci-maintenance-inventory.json",
]);

const LEGACY_MANAGED_FILES = Object.freeze([
  ".github/dependabot.yml",
  ".github/workflows/tests.yml",
  ".gitmodules",
  ".nvmrc",
  "compatibility/audit-ratchet.json",
  "compatibility/baseline.json",
  "compatibility/compiler-warning-allowlist.json",
  "compatibility/evidence/stage-13-ci-security-maintenance.json",
  "compatibility/forge-lint-allowlist.json",
  "compatibility/reviewed-differences.json",
  "compatibility/safety-baselines.json",
  "compatibility/safety-test-inventory.json",
  "compatibility/stage-13-ci-maintenance-inventory.json",
  "coverage/lcov.info",
  "docs/development.md",
  "foundry.toml",
  "gas/key-flows.snap",
  "hardhat.config.ts",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "remappings.txt",
  "scripts/audit-ratchet.cjs",
  "scripts/check-ci-policy.cjs",
  "scripts/check-compiler-warnings.cjs",
  "scripts/check-contract-sizes.cjs",
  "scripts/check-coverage.cjs",
  "scripts/check-forge-lint.cjs",
  "scripts/check-gas.cjs",
  "scripts/check-parity.cjs",
  "scripts/check-safety-baselines.cjs",
  "scripts/compatibility.cjs",
  "scripts/dependency-inventory.cjs",
  "scripts/install.sh",
  "scripts/maintenance-policy.cjs",
  "scripts/run-coverage.cjs",
  "scripts/run-slither.cjs",
  "scripts/test-package.cjs",
  "slither.config.json",
  "tsconfig.json",
]);

const FOUNDRY_RETIREMENT_TOMBSTONES = Object.freeze([
  ".vscode/launch.json",
  "compatibility/erc165.capture.ts",
  "hardhat.config.ts",
  "pnpm-workspace.yaml",
  "tests/Interoperability.smoke.ts",
  "tsconfig.json",
]);

const FOUNDRY_RETIREMENT_MANAGED_FILES = Object.freeze(
  [
    ...LEGACY_MANAGED_FILES,
    ...FOUNDRY_RETIREMENT_TOMBSTONES,
    ".gitignore",
    "compatibility/README.md",
    "compatibility/evidence/stage-14-foundry-retirement.json",
    "compatibility/interoperability-smoke-parity.json",
    "compatibility/stage-14-foundry-retirement-inventory.json",
    "docs/security/custom-erc721-vs-openzeppelin-5.6.1.md",
    "test/solidity/parity/PCOMutationParity.t.sol",
    "test/solidity/parity/PCOReadTaxParity.t.sol",
    "test/solidity/parity/WrapperParity.t.sol",
  ].filter((relativePath, index, paths) => paths.indexOf(relativePath) === index).sort()
);

const MANAGED_FILES_BY_STATE = Object.freeze({
  1: LEGACY_MANAGED_FILES,
  2: FOUNDRY_RETIREMENT_MANAGED_FILES,
});

// Export the post-retirement scope for consumers that need the complete policy
// inventory. Ledger validation selects the version belonging to each record.
const MANAGED_FILES = FOUNDRY_RETIREMENT_MANAGED_FILES;

const BOOTSTRAP_CHANGED_FILES = Object.freeze([
  ".github/workflows/tests.yml",
  "scripts/check-ci-policy.cjs",
  "scripts/check-parity.cjs",
  "scripts/compatibility.cjs",
  "scripts/maintenance-policy.cjs",
]);

const LEGACY_EXPECTED_ACTION_COUNTS = Object.freeze({
  "actions/cache": 10,
  "actions/checkout": 10,
  "actions/setup-node": 10,
  "actions/setup-python": 1,
  "actions/upload-artifact": 1,
  "foundry-rs/foundry-toolchain": 7,
});

const FOUNDRY_RETIREMENT_EXPECTED_ACTION_COUNTS = Object.freeze({
  "actions/cache": 9,
  "actions/checkout": 9,
  "actions/setup-node": 9,
  "actions/setup-python": 1,
  "actions/upload-artifact": 1,
  "foundry-rs/foundry-toolchain": 7,
});

const ACTION_COUNTS_BY_STATE = Object.freeze({
  1: LEGACY_EXPECTED_ACTION_COUNTS,
  2: FOUNDRY_RETIREMENT_EXPECTED_ACTION_COUNTS,
});

const FOUNDRY_RETIREMENT_DEV_DEPENDENCIES = Object.freeze({
  "@nomicfoundation/hardhat-ethers": "4.0.15",
  "@types/node": "24.13.3",
  ethers: "6.17.0",
  hardhat: "3.10.0",
  tsx: "4.23.1",
  typescript: "7.0.2",
});

const FOUNDRY_RETIREMENT_SCRIPT_TRANSITIONS = Object.freeze([
  Object.freeze({ from: "hardhat console", name: "console", to: null }),
  Object.freeze({ from: "hardhat build", name: "compile", to: "forge build" }),
  Object.freeze({
    from: "hardhat build --force && node scripts/check-compiler-warnings.cjs hardhat",
    name: "compiler-warnings:hardhat",
    to: null,
  }),
  Object.freeze({
    from: "pnpm run compiler-warnings:hardhat && pnpm run compiler-warnings:forge",
    name: "compiler-warnings:check",
    to: "pnpm run compiler-warnings:forge",
  }),
  Object.freeze({
    from: "pnpm run test:hardhat:smoke",
    name: "test:hardhat",
    to: null,
  }),
  Object.freeze({
    from: "hardhat build && node --import tsx --test tests/Interoperability.smoke.ts",
    name: "test:hardhat:smoke",
    to: null,
  }),
  Object.freeze({
    from: "pnpm run test:forge && pnpm run test:hardhat:smoke",
    name: "test",
    to: "pnpm run test:forge",
  }),
  Object.freeze({ from: "tsc --noEmit", name: "typecheck", to: null }),
]);

const FOUNDRY_RETIREMENT_ACTION_TRANSITIONS = Object.freeze({
  "actions/cache": Object.freeze({ from: 10, to: 9 }),
  "actions/checkout": Object.freeze({ from: 10, to: 9 }),
  "actions/setup-node": Object.freeze({ from: 10, to: 9 }),
});

const FOUNDRY_RETIREMENT_SECURITY_OVERRIDE = Object.freeze({
  advisory: "GHSA-xcpc-8h2w-3j85",
  name: "adm-zip",
  version: "0.6.0",
});

const RECORD_DIRECTORY = "compatibility/maintenance";
const RECORD_NAME = /^([0-9]{4})-([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;
const EXACT_SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/;
const EXACT_ACTION_TAG = /^v[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/;
const EXACT_GITHUB_ADVISORY =
  /^GHSA-[23456789cfghjmpqrvwx]{4}(?:-[23456789cfghjmpqrvwx]{4}){2}$/;
const HARDHAT_WARNING_ALLOWLIST =
  "compatibility/compiler-warning-allowlist.json";
const MAINTENANCE_POLICY_PATH = "scripts/maintenance-policy.cjs";
const STAGE_15_SOLIDITY_ARTIFACTS = Object.freeze([
  "compatibility/evidence/stage-15-custom-errors.json",
  "compatibility/reviewed-differences.json",
  "compatibility/stage-15-base-manifest.json",
  "compatibility/stage-15-custom-errors-inventory.json",
]);
const PROJECT_REVERT_STRING_INVENTORY =
  "compatibility/project-revert-strings.json";
const PROJECT_REVERT_STRING_INVENTORY_SHA256 =
  "027be662c5a30bc124afd2f8965e39fcd18c3681bd76fddd659bf78396190b68";

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
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

function valuesEqual(left, right) {
  return stableJson(left) === stableJson(right);
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

function managedFilesForState(stateVersion) {
  const managedFiles = MANAGED_FILES_BY_STATE[stateVersion];
  if (!managedFiles) {
    fail(`Unsupported maintenance state version: ${stateVersion}`);
  }
  return managedFiles;
}

function actionCountsForState(stateVersion) {
  const actionCounts = ACTION_COUNTS_BY_STATE[stateVersion];
  if (!actionCounts) {
    fail(`Unsupported maintenance state version: ${stateVersion}`);
  }
  return actionCounts;
}

function runGit(root, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    fail(
      `git ${args.join(" ")} failed: ${Buffer.from(
        result.stderr || ""
      ).toString("utf8")}`
    );
  }
  return result;
}

function checkedPath(root, relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath) ||
    relativePath.split("/").includes("..")
  ) {
    fail(`Maintenance path must be repository-relative: ${relativePath}`);
  }
  const absolutePath = path.resolve(root, relativePath);
  const rootPrefix = `${path.resolve(root)}${path.sep}`;
  if (!absolutePath.startsWith(rootPrefix)) {
    fail(`Maintenance path escaped the repository: ${relativePath}`);
  }
  return absolutePath;
}

function currentFileBytes(root, relativePath, allowMissing = false) {
  const absolutePath = checkedPath(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    if (allowMissing) return null;
    fail(`Maintenance-bound path is missing: ${relativePath}`);
  }
  const stat = fs.lstatSync(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail(`Maintenance-bound path must be a regular file: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath);
}

function checkpointBytes(root, commit, relativePath, allowMissing = false) {
  const result = runGit(root, ["show", `${commit}:${relativePath}`], {
    allowFailure: allowMissing,
  });
  if (result.status !== 0) return null;
  return Buffer.from(result.stdout);
}

function repositoryFileBytes(
  root,
  relativePath,
  reference = null,
  { allowMissing = false } = {}
) {
  return reference === null
    ? currentFileBytes(root, relativePath, allowMissing)
    : checkpointBytes(root, reference, relativePath, allowMissing);
}

function fileSha256(root, relativePath, reference = null) {
  return sha256(repositoryFileBytes(root, relativePath, reference));
}

function validateStage13Anchor(root) {
  runGit(root, [
    "merge-base",
    "--is-ancestor",
    STAGE_13_ANCHOR.commit,
    "HEAD",
  ]);
  for (const [relativePath, expected] of Object.entries(
    STAGE_13_ANCHOR.files
  )) {
    const bytes = checkpointBytes(root, STAGE_13_ANCHOR.commit, relativePath);
    if (sha256(bytes) !== expected) {
      fail(`Stage 13 anchor changed: ${relativePath}`);
    }
  }
  for (const relativePath of IMMUTABLE_STAGE_13_FILES) {
    if (fileSha256(root, relativePath) !== STAGE_13_ANCHOR.files[relativePath]) {
      fail(`Checked-in Stage 13 evidence changed: ${relativePath}`);
    }
  }
  return sorted(STAGE_13_ANCHOR);
}

function stage13AnchorSha256() {
  return sha256(stableJson(STAGE_13_ANCHOR));
}

function boundFiles(
  root,
  reference = null,
  { allowMissing = false, managedFiles = LEGACY_MANAGED_FILES } = {}
) {
  return Object.fromEntries(
    managedFiles.map((relativePath) => {
      const bytes = repositoryFileBytes(root, relativePath, reference, {
        allowMissing,
      });
      if (bytes === null && !allowMissing) {
        fail(`Maintenance-bound path is missing: ${relativePath}`);
      }
      return [relativePath, bytes === null ? null : sha256(bytes)];
    })
  );
}

function currentBoundFiles(root, stateVersion = 1) {
  return boundFiles(root, null, {
    allowMissing: stateVersion >= 2,
    managedFiles: managedFilesForState(stateVersion),
  });
}

function stage13BoundFiles(root) {
  return boundFiles(root, STAGE_13_ANCHOR.commit, {
    allowMissing: true,
    managedFiles: LEGACY_MANAGED_FILES,
  });
}

function parseActionSnapshot(workflowBytes, expectedActionCounts) {
  const workflow = workflowBytes.toString("utf8");
  const actions = {};
  for (const match of workflow.matchAll(
    /^[ \t]*(?:-[ \t]+)?uses:\s*([^\s#]+)(?:\s+#\s*([^\n]+))?$/gm
  )) {
    const specification = match[1];
    if (specification.startsWith("./")) continue;
    const parsed = specification.match(/^([^@]+)@([0-9a-f]{40})$/);
    if (!parsed) {
      fail(`Action is not pinned by full commit SHA: ${specification}`);
    }
    const name = parsed[1];
    if (!(name in expectedActionCounts)) {
      fail(`Workflow contains an unreviewed external action: ${name}`);
    }
    const tag = (match[2] || "").trim();
    if (!EXACT_ACTION_TAG.test(tag)) {
      fail(`Action pin is missing an exact release comment: ${specification}`);
    }
    const existing = actions[name];
    if (existing && (existing.commit !== parsed[2] || existing.tag !== tag)) {
      fail(`Action uses multiple pins: ${name}`);
    }
    actions[name] = {
      commit: parsed[2],
      count: (existing?.count || 0) + 1,
      tag,
    };
  }
  if (!valuesEqual(Object.keys(actions).sort(), Object.keys(expectedActionCounts).sort())) {
    fail("Workflow action-name inventory changed");
  }
  for (const [name, count] of Object.entries(expectedActionCounts)) {
    if (actions[name].count !== count) {
      fail(`Workflow action count changed for ${name}`);
    }
  }
  return sorted(actions);
}

function actionSnapshot(root, reference = null, stateVersion = 1) {
  return parseActionSnapshot(
    repositoryFileBytes(root, ".github/workflows/tests.yml", reference),
    actionCountsForState(stateVersion)
  );
}

function readPackage(root, reference = null) {
  return JSON.parse(
    repositoryFileBytes(root, "package.json", reference).toString("utf8")
  );
}

function readJsonFile(root, relativePath, reference = null) {
  return JSON.parse(
    repositoryFileBytes(root, relativePath, reference).toString("utf8")
  );
}

function pnpmOverrides(root, reference = null) {
  const text = repositoryFileBytes(
    root,
    "pnpm-workspace.yaml",
    reference
  ).toString("utf8");
  const overrides = {};
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line === "overrides:");
  if (start === -1) return overrides;
  for (const line of lines.slice(start + 1)) {
    if (line.length === 0 || /^\s*#/.test(line)) continue;
    if (!line.startsWith("  ")) break;
    const match = line.match(/^  ([A-Za-z0-9@/_.-]+): ([0-9A-Za-z.+-]+)$/);
    if (!match || !EXACT_SEMVER.test(match[2]) || match[1] in overrides) {
      fail("pnpm overrides must be unique exact package-version mappings");
    }
    overrides[match[1]] = match[2];
  }
  return sorted(overrides);
}

function packageSnapshot(root, reference = null) {
  const packageJson = readPackage(root, reference);
  if (!/^pnpm@[0-9]+\.[0-9]+\.[0-9]+$/.test(packageJson.packageManager)) {
    fail("packageManager must pin one exact pnpm release");
  }
  for (const group of ["dependencies", "devDependencies"]) {
    for (const [name, version] of Object.entries(packageJson[group] || {})) {
      if (!EXACT_SEMVER.test(version)) {
        fail(`${group}.${name} is not pinned exactly: ${version}`);
      }
    }
  }
  const node = repositoryFileBytes(root, ".nvmrc", reference)
    .toString("utf8")
    .trim()
    .replace(/^v/, "");
  const nodeTypes = packageJson.devDependencies?.["@types/node"];
  if (
    nodeTypes &&
    Number(nodeTypes.split(".")[0]) !== Number(node.split(".")[0])
  ) {
    fail(`@types/node ${nodeTypes} does not match the Node ${node} runtime major`);
  }
  return sorted({
    dependencies: packageJson.dependencies || {},
    devDependencies: packageJson.devDependencies || {},
    packageManager: packageJson.packageManager,
  });
}

function currentForgeStdGitlink(root) {
  const index = runGit(root, ["ls-files", "-s", "--", "lib/forge-std"])
    .stdout.toString("utf8")
    .trim();
  const match = index.match(/^160000 ([0-9a-f]{40}) 0\tlib\/forge-std$/);
  if (!match) fail("forge-std must be a mode-160000 gitlink");
  const submoduleHead = runGit(root, [
    "-C",
    "lib/forge-std",
    "rev-parse",
    "HEAD",
  ])
    .stdout.toString("utf8")
    .trim();
  const submoduleStatus = runGit(root, [
    "-C",
    "lib/forge-std",
    "status",
    "--porcelain",
  ])
    .stdout.toString("utf8")
    .trim();
  if (submoduleHead !== match[1] || submoduleStatus) {
    fail("forge-std checkout must exactly match its clean gitlink");
  }
  return match[1];
}

function toolchainSnapshot(root, reference = null) {
  const node = repositoryFileBytes(root, ".nvmrc", reference)
    .toString("utf8")
    .trim()
    .replace(/^v/, "");
  if (!EXACT_SEMVER.test(node)) {
    fail(".nvmrc must pin one exact Node release");
  }
  const foundry = repositoryFileBytes(root, "foundry.toml", reference).toString(
    "utf8"
  );
  const setting = (name) =>
    foundry.match(new RegExp(`^${name}\\s*=\\s*([^\\n]+)$`, "m"))?.[1].trim();
  const solidity = setting("solc_version")?.replace(/^"|"$/g, "");
  const evmVersion = setting("evm_version")?.replace(/^"|"$/g, "");
  if (!solidity || !evmVersion) fail("Foundry compiler settings are incomplete");
  const forgeStd =
    reference === null
      ? currentForgeStdGitlink(root)
      : runGit(root, ["rev-parse", `${reference}:lib/forge-std`])
          .stdout.toString("utf8")
          .trim();
  if (!/^[0-9a-f]{40}$/.test(forgeStd)) {
    fail("forge-std must be pinned to one gitlink commit");
  }
  return sorted({
    bytecodeHash: setting("bytecode_hash"),
    cborMetadata: setting("cbor_metadata"),
    evmVersion,
    forgeStd,
    node,
    optimizer: setting("optimizer"),
    optimizerRuns: setting("optimizer_runs"),
    pnpm: packageSnapshot(root, reference).packageManager.slice("pnpm@".length),
    solidity,
    useLiteralContent: setting("use_literal_content"),
    viaIR: setting("via_ir"),
  });
}

function expectedChangedFiles(previousBoundFiles, nextBoundFiles) {
  const managedFiles = [...new Set([
    ...Object.keys(previousBoundFiles),
    ...Object.keys(nextBoundFiles),
  ])].sort();
  return managedFiles.filter(
    (relativePath) =>
      previousBoundFiles[relativePath] !== nextBoundFiles[relativePath]
  );
}

function changedPathsBetween(root, baseCommit, targetCommit) {
  return runGit(root, [
    "diff",
    "--no-renames",
    "--name-only",
    baseCommit,
    targetCommit,
  ])
    .stdout.toString("utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();
}

function currentChangedPaths(root, baseCommit) {
  const changed = new Set(
    runGit(root, ["diff", "--no-renames", "--name-only", baseCommit])
      .stdout.toString("utf8")
      .split(/\r?\n/)
      .filter(Boolean)
  );
  for (const relativePath of runGit(root, [
    "ls-files",
    "--others",
    "--exclude-standard",
  ])
    .stdout.toString("utf8")
    .split(/\r?\n/)
    .filter(Boolean)) {
    changed.add(relativePath);
  }
  return [...changed].sort();
}

function recordFilesAt(root, reference) {
  return runGit(root, [
    "ls-tree",
    "-r",
    "--name-only",
    reference,
    "--",
    RECORD_DIRECTORY,
  ])
    .stdout.toString("utf8")
    .split(/\r?\n/)
    .filter((relativePath) => relativePath.startsWith(`${RECORD_DIRECTORY}/`))
    .map((relativePath) => relativePath.slice(RECORD_DIRECTORY.length + 1))
    .sort();
}

function maintenanceHistory(root, currentFilenames) {
  const commits = [
    STAGE_13_ANCHOR.commit,
    ...runGit(root, [
      "rev-list",
      "--first-parent",
      "--reverse",
      `${STAGE_13_ANCHOR.commit}..HEAD`,
    ])
      .stdout.toString("utf8")
      .split(/\r?\n/)
      .filter(Boolean),
  ];
  const historicalFilenames = new Set();
  for (const commit of commits) {
    for (const filename of recordFilesAt(root, commit)) {
      historicalFilenames.add(filename);
    }
  }
  const missing = [...historicalFilenames]
    .filter((filename) => !currentFilenames.includes(filename))
    .sort();
  if (missing.length > 0) {
    fail(`Append-only maintenance records were removed: ${missing.join(", ")}`);
  }

  const introductions = new Map();
  for (const filename of currentFilenames) {
    const relativePath = `${RECORD_DIRECTORY}/${filename}`;
    let previous = null;
    let introduction = null;
    for (const commit of commits) {
      const current = checkpointBytes(root, commit, relativePath, true);
      if (previous === null && current !== null) {
        if (introduction !== null) {
          fail(`Maintenance record was reintroduced: ${relativePath}`);
        }
        introduction = commit;
      } else if (previous !== null && current === null) {
        fail(`Maintenance record was deleted: ${relativePath}`);
      } else if (
        previous !== null &&
        current !== null &&
        !previous.equals(current)
      ) {
        fail(`Maintenance record was modified after introduction: ${relativePath}`);
      }
      previous = current;
    }
    introductions.set(filename, introduction);
  }

  const introductionCommits = new Set(
    [...introductions.values()].filter((commit) => commit !== null)
  );
  const recordsByIntroduction = new Map();
  for (const filename of currentFilenames) {
    const introduction = introductions.get(filename);
    if (introduction === null) continue;
    const record = JSON.parse(
      currentFileBytes(root, `${RECORD_DIRECTORY}/${filename}`).toString("utf8")
    );
    recordsByIntroduction.set(introduction, record);
  }
  let activeManagedFiles = LEGACY_MANAGED_FILES;
  for (const commit of commits.slice(1)) {
    const firstParent = runGit(root, ["rev-parse", `${commit}^1`])
      .stdout.toString("utf8")
      .trim();
    const scopedPaths = maintenanceScopedPaths(
      changedPathsBetween(root, firstParent, commit),
      activeManagedFiles
    );
    if (scopedPaths.length > 0 && !introductionCommits.has(commit)) {
      fail(
        `Managed files changed without a maintenance record in ${commit}: ${scopedPaths.join(", ")}`
      );
    }
    const introducedRecord = recordsByIntroduction.get(commit);
    if (introducedRecord) {
      activeManagedFiles = managedFilesForState(
        introducedRecord.schemaVersion === 1 ? 1 : introducedRecord.stateVersion
      );
    }
  }
  return introductions;
}

function maintenanceScopedPaths(paths, managedFiles = LEGACY_MANAGED_FILES) {
  const managed = new Set(managedFiles);
  return paths.filter(
    (relativePath) =>
      managed.has(relativePath) ||
      relativePath.startsWith(`${RECORD_DIRECTORY}/`)
  );
}

function validateRecordSchema(record, filename, sequence) {
  const expectedSchemaVersion = sequence <= 7 ? 1 : 2;
  const hasIssueProvenance = sequence >= 9;
  exactKeys(
    record,
    [
      "actions",
      "baseCommit",
      "boundFiles",
      "category",
      "changedFiles",
      "id",
      "packages",
      "previous",
      "productionImpact",
      "schemaVersion",
      "sequence",
      "sourcePullRequests",
      "summary",
      "toolchain",
      "transition",
      ...(expectedSchemaVersion === 2 ? ["stateVersion"] : []),
      ...(hasIssueProvenance ? ["sourceIssues"] : []),
    ],
    `Maintenance record ${filename}`
  );
  const allowedCategories =
    expectedSchemaVersion === 1
      ? ["bootstrap", "governance", "github-actions", "javascript"]
      : [
          "foundry-retirement",
          "governance",
          "github-actions",
          "javascript",
          "solidity",
        ];
  const sourceIssues = hasIssueProvenance ? record.sourceIssues : [];
  if (
    record.schemaVersion !== expectedSchemaVersion ||
    record.sequence !== sequence ||
    (expectedSchemaVersion === 2 && ![1, 2].includes(record.stateVersion)) ||
    (sequence >= 8 && record.stateVersion !== 2) ||
    (sequence === 8 && record.category !== "foundry-retirement") ||
    (sequence !== 8 && record.category === "foundry-retirement") ||
    record.id !== filename.replace(/^[0-9]{4}-|\.json$/g, "") ||
    !/^[0-9a-f]{40}$/.test(record.baseCommit) ||
    !allowedCategories.includes(record.category) ||
    record.transition?.kind !== record.category ||
    typeof record.summary !== "string" ||
    record.summary.trim().length < 12 ||
    !(record.category === "solidity"
      ? record.productionImpact === "abi-breaking"
      : record.productionImpact === "none") ||
    !Array.isArray(record.sourcePullRequests) ||
    record.sourcePullRequests.some(
      (number) => !Number.isInteger(number) || number <= 0
    ) ||
    !valuesEqual(
      record.sourcePullRequests,
      [...new Set(record.sourcePullRequests)].sort((left, right) => left - right)
    ) ||
    !Array.isArray(sourceIssues) ||
    sourceIssues.some((number) => !Number.isInteger(number) || number <= 0) ||
    !valuesEqual(
      sourceIssues,
      [...new Set(sourceIssues)].sort((left, right) => left - right)
    )
  ) {
    fail(`Maintenance record has an invalid schema: ${filename}`);
  }
  if (sequence === 1) {
    if (
      record.category !== "bootstrap" ||
      record.baseCommit !== STAGE_13_ANCHOR.commit ||
      record.sourcePullRequests.length !== 0 ||
      sourceIssues.length !== 0
    ) {
      fail("Record 0001 must be the exact post-Stage-13 bootstrap");
    }
  } else if (
    record.category === "bootstrap" ||
    (record.sourcePullRequests.length === 0 && sourceIssues.length === 0)
  ) {
    fail("Routine maintenance records require issue or PR provenance and cannot bootstrap");
  }
  const stateVersion = record.schemaVersion === 1 ? 1 : record.stateVersion;
  const managedFiles = managedFilesForState(stateVersion);
  const invalidDigest = Object.entries(record.boundFiles).some(
    ([relativePath, digest]) => {
      if (stateVersion === 2 && FOUNDRY_RETIREMENT_TOMBSTONES.includes(relativePath)) {
        return digest !== null;
      }
      return typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest);
    }
  );
  if (
    !valuesEqual(Object.keys(record.boundFiles).sort(), [...managedFiles].sort()) ||
    invalidDigest
  ) {
    fail(`Maintenance record has an invalid bound-file snapshot: ${filename}`);
  }
  if (
    !Array.isArray(record.changedFiles) ||
    record.changedFiles.length === 0 ||
    !valuesEqual(record.changedFiles, [...new Set(record.changedFiles)].sort())
  ) {
    fail(`Maintenance record changed-file inventory is invalid: ${filename}`);
  }
}

function validateSolidityTransition(record, root, targetReference) {
  exactKeys(
    record.transition,
    ["artifacts", "kind", "repositoryPaths", "sourceRevertStrings"],
    "Solidity transition"
  );
  const transition = record.transition;
  const repositoryPaths = transition.repositoryPaths;
  if (
    !Array.isArray(repositoryPaths) ||
    repositoryPaths.length === 0 ||
    !valuesEqual(repositoryPaths, [...new Set(repositoryPaths)].sort()) ||
    !repositoryPaths.includes("scripts/compatibility.cjs") ||
    !repositoryPaths.includes("scripts/test-package.cjs") ||
    !repositoryPaths.includes("compatibility/README.md") ||
    !repositoryPaths.includes("compatibility/reviewed-differences.json") ||
    !repositoryPaths.includes("compatibility/stage-15-custom-errors-inventory.json") ||
    repositoryPaths.some(
      (relativePath) =>
        typeof relativePath !== "string" ||
        relativePath.startsWith("compatibility/maintenance/") ||
        relativePath === "package.json" ||
        relativePath === "pnpm-lock.yaml" ||
        relativePath === "pnpm-workspace.yaml" ||
        relativePath === "foundry.toml" ||
        relativePath === "hardhat.config.ts" ||
        relativePath === ".gitmodules" ||
        relativePath === ".nvmrc" ||
        relativePath.startsWith(".github/")
    )
  ) {
    fail("Solidity maintenance must declare one exact, sorted source and evidence delta");
  }
  exactKeys(
    transition.sourceRevertStrings,
    ["baselineInventorySha256", "from", "to"],
    "Solidity revert-string transition"
  );
  if (
    transition.sourceRevertStrings.from !== 37 ||
    transition.sourceRevertStrings.to !== 0 ||
    transition.sourceRevertStrings.baselineInventorySha256 !==
      PROJECT_REVERT_STRING_INVENTORY_SHA256 ||
    fileSha256(root, PROJECT_REVERT_STRING_INVENTORY, targetReference) !==
      PROJECT_REVERT_STRING_INVENTORY_SHA256
  ) {
    fail("Solidity maintenance must remove the complete reviewed project revert-string inventory");
  }
  if (
    !valuesEqual(
      Object.keys(transition.artifacts).sort(),
      [...STAGE_15_SOLIDITY_ARTIFACTS].sort()
    ) ||
    Object.entries(transition.artifacts).some(
      ([relativePath, digest]) =>
        !/^[0-9a-f]{64}$/.test(digest) ||
        fileSha256(root, relativePath, targetReference) !== digest
    )
  ) {
    fail("Solidity maintenance must bind the exact Stage 15 review artifacts");
  }
  if (!valuesEqual(record.sourceIssues, [75])) {
    fail("The Stage 15 Solidity transition must cite issue 75");
  }
}

function validateBootstrapTransition(record) {
  exactKeys(record.transition, ["kind"], "Bootstrap transition");
  if (!valuesEqual(record.changedFiles, BOOTSTRAP_CHANGED_FILES)) {
    fail("Bootstrap may change only the workflow and four maintenance support scripts");
  }
}

function validateSecurityOverrideTransitions(
  changes,
  root,
  baseCommit,
  targetReference
) {
  if (!Array.isArray(changes)) {
    fail("Security override transitions must be an array");
  }
  const beforeOverrides = pnpmOverrides(root, baseCommit);
  const afterOverrides = pnpmOverrides(root, targetReference);
  const expectedOverrides = structuredClone(beforeOverrides);
  const names = [];
  for (const change of changes) {
    exactKeys(
      change,
      ["advisory", "from", "name", "to"],
      "Security override transition"
    );
    if (
      typeof change.name !== "string" ||
      !EXACT_GITHUB_ADVISORY.test(change.advisory) ||
      !EXACT_SEMVER.test(change.to) ||
      change.from !== (beforeOverrides[change.name] || null) ||
      change.to === change.from
    ) {
      fail(`Invalid security override transition: ${change.name}`);
    }
    names.push(change.name);
    expectedOverrides[change.name] = change.to;
  }
  if (
    !valuesEqual(names, [...new Set(names)].sort()) ||
    !valuesEqual(sorted(expectedOverrides), afterOverrides)
  ) {
    fail("Security overrides must be unique, sorted, and exact");
  }
}

function validateGovernanceTransition(
  record,
  root,
  baseCommit,
  targetReference
) {
  exactKeys(
    record.transition,
    ["fromSha256", "kind", "path", "securityOverrides", "toSha256"],
    "Governance transition"
  );
  const overrideChanges = record.transition.securityOverrides;
  const expectedChangedFiles = [MAINTENANCE_POLICY_PATH];
  if (Array.isArray(overrideChanges) && overrideChanges.length > 0) {
    expectedChangedFiles.push("pnpm-lock.yaml", "pnpm-workspace.yaml");
  }
  if (
    !valuesEqual(record.changedFiles, expectedChangedFiles.sort()) ||
    record.transition.path !== MAINTENANCE_POLICY_PATH ||
    !/^[0-9a-f]{64}$/.test(record.transition.fromSha256) ||
    !/^[0-9a-f]{64}$/.test(record.transition.toSha256) ||
    record.transition.fromSha256 === record.transition.toSha256 ||
    fileSha256(root, MAINTENANCE_POLICY_PATH, baseCommit) !==
      record.transition.fromSha256 ||
    fileSha256(root, MAINTENANCE_POLICY_PATH, targetReference) !==
      record.transition.toSha256
  ) {
    fail("Governance maintenance must bind one exact policy-file replacement");
  }
  if (overrideChanges.length > 0) {
    validateSecurityOverrideTransitions(
      overrideChanges,
      root,
      baseCommit,
      targetReference
    );
  }
}

function validateActionDescriptor(value, label) {
  exactKeys(value, ["commit", "tag"], label);
  if (!/^[0-9a-f]{40}$/.test(value.commit) || !EXACT_ACTION_TAG.test(value.tag)) {
    fail(`${label} must contain an exact action commit and release`);
  }
}

function validateGithubActionTransition(
  record,
  beforeWorkflow,
  afterWorkflow,
  beforeActions,
  afterActions
) {
  exactKeys(
    record.transition,
    ["action", "from", "kind", "occurrences", "to"],
    "GitHub Actions transition"
  );
  const transition = record.transition;
  if (
    !valuesEqual(record.changedFiles, [".github/workflows/tests.yml"]) ||
    !(transition.action in beforeActions) ||
    !Number.isInteger(transition.occurrences) ||
    transition.occurrences <= 0
  ) {
    fail("GitHub Actions maintenance must update one existing action pin only");
  }
  validateActionDescriptor(transition.from, "GitHub Action source");
  validateActionDescriptor(transition.to, "GitHub Action target");
  if (valuesEqual(transition.from, transition.to)) {
    fail("GitHub Action transition is a no-op");
  }
  const beforePin = beforeActions[transition.action];
  const afterPin = afterActions[transition.action];
  if (
    !beforePin ||
    !afterPin ||
    beforePin.commit !== transition.from.commit ||
    beforePin.tag !== transition.from.tag ||
    afterPin.commit !== transition.to.commit ||
    afterPin.tag !== transition.to.tag ||
    beforePin.count !== transition.occurrences ||
    afterPin.count !== transition.occurrences
  ) {
    fail("GitHub Action transition does not match the bound action snapshots");
  }
  const expectedActions = structuredClone(beforeActions);
  expectedActions[transition.action] = afterPin;
  if (!valuesEqual(expectedActions, afterActions)) {
    fail("GitHub Actions maintenance changed more than one action pin");
  }
  const source = `${transition.action}@${transition.from.commit} # ${transition.from.tag}`;
  const replacement = `${transition.action}@${transition.to.commit} # ${transition.to.tag}`;
  const beforeText = beforeWorkflow.toString("utf8");
  const actualOccurrences = beforeText.split(source).length - 1;
  if (
    actualOccurrences !== transition.occurrences ||
    beforeText.split(source).join(replacement) !== afterWorkflow.toString("utf8")
  ) {
    fail("Workflow changed outside the exact reviewed action-pin replacement");
  }
}

function validateJavascriptTransition(
  record,
  beforePackage,
  afterPackage,
  root,
  baseCommit,
  targetReference
) {
  exactKeys(
    record.transition,
    ["devDependencies", "hardhatWarningMetadata", "kind", "securityOverrides"],
    "JavaScript transition"
  );
  const changes = record.transition.devDependencies;
  const hardhatMetadata = record.transition.hardhatWarningMetadata;
  const overrideChanges = record.transition.securityOverrides;
  if (!Array.isArray(overrideChanges)) {
    fail("Security override transitions must be an array");
  }
  const expectedChangedFiles = ["package.json", "pnpm-lock.yaml"];
  if (hardhatMetadata !== null) {
    expectedChangedFiles.push(HARDHAT_WARNING_ALLOWLIST);
  }
  if (overrideChanges.length > 0) {
    expectedChangedFiles.push("pnpm-workspace.yaml");
  }
  if (
    !valuesEqual(record.changedFiles, expectedChangedFiles.sort()) ||
    !Array.isArray(changes) ||
    changes.length === 0
  ) {
    fail("JavaScript maintenance changed files outside its declared transition");
  }
  const names = [];
  const expectedPackage = structuredClone(beforePackage);
  for (const change of changes) {
    exactKeys(change, ["from", "name", "to"], "Development dependency transition");
    if (
      typeof change.name !== "string" ||
      !EXACT_SEMVER.test(change.from) ||
      !EXACT_SEMVER.test(change.to) ||
      change.from === change.to ||
      beforePackage.devDependencies?.[change.name] !== change.from ||
      afterPackage.devDependencies?.[change.name] !== change.to
    ) {
      fail(`Invalid existing development dependency transition: ${change.name}`);
    }
    names.push(change.name);
    expectedPackage.devDependencies[change.name] = change.to;
  }
  if (!valuesEqual(names, [...new Set(names)].sort())) {
    fail("Development dependency transitions must be unique and sorted");
  }
  if (!valuesEqual(expectedPackage, afterPackage)) {
    fail("package.json changed outside declared existing devDependencies");
  }

  validateSecurityOverrideTransitions(
    overrideChanges,
    root,
    baseCommit,
    targetReference
  );

  const hardhatChange = changes.find((change) => change.name === "hardhat");
  if (hardhatMetadata === null) {
    if (hardhatChange) {
      fail("Hardhat maintenance must update its reviewed warning metadata");
    }
  } else {
    exactKeys(
      hardhatMetadata,
      ["from", "to"],
      "Hardhat warning metadata transition"
    );
    const beforeAllowlist = readJsonFile(
      root,
      HARDHAT_WARNING_ALLOWLIST,
      baseCommit
    );
    const afterAllowlist = readJsonFile(
      root,
      HARDHAT_WARNING_ALLOWLIST,
      targetReference
    );
    if (
      !hardhatChange ||
      hardhatMetadata.from !== hardhatChange.from ||
      hardhatMetadata.to !== hardhatChange.to ||
      beforeAllowlist.tools?.hardhat?.version !== hardhatMetadata.from ||
      afterAllowlist.tools?.hardhat?.version !== hardhatMetadata.to
    ) {
      fail("Hardhat warning metadata must match the package transition");
    }
    beforeAllowlist.tools.hardhat.version = hardhatMetadata.to;
    if (!valuesEqual(beforeAllowlist, afterAllowlist)) {
      fail("Hardhat warning allowlist changed outside its reviewed version");
    }
  }
}

function removeWorkflowJob(workflow, jobId) {
  const startPattern = new RegExp(`^  ${jobId}:\\n`, "m");
  const start = workflow.search(startPattern);
  if (start === -1) {
    fail(`Workflow is missing the reviewed ${jobId} job`);
  }
  const remainder = workflow.slice(start + 1);
  const next = remainder.search(/^  [a-z0-9][a-z0-9-]*:\n/m);
  if (next === -1) {
    return workflow.slice(0, start);
  }
  return workflow.slice(0, start) + remainder.slice(next);
}

function validateFoundryRetirementTransition(
  record,
  root,
  baseCommit,
  targetReference,
  beforeActions,
  afterActions,
  beforePackages,
  afterPackages,
  beforeToolchain,
  afterToolchain
) {
  exactKeys(
    record.transition,
    [
      "actionCounts",
      "devDependencies",
      "kind",
      "policy",
      "scripts",
      "securityOverride",
      "tombstones",
    ],
    "Foundry retirement transition"
  );
  if (
    record.schemaVersion !== 2 ||
    record.stateVersion !== 2 ||
    !valuesEqual(
      record.transition.actionCounts,
      FOUNDRY_RETIREMENT_ACTION_TRANSITIONS
    ) ||
    !valuesEqual(
      record.transition.devDependencies,
      FOUNDRY_RETIREMENT_DEV_DEPENDENCIES
    ) ||
    !valuesEqual(
      record.transition.scripts,
      FOUNDRY_RETIREMENT_SCRIPT_TRANSITIONS
    ) ||
    !valuesEqual(
      record.transition.securityOverride,
      FOUNDRY_RETIREMENT_SECURITY_OVERRIDE
    ) ||
    !valuesEqual(
      record.transition.tombstones,
      FOUNDRY_RETIREMENT_TOMBSTONES
    )
  ) {
    fail("Foundry retirement declaration is not the exact reviewed transition");
  }

  exactKeys(
    record.transition.policy,
    ["fromSha256", "path", "toSha256"],
    "Foundry retirement policy transition"
  );
  if (
    record.transition.policy.path !== MAINTENANCE_POLICY_PATH ||
    !/^[0-9a-f]{64}$/.test(record.transition.policy.fromSha256) ||
    !/^[0-9a-f]{64}$/.test(record.transition.policy.toSha256) ||
    record.transition.policy.fromSha256 === record.transition.policy.toSha256 ||
    fileSha256(root, MAINTENANCE_POLICY_PATH, baseCommit) !==
      record.transition.policy.fromSha256 ||
    fileSha256(root, MAINTENANCE_POLICY_PATH, targetReference) !==
      record.transition.policy.toSha256
  ) {
    fail("Foundry retirement must bind its exact policy replacement");
  }

  if (!valuesEqual(beforeToolchain, afterToolchain)) {
    fail("Foundry retirement may not change the pinned production toolchain");
  }
  const expectedActions = structuredClone(beforeActions);
  for (const [name, counts] of Object.entries(
    FOUNDRY_RETIREMENT_ACTION_TRANSITIONS
  )) {
    if (
      beforeActions[name]?.count !== counts.from ||
      afterActions[name]?.count !== counts.to ||
      beforeActions[name]?.commit !== afterActions[name]?.commit ||
      beforeActions[name]?.tag !== afterActions[name]?.tag
    ) {
      fail(`Foundry retirement action transition changed unexpectedly: ${name}`);
    }
    expectedActions[name] = { ...beforeActions[name], count: counts.to };
  }
  if (!valuesEqual(expectedActions, afterActions)) {
    fail("Foundry retirement changed action pins or unreviewed action counts");
  }

  const beforePackage = readPackage(root, baseCommit);
  const afterPackage = readPackage(root, targetReference);
  if (
    !valuesEqual(beforePackage.devDependencies, FOUNDRY_RETIREMENT_DEV_DEPENDENCIES) ||
    !valuesEqual(beforePackages.devDependencies, FOUNDRY_RETIREMENT_DEV_DEPENDENCIES)
  ) {
    fail("Foundry retirement dependency source inventory changed");
  }
  const expectedPackage = structuredClone(beforePackage);
  delete expectedPackage.devDependencies;
  for (const transition of FOUNDRY_RETIREMENT_SCRIPT_TRANSITIONS) {
    if (expectedPackage.scripts?.[transition.name] !== transition.from) {
      fail(`Foundry retirement script source changed: ${transition.name}`);
    }
    if (transition.to === null) {
      delete expectedPackage.scripts[transition.name];
    } else {
      expectedPackage.scripts[transition.name] = transition.to;
    }
  }
  if (
    !valuesEqual(expectedPackage, afterPackage) ||
    !valuesEqual(afterPackages.devDependencies, {}) ||
    !valuesEqual(beforePackages.dependencies, afterPackages.dependencies) ||
    beforePackages.packageManager !== afterPackages.packageManager
  ) {
    fail("package.json changed outside the exact Foundry retirement");
  }

  const beforeWorkflow = repositoryFileBytes(
    root,
    ".github/workflows/tests.yml",
    baseCommit
  ).toString("utf8");
  const afterWorkflow = repositoryFileBytes(
    root,
    ".github/workflows/tests.yml",
    targetReference
  ).toString("utf8");
  if (
    removeWorkflowJob(beforeWorkflow, "hardhat-integration") !== afterWorkflow ||
    /hardhat/i.test(afterWorkflow)
  ) {
    fail("Workflow changed outside removal of the Hardhat integration job");
  }

  const beforeAllowlist = readJsonFile(
    root,
    HARDHAT_WARNING_ALLOWLIST,
    baseCommit
  );
  const afterAllowlist = readJsonFile(
    root,
    HARDHAT_WARNING_ALLOWLIST,
    targetReference
  );
  if (
    beforeAllowlist.tools?.hardhat?.version !== "3.10.0" ||
    afterAllowlist.schemaVersion !== 3 ||
    "hardhat" in afterAllowlist ||
    "hardhat" in afterAllowlist.tools ||
    !valuesEqual(Object.keys(afterAllowlist).sort(), [
      "compiler",
      "diagnostic",
      "forge",
      "schemaVersion",
      "tools",
    ]) ||
    !valuesEqual(beforeAllowlist.compiler, afterAllowlist.compiler) ||
    !valuesEqual(beforeAllowlist.diagnostic, afterAllowlist.diagnostic) ||
    !valuesEqual(beforeAllowlist.tools.forge, afterAllowlist.tools.forge) ||
    !valuesEqual(
      {
        compilerProfile: beforeAllowlist.forge.compilerProfile,
        metadataSettings: beforeAllowlist.forge.metadataSettings,
        settings: beforeAllowlist.forge.settings,
      },
      {
        compilerProfile: afterAllowlist.forge.compilerProfile,
        metadataSettings: afterAllowlist.forge.metadataSettings,
        settings: afterAllowlist.forge.settings,
      }
    ) ||
    !Array.isArray(afterAllowlist.forge.warnings) ||
    !afterAllowlist.forge.sourceSha256 ||
    typeof afterAllowlist.forge.sourceSha256 !== "object"
  ) {
    fail("Compiler warning allowlist changed outside reviewed Forge metadata and Hardhat retirement");
  }

  const beforeOverrides = pnpmOverrides(root, baseCommit);
  if (!valuesEqual(beforeOverrides, { "adm-zip": "0.6.0" })) {
    fail("Foundry retirement security override source changed");
  }
  const lock = repositoryFileBytes(root, "pnpm-lock.yaml", targetReference)
    .toString("utf8")
    .toLowerCase();
  for (const forbidden of [
    "@nomicfoundation/hardhat-ethers",
    "@types/node",
    "adm-zip",
    "ethers@",
    "hardhat@",
    "tsx@",
    "typescript@",
  ]) {
    if (lock.includes(forbidden)) {
      fail(`Retired JavaScript dependency remains in pnpm-lock.yaml: ${forbidden}`);
    }
  }

  for (const relativePath of FOUNDRY_RETIREMENT_TOMBSTONES) {
    if (record.boundFiles[relativePath] !== null) {
      fail(`Foundry retirement tombstone is not null: ${relativePath}`);
    }
  }
  for (const relativePath of [
    "compatibility/evidence/stage-14-foundry-retirement.json",
    "compatibility/interoperability-smoke-parity.json",
    "compatibility/stage-14-foundry-retirement-inventory.json",
    "test/solidity/parity/PCOMutationParity.t.sol",
    "test/solidity/parity/PCOReadTaxParity.t.sol",
    "test/solidity/parity/WrapperParity.t.sol",
  ]) {
    if (!/^[0-9a-f]{64}$/.test(record.boundFiles[relativePath])) {
      fail(`Foundry retirement evidence is not digest-bound: ${relativePath}`);
    }
  }
}

function validateTransition(
  root,
  record,
  baseCommit,
  targetReference,
  beforeActions,
  afterActions,
  beforePackages,
  afterPackages,
  beforeToolchain,
  afterToolchain
) {
  if (record.category === "bootstrap") {
    validateBootstrapTransition(record);
    return;
  }
  if (record.category === "governance") {
    if (
      !valuesEqual(beforeActions, afterActions) ||
      !valuesEqual(beforePackages, afterPackages) ||
      !valuesEqual(beforeToolchain, afterToolchain)
    ) {
      fail(
        "Governance maintenance may not change dependencies or the pinned toolchain"
      );
    }
    validateGovernanceTransition(
      record,
      root,
      baseCommit,
      targetReference
    );
    return;
  }
  if (record.category === "foundry-retirement") {
    validateFoundryRetirementTransition(
      record,
      root,
      baseCommit,
      targetReference,
      beforeActions,
      afterActions,
      beforePackages,
      afterPackages,
      beforeToolchain,
      afterToolchain
    );
    return;
  }
  if (!valuesEqual(beforeToolchain, afterToolchain)) {
    fail("Routine dependency maintenance may not change the pinned toolchain");
  }
  if (record.category === "solidity") {
    if (
      !valuesEqual(beforeActions, afterActions) ||
      !valuesEqual(beforePackages, afterPackages)
    ) {
      fail("Solidity maintenance may not change actions, packages, or the pinned toolchain");
    }
    validateSolidityTransition(record, root, targetReference);
    return;
  }
  if (record.category === "github-actions") {
    if (!valuesEqual(beforePackages, afterPackages)) {
      fail("GitHub Actions maintenance may not change JavaScript packages");
    }
    validateGithubActionTransition(
      record,
      repositoryFileBytes(root, ".github/workflows/tests.yml", baseCommit),
      repositoryFileBytes(root, ".github/workflows/tests.yml", targetReference),
      beforeActions,
      afterActions
    );
    return;
  }
  if (!valuesEqual(beforeActions, afterActions)) {
    fail("JavaScript maintenance may not change GitHub Actions");
  }
  validateJavascriptTransition(
    record,
    readPackage(root, baseCommit),
    readPackage(root, targetReference),
    root,
    baseCommit,
    targetReference
  );
}

function validateMaintenanceLedger({ root = path.resolve(__dirname, "..") } = {}) {
  root = path.resolve(root);
  const stage13 = validateStage13Anchor(root);
  const directory = checkedPath(root, RECORD_DIRECTORY);
  if (!fs.existsSync(directory) || !fs.lstatSync(directory).isDirectory()) {
    fail("The append-only maintenance record directory is missing");
  }
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) {
    fail("Maintenance record directory may contain regular JSON files only");
  }
  const filenames = entries.map((entry) => entry.name).sort();
  if (filenames.length === 0 || filenames.some((name) => !RECORD_NAME.test(name))) {
    fail("Maintenance records must use zero-padded immutable JSON filenames");
  }
  const introductions = maintenanceHistory(root, filenames);

  const records = [];
  let previousBytes = null;
  let previousBoundFiles = stage13BoundFiles(root);
  let previousStateVersion = 1;
  let previousManagedFiles = managedFilesForState(previousStateVersion);
  let previousActions = actionSnapshot(
    root,
    STAGE_13_ANCHOR.commit,
    previousStateVersion
  );
  let previousPackages = packageSnapshot(root, STAGE_13_ANCHOR.commit);
  let previousToolchain = toolchainSnapshot(root, STAGE_13_ANCHOR.commit);

  for (const [index, filename] of filenames.entries()) {
    const sequence = index + 1;
    const match = filename.match(RECORD_NAME);
    if (Number(match[1]) !== sequence) {
      fail(`Maintenance record sequence has a gap: ${filename}`);
    }
    const relativePath = `${RECORD_DIRECTORY}/${filename}`;
    const bytes = currentFileBytes(root, relativePath);
    const record = JSON.parse(bytes);
    if (bytes.toString("utf8") !== stableJson(record)) {
      fail(`Maintenance record is not canonical JSON: ${filename}`);
    }
    validateRecordSchema(record, filename, sequence);
    const recordStateVersion =
      record.schemaVersion === 1 ? 1 : record.stateVersion;
    const recordManagedFiles = managedFilesForState(recordStateVersion);

    const expectedPrevious =
      sequence === 1
        ? { file: null, kind: "stage13", sha256: stage13AnchorSha256() }
        : {
            file: filenames[index - 1],
            kind: "maintenance",
            sha256: sha256(previousBytes),
          };
    if (!valuesEqual(record.previous, expectedPrevious)) {
      fail(`Maintenance record predecessor changed: ${filename}`);
    }

    runGit(root, ["merge-base", "--is-ancestor", record.baseCommit, "HEAD"]);
    if (
      sequence > 1 &&
      maintenanceScopedPaths(
        changedPathsBetween(
          root,
          records[index - 1].introduction,
          record.baseCommit
        ),
        previousManagedFiles
      ).length !== 0
    ) {
      fail(`Maintenance base contains unrecorded managed changes: ${filename}`);
    }
    if (!valuesEqual(recordFilesAt(root, record.baseCommit), filenames.slice(0, index))) {
      fail(`Maintenance base has an invalid record history: ${filename}`);
    }
    if (
      !valuesEqual(
        boundFiles(root, record.baseCommit, {
          allowMissing: true,
          managedFiles: previousManagedFiles,
        }),
        previousBoundFiles
      )
    ) {
      fail(`Maintenance base does not match its predecessor snapshot: ${filename}`);
    }
    if (
      !valuesEqual(
        actionSnapshot(root, record.baseCommit, previousStateVersion),
        previousActions
      ) ||
      !valuesEqual(packageSnapshot(root, record.baseCommit), previousPackages) ||
      !valuesEqual(toolchainSnapshot(root, record.baseCommit), previousToolchain)
    ) {
      fail(`Maintenance base toolchain does not match its predecessor: ${filename}`);
    }

    const introduction = introductions.get(filename);
    if (introduction !== null) {
      const introducedBytes = checkpointBytes(root, introduction, relativePath);
      if (!introducedBytes.equals(bytes)) {
        fail(`Maintenance record history is not append-only: ${relativePath}`);
      }
      runGit(root, [
        "merge-base",
        "--is-ancestor",
        record.baseCommit,
        introduction,
      ]);
      const firstParent = runGit(root, ["rev-parse", `${introduction}^1`])
        .stdout.toString("utf8")
        .trim();
      if (record.baseCommit !== firstParent) {
        fail(`Maintenance record must be based on its introduction's first parent: ${filename}`);
      }
    } else {
      const head = runGit(root, ["rev-parse", "HEAD"])
        .stdout.toString("utf8")
        .trim();
      if (index !== filenames.length - 1 || record.baseCommit !== head) {
        fail(`Only one latest local record may be uncommitted: ${filename}`);
      }
    }
    const targetReference = introduction;
    const targetBoundFiles = boundFiles(root, targetReference, {
      allowMissing: recordStateVersion >= 2,
      managedFiles: recordManagedFiles,
    });
    const targetActions = actionSnapshot(
      root,
      targetReference,
      recordStateVersion
    );
    const targetPackages = packageSnapshot(root, targetReference);
    const targetToolchain = toolchainSnapshot(root, targetReference);
    if (
      !valuesEqual(record.boundFiles, targetBoundFiles) ||
      !valuesEqual(record.actions, targetActions) ||
      !valuesEqual(record.packages, targetPackages) ||
      !valuesEqual(record.toolchain, targetToolchain)
    ) {
      fail(`Maintenance record does not bind its introduction tree: ${filename}`);
    }
    const comparisonBase = boundFiles(root, record.baseCommit, {
      allowMissing: true,
      managedFiles: recordManagedFiles,
    });
    for (const relativePath of previousManagedFiles) {
      if (comparisonBase[relativePath] !== previousBoundFiles[relativePath]) {
        fail(`Maintenance state expansion changed its base: ${relativePath}`);
      }
    }
    const changedFiles = expectedChangedFiles(comparisonBase, targetBoundFiles);
    if (!valuesEqual(record.changedFiles, changedFiles)) {
      fail(`Maintenance record changed-file inventory is stale: ${filename}`);
    }
    const actualPaths =
      targetReference === null
        ? currentChangedPaths(root, record.baseCommit)
        : changedPathsBetween(root, record.baseCommit, targetReference);
    const expectedPaths = [
      ...(record.category === "solidity"
        ? record.transition.repositoryPaths
        : record.changedFiles),
      relativePath,
    ].sort();
    if (!valuesEqual(actualPaths, expectedPaths)) {
      fail(`Maintenance repository delta is not exact: ${filename}`);
    }
    validateTransition(
      root,
      record,
      record.baseCommit,
      targetReference,
      previousActions,
      targetActions,
      previousPackages,
      targetPackages,
      previousToolchain,
      targetToolchain
    );

    records.push({
      ...record,
      filename,
      introduction,
      sha256: sha256(bytes),
    });
    previousBytes = bytes;
    previousBoundFiles = targetBoundFiles;
    previousStateVersion = recordStateVersion;
    previousManagedFiles = recordManagedFiles;
    previousActions = targetActions;
    previousPackages = targetPackages;
    previousToolchain = targetToolchain;
  }

  const latest = records.at(-1);
  const latestStateVersion =
    latest.schemaVersion === 1 ? 1 : latest.stateVersion;
  const latestManagedFiles = managedFilesForState(latestStateVersion);
  if (
    !valuesEqual(currentBoundFiles(root, latestStateVersion), latest.boundFiles) ||
    !valuesEqual(actionSnapshot(root, null, latestStateVersion), latest.actions) ||
    !valuesEqual(packageSnapshot(root), latest.packages) ||
    !valuesEqual(toolchainSnapshot(root), latest.toolchain)
  ) {
    fail("Current managed files do not match the latest maintenance record");
  }
  if (latest.introduction !== null) {
    const unrecorded = maintenanceScopedPaths(
      currentChangedPaths(root, latest.introduction),
      latestManagedFiles
    );
    if (unrecorded.length !== 0) {
      fail(`Managed files changed after the latest maintenance record: ${unrecorded.join(", ")}`);
    }
  }
  return sorted({ latest, records, stage13 });
}

module.exports = Object.freeze({
  BOOTSTRAP_CHANGED_FILES,
  MANAGED_FILES,
  STAGE_13_ANCHOR,
  actionSnapshot,
  currentBoundFiles,
  packageSnapshot,
  sha256,
  stableJson,
  stage13AnchorSha256,
  toolchainSnapshot,
  validateGithubActionTransition,
  validateGovernanceTransition,
  validateJavascriptTransition,
  validateSolidityTransition,
  validateMaintenanceLedger,
});

if (require.main === module) {
  const result = validateMaintenanceLedger();
  console.log(
    `Maintenance policy passed: ${result.records.length} append-only record(s), latest ${result.latest.filename}.`
  );
}
