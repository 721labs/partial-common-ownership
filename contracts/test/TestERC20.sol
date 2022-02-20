// contracts/test/TestERC20.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TestERC20
contract TestERC20 is ERC20 {
  //////////////////////////////
  /// Constructor
  //////////////////////////////

  /// @notice
  /* solhint-disable no-empty-blocks */
  constructor() ERC20("Test ERC20", "tETH") { }
  /* solhint-enable no-empty-blocks */
}

