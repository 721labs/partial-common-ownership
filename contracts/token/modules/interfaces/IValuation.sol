// contracts/token/modules/interfaces/IValuation.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

interface IValuation {
  /// @notice Returns the self-assessed valuation for a token.
  /// @param tokenId_ ID of token.
  /// @return Valuation in Wei.  If token has no valuation set, returns 0.
  function valuationOf(uint256 tokenId_) external view returns (uint256);
}
