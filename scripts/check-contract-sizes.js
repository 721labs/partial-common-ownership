#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "out");
const FORGE_BIN = process.env.FORGE_BIN || "forge";
const EIP170_LIMIT = 24_576;

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(entryPath));
    else if (entry.isFile() && entry.name.endsWith(".json"))
      files.push(entryPath);
  }
  return files;
}

function main() {
  const build = spawnSync(FORGE_BIN, ["build"], {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (build.error) throw build.error;
  if (build.status !== 0) {
    throw new Error(
      `Forge build failed:\n${build.stdout || ""}${build.stderr || ""}`
    );
  }

  const contracts = [];
  for (const artifactPath of walk(OUT)) {
    let artifact;
    try {
      artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    } catch {
      continue;
    }
    const target = artifact.metadata?.settings?.compilationTarget;
    if (!target || !artifact.deployedBytecode?.object) continue;
    const entries = Object.entries(target);
    if (entries.length !== 1) continue;
    const [source, contractName] = entries[0];
    if (
      !source.startsWith("contracts/") ||
      source.startsWith("contracts/test/")
    ) {
      continue;
    }
    const object = artifact.deployedBytecode.object.replace(/^0x/, "");
    if (object.length === 0) continue;
    contracts.push({
      name: `${source}:${contractName}`,
      size: object.length / 2,
    });
  }

  const unique = new Map(
    contracts.map((contract) => [contract.name, contract.size])
  );
  const violations = [...unique]
    .filter(([, size]) => size > EIP170_LIMIT)
    .map(([name, size]) => `${name}: ${size} bytes`);
  if (violations.length > 0) {
    throw new Error(`EIP-170 size violations:\n${violations.join("\n")}`);
  }
  for (const required of [
    "contracts/Wrapper.sol:Wrapper",
    "contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership",
  ]) {
    if (!unique.has(required)) {
      throw new Error(`Required production size was not found: ${required}`);
    }
  }
  console.log(
    `Size gate passed: ${unique.size} production artifacts are at or below ${EIP170_LIMIT} bytes.`
  );
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
