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

Stage 9 upgrades only the forge-std submodule and test helpers. Its named
`stage-09-forge-std-1-16-2` policy binds the previous
`8d93b5273ca94b1c50b055ffc0e1b8b0a3c03d78` pin and the exact `v1.16.2`
commit `bf647bd6046f2f7da30d0c2bf435e5c76a780c1b`, verifies the tag and package
version from a clean submodule, and digest-binds the Stage 8 compiler evidence.
Production compiler settings, bytecode, opcode hashes, sizes, and EIP-170
results must equal the Stage 8 candidate exactly. The Stage 9 evidence records
the only permitted relative changes—the legacy test-harness gas entries—and
rechecks all 12 PCO and Wrapper key flows against the existing gas policy.
The compatibility CI job uses a full-history recursive checkout so the pinned
forge-std tag and ancestry checks are reproducible rather than inferred from a
shallow clone.
Reproduce it with the pinned toolchains:

```console
node scripts/compatibility.js write-stage-09-review
node scripts/compatibility.js write-evidence
node scripts/compatibility.js check
```

Security remediation 01 uses the named
`security-01-erc721-post-hook-owner-recheck` policy. The immutable baseline and
the Stage 8/9 evidence remain unchanged. The policy reconstructs the exact
green Stage 9 compiler, bytecode, gas, toolchain, and 89 Hardhat plus 140 Forge
test inventory from digest-bound evidence, then permits only the reviewed
production bytecode and gas consequences of duplicating the existing
incorrect-owner check immediately after `_beforeTokenTransfer`.

The source gate is anchored at Stage 9 commit
`4b42e69201df9d9d541954ae2c077e39434bc711` and rejects any other production
source edit. It also binds the complete 28-source Hardhat compiler-input closure
(including installed OpenZeppelin sources), dependency manifests and lockfile,
Hardhat and Foundry configuration, remappings, submodule metadata, and the
exact parity-map, parity-fragment, and safety-inventory file digests. ABI,
function/error selectors, events, storage, interfaces, enums, ERC165 answers,
compiler settings, and the exact Stage 9 test-name hashes (89 Hardhat and 140
Forge) remain hard equal before the Stage 9 comparison is reconstructed. The
only revert-callsite exception is one additional use of the existing
`ERC721: transfer from incorrect owner` payload in the same `_transfer`
callable. The checked-in evidence records Stage-9-relative opcode diffs,
bytecode hashes and sizes, EIP-170 checks, the unchanged regression-test
identifier, the owner/approval/transfer-overload behavior matrix, and all 12
key-flow gas comparisons. Reproduce it with:

```console
node scripts/compatibility.js write-security-01-review
node scripts/compatibility.js write-evidence
node scripts/compatibility.js check
node scripts/compatibility.js security-01-negative-probes
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
