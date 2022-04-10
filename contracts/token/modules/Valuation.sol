// contracts/token/modules/Valuation.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "./interfaces/IValuation.sol";

abstract contract Valuation is IValuation {
  //////////////////////////////
  /// State
  //////////////////////////////

  /// @notice Mapping from token ID to token valuation in Wei.
  mapping(uint256 => uint256) internal _valuations;

  //////////////////////////////
  /// Events
  //////////////////////////////

  /// @notice Alert of new valuation.
  /// @param tokenId ID of token.
  /// @param newValuation in Wei.
  event LogValuation(uint256 indexed tokenId, uint256 indexed newValuation);

  //////////////////////////////
  /// Public Getters
  //////////////////////////////

  /// @dev See {IValuation.valuationOf}
  function valuationOf(uint256 tokenId_)
    public
    view
    override
    returns (uint256)
  {
    return _valuations[tokenId_];
  }

  //////////////////////////////
  /// Private Setters
  //////////////////////////////

  /// @notice Sets valuation for a given token.
  /// @param tokenId_ ID of token to set.
  /// @param valuation_ New valuation.
  function _setValuation(uint256 tokenId_, uint256 valuation_) internal {
    _valuations[tokenId_] = valuation_;

    emit LogValuation(tokenId_, valuation_);
  }
}
