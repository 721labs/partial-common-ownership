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

  //////////////////////////////
  /// Internal Getters
  //////////////////////////////

  /// @notice Returns the time when tax owed initially exceeded deposits.
  /// @dev last collected time + ((time_elapsed * deposit) / owed)
  /// @dev Returns within +/- 2s of previous values due to Solidity rounding
  /// down integer division without regard for significant digits, which produces
  /// variable results e.g. `599.9999999999851` becomes `599`.
  /// @param tokenId_ ID of token requesting
  /// @return Unix timestamp
  function _backdatedForeclosureTime(uint256 tokenId_)
    internal
    view
    returns (uint256)
  {
    uint256 last = lastCollectionTimeOf(tokenId_);
    uint256 timeElapsed = block.timestamp - last;
    return last + ((timeElapsed * depositOf(tokenId_)) / _taxOwed(tokenId_));
  }
}
