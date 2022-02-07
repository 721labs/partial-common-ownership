// contracts/token/modules/interfaces/IValuation.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

interface IValuation {
  /// @notice Returns the self-assessed valuation for a token.
  /// Requires that the token has been minted.
  /// @param tokenId_ ID of token.
  /// @return Valuation in Wei.
  function valuationOf(uint256 tokenId_) external view returns (uint256);
}
