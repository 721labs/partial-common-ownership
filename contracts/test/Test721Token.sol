// contracts/test/TestPCO721Token.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title Test721Token – Example implementation of 721 for use in testing.
contract Test721Token is ERC721 {
  /// @notice Constructs token and mints 1 - 3.
  constructor(
    string memory _name,
    string memory _symbol
  )
    ERC721(
      _name,
      _symbol
    )
  {
    _safeMint(msg.sender, 1);
    _safeMint(msg.sender, 2);
    _safeMint(msg.sender, 3);
  }
}
