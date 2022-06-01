// contracts/token/modules/Lease.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "./interfaces/ILease.sol";
import "./Taxation.sol";

abstract contract Lease is ILease, Taxation {
  //////////////////////////////
  /// State
  //////////////////////////////

  /// @notice Mapping from token ID to purchase lock status
  /// @dev Used to prevent reentrancy attacks
  mapping(uint256 => bool) internal _locked;

  //////////////////////////////
  /// Errors
  //////////////////////////////

  error ZeroValuation();

  error SameValuation();

  error TokenLocked();

  error IncorrectCurrentValuation();

  error GreaterOrEqualValuationRequired();

  error SurplusValue();

  error GreaterValuationRequired();

  error AlreadyOwner();

  //////////////////////////////
  /// Events
  //////////////////////////////

  /// @notice Alert of lease takeover.
  /// @param tokenId ID of token.
  /// @param owner Address of new token owner.
  /// @param newValuation New owenr's self assessed valuation.
  event LogLeaseTakeover(
    uint256 indexed tokenId,
    address indexed owner,
    uint256 indexed newValuation
  );

  //////////////////////////////
  /// Public Methods
  //////////////////////////////

  /// @dev See {ILease.takeoverLease}
  function takeoverLease(
    uint256 tokenId_,
    uint256 newValuation_,
    uint256 currentValuation_
  ) public payable override _tokenMinted(tokenId_) {
    // Prevent re-entrancy attack
    if (_locked[tokenId_]) revert TokenLocked();

    uint256 valuationPriorToTaxCollection = valuationOf(tokenId_);

    // Prevent front-run.
    if (valuationPriorToTaxCollection != currentValuation_)
      revert IncorrectCurrentValuation();

    // New valuation must be greater than zero, even if current valuation is zero, to ensure that
    // funds are available for deposit.
    if (newValuation_ == 0) revert ZeroValuation();

    // Buyer can self-assess the valuation higher the current valuation; this renders unnecessary a second gas payment
    // if Buyer wants to immediately self-assess the token at a higher valuation.
    if (newValuation_ < valuationPriorToTaxCollection)
      revert GreaterOrEqualValuationRequired();

    bool senderIsBeneficiary = msg.sender == beneficiaryOf(tokenId_);
    // Current owner is a wallet address or the address of this contract
    // if the token is foreclosed or has never been purchased.
    address currentOwner = ownerOf(tokenId_);

    if (senderIsBeneficiary) {
      if (
        // If token is owned by contract, beneficiary does not need to pay anything.
        (currentOwner == address(this) && msg.value > 0) ||
        // Beneficiary only needs to pay the current valuation,
        // doesn't need to put down a deposit.
        msg.value != currentValuation_
      ) revert SurplusValue();
    } else {
      // Value sent must be greater the amount being remitted to the current owner;
      // surplus is necessary for deposit.
      if (msg.value <= valuationPriorToTaxCollection)
        revert GreaterValuationRequired();
    }

    // Owner will be seller or this contract if foreclosed.
    // Prevent an accidental re-purchase.
    if (msg.sender == currentOwner) revert AlreadyOwner();

    // After all security checks have occured, lock the token.
    _locked[tokenId_] = true;

    // Collect tax.
    // Note: this may result in unexpected effects for the buyer. For example,
    // if taxation forecloses on the token, the buyer will be putting down a larger
    // deposit than they originally anticipated.
    collectTax(tokenId_);

    // Tax collection may have transferred ownership.
    address postTaxCollectionOwner = ownerOf(tokenId_);
    bool purchasedFromContract = postTaxCollectionOwner == address(this);

    // Token is being purchased for the first time or out of foreclosure
    if (purchasedFromContract) {
      // If the token is being purchased for the first time or is being purchased
      // from foreclosure, last collection time is set to now so that the contract
      // does not incorrectly consider the taxable period to have begun prior to
      // foreclosure and overtax the owner.
      _setLastCollectionTime(tokenId_, block.timestamp);

      // Note: no remittance occurs. Beneficiary receives no tax on a token that is currently
      // valued at nothing.

      // Note: Deposit is handled below.
    } else {
      _remit(
        postTaxCollectionOwner,
        // Owner receives their self-assessed valuation and the remainder of their deposit.
        currentValuation_ + depositOf(tokenId_),
        RemittanceTriggers.LeaseTakeover
      );
    }

    // Update deposit
    if (senderIsBeneficiary) {
      // Beneficiary doesn't make deposits as no taxes are collected.
      _setDeposit(tokenId_, 0);
    } else if (purchasedFromContract) {
      // Deposit takes entire msg value
      _setDeposit(tokenId_, msg.value);
    } else {
      // Set the new owner's deposit
      _setDeposit(tokenId_, msg.value - currentValuation_);
    }

    // Set the new valuation
    _setValuation(tokenId_, newValuation_);

    _transfer(postTaxCollectionOwner, msg.sender, tokenId_);

    emit LogLeaseTakeover(tokenId_, msg.sender, newValuation_);

    // Unlock token
    _locked[tokenId_] = false;
  }

  /// @dev See {ILease.selfAssess}
  function selfAssess(uint256 tokenId_, uint256 newValuation_)
    public
    override
    _onlyApprovedOrOwner(tokenId_)
    _collectTax(tokenId_)
  {
    uint256 currentValuation = valuationOf(tokenId_);
    // New valuation cannot be zero.
    if (newValuation_ == 0) revert ZeroValuation();
    // New valuation must be different
    if (newValuation_ == currentValuation) revert SameValuation();

    _setValuation(tokenId_, newValuation_);
  }
}
