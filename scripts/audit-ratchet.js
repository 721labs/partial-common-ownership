const { spawnSync } = require("child_process");
const path = require("path");

const baseline = require(path.join(
  __dirname,
  "..",
  "compatibility",
  "audit-ratchet.json"
));

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
let report;
const failures = [];

// npm is retiring its legacy audit endpoint and intermittently returns HTTP
// 410 while pnpm retries through the bulk advisory endpoint. Retry the command
// itself so a transient registry response cannot make the ratchet flaky.
for (let attempt = 1; attempt <= 3; attempt += 1) {
  const result = spawnSync(pnpm, ["audit", "--json"], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });

  if (result.error) {
    failures.push(`attempt ${attempt}: ${result.error.message}`);
    continue;
  }

  try {
    const candidate = JSON.parse(result.stdout);
    if (candidate.metadata && candidate.metadata.vulnerabilities) {
      report = candidate;
      break;
    }
    failures.push(`attempt ${attempt}: ${JSON.stringify(candidate.error || candidate)}`);
  } catch (error) {
    failures.push(`attempt ${attempt}: audit output was not valid JSON`);
  }
}

if (!report) {
  console.error("pnpm audit failed to return vulnerability counts after 3 attempts.");
  failures.forEach((failure) => console.error(failure));
  process.exit(2);
}

const counts = report.metadata.vulnerabilities;

console.log(
  `Audit counts: critical=${counts.critical}, high=${counts.high}, moderate=${counts.moderate}, low=${counts.low}, info=${counts.info}`
);

const regressions = ["critical", "high"].filter(
  (severity) => counts[severity] > baseline.policy[severity]
);

if (regressions.length > 0) {
  for (const severity of regressions) {
    console.error(
      `${severity} vulnerabilities increased from ${baseline.policy[severity]} to ${counts[severity]}`
    );
  }
  process.exit(1);
}
