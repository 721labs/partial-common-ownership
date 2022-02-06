// contracts/Wrapper.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import {PartialCommonOwnership721 as PCO} from "./token/PartialCommonOwnership721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";

struct WrappedToken {
  /// @notice Issuing contract address.
  address contractAddress;
  /// @notice Underlying token ID (issued when minted).
  uint256 tokenId;
  /// @notice Address that wrapped the token.
  address operatorAddress;
}

/// @title Wrapper
/// @author Will Holley (@will-holley)
/// @author Victor Sint Nicolaas (@vicsn)
/// @notice This contract can wrap or hold other tokens adhering to the ERC721
/// standard, and is partially common owned (see PCO).
contract Wrapper is PCO {
  //////////////////////////////
  /// State
  //////////////////////////////

  /// @notice Mapping from Wrapped Token IDs to metadata on the underlying token.
  mapping(uint256 => WrappedToken) private _wrappedTokenMap;

  //////////////////////////////
  /// Events
  //////////////////////////////

  /// @notice Alert that a token has been wrapped
  /// @param contractAddress See WrappedToken.contractAddress
  /// @param tokenId See WrappedToken.tokenId
  /// @param wrappedTokenId The Wrapped Token ID.
  event LogTokenWrapped(
    address contractAddress,
    uint256 tokenId,
    uint256 wrappedTokenId
  );

  //////////////////////////////
  /// Constructor
  //////////////////////////////

  /// @notice Creates the Wrapper.
  /// @param name_ PCO Contract Name.
  /// @param symbol_ PCO Contract Symbol.
  /* solhint-disable no-empty-blocks */
  constructor(string memory name_, string memory symbol_) PCO(name_, symbol_) {}

  /* solhint-enable no-empty-blocks */

  //////////////////////////////
  /// Public Methods
  //////////////////////////////

  /// @notice Takes possession of a given token, creating a "wrapped" version that complies with
  /// Partial Common Ownership. The new token is returned to the owner.
  /// @dev Note that `#safeTransferFrom` first requires that contract address is
  /// approved by `msg.sender`.
  /// @param tokenContractAddress_ Issuing contract address for token to be wrapped.
  /// @param tokenId_ ID of token to be wrapped
  /// @param newPrice_ Self assessed valuation of the token.
  /// @param beneficiary_ See `PCO._beneficiaries`.
  /// @param taxRate_ See `PCO._taxNumerators`.
  /// @param taxationPeriod_ See `PCO._taxPeriods`.
  function wrap(
    address tokenContractAddress_,
    uint256 tokenId_,
    uint256 newPrice_,
    address payable beneficiary_,
    uint256 taxRate_,
    uint256 taxationPeriod_
  ) public {
    // Transfer ownership of the token to this contract.
    IERC721 tokenContract = IERC721(tokenContractAddress_);
    tokenContract.safeTransferFrom(msg.sender, address(this), tokenId_);

    uint256 _wrappedTokenId = wrappedTokenId(tokenContractAddress_, tokenId_);
    _wrappedTokenMap[_wrappedTokenId] = WrappedToken({
      contractAddress: tokenContractAddress_,
      tokenId: tokenId_,
      operatorAddress: msg.sender
    });
    _safeMint(msg.sender, _wrappedTokenId);

    PCO.changePrice(_wrappedTokenId, newPrice_);
    PCO._setBeneficiary(_wrappedTokenId, beneficiary_);
    PCO._setTaxRate(_wrappedTokenId, taxRate_);
    PCO._setTaxPeriod(_wrappedTokenId, taxationPeriod_);

    emit LogTokenWrapped(tokenContractAddress_, tokenId_, _wrappedTokenId);
  }

  /// @notice Unwrap a given token. Only callable by the address that originally
  /// wrapped the token. Burns the wrapped token and transfers the underlying token
  /// to the last owner of the wrapped token.
  /// @param tokenId_ Id of wrapped token.
  function unwrap(uint256 tokenId_) public _tokenMinted(tokenId_) {
    WrappedToken memory token = _wrappedTokenMap[tokenId_];

    require(token.operatorAddress == msg.sender, "Wrap originator only");

    // Get current owner's address prior to burning.
    address owner = ownerOf(tokenId_);

    // Ensure any outstanding taxes are paid
    collectTax(tokenId_);

    // Return the current owner's deposit.
    _withdrawDeposit(tokenId_, _deposits[tokenId_]);

    // Burn the wrapped token.
    _burn(tokenId_);

    // Delete wrapper state
    delete _wrappedTokenMap[tokenId_];

    // Delete PCO state
    delete _beneficiaries[tokenId_];
    delete prices[tokenId_];
    delete _chainOfTitle[tokenId_];
    delete _taxNumerators[tokenId_];
    delete _taxPeriods[tokenId_];
    delete _locked[tokenId_];

    // Transfer ownership of the underlying token to the current owner
    IERC721 tokenContract = IERC721(token.contractAddress);
    tokenContract.safeTransferFrom(address(this), owner, token.tokenId);
  }

  /// @notice Queries the wrapped token's URI.
  /// @param tokenId_ See IERC721
  /// @return Token URI string.
  function tokenURI(uint256 tokenId_)
    public
    view
    override
    returns (string memory)
  {
    require(
      _exists(tokenId_),
      "ERC721Metadata: URI query for nonexistent token"
    );

    WrappedToken memory wrappedToken = _wrappedTokenMap[tokenId_];
    IERC721Metadata metadata = IERC721Metadata(wrappedToken.contractAddress);
    return metadata.tokenURI(wrappedToken.tokenId);
  }

  /// @notice Mints the wrapped token.
  /// @dev Envoked by `#wrap`.
  /// @param operator_ Address that initiated the token transfer.
  /// @param from_ Address of the contract that issued this token.
  /// @param tokenId_ Id of token received.
  /// @param data_ Unused call data.
  /// @return Must return its Solidity selector to confirm the token transfer.
  /// Returning any other value or interface will revert the transfer.
  /* solhint-disable no-unused-vars */
  function onERC721Received(
    address operator_,
    address from_,
    uint256 tokenId_,
    bytes memory data_
  ) public view returns (bytes4) {
    // Ensure that the token was not errantly sent. This ensures that the self-assesssed valuation
    // and taxation information are set.
    require(
      operator_ == address(this),
      "Tokens can only be received via #wrap"
    );

    return this.onERC721Received.selector;
  }

  /* solhint-enable no-unused-vars */

  /// @notice Deterministically generates wrapped token IDs given the token's
  /// contract address and ID.
  /// @param contractAddress_ Issuing contract address
  /// @param tokenId_ Token ID
  /// @return Wrapped Token ID
  function wrappedTokenId(address contractAddress_, uint256 tokenId_)
    public
    pure
    returns (uint256)
  {
    return uint256(bytes32(keccak256(abi.encode(contractAddress_, tokenId_))));
  }
}
