// contracts/test/TestAsksV1_1.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../../../zora/contracts/modules/Asks/V1.1/AsksV1_1.sol";

/// @title TestAsksV1_1
contract TestAsksV1_1 is AsksV1_1 {
  //////////////////////////////
  /// Constructor
  //////////////////////////////

  /// @notice Creates the Wrapper.
  /* solhint-disable no-empty-blocks */
  constructor(
    address _erc20TransferHelper,
    address _erc721TransferHelper,
    address _royaltyEngine,
    address _protocolFeeSettings,
    address _wethAddress
  ) AsksV1_1(
    _erc20TransferHelper,
    _erc721TransferHelper,
    _royaltyEngine,
    _protocolFeeSettings,
    _wethAddress
  ) {}
  /* solhint-enable no-empty-blocks */
}

