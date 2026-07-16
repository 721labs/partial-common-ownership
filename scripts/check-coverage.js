#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const COUNTER_FIELDS = Object.freeze({
  LF: "linesFound",
  LH: "linesHit",
  FNF: "functionsFound",
  FNH: "functionsHit",
  BRF: "branchesFound",
  BRH: "branchesHit",
});

function normalizeSource(source) {
  const normalized = source.replace(/\\/g, "/");
  const root = ROOT.replace(/\\/g, "/");
  if (normalized.startsWith(`${root}/`)) {
    return normalized.slice(root.length + 1);
  }
  return normalized.replace(/^\.\//, "");
}

function parseCounter(line, prefix, source) {
  const value = line.slice(prefix.length + 1);
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`${source}: malformed ${prefix} counter: ${value}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${source}: unsafe ${prefix} counter: ${value}`);
  }
  return parsed;
}

function completeRecord(records, current) {
  const missing = Object.keys(COUNTER_FIELDS).filter(
    (field) => !current.seen.has(field)
  );
  if (missing.length > 0) {
    throw new Error(
      `${current.source}: incomplete LCOV summary; missing ${missing.join(
        ", "
      )}`
    );
  }
  if (
    current.linesHit > current.linesFound ||
    current.functionsHit > current.functionsFound ||
    current.branchesHit > current.branchesFound
  ) {
    throw new Error(`${current.source}: LCOV hits exceed discovered entries`);
  }

  if (
    current.source.startsWith("contracts/") &&
    !current.source.startsWith("contracts/test/")
  ) {
    if (records.has(current.source)) {
      throw new Error(
        `${current.source}: duplicate normalized production LCOV record`
      );
    }
    const { seen, ...record } = current;
    records.set(current.source, record);
  }
}

function parseLcov(filePath) {
  const records = new Map();
  let current = null;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      if (current) {
        throw new Error(
          `${current.source}: nested SF record before end_of_record`
        );
      }
      const source = normalizeSource(line.slice(3));
      if (!source) throw new Error("LCOV record has an empty source path");
      current = {
        source,
        linesFound: 0,
        linesHit: 0,
        functionsFound: 0,
        functionsHit: 0,
        branchesFound: 0,
        branchesHit: 0,
        seen: new Set(),
      };
      continue;
    }

    if (line === "end_of_record") {
      if (!current) throw new Error("LCOV has end_of_record without SF");
      completeRecord(records, current);
      current = null;
      continue;
    }

    if (!current) continue;
    for (const [prefix, field] of Object.entries(COUNTER_FIELDS)) {
      if (line.startsWith(`${prefix}:`)) {
        if (current.seen.has(prefix)) {
          throw new Error(`${current.source}: duplicate ${prefix} counter`);
        }
        current[field] = parseCounter(line, prefix, current.source);
        current.seen.add(prefix);
        break;
      }
    }
  }
  if (current) {
    throw new Error(`${current.source}: unterminated LCOV record`);
  }
  return records;
}

function ratio(hit, found) {
  return found === 0 ? 1 : hit / found;
}

function metrics(record) {
  return {
    line: ratio(record.linesHit, record.linesFound),
    function: ratio(record.functionsHit, record.functionsFound),
    branch: ratio(record.branchesHit, record.branchesFound),
  };
}

function aggregate(records) {
  const total = {
    linesFound: 0,
    linesHit: 0,
    functionsFound: 0,
    functionsHit: 0,
    branchesFound: 0,
    branchesHit: 0,
  };
  for (const record of records.values()) {
    for (const key of Object.keys(total)) total[key] += record[key];
  }
  return total;
}

function percentage(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function main() {
  const [baselineArgument, currentArgument] = process.argv.slice(2);
  if (!baselineArgument || !currentArgument) {
    throw new Error(
      "Usage: node scripts/check-coverage.js <baseline.lcov> <current.lcov>"
    );
  }
  const baseline = parseLcov(path.resolve(ROOT, baselineArgument));
  const current = parseLcov(path.resolve(ROOT, currentArgument));
  if (baseline.size === 0 || current.size === 0) {
    throw new Error("Coverage reports contain no production-contract records");
  }

  const failures = [];
  const epsilon = 1e-12;
  const baselineOverall = metrics(aggregate(baseline));
  const currentOverall = metrics(aggregate(current));
  for (const metric of ["line", "function", "branch"]) {
    if (currentOverall[metric] + epsilon < baselineOverall[metric]) {
      failures.push(
        `overall ${metric}: ${percentage(
          baselineOverall[metric]
        )} -> ${percentage(currentOverall[metric])}`
      );
    }
  }

  for (const [source, baselineRecord] of baseline) {
    const currentRecord = current.get(source);
    if (!currentRecord) {
      failures.push(`${source}: missing from current coverage`);
      continue;
    }
    const before = metrics(baselineRecord);
    const after = metrics(currentRecord);
    for (const metric of ["line", "function", "branch"]) {
      if (after[metric] + epsilon < before[metric]) {
        failures.push(
          `${source} ${metric}: ${percentage(before[metric])} -> ${percentage(
            after[metric]
          )}`
        );
      }
    }
  }

  for (const [source, currentRecord] of current) {
    if (baseline.has(source)) continue;
    const coverage = metrics(currentRecord);
    if (coverage.line + epsilon < 0.9) failures.push(`${source} line < 90%`);
    if (coverage.function + epsilon < 0.9)
      failures.push(`${source} function < 90%`);
    if (coverage.branch + epsilon < 0.8)
      failures.push(`${source} branch < 80%`);
  }

  if (failures.length > 0) {
    throw new Error(`Forge coverage regression:\n${failures.join("\n")}`);
  }
  console.log(
    `Coverage gate passed: line=${percentage(
      currentOverall.line
    )}, function=${percentage(currentOverall.function)}, branch=${percentage(
      currentOverall.branch
    )} across ${current.size} production files.`
  );
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
