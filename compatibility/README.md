# Compatibility baseline

This directory freezes the externally observable contract surface and the
executed test inventory at source commit
`ca72ca7f13dd0a2103d592b39a4fcaa749e9045f`.

Capture once, then run the check with the pinned Foundry 1.7.1 binaries on
`PATH`:

```console
node scripts/compatibility.cjs capture
node scripts/compatibility.cjs check
node scripts/compatibility.cjs diff
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
node scripts/compatibility.cjs write-stage-08-review
node scripts/compatibility.cjs write-evidence
node scripts/compatibility.cjs check
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
node scripts/compatibility.cjs write-stage-09-review
node scripts/compatibility.cjs write-evidence
node scripts/compatibility.cjs check
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
node scripts/compatibility.cjs write-security-01-review
node scripts/compatibility.cjs write-evidence
node scripts/compatibility.cjs check
node scripts/compatibility.cjs security-01-negative-probes
```

Security remediation 02 uses the named
`security-02-pco-init-before-callback` policy. It anchors the immutable
Security 01 commit `b8be19e6ae6676d445127b38a47c7f73f1c45917`, the exact
Security 01 evidence and review digests, and reconstructs that checkpoint's
production opcodes and gas entries before comparison. The policy permits only
making the existing ERC721 receiver helper internal and changing PCO minting
to establish ERC721 ownership plus the five existing PCO fields before the
same receiver callback is invoked with the same rejection payload.

The source gate digest-binds the exact production edits, the package-excluded
receiver fixture, the existing Hardhat and Forge regression sources, Slither
runner and triage updates, dependency/tool configuration, parity files, and
the complete compiler-input closure. It rejects any added test identifier:
the strengthened callback matrix remains inside one existing Hardhat oracle
and one existing Forge parity test, preserving the exact 89 Hardhat and 140
Forge names. The matrix proves initialized callback state and ordered events,
full rollback for a wrong selector or receiver revert, and safe reentrant
transfer and unwrap cleanup. ABI, selectors, events, errors, storage,
interfaces, enums, ERC165 answers, compiler settings, and every prior
project-owned revert callsite remain hard equal. The only revert-callsite
addition is the existing `ERC721: transfer to non ERC721Receiver implementer`
payload in the existing PCO `_mint` callable. Reproduce the review, evidence,
and adversarial policy probes with:

```console
node scripts/compatibility.cjs write-security-02-review
node scripts/compatibility.cjs write-evidence
node scripts/compatibility.cjs check
node scripts/compatibility.cjs security-02-negative-probes
```

Security remediation 03 uses the named
`security-03-post-tax-stabilization` policy. It anchors the merged Security 02
squash commit `02c2b6cfef5807e01fad80d81f1eb72519d74456`, together with the
exact Security 02 evidence and review digests, and reconstructs that
checkpoint's production opcodes and legacy gas entries before comparison.
The only production edits are post-collection authorization rechecks for
`selfAssess`, `deposit`, `withdrawDeposit`, and `exit`, plus moving takeover
payment classification after tax collection so payment is based on the owner
that will actually sell the token.

The source gate digest-binds those two exact production transforms, every
strengthened Forge regression and invariant source, the Slither provenance
line, the warning allowlist, dependency/tool configuration, the unchanged
89-Hardhat and 140-Forge inventories, and the complete 29-source Hardhat
compiler-input closure. ABI, function and error selectors, events, storage,
interfaces, enums, ERC165 answers, compiler settings, test identifiers, and
project-owned revert payloads remain exact. The sole revert-manifest change is
the reviewed ordering of existing takeover payment and already-owner checks;
no payload or callsite is added or removed. Checked-in evidence records full
Security-02-relative opcode diffs, raw and normalized bytecode hashes and
sizes, EIP-170 checks, exact legacy and key-flow gas changes, rollback across
all four post-tax mutations and three authorization modes, and successful
cross-foreclosure takeover accounting and event order. Reproduce it with:

```console
node scripts/compatibility.cjs write-security-03-review
node scripts/compatibility.cjs write-evidence
node scripts/compatibility.cjs check
node scripts/compatibility.cjs security-03-negative-probes
```

Security remediation 04 uses the named
`security-04-foreclosed-unwrap-guard` policy. It anchors the merged Security 03
squash commit `f7e98cbc778c279af82b6514d70df886ba0af6cd`, together with the
exact Security 03 evidence and review digests, and reconstructs that
checkpoint's production opcodes and gas entries before comparison. The only
production edit adds the existing `DestinationContractAddress()` custom-error
guard to `Wrapper.unwrap` after the existing originator check and owner capture,
but before wrapper metadata deletion, burn, or underlying transfer.

The source gate digest-binds that exact placement, the strengthened retained
regression and invariant sources, the warning allowlist, documentation,
dependency/tool configuration, the unchanged 89-Hardhat and 140-Forge test
inventories, and the complete 29-source Hardhat compiler-input closure. ABI,
selectors, events, errors, storage, interfaces, enums, ERC165 answers, compiler
settings, project revert strings, and test identifiers remain hard equal.
Only Wrapper bytecode and reviewed gas consequences are permitted; the
standalone PartialCommonOwnership bytecode, opcodes, hashes, and sizes must
equal Security 03 exactly. Reproduce the review, evidence, and adversarial
policy probes with:

```console
node scripts/compatibility.cjs write-security-04-review
node scripts/compatibility.cjs write-evidence
node scripts/compatibility.cjs check
node scripts/compatibility.cjs security-04-negative-probes
```

Stage 10 upgrades only `@openzeppelin/contracts` to exact 5.6.1 and raises the
13 shipped production pragmas to `^0.8.20` while keeping the Solidity compiler
and every compiler setting pinned to 0.8.36. Its named
`stage-10-openzeppelin-5-6-1-security-04-relative-full-diff` policy anchors the
merged Security 04 squash commit
`face4310d072b062487f988dad8796a027cf1bae`, together with the exact Security 04
evidence and review digests, and reconstructs that checkpoint's production
opcodes and gas entries before comparison.

The policy hard-binds the package manifest, pnpm lock and registry integrity,
all shipped pragmas, the complete Hardhat compiler-input closure, the smaller
production OpenZeppelin import closure, package-consumer script, migrated
`TestNFT` fixture, receiver regression source, warning allowlist, and security
documentation. Production may import only the OpenZeppelin interfaces,
`Context`, and ERC165 support already required by the custom ERC721. Importing
or inheriting OpenZeppelin's ERC721, or retaining `Address` or `Strings`, is a
blocking mismatch. The project ERC721's sole production semantic transform is
the behavior-equivalent replacement of `to.isContract()` with
`to.code.length > 0`.

ABI, function and error selectors, argument names and mutability, events and
indexed fields, storage, interfaces, enum ordinals, ERC165 answers, all
Security 04 project-owned revert callsites and payloads, compiler settings, and
the exact 89 Hardhat plus 140 Forge identifiers remain hard equal. The retained
receiver regression now deterministically covers an EOA, a valid receiver,
incorrect return data, non-empty and empty receiver reverts, and construction-
time zero code length without renaming the test. Only exact Security-04-relative
compiler/dependency bytecode, opcode, size, and gas consequences are reviewable.
The evidence contains complete opcode diffs for `Wrapper` and standalone
`PartialCommonOwnership`, EIP-170 validation, the 15-entry legacy gas inventory,
and all 12 key-flow comparisons.

Reproduce the Stage 10 review, evidence, gate, and adversarial policy probes
with:

```console
node scripts/compatibility.cjs write-stage-10-review
node scripts/compatibility.cjs write-evidence
node scripts/compatibility.cjs check
node scripts/compatibility.cjs stage-10-negative-probes
```

Stage 11 uses the named `stage-11-foundry-first-cutover` policy. It anchors the
merged Stage 10 commit `14720718787046af58be50c110be40c18f5b1364`, together
with the exact Stage 10 evidence and review digests, and reconstructs that
checkpoint's production bytecode, metadata-stripped opcodes, sizes, compiler
identity, 15-entry legacy gas inventory, and 12 key-flow gas results before
comparison.

The cutover deletes only `tests/PartialCommonOwnership/index.ts` and
`tests/Wrapper.ts`, whose Stage 10 contents remain SHA-256-bound historical
provenance. The immutable 89-name Hardhat oracle and 104-entry parity map are
not rewritten. All 104 mapped behavior tests and 36 safety tests remain active
in Forge with the exact 140-name digest. Hardhat's active inventory becomes
exactly three digest-bound interoperability smokes covering configuration,
PCO acquire/collect/exit accounting and event decoding, and Wrapper
approve/wrap/takeover/unwrap custody and cleanup.

No production source, dependency, lockfile, compiler input, public interface,
storage layout, revert callsite, bytecode, opcode, size, or gas value may
change in this stage. The source gate binds the smoke, runner and parity policy,
package scripts, CI workflow, and development documentation. The compatibility
job uses full Git history to prove the Stage 10 checkpoint and retired-source
digests; the normal Forge parity job remains safe in a shallow checkout.

Reproduce the Stage 11 review, evidence, gate, and adversarial policy probes
with:

```console
node scripts/compatibility.cjs write-stage-11-review
node scripts/compatibility.cjs write-evidence
node scripts/compatibility.cjs check
node scripts/compatibility.cjs stage-11-negative-probes
```

Stage 12a uses the named `stage-12a-ethers-6-stage-11-equality` policy. It
anchors the merged Stage 11 commit
`c84870955d77e82e91ed70591f010233675a6880`, its exact evidence and review
digests, and reconstructs the Stage 11 production bytecode, metadata-stripped
opcodes, sizes, compiler identity, 15-entry legacy gas inventory, 12 key-flow
gas results, and active 3-Hardhat plus 140-Forge test inventory before
comparison.

The bridge changes only JavaScript tooling: direct ethers becomes exact
6.17.0, `@nomicfoundation/hardhat-ethers` 3.1.3 is activated under unchanged
Hardhat 2.28.6, and the three interoperability smokes are migrated to ethers 6
without changing their reporter titles or behavior. The legacy NomicLabs
ethers, Waffle, and ethers-v5 TypeChain hooks remain installed but are not
loaded or invoked. Their grouped removal remains isolated to Stage 12b; the
resulting peer warning is recorded and is not suppressed. The unrelated Web3
plugin remains unchanged.

The Stage 12a tooling inventory binds the new smoke source, package and lock,
Hardhat config and declaration file, and TypeScript scope while retaining the
exact Stage 11 inventory digest and old smoke-source digest as provenance. No
compatibility-manifest difference is reviewable: production sources and import
closure, runtime dependencies, compiler settings, ABI, selectors, events,
errors, storage, interfaces, enum ordinals, ERC165 answers, revert callsites,
bytecode, opcodes, sizes, gas, and all 143 active test identifiers must remain
exactly equal to Stage 11.

Reproduce the Stage 12a review, evidence, gate, and adversarial policy probes
with:

```console
node scripts/compatibility.cjs write-stage-12a-review
node scripts/compatibility.cjs write-evidence
node scripts/compatibility.cjs check
node scripts/compatibility.cjs stage-12a-negative-probes
```

Stage 12b uses the named `stage-12b-hardhat-3-stage-12a-metadata-only`
policy. It anchors merged Stage 12a commit
`9a86ff5d001a4d3a06823712d0e70ad011987ecd`, its immutable evidence and
review digests, and the exact Stage 12a dependency, smoke, Forge, compiler,
bytecode, and gas identities. The migration installs exact Hardhat 3.9.1 and
`@nomicfoundation/hardhat-ethers` 4.0.14, adopts ESM and Hardhat's declarative
configuration, removes the dormant Hardhat 2/Waffle/Web3/TypeChain toolchain,
and uses Node's built-in test runner for the same three interoperability
smokes.

Hardhat 3 records compiler input and output separately and uses canonical
`project/` and versioned `npm/` source names. The compatibility runner binds
the split records and target artifacts by one build-info ID, then maps those
names back to the public Solidity import paths before comparing ABI, storage,
AST, and executable bytecode. Only the exact native package-resolution
remapping and four full bytecode hashes are reviewable. Metadata length, raw
size, metadata-stripped size and hash, complete stripped opcodes, EIP-170
results, interfaces, reverts, and test names remain hard equal.

The immutable Stage 12a 15-entry fuzz gas snapshot is reconstructed through
the complete checkpoint chain and replayed from an isolated checkout of the
exact Stage 12a commit under the pinned Forge, forge-std, and solc binaries.
Stage 12b requires the frozen snapshot, detached replay, and candidate capture
to remain byte-for-byte equal. All 12 deterministic production key-flow gas
entries also remain exactly equal to Stage 12a.

Reproduce the review, evidence, gate, and adversarial probes with:

```console
node scripts/compatibility.cjs write-stage-12b-review
node scripts/compatibility.cjs write-evidence
node scripts/compatibility.cjs check
node scripts/compatibility.cjs stage-12b-negative-probes
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
