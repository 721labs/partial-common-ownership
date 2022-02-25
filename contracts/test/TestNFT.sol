// contracts/test/TestNFT.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title TestNFT – An ERC721 NFT for use in testing.
contract TestNFT is ERC721 {
  //////////////////////////////
  /// Constructor
  //////////////////////////////

  /// @notice Sets up ERC721 contract and mints tokens 1 - 3.
  constructor() ERC721("Test NFT", "tNFT") {
    for (uint8 i = 1; i <= 3; i++) {
      _safeMint(msg.sender, i);
    }
  }

  //////////////////////////////
  /// Internal Methods
  //////////////////////////////

  /// @notice Sets the base uri for testing.
  function _baseURI() internal pure override returns (string memory) {
    return "721.dev/";
  }
}
