#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const WORKFLOW_DIRECTORY = path.join(ROOT, ".github", "workflows");
const PNPM_VERSION = "11.13.1";
const FORGE_STD_URL = "https://github.com/foundry-rs/forge-std.git";
const FORGE_STD_BRANCH = "v1";

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const acceptedStatuses = options.acceptedStatuses || [0];
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CI: "true", COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
  });
  if (result.error) throw result.error;
  if (!acceptedStatuses.includes(result.status)) {
    fail(
      `${command} ${args.join(" ")} failed with status ${result.status}: ${
        result.stderr || result.stdout
      }`
    );
  }
  return result;
}

function retry(description, operation) {
  const failures = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      failures.push(`attempt ${attempt}: ${error.message}`);
    }
  }
  fail(`${description} failed after 3 attempts:\n${failures.join("\n")}`);
}

function parseVersion(tag) {
  const match = tag.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!match) fail(`Expected a stable three-part version tag, received ${tag}.`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function remote(repository, refs) {
  return retry(`${repository} remote inventory`, () => {
    const result = run("git", [
      "ls-remote",
      ...(refs.includes("refs/tags/v*") ? ["--tags", "--refs"] : []),
      `https://github.com/${repository}.git`,
      ...refs,
    ]);
    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) fail(`${repository} returned no matching refs.`);
    return lines.map((line) => {
      const [commit, ref] = line.split(/\s+/);
      if (!/^[0-9a-f]{40}$/.test(commit) || !ref) {
        fail(`${repository} returned an invalid ref: ${line}`);
      }
      return { commit, ref };
    });
  });
}

function stableTags(repository) {
  const tags = remote(repository, ["refs/tags/v*"])
    .map(({ ref }) => ref.slice("refs/tags/".length))
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag))
    .map((tag) => ({ tag, version: parseVersion(tag) }))
    .sort((left, right) => compareVersions(left.version, right.version));
  if (tags.length === 0) fail(`${repository} has no stable version tags.`);
  return tags;
}

function actionPins() {
  const files = fs
    .readdirSync(WORKFLOW_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:yml|yaml)$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const pins = new Map();
  for (const file of files) {
    const source = fs.readFileSync(path.join(WORKFLOW_DIRECTORY, file), "utf8");
    const matches = source.matchAll(
      /^[ \t]*(?:-[ \t]+)?uses:\s*([^@\s#]+)@([0-9a-f]{40})\s+#\s*(v\d+\.\d+\.\d+)$/gm
    );
    for (const match of matches) {
      const [, repository, commit, tag] = match;
      const previous = pins.get(repository);
      if (previous && (previous.commit !== commit || previous.tag !== tag)) {
        fail(`${repository} is pinned inconsistently across workflows.`);
      }
      pins.set(repository, { repository, commit, tag });
    }
  }
  if (pins.size === 0) fail("No pinned GitHub Actions were discovered.");
  return [...pins.values()].sort((left, right) =>
    left.repository.localeCompare(right.repository)
  );
}

function actionInventory(pin) {
  const current = parseVersion(pin.tag);
  const pinnedTagRefs = remote(pin.repository, [
    `refs/tags/${pin.tag}`,
    `refs/tags/${pin.tag}^{}`,
  ]);
  const resolvedTag =
    pinnedTagRefs.find(({ ref }) => ref.endsWith("^{}")) || pinnedTagRefs[0];
  if (resolvedTag.commit !== pin.commit) {
    fail(
      `${pin.repository} ${pin.tag} resolves to ${resolvedTag.commit}, not pinned commit ${pin.commit}.`
    );
  }
  const tags = stableTags(pin.repository);
  const latest = tags.at(-1);
  const sameMajor = tags.filter(({ version }) => version[0] === current[0]).at(-1);
  if (!sameMajor) fail(`${pin.repository} has no tags for ${pin.tag}'s major.`);
  return {
    repository: pin.repository,
    pinnedCommit: pin.commit,
    currentTag: pin.tag,
    tagCommitVerified: true,
    latestSameMajorTag: sameMajor.tag,
    latestStableTag: latest.tag,
    sameMajorUpdateAvailable: compareVersions(sameMajor.version, current) > 0,
    majorUpdateAvailable: latest.version[0] > current[0],
  };
}

function pnpmInventory() {
  const actualVersion = run("pnpm", ["--version"]).stdout.trim();
  if (actualVersion !== PNPM_VERSION) {
    fail(`Expected pnpm ${PNPM_VERSION}, received ${actualVersion}.`);
  }
  return retry("pnpm dependency inventory", () => {
    const result = run("pnpm", ["outdated", "--format", "json"], {
      acceptedStatuses: [0, 1],
    });
    if (result.stdout.trim() === "") {
      fail(`pnpm outdated returned no JSON with status ${result.status}.`);
    }
    let outdated;
    try {
      outdated = JSON.parse(result.stdout);
    } catch (error) {
      fail(`pnpm outdated did not return JSON: ${error.message}`);
    }
    if (!outdated || typeof outdated !== "object" || Array.isArray(outdated)) {
      fail("pnpm outdated returned an invalid inventory.");
    }
    const updateCount = Object.keys(outdated).length;
    if (
      (result.status === 1 && updateCount === 0) ||
      (result.status === 0 && updateCount !== 0)
    ) {
      fail(
        `pnpm outdated status ${result.status} is inconsistent with ${updateCount} reported updates.`
      );
    }
    return {
      version: PNPM_VERSION,
      updateCount,
      outdated,
    };
  });
}

function forgeStdInventory() {
  const currentCommit = run("git", ["-C", "lib/forge-std", "rev-parse", "HEAD"])
    .stdout.trim();
  const currentTag = run("git", [
    "-C",
    "lib/forge-std",
    "describe",
    "--tags",
    "--exact-match",
    "HEAD",
  ]).stdout.trim();
  const current = parseVersion(currentTag);
  const tags = stableTags("foundry-rs/forge-std");
  const latest = tags.at(-1);
  const sameMajor = tags.filter(({ version }) => version[0] === current[0]).at(-1);
  const branch = remote("foundry-rs/forge-std", [
    `refs/heads/${FORGE_STD_BRANCH}`,
  ])[0];
  if (!sameMajor || branch.ref !== `refs/heads/${FORGE_STD_BRANCH}`) {
    fail("forge-std v1 inventory is incomplete.");
  }
  return {
    repository: FORGE_STD_URL,
    updateBranch: FORGE_STD_BRANCH,
    currentCommit,
    currentTag,
    remoteBranchCommit: branch.commit,
    branchUpdateAvailable: branch.commit !== currentCommit,
    latestSameMajorTag: sameMajor.tag,
    latestStableTag: latest.tag,
    sameMajorUpdateAvailable: compareVersions(sameMajor.version, current) > 0,
    majorUpdateAvailable: latest.version[0] > current[0],
  };
}

try {
  const inventory = {
    schemaVersion: 1,
    pnpm: pnpmInventory(),
    githubActions: actionPins().map(actionInventory),
    forgeStd: forgeStdInventory(),
  };
  process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
