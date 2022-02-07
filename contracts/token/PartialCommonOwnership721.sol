// contracts/token/PartialCommonOwnership721.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {TokenManagement} from "./modules/TokenManagement.sol";
import {Valuation} from "./modules/Valuation.sol";
import {Remittance, RemittanceTriggers} from "./modules/Remittance.sol";
import {Taxation} from "./modules/Taxation.sol";
import {Beneficiary} from "./modules/Beneficiary.sol";
import {Title} from "./modules/Title.sol";
import {Lease} from "./modules/Lease.sol";

/// @title PartialCommonOwnership721
/// @author Simon de la Rouviere, Will Holley
/// @notice Extends the ERC721 standard by requiring tax payments from a token's current owner
/// using a Harberger Tax model; if payments are not made, the token is repossessed by the contract
/// and can be repurchased at any price > 0.
/// @dev This code was originally forked from ThisArtworkIsAlwaysOnSale's `v2_contracts/ArtSteward.sol`
/// contract by Simon de la Rouviere.
contract PartialCommonOwnership721 is
  ERC721,
  TokenManagement,
  Valuation,
  Title,
  Remittance,
  Beneficiary,
  Taxation,
  Lease
{
  //////////////////////////////
  /// Constructor
  //////////////////////////////

  /// @notice Creates the token.
  /// @param name_ ERC721 Token Name
  /// @param symbol_ ERC721 Token Symbol
  /* solhint-disable no-empty-blocks */
  constructor(string memory name_, string memory symbol_)
    ERC721(name_, symbol_)
  {}

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
    _setTaxPeriod(tokenId_, collectionFrequency_);
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
    delete _chainOfTitle[tokenId_];
    delete _taxNumerators[tokenId_];
    delete _taxPeriods[tokenId_];
    delete _locked[tokenId_];
  }

  /* solhint-enable no-empty-blocks */

  //////////////////////////////
  /// ERC721 Overrides
  //////////////////////////////

  /**
   * Override ERC721 public transfer methods to ensure that purchasing and
   * foreclosure are the only way tokens can be transferred.
   */

  /* solhint-disable no-unused-vars */
  /* solhint-disable ordering */

  /// @dev Override to make effectively-private.
  function transferFrom(
    address from,
    address to,
    uint256 tokenId
  ) public pure override {
    revert("Transfers may only occur via purchase/foreclosure");
  }

  /// @dev Override to make effectively-private.
  function safeTransferFrom(
    address from,
    address to,
    uint256 tokenId
  ) public pure override {
    revert("Transfers may only occur via purchase/foreclosure");
  }

  /// @dev Override to make effectively-private.
  function safeTransferFrom(
    address from,
    address to,
    uint256 tokenId,
    bytes memory _data
  ) public pure override {
    revert("Transfers may only occur via purchase/foreclosure");
  }

  /* solhint-enable no-unused-vars */
  /* solhint-enable ordering */
}
