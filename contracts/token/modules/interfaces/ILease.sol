// contracts/token/modules/interfaces/ILease.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

interface ILease {
  /// @notice Enables owner to self-assess the value of a token.
  /// @param tokenId_ ID of token.
  /// @param newValuation_ New valuation in Wei.
  function selfAssess(uint256 tokenId_, uint256 newValuation_) external;
}
