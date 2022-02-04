// contracts/Wrapper.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./token/PartialCommonOwnership721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";

struct WrappedToken {
  address contractAddress;
  uint256 id;
}

contract Wrapper is PartialCommonOwnership721 {
  /// @notice Monotonic counter for token ids
  uint256 private tokenIdCounter = 0;

  mapping(uint256 => WrappedToken) private tokenMap;

  /// @dev TODO: These will be set in `wrap`
  constructor(
    address payable _beneficiary,
    uint256 _taxRate,
    uint256 _taxationPeriod
  )
    PartialCommonOwnership721(
      "Partial Common Ownership Token Wrapper",
      "wPCO",
      _beneficiary,
      _taxRate,
      _taxationPeriod
    )
  {}

  /// @notice
  /// @param _tokenContractAddress Address of contract that issued token
  /// @param _tokenId Token Id to be wrapped
  /// @param _beneficiary Note: requires support for multiple
  /// @param _taxRate Note: requires support for multiple
  /// @param _taxationPeriod Note: requires support for multiple
  function deposit(
    address _tokenContractAddress,
    uint256 _tokenId,
    address payable _beneficiary,
    uint256 _taxRate,
    uint256 _taxationPeriod
  ) public {
    IERC721 tokenContract = IERC721(_tokenContractAddress);

    // Sender must own token.
    require(msg.sender == tokenContract.ownerOf(_tokenId), "OWNER ONLY");

    tokenMap[tokenIdCounter] = WrappedToken({
      contractAddress: _tokenContractAddress,
      id: _tokenId
    });

    tokenContract.transferFrom(msg.sender, address(this), _tokenId);

    // Mint
    // TODO: Set tax rate, beneficiary, etc.
    _safeMint(msg.sender, tokenIdCounter);
    tokenIdCounter += 1;
  }

  /// @notice Queries original tokenURI
  /// @param tokenId See IERC721
  function tokenURI(uint256 tokenId)
    public
    view
    virtual
    override
    returns (string memory)
  {
    require(
      _exists(tokenId),
      "ERC721Metadata: URI query for nonexistent token"
    );

    WrappedToken memory wrappedToken = tokenMap[tokenId];
    IERC721Metadata metadata = IERC721Metadata(wrappedToken.contractAddress);
    return metadata.tokenURI(wrappedToken.id);
  }
}
