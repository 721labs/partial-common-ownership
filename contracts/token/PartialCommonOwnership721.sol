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
  Taxation
{
  //////////////////////////////
  /// State
  //////////////////////////////

  /// @notice Mapping from token ID to purchase lock status
  /// @dev Used to prevent reentrancy attacks
  mapping(uint256 => bool) private locked;

  //////////////////////////////
  /// Events
  //////////////////////////////

  /// @notice Alert of purchase.
  /// @param tokenId ID of token.
  /// @param owner Address of new token owner.
  /// @param price Price paid by new owner.
  event LogBuy(
    uint256 indexed tokenId,
    address indexed owner,
    uint256 indexed price
  );

  /// @notice Alert owner changed price.
  /// @param tokenId ID of token.
  /// @param newPrice New price in Wei.
  event LogPriceChange(uint256 indexed tokenId, uint256 indexed newPrice);

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

  /// @notice Buy the token.  Current owner is remitted the current price and all excess value included
  /// in the message gets added to the deposit.
  /// @param tokenId_ ID of token the buyer wants to purchase.
  /// @param newValuation_ New buyer's valuation of the token. Must be greater or equal to current price.
  /// @param currentValuation_ Current valuation must be given to protect against a front-run attack.
  /// The buyer will only complete the purchase at the agreed upon price. This prevents a malicious,
  /// second buyer from purchasing the token before the first trx is complete, changing the price,
  /// and eating into the first buyer's deposit.
  function buy(
    uint256 tokenId_,
    uint256 newValuation_,
    uint256 currentValuation_
  ) public payable _tokenMinted(tokenId_) {
    // Prevent re-entrancy attack
    require(!locked[tokenId_], "Token is locked");

    uint256 valuationPriorToTaxCollection = valuationOf(tokenId_);

    // Prevent front-run.
    require(
      valuationPriorToTaxCollection == currentValuation_,
      "Current valuation is incorrect"
    );

    // New valuation must be greater than zero, even if current valuation is zero, to ensure that
    // funds are available for deposit.
    require(newValuation_ > 0, "New valuation cannot be zero");

    // Buyer can set the new valuation higher the current price; this renders unnecessary a second gas payment
    // if Buyer wants to immediately self-assess the token at a higher valuation.
    require(
      newValuation_ >= valuationPriorToTaxCollection,
      "New valuation must be >= current valuation"
    );

    // Value sent must be greater the amount being remitted to the current owner;
    // surplus is necessary for deposit.
    require(
      msg.value > valuationPriorToTaxCollection,
      "Message does not contain surplus value for deposit"
    );

    // Owner will be seller or this contract if foreclosed.
    // Prevent an accidental re-purchase.
    require(msg.sender != ownerOf(tokenId_), "Buyer is already owner");

    // After all security checks have occured, lock the token.
    locked[tokenId_] = true;

    // Collect tax.
    // Note: this may result in unexpected effects for the buyer. For example,
    // if taxation forecloses on the token, the buyer will be putting down a larger
    // deposit than they originally anticipated.
    collectTax(tokenId_);

    address ownerAfterCollection = ownerOf(tokenId_);

    // Token is being purchased for the first time or out of foreclosure
    if (ownerAfterCollection == address(this)) {
      // Deposit takes entire msg value
      _setDeposit(tokenId_, msg.value);

      // If the token is being purchased for the first time or is being purchased
      // from foreclosure, last collection time is set to now so that the contract
      // does not incorrectly consider the taxable period to have begun prior to
      // foreclosure and overtax the owner.
      _setLastCollectionTime(tokenId_, block.timestamp);

      // Note: no remittance occurs. Beneficiary receives no tax on a token that is currently
      // valued at nothing.
    } else {
      _remit(
        ownerAfterCollection,
        // Owner receives their self-assessed valuation and the remainder of their deposit.
        currentValuation_ + depositOf(tokenId_),
        RemittanceTriggers.LeaseTakeover
      );

      // Set the new owner's deposit
      _setDeposit(tokenId_, msg.value - currentValuation_);
    }

    // Set the new valuation
    _setValuation(tokenId_, newValuation_);

    _transfer(ownerAfterCollection, msg.sender, tokenId_);
    _titleTransfer(tokenId_, ownerAfterCollection, msg.sender, newValuation_);
    _setTaxCollectedSinceLastTransfer(tokenId_, 0);

    emit LogBuy(tokenId_, msg.sender, newValuation_);

    // Unlock token
    locked[tokenId_] = false;
  }

  //////////////////////////////
  /// Owner-Only Methods
  //////////////////////////////

  /// @notice Enables owner to change price in accordance with
  /// self-assessed value.
  /// @param tokenId_ ID of token to change price of.
  /// @param newPrice_ New price in Wei.
  function changePrice(uint256 tokenId_, uint256 newPrice_)
    public
    _onlyOwner(tokenId_)
    _collectTax(tokenId_)
  {
    uint256 price = valuationOf(tokenId_);
    require(newPrice_ > 0, "New price cannot be zero");
    require(newPrice_ != price, "New price cannot be same");
    _setValuation(tokenId_, newPrice_);
    emit LogPriceChange(tokenId_, newPrice_);
  }

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
