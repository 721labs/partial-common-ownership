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

## Partial Common Ownership Wrapper

### Wrapping

#### Deposits

If beneficiary, no deposit necessary (not going to pay taxes to yourself). If not beneficiary, deposit necessary (taxes must be paid to the beneficiary).

#### Purchasing as Beneficiary from the Contract (initial mint or foreclosure)

No message value, (essentially free minus cost of gas) because the value would be remitted back to the beneficiary, providing no benefit and increasing the gas cost. **Because of this, beneficiary is able to hoard the token by setting a prohibitively high price, effectively monopolizing the asset**.
