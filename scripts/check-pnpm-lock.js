const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const lockfile = yaml.load(
  fs.readFileSync(path.join(__dirname, "..", "pnpm-lock.yaml"), "utf8")
);

const allowedExoticPackages = new Set([
  "ethereumjs-abi@https://codeload.github.com/ethereumjs/ethereumjs-abi/tar.gz/ee3994657fa7a427238e6ba92a84d0b529bbcde0",
]);

const exoticPackages = Object.entries(lockfile.packages || {})
  .filter(([, value]) => value.resolution && value.resolution.gitHosted)
  .map(([name]) => name)
  .sort();

const unexpected = exoticPackages.filter(
  (name) => !allowedExoticPackages.has(name)
);
const missing = [...allowedExoticPackages].filter(
  (name) => !exoticPackages.includes(name)
);

if (unexpected.length || missing.length) {
  if (unexpected.length) {
    console.error(`Unexpected exotic dependencies: ${unexpected.join(", ")}`);
  }
  if (missing.length) {
    console.error(`Expected legacy dependency is missing: ${missing.join(", ")}`);
  }
  process.exit(1);
}

console.log(`Validated ${exoticPackages.length} pinned exotic dependency.`);
