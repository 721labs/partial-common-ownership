// contracts/token/modules/interfaces/IPrice.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

interface IPrice {
  /// @notice Gets current price for a given token ID. Requires that
  /// the token has been minted.
  /// @param tokenId_ ID of token requesting price for.
  /// @return Price in Wei.
  function priceOf(uint256 tokenId_) external view returns (uint256);
}
