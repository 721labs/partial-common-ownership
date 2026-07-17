# Development

## Installation

Development is pinned to Node 24.18.0 and pnpm 11.13.1. The Node version is a
repository development requirement, not a consumer-facing package engine
restriction.

The bootstrap script installs the version in `.nvmrc`, activates the exact pnpm
release through Corepack, performs a frozen dependency install, and installs
Foundry 1.7.1:

```console
$ ./scripts/install.sh
```

For an existing checkout, the equivalent dependency commands are:

```console
$ nvm use
$ corepack enable pnpm
$ corepack install --global pnpm@11.13.1
$ pnpm install --frozen-lockfile
```

## Behavior tests and compatibility

The repository is Foundry-first. The default command runs the complete Forge
behavior and parity gate first, then the three retained Hardhat interoperability
smokes:

```console
$ pnpm test
```

Run either side of that split directly with:

```console
$ pnpm test:forge
$ pnpm test:hardhat:smoke
```

`pnpm test:hardhat` remains an alias for the explicit smoke command. That small
suite contains exactly three integration checks: deploy and read
configuration; acquire, collect tax, and exit while decoding events; and
approve, wrap, takeover, and unwrap while verifying custody. It is an
interoperability signal, not a second behavior oracle.

The Forge command enforces the checked-in 104-entry parity map. The 89 legacy
Hardhat behavior scenarios and 15 original Forge scenarios each map to one
unique, successful Forge regression. The 89 TypeScript behavior tests were
retired only after 104/104 Forge parity, the fuzz and invariant gates, and a
final green dual run; the map remains the machine-readable record of their
replacement coverage.

CI preserves the same division: the Forge job runs the complete fixed-seed
safety profile, while the Hardhat job compiles and runs only the three
interoperability smokes. The immutable public-compatibility and packed-consumer
gates run separately:

```console
$ pnpm parity:check
$ pnpm compatibility
$ pnpm test:package
```

The package gate also inspects the packed bytes rather than trusting the
working tree. It requires exact `@openzeppelin/contracts@5.6.1` as the sole
OpenZeppelin declaration, exactly 13 shipped production Solidity sources, and
the exact `^0.8.20` pragma in every one before compiling clean Hardhat and Forge
consumers.

Repository tool configurations compile with exactly Solidity 0.8.36 while
retaining the London EVM target, disabled optimizer with 200 configured runs,
`viaIR = false`, and the existing metadata mode. Production sources advertise
the compatible `^0.8.20` range required by the OpenZeppelin 5 dependency. Test
and fixture pragmas remain pinned to exact 0.8.36. The custom ERC721 is retained;
the dependency supplies interfaces, `Context`, and `ERC165`, not production
ownership or transfer semantics.

The compiler warning gates perform forced builds and require the complete,
exact reviewed warning inventories from both compiler entry points, including
warnings from production code, fixtures, and Forge tests. Mutability
suggestions, the test-only unchecked call, and expected test-contract code-size
warnings are included rather than globally ignored. Forge lint diagnostics are
captured separately from the compiler JSON and are not counted as Solidity
compiler warnings.

```console
$ pnpm compiler-warnings:hardhat
$ pnpm compiler-warnings:forge
$ pnpm compiler-warnings:check
```

The first two commands let the separate Hardhat and Forge CI jobs enforce only
the toolchain installed in that job. The combined command is the local full
gate. Each gate verifies the exact tool and Solidity versions, compiler
settings, warning source bytes and byte ranges, and rejects duplicate, new, or
missing warnings.

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
$ pnpm safety-baselines:check
$ pnpm coverage:forge
$ pnpm gas:check
$ pnpm size:check
```

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

The Partial Common Ownership business logic is fairly complex and, in alignment with best practices, you should consider gas usage during development. To make this easier, `hardhat-gas-reporter` is included.

When tests are run, it calculates the average gas usage of frequently used methods and prints these figures to stdout. Viewing gas costs as USD requires setting the `COINMARKETCAP_API_KEY` environment variable in `.env`.

## Compiler warnings

The Solidity compiler reports unused parameters because the ERC721 transfer
methods are overridden to ensure purchasing and foreclosure remain the only
transfer paths. It also reports the deliberately deferred `send`/`transfer`
deprecations, compiler mutability suggestions, a test-only unchecked call, and
expected oversized test harnesses. These warnings are reviewed by the exact
complete allowlist above; they must not be ignored globally.

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
