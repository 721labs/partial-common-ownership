# Development

## Installation

```console
$ ./scripts/install.sh
```

## Gas

The Partial Common Ownership business logic is fairly complex and, in alignment with best practices, you should consider gas usage during development. To make this easier, `hardhat-gas-reporter` is included.

When tests are run, it calculates the average gas usage of frequently used methods and prints these figures to stdout. Viewing gas costs as USD requires setting the `COINMARKETCAP_API_KEY` environment variable in `.env`.

## "Unused function parameter" Warnings

The Solidity compiler will raise "unused function parameter" warnings because we are overriding the ERC721 public transfer methods to ensure that purchasing and foreclosure are the only way tokens can be transferred. _These warnings are to be expected and ignored_.

## Modules

Business logic is split up into a set of modules in order to reduce complexity and make the library more extensible to alternative implementations (e.g. depreciating licenses).

### [Beneficiary.sol](../contracts/token/modules/Beneficiary.sol)

The beneficiary of a given token is the recipient of the Harberger taxation. The module handles state management of the beneficiary registry.

### [Lease.sol](../contracts/token/modules/Lease.sol)

The module handles takeover and valuation assessments for a token's perpetual lease.

### [Remittance.sol](../contracts/token/modules/Remittance.sol)

The module handles sending and withdrawing (failed) remittances. By default, an active "push" strategy is employed, which alleviates the need for the tax collector to actively
check and collect.

### [Taxation.sol](../contracts/token/modules/Taxation.sol)

The module handles taxation, leasee deposits, and lease foreclosures.

### [Title.sol](../contracts/token/modules/Title.sol)

The module handles state management of the chain of title registry.

### [TokenManagement.sol](../contracts/token/modules/TokenManagement.sol)

The module is a light wrapper on top of ERC721 that exposes permissions modifiers.

### [Valuation.sol](../contracts/token/modules/Valuation.sol)

The module handles state management of the self-assessed valuations registry.
