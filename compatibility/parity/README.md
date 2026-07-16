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
Forge targets are unique, and the discovered Forge inventory is exactly the
mapped inventory. The compatibility baseline remains immutable; Stage 6 only
permits the validated Forge test expansion while keeping the 89-test Hardhat
oracle unchanged.
