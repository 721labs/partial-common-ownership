# Development

## Installation

Development is pinned to Node 24.18.0 and pnpm 11.13.1. The Node version is a
repository development requirement, not a consumer-facing package engine
restriction.

Start from a recursive checkout so the pinned forge-std submodule is present:

```console
$ git clone --recurse-submodules git@github.com:721labs/partial-common-ownership.git
$ cd partial-common-ownership
$ git submodule update --init --recursive
```

The bootstrap script installs the version in `.nvmrc`, activates pnpm through
Corepack, performs a frozen dependency install, and installs Foundry 1.7.1 from
its official release archive:

```console
$ ./scripts/install.sh
```

The script cannot change its parent shell. Activate the installed tools before
running the commands below in the same terminal session:

```console
$ source "$HOME/.nvm/nvm.sh"
$ nvm use 24.18.0
$ export PATH="$HOME/.foundry/bin:$PATH"
```

For an existing checkout, install dependencies with:

```console
$ nvm use
$ corepack enable pnpm
$ corepack install --global pnpm@11.13.1
$ pnpm install --frozen-lockfile
```

Verify the development runtimes with:

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

## Tests and CI

The repository is Foundry-only. The default command runs the complete Forge
unit, regression, fuzz, and invariant suite:

```console
$ pnpm test
```

`pnpm test:safety` runs the same suite with the fixed CI fuzz seed `0x721`.
The scheduled profile uses 10,000 fuzz runs and 2,000 invariant runs at depth
128; GitHub Actions supplies a rotating seed and uploads the seed, log, and any
minimized failure corpus.

Pull requests run seven jobs: Forge Build and Tests, Forge Coverage, Forge Gas
Snapshot, Package Consumers, Forge Formatting and Linting, Slither, and
Dependency Audit. Every job performs a frozen pnpm install and uses pinned tool
versions.

The packed-package gate inspects the published tarball rather than trusting the
working tree. It requires exact `@openzeppelin/contracts@5.6.1` as the sole
OpenZeppelin declaration, exactly 13 shipped production Solidity sources, and
the `^0.8.20` pragma in every production source before compiling a clean Forge
consumer with the London profile:

```console
$ pnpm test:package
```

Repository configuration compiles with Solidity 0.8.36 and the London EVM
target, with the optimizer disabled, `viaIR = false`, and the configured
metadata mode. Production sources advertise the `^0.8.20` range required by
OpenZeppelin 5; tests and fixtures remain pinned to 0.8.36.

Run the remaining local quality gates with:

```console
$ pnpm compile
$ pnpm compiler-warnings:forge
$ pnpm test:safety
$ pnpm fmt:forge
$ pnpm lint:forge
$ pnpm coverage:forge
$ pnpm gas:check
$ pnpm size:check
```

The compiler-warning gate verifies the pinned compiler settings and exact known
warning inventory stored under `ci/`. `fmt:forge` checks the fuzz and invariant
suites. `lint:forge` rejects changes to the exact reviewed Forge lint inventory
stored under `ci/`. Coverage rejects overall or per-file line, function, and
branch regressions against `coverage/lcov.info`. The gas gate compares twelve
key flows with `gas/key-flows.snap` and rejects an increase greater than the
larger of 3% or 2,000 gas. The size gate requires all deployable production
artifacts to remain within EIP-170's 24,576-byte limit.

## Static analysis

CI runs Slither 0.11.5 with solc 0.8.36 over the production import closure:

```console
$ pnpm slither
```

The runner rejects version drift, unapproved suppression comments, and every
untriaged high- or medium-impact finding. The reviewed findings and their
dispositions are documented in
`docs/security/slither-0.11.5-triage.md`.

## Dependency security

Critical and high dependency findings must remain zero. The audit command
retries transient registry failures, validates the returned vulnerability
counts, and enforces that policy:

```console
$ pnpm audit:ratchet
```

Dependabot checks npm-compatible dependencies, GitHub Actions, and the
forge-std git submodule every Monday. Minor and patch updates are grouped by
ecosystem; major upgrades must be reviewed separately. GitHub Actions remain
pinned to complete 40-character commit SHAs, and forge-std updates are fenced
to its `v1` branch.

## Full local release gate

From a clean recursive checkout, run:

```console
$ CI=true pnpm install --frozen-lockfile
$ pnpm compile
$ pnpm compiler-warnings:forge
$ pnpm test
$ pnpm test:safety
$ pnpm coverage:forge
$ pnpm gas:check
$ pnpm size:check
$ pnpm fmt:forge
$ pnpm lint:forge
$ pnpm test:package
$ pnpm slither
$ pnpm audit:ratchet
```

## Modules

Business logic is split into modules to reduce complexity and make the library
extensible to alternative implementations.

### [Beneficiary.sol](../contracts/token/modules/Beneficiary.sol)

The beneficiary of a token receives its Harberger taxation. The module manages
the beneficiary registry.

### [Lease.sol](../contracts/token/modules/Lease.sol)

The module handles takeover and valuation assessments for a token's perpetual
lease.

- If a lease is taken over for the first time, or out of foreclosure, the
  transaction's entire value is deposited. Otherwise, the message value pays
  the current leasee their self-assessed valuation and the remainder is
  deposited.
- If the beneficiary takes over a token, no deposit is necessary because taxes
  would return to the beneficiary. Transactions with value are rejected in that
  case. This allows the beneficiary to monopolize the token by taking over at
  the current valuation and then setting a prohibitively high valuation.

### [Remittance.sol](../contracts/token/modules/Remittance.sol)

The module handles sending and withdrawing failed remittances. By default, an
active push strategy avoids requiring the tax collector to collect manually.

### [Taxation.sol](../contracts/token/modules/Taxation.sol)

The module handles taxation, leasee deposits, and lease foreclosures.

### [Title.sol](../contracts/token/modules/Title.sol)

The module manages the chain-of-title registry.

### [TokenManagement.sol](../contracts/token/modules/TokenManagement.sol)

The module is a light wrapper around ERC721 that exposes permission modifiers.

### [Valuation.sol](../contracts/token/modules/Valuation.sol)

The module manages self-assessed valuations.
