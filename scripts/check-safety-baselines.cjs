#!/usr/bin/env node

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "compatibility", "safety-baselines.json");
const REQUIRED_ARTIFACTS = ["coverage/lcov.info", "gas/key-flows.snap"];

function sha256(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function verifySafetyBaselines() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing safety-baseline manifest: ${MANIFEST_PATH}`);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.candidate !== "stage-07-foundry-safety" ||
    !manifest.artifacts ||
    typeof manifest.artifacts !== "object" ||
    Array.isArray(manifest.artifacts)
  ) {
    throw new Error("Safety-baseline manifest has an invalid schema");
  }

  const names = Object.keys(manifest.artifacts).sort();
  if (JSON.stringify(names) !== JSON.stringify(REQUIRED_ARTIFACTS)) {
    throw new Error(
      `Safety-baseline manifest must bind exactly: ${REQUIRED_ARTIFACTS.join(
        ", "
      )}`
    );
  }

  for (const relativePath of names) {
    const artifactPath = path.resolve(ROOT, relativePath);
    if (!artifactPath.startsWith(`${ROOT}${path.sep}`)) {
      throw new Error(
        `Safety baseline escapes the repository: ${relativePath}`
      );
    }
    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Missing checked-in safety baseline: ${relativePath}`);
    }

    const expected = manifest.artifacts[relativePath]?.sha256;
    if (!/^[a-f0-9]{64}$/.test(expected || "")) {
      throw new Error(`Invalid SHA-256 binding for ${relativePath}`);
    }
    const actual = sha256(artifactPath);
    if (actual !== expected) {
      throw new Error(
        `${relativePath} does not match its reviewed SHA-256 binding: expected ${expected}, received ${actual}`
      );
    }
  }

  return manifest;
}

if (require.main === module) {
  try {
    verifySafetyBaselines();
    console.log(
      `Safety-baseline binding passed: ${REQUIRED_ARTIFACTS.length} reviewed artifacts.`
    );
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  }
}

module.exports = { verifySafetyBaselines };
