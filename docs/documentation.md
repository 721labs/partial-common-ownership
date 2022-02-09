# Documentation

## Usage

Once installed, you can use the contracts by importing and inheriting from them:

### [PartialCommonOwnership.sol](contracts/token/PartialCommonOwnership.sol)

`PartialCommonOwnership.sol` enables you to launch new ERC721 tokens that are governed by PCO.

```solidity
import "./PartialCommonOwnership.sol";

contract YourToken is PartialCommonOwnership {
  constructor()
    PartialCommonOwnership(
      "YourToken",
      "TOKEN",
      payable(msg.sender),
      // 100% patronage per year
      1000000000000,
      365
    )
  {}
}

```

### [Wrapper.sol](contracts/Wrapper.sol)

`Wrapper.sol` enables you to launch your own contracts that wrap existent ERC721 tokens.

```solidity
import "../Wrapper.sol";

contract YourWrapper is Wrapper {
  constructor() Wrapper("Partial Common Ownership NFT", "pcoNFT") {}
}

```
