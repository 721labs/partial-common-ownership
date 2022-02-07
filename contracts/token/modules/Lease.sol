// contracts/token/modules/Lease.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./interfaces/ILease.sol";
import "./TokenManagement.sol";
import "./Taxation.sol";

abstract contract Lease is ILease, TokenManagement, Taxation {
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

  /// @notice Alert owner re-assessed the valuation.
  /// @param tokenId ID of token.
  /// @param newValuation New valuation in Wei.
  event LogValuationReassessment(
    uint256 indexed tokenId,
    uint256 indexed newValuation
  );

  //////////////////////////////
  /// Public Methods
  //////////////////////////////

  /// @dev See {ILease.buy}
  function buy(
    uint256 tokenId_,
    uint256 newValuation_,
    uint256 currentValuation_
  ) public payable override _tokenMinted(tokenId_) {
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

  /// @dev See {ILease.selfAssess}
  function selfAssess(uint256 tokenId_, uint256 newValuation_)
    public
    override
    _onlyOwner(tokenId_)
    _collectTax(tokenId_)
  {
    uint256 currentValuation = valuationOf(tokenId_);
    require(newValuation_ > 0, "New price cannot be zero");
    require(newValuation_ != currentValuation, "New price cannot be same");

    _setValuation(tokenId_, newValuation_);
    emit LogValuationReassessment(tokenId_, newValuation_);
  }
}
