# Partial Common Ownership Tokens

[![tests](https://github.com/721labs/partial-common-ownership/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/721labs/partial-common-ownership/actions/workflows/tests.yml)

## Overview

**Adding [Partial Common Ownership](https://www.radicalxchange.org/concepts/partial-common-ownership/) to the ERC721 Token Standard.** Enable a new way of managing ERC721 tokens that is "fairer and more efficient than those under capitalism or communism."

### Installation

```console
$ yarn install
```

### Usage

Once installed, you can use the contracts by importing and inheriting from them:

```solidity
pragma solidity 0.8.7;

import "./PartialCommonOwnership721.sol";

/// @dev 100% patronage
contract YourToken is PartialCommonOwnership721 {
  constructor()
    PartialCommonOwnership721(
      "YourToken",
      "TOKEN",
      payable(msg.sender),
      1000000000000
    )
  {}
}
```

## Learn More

Documentation coming soon.

## Security

**Please note that `PartialCommonOwnership721.sol` is in early-development has not been independently audited for security**.  While the maintainers strive to ensure best practices, we are not responsible for loss-of-funds resulting from usage of Partial Common Ownership.  

Please report any security issues you find in [Issues](https://github.com/721labs/partial-common-ownership/issues).

## Authors

- [Simon de la Rouviere](https://twitter.com/simondlr)
- [Will Holley](https://twitter.com/waholleyiv)

## License

721 Labs' Partial Common Ownership is released under the [MIT License](LICENSE).