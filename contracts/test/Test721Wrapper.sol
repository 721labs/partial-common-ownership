// contracts/test/Test721Token.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "../token/PartialCommonOwnership721.sol";
import "../Wrapper.sol"; // TODO: should have more consistent naming

/// @title Test721Token – Example implementation of Wrapper PCO for 721 for use in testing.
contract Test721Wrapper is Wrapper {
  /// @notice Constructs token.
  constructor()
    Wrapper()
  {
  }
}

