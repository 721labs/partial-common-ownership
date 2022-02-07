// contracts/token/modules/Price.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./TokenManagement.sol";
import "./interfaces/IPrice.sol";

abstract contract Price is IPrice, TokenManagement {
  //////////////////////////////
  /// State
  //////////////////////////////

  /// @notice Mapping from token ID to token price in Wei.
  mapping(uint256 => uint256) private _prices;

  //////////////////////////////
  /// Public Getters
  //////////////////////////////

  /// @dev See {IPrice.priceOf}
  function priceOf(uint256 tokenId_)
    public
    view
    override
    _tokenMinted(tokenId_)
    returns (uint256)
  {
    return _price(tokenId_);
  }

  //////////////////////////////
  /// Prviate Setters
  //////////////////////////////

  /// @notice Sets price for a given token.
  /// @param tokenId_ ID of token to set.
  /// @param price_ New price.
  function _setPrice(uint256 tokenId_, uint256 price_) internal {
    _prices[tokenId_] = price_;
  }

  //////////////////////////////
  /// Prviate Getters
  //////////////////////////////

  /// @notice Gets current price for a given token ID.
  /// @param tokenId_ ID of token requesting price for.
  /// @return Price in Wei.
  function _price(uint256 tokenId_) private view returns (uint256) {
    return _prices[tokenId_];
  }
}
