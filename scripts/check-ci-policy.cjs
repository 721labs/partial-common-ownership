#!/usr/bin/env node

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  validateMaintenanceLedger,
} = require("./maintenance-policy.cjs");

const ROOT = path.resolve(__dirname, "..");
const MAINTENANCE = validateMaintenanceLedger({ root: ROOT });
const CURRENT_MAINTENANCE = MAINTENANCE.latest;
const WORKFLOW_DIRECTORY = path.join(ROOT, ".github", "workflows");
const WORKFLOW_PATH = path.join(WORKFLOW_DIRECTORY, "tests.yml");
const DEPENDABOT_PATH = path.join(ROOT, ".github", "dependabot.yml");
const GITMODULES_PATH = path.join(ROOT, ".gitmodules");
const EXPECTED_WORKFLOW_SHA256 =
  CURRENT_MAINTENANCE.boundFiles[".github/workflows/tests.yml"];
const EXPECTED_DEPENDABOT_SHA256 =
  CURRENT_MAINTENANCE.boundFiles[".github/dependabot.yml"];

const EXPECTED_ACTIONS = new Map(
  Object.entries(CURRENT_MAINTENANCE.actions).map(([name, pin]) => [
    `${name}@${pin.commit}`,
    { count: pin.count, tag: pin.tag },
  ])
);
const UPLOAD_ARTIFACT = CURRENT_MAINTENANCE.actions["actions/upload-artifact"];
if (!UPLOAD_ARTIFACT) {
  throw new Error("The maintenance record must bind actions/upload-artifact.");
}

const EXPECTED_JOBS = new Map([
  ["forge-tests", 15],
  ["hardhat-integration", 15],
  ["compatibility", 20],
  ["coverage", 15],
  ["gas", 15],
  ["package-consumers", 20],
  ["forge-quality", 10],
  ["slither", 15],
  ["dependency-audit", 10],
  ["foundry-scheduled", 45],
]);
const FOUNDRY_JOBS = new Set([
  "forge-tests",
  "compatibility",
  "coverage",
  "gas",
  "package-consumers",
  "forge-quality",
  "foundry-scheduled",
]);
const HISTORY_JOBS = new Set([
  "forge-tests",
  "compatibility",
  "forge-quality",
  "foundry-scheduled",
]);

function exactStep(name, body) {
  return `      - name: "${name}"\n${body}\n`;
}

const REQUIRED_STEPS = new Map([
  [
    "forge-tests",
    [
      exactStep(
        "Build and enforce Forge compiler warnings",
        '        run: "pnpm run compiler-warnings:forge"'
      ),
      exactStep(
        "Run fixed-seed Forge safety suite",
        '        run: "pnpm run test:safety"'
      ),
      exactStep(
        "Enforce EIP-170 contract sizes",
        '        run: "pnpm run size:check"'
      ),
    ],
  ],
  [
    "hardhat-integration",
    [
      exactStep(
        "Type-check Hardhat configuration and smokes",
        '        run: "pnpm run typecheck"'
      ),
      exactStep(
        "Build and enforce Hardhat compiler warnings",
        '        run: "pnpm run compiler-warnings:hardhat"'
      ),
      exactStep(
        "Run three interoperability smokes",
        '        run: "pnpm run test:hardhat:smoke"'
      ),
    ],
  ],
  [
    "compatibility",
    [
      exactStep(
        "Enforce reviewed safety-baseline bindings",
        '        run: "pnpm run safety-baselines:check"'
      ),
      exactStep(
        "Enforce compatibility manifest",
        '        run: "pnpm run compatibility"'
      ),
    ],
  ],
  [
    "coverage",
    [
      exactStep(
        "Enforce Forge LCOV baseline",
        '        run: "pnpm run coverage:forge"'
      ),
    ],
  ],
  [
    "gas",
    [
      exactStep(
        "Enforce key-flow gas baseline",
        '        run: "pnpm run gas:check"'
      ),
    ],
  ],
  [
    "package-consumers",
    [
      exactStep(
        "Test packed package consumers",
        '        run: "pnpm run test:package"'
      ),
    ],
  ],
  [
    "forge-quality",
    [
      exactStep(
        "Check Solidity formatting",
        '        run: "pnpm run fmt:forge"'
      ),
      exactStep(
        "Run Forge lint",
        '        run: "pnpm run lint:forge"'
      ),
      exactStep(
        "Enforce immutable CI and maintenance policy",
        '        run: "pnpm run ci:policy"'
      ),
    ],
  ],
  [
    "slither",
    [
      exactStep(
        "Install Slither and Solidity compiler",
        `        run: |
          python -m pip install --disable-pip-version-check "slither-analyzer==0.11.5"
          test "$(slither --version)" = "0.11.5"
          solc-select install 0.8.36
          solc-select use 0.8.36
          solc --version | grep -Eq '^Version: 0\\.8\\.36\\+'`
      ),
      exactStep("Run Slither", '        run: "pnpm run slither"'),
    ],
  ],
  [
    "dependency-audit",
    [
      exactStep(
        "Enforce zero critical and high findings",
        '        run: "pnpm run audit:ratchet"'
      ),
    ],
  ],
  [
    "foundry-scheduled",
    [
      exactStep(
        "Generate and log rotating seed",
        [
          "        id: seed",
          "        shell: bash",
          "        run: |",
          `          seed="0x$(printf '%s' "\${GITHUB_RUN_ID}:\${GITHUB_RUN_ATTEMPT}" | sha256sum | cut -d ' ' -f 1)"`,
          '          echo "FOUNDRY_FUZZ_SEED=$seed" >> "$GITHUB_ENV"',
          '          echo "seed=$seed" >> "$GITHUB_OUTPUT"',
          `          printf '%s\\n' "$seed" > "$RUNNER_TEMP/foundry-seed.txt"`,
          '          echo "Foundry seed: \\`$seed\\`" >> "$GITHUB_STEP_SUMMARY"',
        ].join("\n")
      ),
      exactStep(
        "Record exact dependency update inventory",
        '        run: "pnpm --silent maintenance:inventory > $RUNNER_TEMP/dependency-inventory.json"'
      ),
      exactStep(
        "Run scheduled fuzz and invariant profile",
        `        timeout-minutes: 40
        shell: bash
        run: |
          set -o pipefail
          pnpm run test:safety:scheduled 2>&1 | tee "$RUNNER_TEMP/foundry-scheduled.log"`
      ),
      exactStep(
        "Upload minimized failures, seed, and log",
        `        if: \${{ always() }}
        uses: actions/upload-artifact@${UPLOAD_ARTIFACT.commit} # ${UPLOAD_ARTIFACT.tag}
        with:
          name: foundry-scheduled-\${{ github.run_id }}-\${{ github.run_attempt }}
          path: |
            cache/fuzz
            cache/invariant
            \${{ runner.temp }}/foundry-seed.txt
            \${{ runner.temp }}/foundry-scheduled.log
            \${{ runner.temp }}/dependency-inventory.json
          if-no-files-found: error
          retention-days: 14`
      ),
    ],
  ],
]);

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function assertCount(text, pattern, expected, description) {
  const actual = countMatches(text, pattern);
  if (actual !== expected) {
    fail(`${description}: expected ${expected}, received ${actual}.`);
  }
}

function parseJobs(workflow) {
  const jobsStart = workflow.indexOf("\njobs:\n");
  if (jobsStart === -1) fail("Workflow is missing its jobs mapping.");

  const jobsText = workflow.slice(jobsStart + 1);
  const headers = [...jobsText.matchAll(/^  ([a-z0-9-]+):\n/gm)];
  const jobs = new Map();
  for (let index = 0; index < headers.length; index += 1) {
    const current = headers[index];
    const next = headers[index + 1];
    jobs.set(
      current[1],
      jobsText.slice(current.index, next ? next.index : jobsText.length)
    );
  }
  return jobs;
}

function parseSteps(job, body) {
  const headers = [...body.matchAll(/^      - name: "([^"]+)"\n/gm)];
  const steps = new Map();
  for (let index = 0; index < headers.length; index += 1) {
    const current = headers[index];
    const next = headers[index + 1];
    if (steps.has(current[1])) {
      fail(`${job} has a duplicate step name: ${current[1]}.`);
    }
    steps.set(
      current[1],
      body
        .slice(current.index, next ? next.index : body.length)
        .replace(/\n+$/, "\n")
    );
  }
  return steps;
}

function checkWorkflow() {
  const workflowFiles = fs
    .readdirSync(WORKFLOW_DIRECTORY, { withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && /\.(?:yml|yaml)$/.test(entry.name)
    )
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(workflowFiles) !== JSON.stringify(["tests.yml"])) {
    fail(
      `Workflow inventory changed; every workflow must be reviewed by this gate: ${workflowFiles.join(
        ", "
      )}.`
    );
  }
  const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
  if (sha256(workflow) !== EXPECTED_WORKFLOW_SHA256) {
    fail(
      "Workflow bytes changed; update the reviewed immutable workflow binding before proceeding."
    );
  }
  if (workflow.includes("ubuntu-latest")) {
    fail("CI runners must be pinned; ubuntu-latest is forbidden.");
  }
  if (/persist-credentials:\s*true/.test(workflow)) {
    fail("Checkout credentials must never be persisted.");
  }
  if (workflow.includes("continue-on-error")) {
    fail("CI jobs and steps must remain blocking; continue-on-error is forbidden.");
  }

  const conditionalLines = workflow
    .split("\n")
    .filter((line) => /^\s+if\s*:/.test(line));
  const expectedConditionalLines = [
    "    if: ${{ github.event_name == 'schedule' || (github.event_name == 'workflow_dispatch' && inputs.run_scheduled_safety) }}",
    "        if: ${{ always() }}",
  ];
  if (
    JSON.stringify(conditionalLines) !==
    JSON.stringify(expectedConditionalLines)
  ) {
    fail(
      `Workflow condition inventory changed: ${conditionalLines.join(" | ")}.`
    );
  }
  const manualScheduledInput = `  workflow_dispatch:
    inputs:
      run_scheduled_safety:
        description: "Run the 45-minute scheduled fuzz/invariant profile and upload its evidence"
        required: false
        default: false
        type: boolean`;
  assertCount(
    workflow,
    new RegExp(manualScheduledInput.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
    1,
    "opt-in manual scheduled-safety input"
  );

  const permissions = workflow.match(
    /^permissions:\n((?:  [a-z-]+:\s*[^\n]+\n)+)/m
  );
  if (!permissions || permissions[1] !== "  contents: read\n") {
    fail("Top-level workflow permissions must be exactly contents: read.");
  }
  assertCount(workflow, /^permissions:$/gm, 1, "top-level permissions block");
  if (
    /^[ \t]+permissions:/m.test(workflow) ||
    /:\s*(?:write|write-all)\s*$/m.test(workflow)
  ) {
    fail("Jobs may not override the read-only top-level permissions policy.");
  }

  const actionLines = [...
    workflow.matchAll(
      /^[ \t]*(?:-[ \t]+)?uses:\s*([^\s#]+)(?:\s+#\s*([^\n]+))?$/gm
    ),
  ];
  const nonCanonicalMappingLines = workflow
    .split("\n")
    .filter(
      (line) =>
        /^[ \t]*-[ \t]*\{/.test(line) ||
        /^[ \t]*(?:-[ \t]*)?["'][^"']+["'][ \t]*:/.test(line) ||
        /^[ \t]*\?/.test(line)
    );
  if (nonCanonicalMappingLines.length > 0) {
    fail(
      `Workflow mapping syntax must remain canonical and reviewable: ${nonCanonicalMappingLines.join(
        " | "
      )}`
    );
  }
  const usesTokens = countMatches(workflow, /\buses\b/g);
  if (usesTokens !== actionLines.length) {
    fail(
      `Workflow contains non-canonical or unreviewed uses syntax: parsed ${actionLines.length} of ${usesTokens} uses keys.`
    );
  }
  const actualActionCounts = new Map();
  for (const match of actionLines) {
    const action = match[1];
    const comment = match[2];
    if (!/^[^@\s]+@[0-9a-f]{40}$/.test(action)) {
      fail(`External action is not pinned to a full commit SHA: ${action}`);
    }
    const expected = EXPECTED_ACTIONS.get(action);
    if (!expected) fail(`Unreviewed external action: ${action}`);
    if (comment !== expected.tag) {
      fail(
        `Action ${action} must retain its reviewed ${expected.tag} tag comment.`
      );
    }
    actualActionCounts.set(action, (actualActionCounts.get(action) || 0) + 1);
  }
  for (const [action, expected] of EXPECTED_ACTIONS) {
    const actual = actualActionCounts.get(action) || 0;
    if (actual !== expected.count) {
      fail(`Action ${action}: expected ${expected.count} uses, received ${actual}.`);
    }
  }

  const jobs = parseJobs(workflow);
  if (
    JSON.stringify([...jobs.keys()].sort()) !==
    JSON.stringify([...EXPECTED_JOBS.keys()].sort())
  ) {
    fail(
      `CI job inventory mismatch. Expected ${[...EXPECTED_JOBS.keys()].join(
        ", "
      )}; received ${[...jobs.keys()].join(", ")}.`
    );
  }

  for (const [job, timeout] of EXPECTED_JOBS) {
    const body = jobs.get(job);
    assertCount(
      body,
      /^    runs-on: ubuntu-24\.04$/gm,
      1,
      `${job} pinned runner`
    );
    assertCount(
      body,
      new RegExp(`^    timeout-minutes: ${timeout}$`, "gm"),
      1,
      `${job} job timeout`
    );
    assertCount(
      body,
      /^          node-version: "24\.18\.0"$/gm,
      1,
      `${job} Node version`
    );
    assertCount(
      body,
      /^          corepack install --global pnpm@11\.13\.1$/gm,
      1,
      `${job} pnpm version`
    );
    assertCount(
      body,
      /^        run: "pnpm install --frozen-lockfile"$/gm,
      1,
      `${job} frozen install`
    );
    assertCount(
      body,
      /uses: actions\/checkout@[0-9a-f]{40}/g,
      1,
      `${job} checkout`
    );
    assertCount(
      body,
      /uses: actions\/setup-node@[0-9a-f]{40}/g,
      1,
      `${job} Node setup action`
    );
    assertCount(
      body,
      /uses: foundry-rs\/foundry-toolchain@[0-9a-f]{40}/g,
      FOUNDRY_JOBS.has(job) ? 1 : 0,
      `${job} Foundry setup action`
    );
    assertCount(
      body,
      /uses: actions\/setup-python@[0-9a-f]{40}/g,
      job === "slither" ? 1 : 0,
      `${job} Python setup action`
    );
    assertCount(
      body,
      /uses: actions\/upload-artifact@[0-9a-f]{40}/g,
      job === "foundry-scheduled" ? 1 : 0,
      `${job} artifact upload action`
    );
    assertCount(
      body,
      /^          version: v1\.7\.1$/gm,
      FOUNDRY_JOBS.has(job) ? 1 : 0,
      `${job} Foundry version`
    );

    const checkoutStart = body.search(/uses: actions\/checkout@[0-9a-f]{40}/);
    const nextStep = body.indexOf("\n      - name:", checkoutStart);
    const checkout = body.slice(
      checkoutStart,
      nextStep === -1 ? body.length : nextStep
    );
    assertCount(
      checkout,
      /^          submodules: recursive$/gm,
      1,
      `${job} recursive submodules`
    );
    assertCount(
      checkout,
      /^          persist-credentials: false$/gm,
      1,
      `${job} disabled checkout credentials`
    );
    assertCount(
      checkout,
      /^          fetch-depth: 0$/gm,
      HISTORY_JOBS.has(job) ? 1 : 0,
      `${job} immutable-checkpoint history`
    );

    const steps = parseSteps(job, body);
    for (const expectedStep of REQUIRED_STEPS.get(job)) {
      const name = expectedStep.match(/^      - name: "([^"]+)"/)[1];
      const actualStep = steps.get(name);
      if (actualStep !== expectedStep) {
        fail(`${job} must retain the exact blocking step: ${name}.`);
      }
    }
  }

  assertCount(
    workflow,
    /^          corepack install --global pnpm@/gm,
    EXPECTED_JOBS.size,
    "complete pnpm install inventory"
  );
  assertCount(
    workflow,
    /^        run: "pnpm install /gm,
    EXPECTED_JOBS.size,
    "complete dependency-install inventory"
  );

  return { actions: actionLines.length, jobs: jobs.size };
}

function checkDependabot() {
  const dependabot = fs.readFileSync(DEPENDABOT_PATH, "utf8");
  if (sha256(dependabot) !== EXPECTED_DEPENDABOT_SHA256) {
    fail(
      "Dependabot bytes changed; update the reviewed immutable maintenance binding before proceeding."
    );
  }
  if (!/^version: 2$/m.test(dependabot)) {
    fail("Dependabot configuration must use schema version 2.");
  }
  const ecosystems = [...
    dependabot.matchAll(/^  - package-ecosystem: "([^"]+)"$/gm),
  ].map((match) => match[1]);
  const expected = ["npm", "github-actions", "gitsubmodule"];
  if (JSON.stringify(ecosystems) !== JSON.stringify(expected)) {
    fail(
      `Dependabot ecosystem inventory mismatch: received ${ecosystems.join(", ")}.`
    );
  }
  assertCount(
    dependabot,
    /^      interval: "weekly"$/gm,
    3,
    "weekly Dependabot schedules"
  );
  assertCount(
    dependabot,
    /^      day: "monday"$/gm,
    3,
    "Monday Dependabot schedules"
  );
  assertCount(
    dependabot,
    /^      timezone: "America\/Los_Angeles"$/gm,
    3,
    "Dependabot schedule timezones"
  );
  assertCount(
    dependabot,
    /^    directory: "\/"$/gm,
    3,
    "Dependabot root directories"
  );
  assertCount(
    dependabot,
    /^      time: "09:00"$/gm,
    3,
    "Dependabot schedule times"
  );
  assertCount(
    dependabot,
    /^        update-types:\n          - "minor"\n          - "patch"$/gm,
    3,
    "minor/patch-only semantic-version groups"
  );
  if (/^\s+- "major"$/m.test(dependabot)) {
    fail("Major dependency updates must remain outside grouped updates.");
  }
  const expectedGroups = [
    "production-minor-and-patch",
    "development-minor-and-patch",
    "actions-minor-and-patch",
    "forge-std-updates",
  ];
  const groups = [...dependabot.matchAll(/^      ([a-z][a-z0-9-]+):$/gm)].map(
    (match) => match[1]
  );
  if (JSON.stringify(groups) !== JSON.stringify(expectedGroups)) {
    fail(`Dependabot group inventory mismatch: received ${groups.join(", ")}.`);
  }
  for (const group of expectedGroups) {
    assertCount(
      dependabot,
      new RegExp(`^      ${group}:$`, "gm"),
      1,
      `Dependabot ${group} group`
    );
  }
  const expectedGroupBlocks = [
    `      production-minor-and-patch:
        applies-to: "version-updates"
        dependency-type: "production"
        patterns:
          - "*"
        update-types:
          - "minor"
          - "patch"`,
    `      development-minor-and-patch:
        applies-to: "version-updates"
        dependency-type: "development"
        patterns:
          - "*"
        update-types:
          - "minor"
          - "patch"`,
    `      actions-minor-and-patch:
        applies-to: "version-updates"
        patterns:
          - "*"
        update-types:
          - "minor"
          - "patch"`,
    `      forge-std-updates:
        applies-to: "version-updates"
        patterns:
          - "lib/forge-std"`,
  ];
  for (const block of expectedGroupBlocks) {
    assertCount(
      dependabot,
      new RegExp(block.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      1,
      `exact Dependabot group ${block.split(":", 1)[0].trim()}`
    );
  }
  if (/^\s+(?:allow|ignore|exclude-patterns):/m.test(dependabot)) {
    fail("Dependabot allow, ignore, and exclude rules require explicit policy review.");
  }

  const gitmodules = fs.readFileSync(GITMODULES_PATH, "utf8");
  assertCount(
    gitmodules,
    /^\s*branch = v1$/gm,
    1,
    "forge-std v1 update fence"
  );
  if (/^\s*branch = (?:master|main)$/m.test(gitmodules)) {
    fail("forge-std updates must not track an unbounded default branch.");
  }

  return ecosystems.length;
}

try {
  const workflow = checkWorkflow();
  const ecosystems = checkDependabot();
  console.log(
    `CI policy gate passed: ${workflow.jobs} pinned jobs, ${workflow.actions} immutable action uses, ${ecosystems} weekly Dependabot ecosystems.`
  );
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
