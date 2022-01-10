# Documentation

## Usage

Once installed, you can use the contracts by importing and inheriting from them:

```solidity
import "./PartialCommonOwnership721.sol";

/// @dev 100% patronage
contract YourToken is PartialCommonOwnership721 {
  constructor()
    PartialCommonOwnership721(
      "YourToken",
      "TOKEN",
      payable(msg.sender),
      1000000000000,
      365
    )
  {}
}

```
