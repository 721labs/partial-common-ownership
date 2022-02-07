// contracts/token/modules/Foreclosure.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./interfaces/IForeclosure.sol";
import "./Taxation.sol";
import "./Deposit.sol";

abstract contract Foreclosure is IForeclosure, Taxation, Deposit {
  //////////////////////////////
  /// Public Getters
  //////////////////////////////

  /// @dev See {IForeclosure.foreclosed}
  function foreclosed(uint256 tokenId_) public view override returns (bool) {
    uint256 owed = _taxOwed(tokenId_);
    if (owed >= depositOf(tokenId_)) {
      return true;
    } else {
      return false;
    }
  }
}
