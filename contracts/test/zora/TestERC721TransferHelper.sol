// contracts/test/TestERC721TransferHelper.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../../../zora/contracts/transferHelpers/ERC721TransferHelper.sol";

/// @title TestERC721TransferHelper
contract TestERC721TransferHelper is ERC721TransferHelper {
  //////////////////////////////
  /// Constructor
  //////////////////////////////

  /* solhint-disable no-empty-blocks */
  constructor(
    address _approvalsManager
  ) ERC721TransferHelper (
    _approvalsManager
  ) {}
  /* solhint-enable no-empty-blocks */
}



