// contracts/test/TestZoraModuleManager.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../../../zora/contracts/ZoraModuleManager.sol";

/// @title TestZoraModuleManager
contract TestZoraModuleManager is ZoraModuleManager {
  //////////////////////////////
  /// Constructor
  //////////////////////////////

  /// @notice Creates the Wrapper.
  /* solhint-disable no-empty-blocks */
  constructor(
    address _registrar, 
    address _feeToken
  ) ZoraModuleManager (
    _registrar,
    _feeToken
  ) {}
  /* solhint-enable no-empty-blocks */
}
