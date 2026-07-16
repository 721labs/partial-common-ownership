# Forge behavior parity

`compatibility/parity-map.json` is the manifest for the four reviewable mapping
fragments in this directory. Together they map every frozen behavior scenario
to one unique Forge regression test:

- 15 pre-existing Forge scenarios
- 38 PCO construction, access, getter, taxation, and foreclosure scenarios
- 31 PCO takeover, deposit, self-assessment, withdrawal, and exit scenarios
- 20 Wrapper scenarios

Run `pnpm parity:check` with Foundry 1.7.1. The check fails unless the 89
Hardhat names and 15 baseline Forge names are covered exactly once, all 104
Forge targets are unique, and the discovered behavior inventory is exact.
Stage 7 adds a separate, exact `compatibility/safety-test-inventory.json` for
fuzz, invariant, and deferred-regression tests; discovery and successful
execution must equal the union of both inventories with no overlap or skipped
test. The compatibility baseline remains immutable while the 89-test Hardhat
oracle stays unchanged.
