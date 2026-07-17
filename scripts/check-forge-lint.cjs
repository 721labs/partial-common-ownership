#!/usr/bin/env node

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ALLOWLIST_PATH = path.join(
  ROOT,
  "compatibility",
  "forge-lint-allowlist.json"
);
const EXPECTED_TOOL = {
  version: "1.7.1",
  commitSha: "4072e48705af9d93e3c0f6e29e93b5e9a40caed8",
  buildProfile: "dist",
};
const EXPECTED_ROOTS = ["contracts", "test/solidity"];
const EXPECTED_SEVERITIES = ["high", "med", "low"];
const DIAGNOSTIC_KEYS = [
  "code",
  "columnEnd",
  "columnStart",
  "end",
  "level",
  "lineEnd",
  "lineStart",
  "message",
  "severity",
  "source",
  "start",
];

function fail(message) {
  throw new Error(message);
}

function assertEqual(actual, expected, description) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      `${description} mismatch.\nExpected: ${JSON.stringify(
        expected,
        null,
        2
      )}\nReceived: ${JSON.stringify(actual, null, 2)}`
    );
  }
}

function assertKeys(value, expected, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${description} must be an object.`);
  }
  assertEqual(Object.keys(value).sort(), [...expected].sort(), description);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareDiagnostics(left, right) {
  const severity =
    EXPECTED_SEVERITIES.indexOf(left.severity) -
    EXPECTED_SEVERITIES.indexOf(right.severity);
  if (severity !== 0) return severity;

  return (
    compareText(left.source, right.source) ||
    left.start - right.start ||
    left.end - right.end ||
    compareText(left.code, right.code) ||
    compareText(left.message, right.message)
  );
}

function sourcePath(relativePath) {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    !EXPECTED_ROOTS.some(
      (root) => relativePath === root || relativePath.startsWith(`${root}/`)
    )
  ) {
    fail(`Forge lint source is outside the reviewed roots: ${relativePath}`);
  }

  const absolutePath = path.resolve(ROOT, relativePath);
  if (!absolutePath.startsWith(`${ROOT}${path.sep}`)) {
    fail(`Forge lint source escapes the repository: ${relativePath}`);
  }
  if (!fs.statSync(absolutePath).isFile()) {
    fail(`Forge lint source is not a file: ${relativePath}`);
  }
  return absolutePath;
}

function validateDiagnosticRecord(diagnostic, description) {
  assertKeys(diagnostic, DIAGNOSTIC_KEYS, description);
  if (!EXPECTED_SEVERITIES.includes(diagnostic.severity)) {
    fail(`${description} has an invalid severity.`);
  }
  if (
    typeof diagnostic.code !== "string" ||
    diagnostic.code.length === 0 ||
    diagnostic.level !== "warning" ||
    typeof diagnostic.source !== "string" ||
    typeof diagnostic.message !== "string" ||
    diagnostic.message.length === 0
  ) {
    fail(`${description} has invalid string fields.`);
  }

  for (const field of [
    "start",
    "end",
    "lineStart",
    "lineEnd",
    "columnStart",
    "columnEnd",
  ]) {
    if (!Number.isSafeInteger(diagnostic[field]) || diagnostic[field] < 0) {
      fail(`${description} has an invalid ${field}.`);
    }
  }
  if (
    diagnostic.end <= diagnostic.start ||
    diagnostic.lineStart < 1 ||
    diagnostic.lineEnd < diagnostic.lineStart ||
    diagnostic.columnStart < 1 ||
    diagnostic.columnEnd < 1
  ) {
    fail(`${description} has an invalid source span.`);
  }

  const bytes = fs.readFileSync(sourcePath(diagnostic.source));
  if (diagnostic.end > bytes.length) {
    fail(`${description} has a source span beyond the end of its file.`);
  }
}

function loadAllowlist() {
  const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8"));
  assertKeys(
    allowlist,
    ["diagnostics", "schemaVersion", "scope", "sourceSha256", "tool"],
    "Forge lint allowlist"
  );
  if (allowlist.schemaVersion !== 1) {
    fail("Forge lint allowlist has an unsupported schema version.");
  }

  assertKeys(
    allowlist.tool,
    ["buildProfile", "commitSha", "version"],
    "Forge lint tool"
  );
  assertEqual(allowlist.tool, EXPECTED_TOOL, "Forge lint tool");

  assertKeys(allowlist.scope, ["roots", "severities"], "Forge lint scope");
  assertEqual(allowlist.scope.roots, EXPECTED_ROOTS, "Forge lint roots");
  assertEqual(
    allowlist.scope.severities,
    EXPECTED_SEVERITIES,
    "Forge lint severities"
  );

  if (!Array.isArray(allowlist.diagnostics)) {
    fail("Forge lint diagnostics must be an array.");
  }
  allowlist.diagnostics.forEach((diagnostic, index) =>
    validateDiagnosticRecord(diagnostic, `Forge lint diagnostic ${index}`)
  );
  const sorted = [...allowlist.diagnostics].sort(compareDiagnostics);
  assertEqual(allowlist.diagnostics, sorted, "Forge lint diagnostic order");
  const unique = new Set(allowlist.diagnostics.map((item) => JSON.stringify(item)));
  if (unique.size !== allowlist.diagnostics.length) {
    fail("Forge lint allowlist contains duplicate diagnostics.");
  }

  assertKeys(
    allowlist.sourceSha256,
    [...new Set(allowlist.diagnostics.map((item) => item.source))],
    "Forge lint source hash inventory"
  );
  for (const [source, expected] of Object.entries(allowlist.sourceSha256)) {
    if (!/^[a-f0-9]{64}$/.test(expected)) {
      fail(`Forge lint source has an invalid SHA-256 digest: ${source}`);
    }
    const actual = sha256(fs.readFileSync(sourcePath(source)));
    if (actual !== expected) {
      fail(
        `Forge lint source digest mismatch for ${source}: expected ${expected}, received ${actual}`
      );
    }
  }

  return allowlist;
}

function runForge(arguments_, description) {
  const result = spawnSync("forge", arguments_, {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      FOUNDRY_PROFILE: "default",
      NO_COLOR: "1",
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(
      `${description} failed with exit code ${result.status}.\n${
        result.stderr || result.stdout
      }`
    );
  }
  return result;
}

function validateForgeVersion() {
  const result = runForge(["--version"], "forge --version");
  const match = result.stdout.trim().match(
    /^forge Version: ([^\n]+)\nCommit SHA: ([0-9a-f]{40})\nBuild Timestamp: [^\n]+\nBuild Profile: ([^\n]+)$/
  );
  if (!match || result.stderr.trim() !== "") {
    fail(`Unexpected forge --version output:\n${result.stdout}${result.stderr}`);
  }
  assertEqual(
    {
      version: match[1],
      commitSha: match[2],
      buildProfile: match[3],
    },
    EXPECTED_TOOL,
    "Forge version"
  );
}

function normalizeForgeDiagnostic(diagnostic, severity, lineNumber) {
  const description = `Forge ${severity} diagnostic line ${lineNumber}`;
  assertKeys(
    diagnostic,
    [
      "$message_type",
      "children",
      "code",
      "level",
      "message",
      "rendered",
      "spans",
    ],
    description
  );
  if (
    diagnostic.$message_type !== "diagnostic" ||
    diagnostic.level !== "warning" ||
    typeof diagnostic.message !== "string" ||
    typeof diagnostic.rendered !== "string" ||
    !Array.isArray(diagnostic.children)
  ) {
    fail(`${description} has an unexpected shape.`);
  }
  assertKeys(diagnostic.code, ["code", "explanation"], `${description} code`);
  if (
    typeof diagnostic.code.code !== "string" ||
    diagnostic.code.explanation !== null
  ) {
    fail(`${description} has an unexpected code.`);
  }
  if (!Array.isArray(diagnostic.spans) || diagnostic.spans.length !== 1) {
    fail(`${description} must contain exactly one source span.`);
  }

  const span = diagnostic.spans[0];
  assertKeys(
    span,
    [
      "byte_end",
      "byte_start",
      "column_end",
      "column_start",
      "file_name",
      "is_primary",
      "label",
      "line_end",
      "line_start",
      "suggested_replacement",
      "text",
    ],
    `${description} span`
  );
  if (
    span.is_primary !== true ||
    span.label !== null ||
    span.suggested_replacement !== null ||
    !Array.isArray(span.text)
  ) {
    fail(`${description} has an unexpected primary span.`);
  }

  const normalized = {
    severity,
    code: diagnostic.code.code,
    level: diagnostic.level,
    source: span.file_name,
    start: span.byte_start,
    end: span.byte_end,
    lineStart: span.line_start,
    lineEnd: span.line_end,
    columnStart: span.column_start,
    columnEnd: span.column_end,
    message: diagnostic.message,
  };
  validateDiagnosticRecord(normalized, description);
  return normalized;
}

function runLintSeverity(severity) {
  const result = runForge(
    [
      "lint",
      ...EXPECTED_ROOTS,
      "--force",
      "--json",
      "--threads",
      "1",
      "--severity",
      severity,
    ],
    `forge lint (${severity})`
  );
  if (result.stdout.trim() !== "") {
    fail(`Forge lint (${severity}) wrote unexpected stdout:\n${result.stdout}`);
  }

  return result.stderr
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, index) => {
      let diagnostic;
      try {
        diagnostic = JSON.parse(line);
      } catch (error) {
        fail(
          `Forge lint (${severity}) emitted non-JSON stderr on line ${
            index + 1
          }: ${error.message}`
        );
      }
      return normalizeForgeDiagnostic(diagnostic, severity, index + 1);
    });
}

function main() {
  const allowlist = loadAllowlist();
  validateForgeVersion();

  const actual = EXPECTED_SEVERITIES.flatMap(runLintSeverity).sort(
    compareDiagnostics
  );
  assertEqual(actual, allowlist.diagnostics, "Forge lint diagnostics");

  const counts = Object.fromEntries(
    EXPECTED_SEVERITIES.map((severity) => [
      severity,
      actual.filter((diagnostic) => diagnostic.severity === severity).length,
    ])
  );
  console.log(
    `Forge lint gate passed: Forge ${EXPECTED_TOOL.version}, ${actual.length} exact diagnostics (${counts.high} high, ${counts.med} med, ${counts.low} low).`
  );
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
