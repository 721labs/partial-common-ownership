// contracts/TestToken.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./PartialCommonOwnership721.sol";

/// @title Example721Token – Example implementation of PCO for 721 for use in testing.
/// @dev 100% patronage
contract Example721Token is PartialCommonOwnership721 {
  constructor()
    PartialCommonOwnership721(
      "EXAMPLE",
      "EXAMPLE",
      payable(msg.sender),
      1000000000000
    )
  {}
}
