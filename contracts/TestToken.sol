// contracts/TestToken.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title TestToken
/// @dev Ensures that Hardhat compiles ERC721 into artifacts for use in testing.
contract TestToken is ERC721 {
  constructor() ERC721("TEST", "TEST") {}

  /// @dev Exposes mint functionality.
  function mint(address to, uint256 tokenId) public virtual {
    _safeMint(to, tokenId);
  }
}

// TODO: Token should extend PartialCommonOwnership because PCO needs to own the
// ERC721 token in order to call `transferFrom` without prior approval of the token's
// current owner, which would allow the currenet owner to block transfer and maintain
// ownership, thus violating the Harberger tax.
// contract TestToken is ERC721, PartialCommonOwnership { ... }
