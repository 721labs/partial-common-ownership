// contracts/test/TestProtocolFeeSettings.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../../../zora/contracts/auxiliary/ZoraProtocolFeeSettings/ZoraProtocolFeeSettings.sol";

/// @title TestProtocolFeeSettings
contract TestProtocolFeeSettings is ZoraProtocolFeeSettings {
  //////////////////////////////
  /// Constructor
  //////////////////////////////

  /// @notice 
  /* solhint-disable no-empty-blocks */
  constructor() ZoraProtocolFeeSettings () {}
  /* solhint-enable no-empty-blocks */
}
