# Compatibility baseline

This directory freezes the externally observable contract surface and the
executed test inventory at source commit
`ca72ca7f13dd0a2103d592b39a4fcaa749e9045f`.

Capture once, then run the check with the pinned Foundry 1.7.1 binaries on
`PATH`:

```console
node scripts/compatibility.js capture
node scripts/compatibility.js check
node scripts/compatibility.js diff
```

The contract manifest includes canonical ABIs, method and error selectors,
event topics, storage layouts, enum ordinals, expected ERC165 responses,
compiler settings, bytecode hashes and sizes, and metadata-stripped runtime
opcodes and a deterministic gas snapshot. It also executes and records all 89
Hardhat tests and all 15 Forge tests and probes the actual ERC165 responses of
both concrete contracts.

Foundry's version and commit remain exact compatibility fields. Its official
macOS and Linux binaries embed different build timestamps for the same release,
so only that timestamp line is normalized; the build profile is still compared.

The `diff` command prints every exact baseline-to-candidate difference without
changing the baseline. Reviewed dependency, compiler, and test-expansion stages
must use a named policy and checked-in evidence. Stage 6's intentional Forge
inventory expansion is additionally constrained by `parity-map.json`; it may
add the mapped tests but may not rename or remove any Hardhat oracle scenario or
baseline Forge test.

Stage 7's additional fuzz, invariant, coverage, and gas artifacts are bound by
`safety-test-inventory.json`, `safety-baselines.json`, and a separately hashed
named-policy evidence file under `evidence/`. Changing a baseline therefore
requires an explicit compatibility-policy review; updating the artifact and
its adjacent manifest alone cannot make the gate pass.

Stage 8's Solidity 0.8.36 compiler change uses the named
`stage-08-solidity-0-8-36-compiler` policy. The policy requires exact equality
for the ABI, selectors, events, errors, storage, interfaces, enums, ERC165
answers, compiler settings, and behavior-test inventory. Its checked-in
`evidence/stage-08-solidity-0-8-36.json` contains deterministic, complete
instruction-level diffs for the metadata-stripped creation and runtime
bytecode of `Wrapper` and `PartialCommonOwnership`, raw and normalized hashes
and sizes, EIP-170 checks, and the 12 key-flow gas comparisons. Reproduce the
candidate review and evidence with the pinned toolchains:

```console
node scripts/compatibility.js write-stage-08-review
node scripts/compatibility.js write-evidence
node scripts/compatibility.js check
```

The original baseline predated explicit revert-literal extraction.
`project-revert-strings.json` is a SHA-256-bound supplement derived from the
unchanged production sources at the recorded baseline commit. It binds all 35
project-owned `require`/`revert` strings to their source contract, callable,
call kind, and ordinal. The compatibility runner injects that supplement as a
non-waivable field, so compiler-bytecode review cannot authorize a changed
project revert payload.

Do not overwrite these files to make a dependency or compiler upgrade pass.
For an intentional compiler change, generate a separate candidate manifest and
review the ABI, selector, event, storage, opcode, bytecode-size, and gas deltas.
