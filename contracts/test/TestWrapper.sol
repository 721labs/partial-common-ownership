// contracts/test/TestWrapper.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "../Wrapper.sol";

/// @title TestWrapper – Example implementation of Wrapper PCO for 721 for use in testing.
contract TestWrapper is Wrapper {
  //////////////////////////////
  /// Constructor
  //////////////////////////////

  /// @notice Creates the Wrapper.
  /* solhint-disable no-empty-blocks */
  constructor() Wrapper("Partial Common Ownership NFT", "pcoNFT") {}
  /* solhint-enable no-empty-blocks */
}
