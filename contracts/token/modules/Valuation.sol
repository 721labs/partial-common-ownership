// contracts/token/modules/Valuation.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./TokenManagement.sol";
import "./interfaces/IValuation.sol";

abstract contract Valuation is IValuation, TokenManagement {
  //////////////////////////////
  /// State
  //////////////////////////////

  /// @notice Mapping from token ID to token price in Wei.
  mapping(uint256 => uint256) private _valuations;

  //////////////////////////////
  /// Public Getters
  //////////////////////////////

  /// @dev See {IValuation.valuationOf}
  function valuationOf(uint256 tokenId_)
    public
    view
    override
    _tokenMinted(tokenId_)
    returns (uint256)
  {
    return _valuation(tokenId_);
  }

  //////////////////////////////
  /// Prviate Setters
  //////////////////////////////

  /// @notice Sets valuation for a given token.
  /// @param tokenId_ ID of token to set.
  /// @param price_ New price.
  function _setValuation(uint256 tokenId_, uint256 price_) internal {
    _valuations[tokenId_] = price_;
  }

  //////////////////////////////
  /// Prviate Getters
  //////////////////////////////

  /// @notice Returns the self-assessed valuation for a token.
  /// @param tokenId_ ID of token.
  /// @return Valuation in Wei.
  function _valuation(uint256 tokenId_) private view returns (uint256) {
    return _valuations[tokenId_];
  }
}