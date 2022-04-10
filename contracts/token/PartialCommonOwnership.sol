// contracts/token/PartialCommonOwnership.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import {ERC721} from "./modules/ERC721.sol";
import {Valuation} from "./modules/Valuation.sol";
import {Remittance, RemittanceTriggers} from "./modules/Remittance.sol";
import {Taxation} from "./modules/Taxation.sol";
import {Beneficiary} from "./modules/Beneficiary.sol";
import {Lease} from "./modules/Lease.sol";

/// @title PartialCommonOwnership
/// @notice Extends the ERC721 standard by requiring tax payments from a token's current owner
/// using a Harberger Tax model; if payments are not made, the token is repossessed by the contract
/// and can be repurchased at any valuation > 0.
contract PartialCommonOwnership is ERC721, Valuation, Lease {
  //////////////////////////////
  /// Internal Methods
  //////////////////////////////

  /// @notice Mints a new token.
  /// @param tokenId_ Token's ID.
  /// @param leasee_ Token's leasee.
  /// @param deposit_ Token's deposit.
  /// @param valuation_ Leasee's self assessed valuation of the token.
  /// @param beneficiary_ Beneficiary of the token's taxation.
  /// @param taxRate_ Tax rate (numerator).
  /// @param collectionFrequency_ Tax collection frequency.
  function _mint(
    uint256 tokenId_,
    address leasee_,
    uint256 deposit_,
    uint256 valuation_,
    address payable beneficiary_,
    uint256 taxRate_,
    uint256 collectionFrequency_
  ) internal {
    ERC721._safeMint(leasee_, tokenId_);
    _setDeposit(tokenId_, deposit_);
    _setValuation(tokenId_, valuation_);
    _setBeneficiary(tokenId_, beneficiary_);
    _setTaxRate(tokenId_, taxRate_);
    _setCollectionFrequency(tokenId_, collectionFrequency_);
  }

  /// @notice Burns a token.
  /// @param tokenId_ ID of token to burn.
  function _burn(uint256 tokenId_) internal override _collectTax(tokenId_) {
    // Return the current owner's deposit.
    _withdrawDeposit(tokenId_, depositOf(tokenId_));

    // Burn token
    ERC721._burn(tokenId_);

    // Delete state
    delete _beneficiaries[tokenId_];
    delete _valuations[tokenId_];
    delete _taxNumerators[tokenId_];
    delete _collectionFrequencies[tokenId_];
    delete _locked[tokenId_];
  }

  /* solhint-disable no-unused-vars*/

  /// @notice Collect Tax
  function _beforeTokenTransfer(
    address from_,
    address to_,
    uint256 tokenId_
  ) internal override {
    collectTax(tokenId_);
  }

  /// @notice Reset tax collected
  function _afterTokenTransfer(
    address from_,
    address to_,
    uint256 tokenId_
  ) internal override {
    _setTaxCollectedSinceLastTransfer(tokenId_, 0);
  }

  /* solhint-enable no-unused-vars*/
}
