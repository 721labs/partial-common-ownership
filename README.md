# Partial Common Ownership ERC721 Contract

## Usage

```solidity
/// @dev 100% patronage
contract Example is PartialCommonOwnership721 {
  constructor()
    PartialCommonOwnership721(
      "EXAMPLE",
      "EXAMPLE",
      payable(msg.sender),
      1000000000000
    )
  {}
}
```