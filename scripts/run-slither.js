#!/usr/bin/env node

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SLITHER_VERSION = "0.11.5";
const SOLC_LONG_VERSION = "0.8.36+commit.8a079791";
const SLITHER_CONFIG_PATH = path.join(ROOT, "slither.config.json");
const EXPECTED_CONFIG = {
  compile_force_framework: "solc",
  detectors_to_run: "all",
  disable_color: true,
  exclude_dependencies: true,
  fail_on: "medium",
  filter_paths: "(^|/)(node_modules|lib)/",
  solc_args: "--evm-version london --optimize-runs 200",
  solc_remaps: "@openzeppelin/=node_modules/@openzeppelin/",
};

const APPROVED_SUPPRESSIONS = [
  "contracts/token/PartialCommonOwnership.sol:34:reentrancy-eth:_safeMint(leasee_, tokenId_);",
  "contracts/token/modules/Remittance.sol:73:incorrect-equality:if (balance == 0) revert NoOutstandingBalance();",
  "contracts/token/modules/Remittance.sol:109:incorrect-equality:if (remittance_ == 0) revert AmountZero();",
  "contracts/token/modules/Taxation.sol:94:incorrect-equality:if (owed == 0) return;",
  "contracts/token/modules/Taxation.sol:200:divide-before-multiply:return",
].sort();

function fail(message) {
  console.error(message);
  process.exit(1);
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
  });

  if (result.error) {
    fail(`Unable to run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "");
    fail(`${command} exited with status ${result.status}`);
  }

  return `${result.stdout || ""}${result.stderr || ""}`.trim();
}

function solidityFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return solidityFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".sol") ? [absolute] : [];
  });
}

function normalizedJson(value) {
  if (Array.isArray(value)) return value.map(normalizedJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizedJson(value[key])])
    );
  }
  return value;
}

function verifyConfiguration() {
  const actual = JSON.parse(fs.readFileSync(SLITHER_CONFIG_PATH, "utf8"));
  if (
    JSON.stringify(normalizedJson(actual)) !==
    JSON.stringify(normalizedJson(EXPECTED_CONFIG))
  ) {
    fail(
      `Slither configuration drifted from the reviewed settings:\n${JSON.stringify(
        actual,
        null,
        2
      )}`
    );
  }
}

function verifyProductionClosure(productionRoots) {
  const expected = new Set(
    productionRoots.map((filename) => path.resolve(filename))
  );
  const closure = new Set();
  const queue = [path.join(ROOT, "contracts", "Wrapper.sol")];
  const contractsRoot = `${path.join(ROOT, "contracts")}${path.sep}`;

  while (queue.length > 0) {
    const filename = path.resolve(queue.pop());
    if (closure.has(filename)) continue;
    if (!fs.existsSync(filename)) {
      fail(`Production import is missing: ${path.relative(ROOT, filename)}`);
    }
    closure.add(filename);

    const source = fs.readFileSync(filename, "utf8");
    const imports = source.matchAll(
      /\bimport\s+(?:[^'";]+\s+from\s+)?["']([^"']+)["']\s*;/g
    );
    for (const match of imports) {
      const specifier = match[1];
      let imported;
      if (specifier.startsWith(".")) {
        imported = path.resolve(path.dirname(filename), specifier);
      } else if (specifier.startsWith("contracts/")) {
        imported = path.resolve(ROOT, specifier);
      } else {
        continue;
      }
      if (!imported.startsWith(contractsRoot)) {
        fail(`Production import escapes contracts/: ${specifier}`);
      }
      queue.push(imported);
    }
  }

  const missing = [...expected].filter((filename) => !closure.has(filename));
  const unexpected = [...closure].filter((filename) => !expected.has(filename));
  if (missing.length || unexpected.length) {
    fail(
      [
        "Wrapper.sol must transitively include the exact shipped production source inventory:",
        ...missing.map(
          (filename) => `  missing: ${path.relative(ROOT, filename)}`
        ),
        ...unexpected.map(
          (filename) => `  unexpected: ${path.relative(ROOT, filename)}`
        ),
      ].join("\n")
    );
  }
}

function verifySuppressions() {
  const found = [];
  const productionRoots = [
    path.join(ROOT, "contracts", "Wrapper.sol"),
    ...solidityFiles(path.join(ROOT, "contracts", "token")),
  ];

  if (productionRoots.length !== 13) {
    fail(
      `Expected 13 shipped production sources; found ${productionRoots.length}`
    );
  }
  verifyProductionClosure(productionRoots);

  for (const filename of productionRoots) {
    const relative = path.relative(ROOT, filename).split(path.sep).join("/");
    const lines = fs.readFileSync(filename, "utf8").split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].includes("slither-disable")) continue;

      const match = lines[index].match(
        /^\s*\/\/\s*slither-disable-next-line\s+([a-z0-9-]+)\s*$/
      );
      if (!match) {
        fail(
          `Unapproved Slither suppression form at ${relative}:${index + 1}; ` +
            "only reviewed disable-next-line comments are allowed"
        );
      }

      let guardedIndex = index + 1;
      while (
        guardedIndex < lines.length &&
        lines[guardedIndex].trim().length === 0
      ) {
        guardedIndex += 1;
      }
      if (guardedIndex === lines.length) {
        fail(`Slither suppression at ${relative}:${index + 1} guards no code`);
      }

      found.push(
        `${relative}:${index + 1}:${match[1]}:${lines[guardedIndex].trim()}`
      );
    }
  }

  found.sort();
  const missing = APPROVED_SUPPRESSIONS.filter((item) => !found.includes(item));
  const extra = found.filter((item) => !APPROVED_SUPPRESSIONS.includes(item));
  const duplicates = found.filter(
    (item, index) => found.indexOf(item) !== index
  );
  if (
    missing.length ||
    extra.length ||
    duplicates.length ||
    found.length !== APPROVED_SUPPRESSIONS.length
  ) {
    fail(
      [
        "Slither suppression inventory drifted from the reviewed triage:",
        ...missing.map((item) => `  missing: ${item}`),
        ...extra.map((item) => `  unapproved: ${item}`),
        ...duplicates.map((item) => `  duplicate: ${item}`),
      ].join("\n")
    );
  }
}

const slitherVersion = commandOutput("slither", ["--version"]);
if (slitherVersion !== SLITHER_VERSION) {
  fail(`Expected Slither ${SLITHER_VERSION}, received ${slitherVersion}`);
}

const solcVersion = commandOutput("solc", ["--version"]);
if (
  !new RegExp(
    `^Version: ${SOLC_LONG_VERSION.replace(/[.+]/g, "\\$&")}(?:\\.|$)`,
    "m"
  ).test(solcVersion)
) {
  fail(`Expected solc ${SOLC_LONG_VERSION}, received:\n${solcVersion}`);
}

verifyConfiguration();
verifySuppressions();

const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "partial-common-ownership-slither-")
);
const reportPath = path.join(temporaryDirectory, "slither.json");

try {
  const result = spawnSync(
    "slither",
    [
      path.join(ROOT, "contracts", "Wrapper.sol"),
      "--config-file",
      SLITHER_CONFIG_PATH,
      "--solc-working-dir",
      ROOT,
      "--json",
      reportPath,
    ],
    {
      // Running outside the repository prevents crytic-compile from silently
      // replacing the pinned solc settings with Foundry auto-detection.
      cwd: temporaryDirectory,
      encoding: "utf8",
    }
  );

  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.error) fail(`Unable to run Slither: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`Slither exited with status ${result.status}`);
  }

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (report.success !== true)
    fail("Slither did not produce a successful report");

  const findings = report.results?.detectors || [];
  const untriaged = findings.filter(
    (finding) => finding.impact === "High" || finding.impact === "Medium"
  );
  if (untriaged.length) {
    fail(
      `Slither reported ${untriaged.length} untriaged high/medium finding(s)`
    );
  }

  const counts = findings.reduce((result, finding) => {
    result[finding.impact] = (result[finding.impact] || 0) + 1;
    return result;
  }, {});
  console.log(
    `Slither ${SLITHER_VERSION}: zero untriaged high/medium findings; ` +
      `${counts.Low || 0} acknowledged low and ` +
      `${counts.Informational || 0} acknowledged informational findings.`
  );
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
