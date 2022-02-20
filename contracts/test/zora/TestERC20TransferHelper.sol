// contracts/test/TestERC20TransferHelper.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../../../zora/contracts/transferHelpers/ERC20TransferHelper.sol";

/// @title TestERC20TransferHelper
contract TestERC20TransferHelper is ERC20TransferHelper {
  //////////////////////////////
  /// Constructor
  //////////////////////////////

  /// @notice Creates the Wrapper.
  /* solhint-disable no-empty-blocks */
  constructor(
    address _approvalsManager
  ) ERC20TransferHelper (
    _approvalsManager
  ) {}
  /* solhint-enable no-empty-blocks */
}


