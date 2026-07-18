# Development

## Installation

Development is pinned to Node 24.18.0 and pnpm 11.13.1. The Node version is a
repository development requirement, not a consumer-facing package engine
restriction.

Start from a recursive checkout so the exact forge-std v1.16.2 gitlink is
present:

```console
$ git clone --recurse-submodules git@github.com:721labs/partial-common-ownership.git
$ cd partial-common-ownership
$ git submodule update --init --recursive
```

The bootstrap script installs the version in `.nvmrc`, activates the exact pnpm
release through Corepack, performs a frozen dependency install, and installs
Foundry 1.7.1 from its platform-specific official release archive. It stops on
the first failed command and verifies both the pinned forge-std commit and the
hard-coded Foundry archive SHA-256 before installing those tools:

```console
$ ./scripts/install.sh
```

The script cannot change its parent shell. Activate the pinned Node version and
the newly installed Foundry binaries before running the commands below in the
same terminal session:

```console
$ source "$HOME/.nvm/nvm.sh"
$ nvm use 24.18.0
$ export PATH="$HOME/.foundry/bin:$PATH"
```

For an existing checkout, the equivalent dependency commands are:

```console
$ nvm use
$ corepack enable pnpm
$ corepack install --global pnpm@11.13.1
$ pnpm install --frozen-lockfile
```

Verify every development runtime explicitly with:

```console
$ test "$(node --version)" = "v24.18.0"
$ test "$(pnpm --version)" = "11.13.1"
$ forge --version | grep -Fqx "forge Version: 1.7.1"
$ forge --version | grep -Fqx "Commit SHA: 4072e48705af9d93e3c0f6e29e93b5e9a40caed8"
$ test "$(git -C lib/forge-std rev-parse HEAD)" = "bf647bd6046f2f7da30d0c2bf435e5c76a780c1b"
$ test -z "$(git -C lib/forge-std status --porcelain --untracked-files=all)"
$ forge config --json | grep -Fqx '  "solc": "0.8.36",'
$ slither --version | grep -Fxq '0.11.5'
```

To reproduce a clean install without deleting the working tree, clone into a
temporary directory with recursive submodules and run the frozen install plus
the commands below. Never regenerate a compatibility, gas, coverage, or warning
baseline merely because a clean candidate differs.

The clean release sequence is therefore: start from a fresh recursive checkout
of the candidate commit, activate the pinned Node, pnpm, Foundry, forge-std, solc,
and Slither versions above, run `CI=true pnpm install --frozen-lockfile`, and
then run the full local release gate in the order documented below. Keep
compiler-cache users sequential so one gate cannot alter another gate's
compiler inputs.

## Behavior tests and compatibility

The active repository is Foundry-only. The default command runs the complete
143-test Forge behavior, parity, fuzz, and invariant inventory:

```console
$ pnpm test
```

Run the same Forge authority directly with:

```console
$ pnpm test:forge
```

The three former interoperability smokes each have one exact, active Forge
successor recorded in `compatibility/interoperability-smoke-parity.json`:

- `PCOReadTaxParityTest:test_interoperabilitySmoke_deploysAndReadsDeterministicPCOConfiguration`
- `PCOMutationParityTest:test_interoperabilitySmoke_acquiresCollectsTaxAndExitsWithOrderedEventsAndConservedBalances`
- `WrapperParityTest:test_interoperabilitySmoke_approvesWrapsTakesOverAndUnwrapsWithCustodyAndMetadataCleanup`

That evidence binds each retired smoke's historical name and source digest to
its Forge test contract, source path, and test identifier. It also binds the
complete 143-name Forge inventory, so deleting a successor, renaming it, or
reviving an active JavaScript bridge fails the parity gate.

The Forge command also enforces the checked-in 104-entry historical parity map.
The 89 legacy Hardhat behavior scenarios and 15 original Forge scenarios each
map to one unique, successful Forge regression. The 89 TypeScript behavior
tests were retired only after 104/104 Forge parity and the fuzz and invariant
gates; the map remains immutable machine-readable replacement evidence.

Stage 11 through Stage 13 records retain the former Hardhat, ethers, and
TypeScript inventories and toolchain digests solely as immutable historical
provenance. They are reconstructed from their recorded commits by the
compatibility job; they are not active dependencies, commands, tests, compiler
entry points, or CI jobs and must not be rewritten to hide the cutover.

Pull requests have eight active jobs: Forge Build and Tests, Compatibility
Manifest, Forge Coverage, Forge Gas Snapshot, Package Consumers, Forge
Formatting and Linting, Slither, and Dependency Audit. Every job starts from an
immutable frozen pnpm install; jobs that replay a historical compatibility
checkpoint fetch the complete read-only Git history. Scheduled Foundry Safety
is a separate 45-minute weekly/manual job and always uploads its seed, log, and
minimized failure corpus.

Run the public-compatibility and packed-consumer gates locally with:

```console
$ pnpm parity:check
$ pnpm compatibility
$ pnpm test:package
```

The package gate also inspects the packed bytes rather than trusting the
working tree. It requires exact `@openzeppelin/contracts@5.6.1` as the sole
OpenZeppelin declaration, exactly 13 shipped production Solidity sources, and
the exact `^0.8.20` pragma in every one before compiling a clean Forge consumer
with the pinned London profile. Historical Hardhat consumer evidence remains in
its immutable stage record but is not part of the active package gate.

Repository tool configurations compile with exactly Solidity 0.8.36 while
retaining the London EVM target, disabled optimizer with 200 configured runs,
`viaIR = false`, and the existing metadata mode. Production sources advertise
the compatible `^0.8.20` range required by the OpenZeppelin 5 dependency. Test
and fixture pragmas remain pinned to exact 0.8.36. The custom ERC721 is retained;
the dependency supplies interfaces, `Context`, and `ERC165`, not production
ownership or transfer semantics.

The Forge compiler-warning gate performs a forced build and requires the
complete, exact reviewed warning inventory, including warnings from production
code, fixtures, and Forge tests. Mutability suggestions, the test-only
unchecked call, and expected test-contract code-size warnings are included
rather than globally ignored. Forge lint diagnostics are captured separately
from the compiler JSON and are not counted as Solidity compiler warnings.

```console
$ pnpm compiler-warnings:forge
$ pnpm compiler-warnings:check
```

`compiler-warnings:check` is the local aggregate entry point for the same
Forge-only warning policy. The gate verifies the exact Forge and Solidity
versions, compiler settings, warning source bytes and byte ranges, and rejects
duplicate, new, or missing warnings.

Warnings may be changed only by reviewing and updating
`compatibility/compiler-warning-allowlist.json`; the gate rejects both new and
missing warnings, stale build metadata, source or pragma drift, and
compiler-setting drift.

The default and CI Foundry profile uses seed `0x721`, 512 fuzz runs, and 128
stateful invariant runs at depth 64. The scheduled profile uses 10,000 fuzz
runs and 2,000 invariant runs at depth 128; CI supplies and records a rotating
seed and uploads any minimized failure corpus.

The remaining Foundry safety gates are:

```console
$ pnpm test:safety
$ pnpm fmt:forge
$ pnpm lint:forge
$ pnpm ci:policy
$ pnpm safety-baselines:check
$ pnpm coverage:forge
$ pnpm gas:check
$ pnpm size:check
```

`fmt:forge` intentionally checks the fuzz and invariant suites. Formatting the
historical production and parity sources would change compatibility-bound
source and compiler-metadata bytes, so widening that scope requires its own
reviewed compatibility change. `lint:forge` covers all contracts and tests and
requires exact equality with the reviewed high, medium, and low diagnostic
inventory; Forge returning exit status zero is not treated as sufficient.
`ci:policy` verifies the exact required-job inventory, pinned runners and
timeouts, read-only workflow permissions, full-SHA Action pins, checkout
credential isolation, frozen tool installs, weekly Dependabot ecosystems, and
the forge-std `v1` update fence.

Coverage cannot regress from the checked-in LCOV baseline. New production
files must reach at least 90% line/function and 80% branch coverage. Key-flow
gas may increase by at most the greater of 3% or 2,000 gas, and every deployable
production artifact must remain within EIP-170's 24,576-byte limit.
The gas and LCOV artifacts are SHA-256-bound through the compatibility review;
they must never be refreshed merely to make a candidate pass.

## Static analysis

CI runs exactly Slither 0.11.5 with solc 0.8.36 over the production import
closure. To reproduce it, install those exact Python/compiler versions and run:

```console
$ pnpm slither
```

The runner rejects version drift, unreviewed suppression comments, and every
untriaged high- or medium-impact finding. The reviewed findings and their
dispositions are documented in
`docs/security/slither-0.11.5-triage.md`.
The dependency-specific review is documented in
`docs/security/custom-erc721-vs-openzeppelin-5.6.1.md`.

## Gas

Forge records deterministic gas for the key PCO and Wrapper flows. Run
`pnpm gas:check` to compare the current measurements with the reviewed
snapshot. The gate rejects increases greater than the larger of 3% or 2,000
gas; it does not depend on external price APIs or environment variables.

## Compiler warnings

The Solidity compiler reports unused parameters because the ERC721 transfer
methods are overridden to ensure purchasing and foreclosure remain the only
transfer paths. It also reports the deliberately deferred `send`/`transfer`
deprecations, compiler mutability suggestions, a test-only unchecked call, and
expected oversized test harnesses. These warnings are reviewed by the exact
complete allowlist above; they must not be ignored globally.

## Dependency security and maintenance

The final audit policy is absolute: critical and high findings must both remain
zero. The runner rejects malformed audit output and any attempt to weaken the
checked-in policy before evaluating the registry result:

```console
$ pnpm audit:ratchet
```

Dependabot checks npm-compatible dependencies, GitHub Actions, and the
forge-std git submodule every Monday. Minor and patch updates are grouped by
ecosystem; major upgrades are never included in those groups and must be
reviewed in isolated pull requests. GitHub Actions remain pinned to complete
40-character commit SHAs, and forge-std updates are fenced to its `v1` branch.

The repository intentionally uses pnpm 11.13.1. GitHub's current Dependabot
[options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)
documents pnpm support only through v10, and
[pnpm 11 support remains open upstream](https://github.com/dependabot/dependabot-core/issues/14794).
Do not downgrade the development runtime to make Dependabot accept the lockfile.
Confirm the first run in Repository Insights and keep the independent exact-pnpm
audit job required. Until GitHub adds pnpm 11 support, the weekly scheduled job
also uploads an exact dependency inventory alongside its seed and safety logs.
That inventory contains `pnpm outdated --format json`, every pinned Action's
latest stable same-major and overall tags, and the forge-std `v1` branch head,
so suppressed major discovery cannot silently disappear.

Dependabot documents unmatched majors as individual updates, but an
[open grouping issue](https://github.com/dependabot/dependabot-core/issues/14202)
can suppress major discovery for minor/patch groups. Reproduce the scheduled
inventory locally as needed and open each reported major as a separate upgrade:

```console
$ pnpm outdated --format json
$ pnpm --silent maintenance:inventory
```

That command exits with status 1 when updates exist; its JSON is still the
expected inventory in that case.

## Full local release gate

From a clean recursive checkout, run:

```console
$ CI=true pnpm install --frozen-lockfile
$ pnpm compiler-warnings:check
$ pnpm test
$ pnpm compatibility
$ pnpm test:safety
$ pnpm safety-baselines:check
$ pnpm coverage:forge
$ pnpm gas:check
$ pnpm size:check
$ pnpm fmt:forge
$ pnpm lint:forge
$ pnpm ci:policy
$ pnpm test:package
$ pnpm slither
$ pnpm audit:ratchet
```

No publication, deployment, tag, optimizer change, EVM-target change, or
compatibility-baseline regeneration is part of this maintenance workflow.

## Modules

Business logic is split up into a set of modules in order to reduce complexity and make the library more extensible to alternative implementations (e.g. depreciating licenses).

### [Beneficiary.sol](../contracts/token/modules/Beneficiary.sol)

The beneficiary of a given token is the recipient of the Harberger taxation. The module handles state management of the beneficiary registry.

### [Lease.sol](../contracts/token/modules/Lease.sol)

The module handles takeover and valuation assessments for a token's perpetual lease.

A few important notes:

- If a lease is being taken over for the first time, or out of foreclosure, the transaction's entire value is deposited. Otherwise, the message value pays the current leasee their self-assessed valuation and the remainder is deposited.
- If the beneficiary of a token is taking over a token's lease:
  - No deposit is necessary (taxes would be going to itself in a convoluted loop at the cost of gas). As such, transactions with value will be rejected.
  - **Because of this, the beneficiary is able to effectively monopolize the token: by taking over the lease at the current owner's self-assessed valuation (or for free out of foreclosure) then self-assessing a prohibitively high valuation**.

### [Remittance.sol](../contracts/token/modules/Remittance.sol)

The module handles sending and withdrawing (failed) remittances. By default, an active "push" strategy is employed, which alleviates the need for the tax collector to actively check and collect.

### [Taxation.sol](../contracts/token/modules/Taxation.sol)

The module handles taxation, leasee deposits, and lease foreclosures.

### [Title.sol](../contracts/token/modules/Title.sol)

The module handles state management of the chain of title registry.

### [TokenManagement.sol](../contracts/token/modules/TokenManagement.sol)

The module is a light wrapper on top of ERC721 that exposes permissions modifiers.

### [Valuation.sol](../contracts/token/modules/Valuation.sol)

The module handles state management of the self-assessed valuations registry.
