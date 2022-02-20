// contracts/test/TestRoyaltyEngine.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@manifoldxyz/royalty-registry-solidity/contracts/RoyaltyEngineV1.sol";

/// @title TestERC20TransferHelper
contract TestRoyaltyEngine is RoyaltyEngineV1 {
  //////////////////////////////
  /// Constructor
  //////////////////////////////

  /// @notice Creates the Wrapper.
  /* solhint-disable no-empty-blocks */
  constructor() RoyaltyEngineV1 () {}
  /* solhint-enable no-empty-blocks */
}
