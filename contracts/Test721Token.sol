// contracts/TestToken.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./PartialCommonOwnership721.sol";

/// @title Test721Token – Example implementation of PCO for 721 for use in testing.
/// @dev 100% patronage
contract Test721Token is PartialCommonOwnership721 {
  /// @notice Constructs token and mints 1 - 3.
  constructor()
    PartialCommonOwnership721(
      "721TEST",
      "TEST",
      payable(msg.sender),
      1000000000000
    )
  {
    _safeMint(address(this), 1);
    _safeMint(address(this), 2);
    _safeMint(address(this), 3);
  }
}
