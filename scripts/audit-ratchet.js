const { spawnSync } = require("child_process");
const path = require("path");

const baseline = require(path.join(
  __dirname,
  "..",
  "compatibility",
  "audit-ratchet.json"
));

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(pnpm, ["audit", "--json"], {
  cwd: path.join(__dirname, ".."),
  encoding: "utf8",
});

if (result.error) {
  console.error(`Unable to run pnpm audit: ${result.error.message}`);
  process.exit(2);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch (error) {
  console.error("pnpm audit did not return a JSON report.");
  if (result.stderr) console.error(result.stderr.trim());
  process.exit(2);
}

const counts = report.metadata && report.metadata.vulnerabilities;
if (!counts) {
  console.error("pnpm audit report did not include vulnerability counts.");
  process.exit(2);
}

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
