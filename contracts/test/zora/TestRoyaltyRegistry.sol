// contracts/test/TestRoyaltyRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@manifoldxyz/royalty-registry-solidity/contracts/RoyaltyRegistry.sol";

/// @title TestRoyaltyRegistry
contract TestRoyaltyRegistry is RoyaltyRegistry {
  //////////////////////////////
  /// Constructor
  //////////////////////////////

  /// @notice Creates the Wrapper.
  /* solhint-disable no-empty-blocks */
  constructor() RoyaltyRegistry () {}
  /* solhint-enable no-empty-blocks */
}

