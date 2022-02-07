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
