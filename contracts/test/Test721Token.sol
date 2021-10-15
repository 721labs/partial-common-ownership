// contracts/test/Test721Token.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "../token/PartialCommonOwnership721.sol";

/// @title Test721Token – Example implementation of PCO for 721 for use in testing.
/// @dev Requires 100% patronage per 365 days
contract Test721Token is PartialCommonOwnership721 {
  /// @notice Constructs token and mints 1 - 3.
  constructor(address payable _beneficiary, uint256 taxationPeriod_)
    PartialCommonOwnership721(
      "721TEST",
      "TEST",
      _beneficiary,
      1000000000000,
      taxationPeriod_
    )
  {
    _safeMint(address(this), 1);
    _safeMint(address(this), 2);
    _safeMint(address(this), 3);
  }
}
