// contracts/Wrapper.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./token/PartialCommonOwnership721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";

struct WrappedToken {
  address originAddress;
  uint256 originId;
  uint256 price;
}

/// @title Wrapper
/// @author Will Holley, Victor Sint Nicolaas
/// @notice This contract can wrap or hold other tokens adhering to the ERC721
//          standard, and is partially common owned (see PartialCommonOwnership721).
contract Wrapper is PartialCommonOwnership721 {
  /// @notice Mapping tokenIds to WrappedToken's
  mapping(uint256 => WrappedToken) private tokenMap;

  // @notice Event when acquire() is called
  event Acquire(uint256 tokenId);

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

  /// @notice helper function to get wrapperTokenId: hash the original NFT
  ///         contract address and its respective local tokenId
  /// @param assetContract Address the contract defining the token
  /// @param tokenId Token Id to be wrapped
  function createWrappedTokenId(
    address assetContract, 
    uint256 tokenId
  ) public returns (uint256) {
    return uint256(uint32(bytes4(keccak256(abi.encode(assetContract, tokenId)))));
  }

  /// @notice
  /// @param operator Address of contract TODO
  /// @param from Address the owner of the token
  /// @param tokenId Token Id to be wrapped
  /// @param _data extra data - unused
  function onERC721Received(
    address operator, 
    address from, 
    uint256 tokenId, 
    bytes memory _data
  ) public returns (bytes4) {
    uint256 wrapperTokenId = createWrappedTokenId(msg.sender, tokenId);
    _safeMint(from, wrapperTokenId);
    return bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
  }

  /// @notice
  /// @param _tokenContractAddress Address of contract that issued token
  /// @param _tokenId Token Id to be wrapped
  /// @param _newPrice New price for the token
  function acquire(
    address      _tokenContractAddress,
    uint256      _tokenId,
    uint256      _newPrice
  ) public {
    IERC721 tokenContract = IERC721(_tokenContractAddress);
    tokenContract.safeTransferFrom(msg.sender, address(this), _tokenId);
    
    uint256 wrappedTokenId = createWrappedTokenId(_tokenContractAddress, _tokenId);
    tokenMap[wrappedTokenId] = WrappedToken({
      originAddress: _tokenContractAddress,
      originId: _tokenId,
      price: _newPrice
    });

    PartialCommonOwnership721.changePrice(wrappedTokenId, _newPrice);

    emit Acquire(wrappedTokenId);
  }

  /// @notice Queries original tokenURI
  /// @param tokenId See IERC721
  function tokenURI(
    uint256 tokenId
  ) public view virtual override returns (string memory) { // TODO: why virtual?
    require(
      _exists(tokenId),
      "ERC721Metadata: URI query for nonexistent token"
    );

    WrappedToken memory wrappedToken = tokenMap[tokenId]; // TODO: or storage or calldata
    IERC721Metadata metadata = IERC721Metadata(wrappedToken.originAddress);
    return metadata.tokenURI(wrappedToken.originId);
  }
}
