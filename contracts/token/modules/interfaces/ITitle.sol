// contracts/token/modules/interfaces/ITitle.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

struct TitleTransferEvent {
  /// @notice From address.
  address from;
  /// @notice To address.
  address to;
  /// @notice Unix timestamp.
  uint256 timestamp;
  /// @notice Valuation in Wei
  uint256 valuation;
}

interface ITitle {
  /// @notice Returns an array of metadata about transfers for a given token.
  /// @param tokenId_ ID of the token requesting for.
  /// @return Array of TitleTransferEvents.
  function titleChainOf(uint256 tokenId_)
    external
    view
    returns (TitleTransferEvent[] memory);

  /// @notice Returns the time that a title was last transferred.
  /// @param tokenId_ ID of token to fetch title for.
  /// @return Timestamp.
  function lastTransferTimeOf(uint256 tokenId_) external view returns (uint256);
}
