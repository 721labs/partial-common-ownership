// contracts/token/modules/TokenManagement.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

abstract contract TokenManagement is ERC721 {
  //////////////////////////////
  /// Modifiers
  //////////////////////////////

  /// @notice Checks whether message sender owns a given token id
  /// @param tokenId_ ID of token to check ownership again.
  modifier _onlyOwner(uint256 tokenId_) {
    address owner = ownerOf(tokenId_);
    require(msg.sender == owner, "Sender does not own this token");
    _;
  }

  /// @notice Requires that token have been minted.
  /// @param tokenId_ ID of token to verify.
  modifier _tokenMinted(uint256 tokenId_) {
    require(_exists(tokenId_), "Query for nonexistent token");
    _;
  }
}
