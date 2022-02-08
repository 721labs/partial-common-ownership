# Documentation

## Usage

Once installed, you can use the contracts by importing and inheriting from them:

### [PartialCommonOwnership721.sol](contracts/token/PartialCommonOwnership721.sol)

`PartialCommonOwnership721.sol` enables you to launch new ERC721 tokens that are governed by PCO.

```solidity
import "./PartialCommonOwnership721.sol";

contract YourToken is PartialCommonOwnership721 {
  constructor()
    PartialCommonOwnership721(
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
