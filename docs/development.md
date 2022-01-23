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
