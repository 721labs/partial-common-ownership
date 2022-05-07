// contracts/token/modules/Beneficiary.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "./interfaces/IBeneficiary.sol";

/// @dev Note that this implementation is agnostic to whether or not a token
/// has actually been minted. Resultantly, it allows setting the beneficiary of yet-to-be
/// minuted tokens by directly calling `_setBeneficiary`.
abstract contract Beneficiary is IBeneficiary {
  //////////////////////////////
  /// State
  //////////////////////////////

  /// @notice Map of tokens to their beneficiaries.
  mapping(uint256 => address) internal _beneficiaries;

  //////////////////////////////
  /// Errors
  //////////////////////////////

  error BeneficiaryOnly();

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
  {
    if (msg.sender != _beneficiaries[tokenId_]) revert BeneficiaryOnly();
    _setBeneficiary(tokenId_, beneficiary_);
  }

  /// @dev See {IBeneficiary.beneficiaryOf}
  function beneficiaryOf(uint256 tokenId_)
    public
    view
    override
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
  {
    _beneficiaries[tokenId_] = beneficiary_;

    emit LogBeneficiaryUpdated(tokenId_, beneficiary_);
  }
}
