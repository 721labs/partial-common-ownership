// contracts/test/TestNFT.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import {ERC721} from "../token/modules/ERC721.sol";

/// @title TestNFT – An ERC721 NFT for use in testing.
contract TestNFT is ERC721 {
  string private _fixtureName;
  string private _fixtureSymbol;
  mapping(uint256 => address) private _fixtureTokenApprovals;
  bool private _clearingApprovalForTransfer;

  //////////////////////////////
  /// Constructor
  //////////////////////////////

  /// @notice Sets up ERC721 contract and mints tokens 1 - 3.
  constructor() {
    _fixtureName = "Test NFT";
    _fixtureSymbol = "tNFT";
    for (uint8 i = 1; i <= 3; i++) {
      _safeMint(msg.sender, i);
    }
  }

  //////////////////////////////
  /// Public Methods
  //////////////////////////////

  /* solhint-disable ordering */

  /// @dev Retains the OpenZeppelin 4.9 fixture's metadata interface answer.
  function supportsInterface(bytes4 interfaceId)
    public
    view
    virtual
    override
    returns (bool)
  {
    return
      interfaceId == type(IERC721Metadata).interfaceId ||
      super.supportsInterface(interfaceId);
  }

  /// @notice Returns the fixture collection name.
  function name() public view returns (string memory) {
    return _fixtureName;
  }

  /// @notice Returns the fixture collection symbol.
  function symbol() public view returns (string memory) {
    return _fixtureSymbol;
  }

  /// @notice Returns the fixture token URI.
  function tokenURI(uint256 tokenId) public view returns (string memory) {
    require(_exists(tokenId), "ERC721: invalid token ID");
    return string(abi.encodePacked(_baseURI(), _toString(tokenId)));
  }

  /// @dev Retains the OpenZeppelin 4.9 fixture's nonexistent-token payload.
  function ownerOf(uint256 tokenId)
    public
    view
    virtual
    override
    returns (address)
  {
    require(_exists(tokenId), "ERC721: invalid token ID");
    return super.ownerOf(tokenId);
  }

  /// @dev Retains the OpenZeppelin 4.9 fixture's nonexistent-token payload.
  function getApproved(uint256 tokenId)
    public
    view
    virtual
    override
    returns (address)
  {
    require(_exists(tokenId), "ERC721: invalid token ID");
    return _fixtureTokenApprovals[tokenId];
  }

  /// @dev Retains the OpenZeppelin 4.9 fixture's authorization payload.
  function approve(address to, uint256 tokenId) public virtual override {
    address owner = ownerOf(tokenId);
    require(to != owner, "ERC721: approval to current owner");
    /* solhint-disable reason-string */
    require(
      _msgSender() == owner || isApprovedForAll(owner, _msgSender()),
      "ERC721: approve caller is not token owner or approved for all"
    );
    /* solhint-enable reason-string */
    _approve(to, tokenId);
  }

  /// @dev Retains the OpenZeppelin 4.9 fixture's authorization payload.
  function transferFrom(
    address from,
    address to,
    uint256 tokenId
  ) public virtual override {
    _requireFixtureAuthorization(tokenId);
    _transfer(from, to, tokenId);
  }

  /// @dev Retains the OpenZeppelin 4.9 fixture's authorization payload.
  function safeTransferFrom(
    address from,
    address to,
    uint256 tokenId
  ) public virtual override {
    safeTransferFrom(from, to, tokenId, "");
  }

  /// @dev Retains the OpenZeppelin 4.9 fixture's authorization payload.
  function safeTransferFrom(
    address from,
    address to,
    uint256 tokenId,
    bytes memory data
  ) public virtual override {
    _requireFixtureAuthorization(tokenId);
    _safeTransfer(from, to, tokenId, data);
  }

  /* solhint-enable ordering */

  //////////////////////////////
  /// Internal Methods
  //////////////////////////////

  /// @notice Sets the base uri for testing.
  function _baseURI() internal pure returns (string memory) {
    return "721.dev/";
  }

  /// @dev The project base emits an Approval-clear event during transfers,
  /// while OpenZeppelin 4.9 cleared the same state without that event. Keep
  /// this test fixture's historical event sequence without changing the
  /// production implementation.
  function _transfer(
    address from,
    address to,
    uint256 tokenId
  ) internal virtual override {
    _clearingApprovalForTransfer = true;
    super._transfer(from, to, tokenId);
    _clearingApprovalForTransfer = false;
  }

  function _approve(address to, uint256 tokenId) internal virtual override {
    _fixtureTokenApprovals[tokenId] = to;
    if (!_clearingApprovalForTransfer)
      emit Approval(ownerOf(tokenId), to, tokenId);
  }

  function _requireFixtureAuthorization(uint256 tokenId) private view {
    require(_exists(tokenId), "ERC721: invalid token ID");
    require(
      _isApprovedOrOwner(_msgSender(), tokenId),
      "ERC721: caller is not token owner or approved"
    );
  }

  function _toString(uint256 value) private pure returns (string memory) {
    if (value == 0) return "0";

    uint256 digits;
    uint256 remaining = value;
    while (remaining != 0) {
      digits++;
      remaining /= 10;
    }

    bytes memory buffer = new bytes(digits);
    while (value != 0) {
      digits -= 1;
      buffer[digits] = bytes1(uint8(48 + (value % 10)));
      value /= 10;
    }
    return string(buffer);
  }
}
