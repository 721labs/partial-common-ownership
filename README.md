# Partial Common Ownership Tokens

[![tests](https://github.com/721labs/partial-common-ownership/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/721labs/partial-common-ownership/actions/workflows/tests.yml)

## Overview

This project aims to establish a standard, open source implementation of Partial Common Ownership for ERC721, ERC1155 and future non-fungible tokens.  It builds upon work done by RadicalxChange, Simon de la Rouviere, and others.

### Partial Common Ownership

> Partial common ownership is a new way of managing assets that is fairer and more efficient than those under capitalism or communism.
>
> In partial common ownership systems (also known under the acronyms COST and SALSA), assets belong to no one and everyone. An asset’s current possessor, must self-assess and declare its value. Based on the self-assessed value, they pay a fee, which can be used to fund public goods, or distributed as a social dividend. If somebody bids more for that asset, current possessors sell it for their self-assessed value, resulting in more benefits for the public. [RadicalxChange](https://www.radicalxchange.org/concepts/partial-common-ownership/)

To learn more, see:

- [Educational Resources](https://www.radicalxchange.org/concepts/partial-common-ownership/)
- [RadicalxChange](https://www.radicalxchange.org/)
- [This Artwork Is Always On Sale](https://thisartworkisalwaysonsale.com/)

## Installation

```console
$ yarn install
```

## Usage

Once installed, you can use the contracts by importing and inheriting from them:

```solidity
pragma solidity 0.8.7;

import "./PartialCommonOwnership721.sol";

/// @dev 100% patronage
contract YourToken is PartialCommonOwnership721 {
  constructor()
    PartialCommonOwnership721(
      "Your Token",
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

- [Will Holley](https://twitter.com/waholleyiv)

## License

721 Labs' Partial Common Ownership is released under the [MIT License](LICENSE).
