// contracts/token/modules/Beneficiary.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "./interfaces/IBeneficiary.sol";
import "./TokenManagement.sol";

abstract contract Beneficiary is IBeneficiary, TokenManagement {
  //////////////////////////////
  /// State
  //////////////////////////////

  /// @notice Map of tokens to their beneficiaries.
  mapping(uint256 => address) internal _beneficiaries;

  //////////////////////////////
  /// Events
  //////////////////////////////

  /// @notice Alert of new beneficiary
  /// @param tokenId ID of token.
  /// @param newBeneficiary Address of new beneficiary.
  event LogBeneficiaryUpdated(
    uint256 indexed tokenId,
    address indexed newBeneficiary
  );

  //////////////////////////////
  /// Public Methods
  //////////////////////////////

  /// @dev See {IBeneficiary.setBeneficiary}
  function setBeneficiary(uint256 tokenId_, address payable beneficiary_)
    public
    override
    _tokenMinted(tokenId_)
  {
    require(msg.sender == _beneficiaries[tokenId_], "Current beneficiary only");
    _setBeneficiary(tokenId_, beneficiary_);
  }

  /// @dev See {IBeneficiary.beneficiaryOf}
  function beneficiaryOf(uint256 tokenId_)
    public
    view
    override
    _tokenMinted(tokenId_)
    returns (address)
  {
    return _beneficiaries[tokenId_];
  }

  //////////////////////////////
  /// Internal Methods
  //////////////////////////////

  /// @notice Internal beneficiary setter.
  /// @dev Should be invoked immediately after calling `#_safeMint`
  /// @param tokenId_ Token to set beneficiary of.
  /// @param beneficiary_ Address of beneficiary.
  function _setBeneficiary(uint256 tokenId_, address payable beneficiary_)
    internal
    _tokenMinted(tokenId_)
  {
    _beneficiaries[tokenId_] = beneficiary_;

    emit LogBeneficiaryUpdated(tokenId_, beneficiary_);
  }
}
