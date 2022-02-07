// contracts/token/modules/interfaces/IDeposits.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

interface IDeposit {
  /// @notice Gets current deposit for a given token ID.
  /// @param tokenId_ ID of token requesting deposit for.
  /// @return Deposit in Wei.
  function depositOf(uint256 tokenId_) external view returns (uint256);
}
