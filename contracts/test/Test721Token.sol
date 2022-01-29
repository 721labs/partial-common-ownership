// contracts/test/TestPCO721Token.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/// @title Test721Token – Example implementation of 721 for use in testing.
contract Test721Token is ERC721URIStorage {
  /// @notice Constructs token and mints 1 - 3.
  constructor(
    string memory _name,
    string memory _symbol,
    string memory _uri
  ) ERC721(_name, _symbol) {
    _safeMint(msg.sender, 1);
    _setTokenURI(1, _uri);
    _safeMint(msg.sender, 2);
    _setTokenURI(2, _uri);
    _safeMint(msg.sender, 3);
    _setTokenURI(3, _uri);
  }
}
