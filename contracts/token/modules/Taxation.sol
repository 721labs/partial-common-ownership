// contracts/token/modules/interfaces/Taxation.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "./interfaces/ITaxation.sol";
import "./Valuation.sol";
import "./ERC721.sol";
import "./Remittance.sol";
import "./Beneficiary.sol";

abstract contract Taxation is
  ITaxation,
  ERC721,
  Valuation,
  Remittance,
  Beneficiary
{
  //////////////////////////////
  /// State
  //////////////////////////////

  /// @notice Mapping from token ID to taxation collected over lifetime in Wei.
  mapping(uint256 => uint256) public taxationCollected;

  /// @notice Mapping from token ID to taxation collected since last transfer in Wei.
  mapping(uint256 => uint256) private _taxCollectedSinceLastTransfer;

  /// @notice  Percentage taxation rate. e.g. 5% or 100%
  /// @dev Granular to an additionial 10 zeroes.
  /// e.g. 100% => 1000000000000
  /// e.g. 5% => 50000000000
  mapping(uint256 => uint256) internal _taxNumerators;
  uint256 private constant TAX_DENOMINATOR = 1000000000000;

  /// @notice Over what period, in days, should taxation be applied?
  mapping(uint256 => uint256) internal _collectionFrequencies;

  /// @notice Mapping from token ID to Unix timestamp when last tax collection occured.
  /// @dev This is used to determine how much time has passed since last collection and the present
  /// and resultingly how much tax is due in the present.
  /// @dev In the event that a foreclosure happens AFTER it should have, this
  /// variable is backdated to when it should've occurred. Thus: `_chainOfTitle` is
  /// accurate to the actual possession period.
  mapping(uint256 => uint256) private _lastCollectionTimes;

  /// @notice Mapping from token ID to funds for paying tax ("Deposit") in Wei.
  mapping(uint256 => uint256) private _deposits;

  //////////////////////////////
  /// Events
  //////////////////////////////

  /// @notice Alert token foreclosed.
  /// @param tokenId ID of token.
  /// @param prevOwner Address of previous owner.
  event LogForeclosure(uint256 indexed tokenId, address indexed prevOwner);

  /// @notice Alert tax collected.
  /// @param tokenId ID of token.
  /// @param collected Amount in wei.
  event LogCollection(uint256 indexed tokenId, uint256 indexed collected);

  //////////////////////////////
  /// Modifiers
  //////////////////////////////

  /// @notice Envokes tax collection.
  /// @dev Tax collection is triggered by an external envocation of a method wrapped by
  /// this modifier.
  /// @param tokenId_ ID of token to collect tax for.
  modifier _collectTax(uint256 tokenId_) {
    collectTax(tokenId_);
    _;
  }

  //////////////////////////////
  /// Public Methods
  //////////////////////////////

  /// @notice Collects tax.
  /// @param tokenId_ ID of token to collect tax for.
  /// @dev Strictly envoked by modifier but can be called publically.
  function collectTax(uint256 tokenId_) public {
    uint256 valuation = valuationOf(tokenId_);

    // There's no tax to be collected on an unvalued token.
    if (valuation == 0) return;

    // If valuation > 0, contract has not foreclosed.
    uint256 owed = _taxOwed(tokenId_);

    // Owed will be 0 when the token is owned by its beneficiary.
    // i.e. no tax is owed.
    if (owed == 0) return;

    // If foreclosure should have occured in the past, last collection time will be
    // backdated to when the tax was last paid for.
    if (foreclosed(tokenId_)) {
      _setLastCollectionTime(tokenId_, _backdatedForeclosureTime(tokenId_));
      // Set remaining deposit to be collected.
      owed = depositOf(tokenId_);
    } else {
      _setLastCollectionTime(tokenId_, block.timestamp);
    }

    // Normal collection
    _setDeposit(tokenId_, depositOf(tokenId_) - owed);
    taxationCollected[tokenId_] += owed;
    _setTaxCollectedSinceLastTransfer(
      tokenId_,
      taxCollectedSinceLastTransferOf(tokenId_) + owed
    );

    emit LogCollection(tokenId_, owed);

    /// Remit taxation to beneficiary.
    _remit(beneficiaryOf(tokenId_), owed, RemittanceTriggers.TaxCollection);

    _forecloseIfNecessary(tokenId_);
  }

  /// @dev See {ITaxation.deposit}
  function deposit(uint256 tokenId_)
    public
    payable
    override
    _onlyApprovedOrOwner(tokenId_)
    _collectTax(tokenId_)
  {
    _setDeposit(tokenId_, depositOf(tokenId_) + msg.value);
  }

  /// @dev See {ITaxation.withdrawDeposit}
  function withdrawDeposit(uint256 tokenId_, uint256 wei_)
    public
    override
    _onlyApprovedOrOwner(tokenId_)
    _collectTax(tokenId_)
  {
    _withdrawDeposit(tokenId_, wei_);
  }

  /// @dev See {ITaxation.exit}
  function exit(uint256 tokenId_)
    public
    override
    _onlyApprovedOrOwner(tokenId_)
    _collectTax(tokenId_)
  {
    _withdrawDeposit(tokenId_, depositOf(tokenId_));
  }

  //////////////////////////////
  /// Public Getters
  //////////////////////////////

  /// @dev See {ITaxation.taxCollectedSinceLastTransferOf}
  function taxCollectedSinceLastTransferOf(uint256 tokenId_)
    public
    view
    override
    _tokenMinted(tokenId_)
    returns (uint256)
  {
    return _taxCollectedSinceLastTransfer[tokenId_];
  }

  /// @dev See {ITaxation.taxRateOf}
  function taxRateOf(uint256 tokenId_)
    public
    view
    override
    _tokenMinted(tokenId_)
    returns (uint256)
  {
    return _taxNumerators[tokenId_];
  }

  /// @dev See {ITaxation.collectionFrequencyOf}
  function collectionFrequencyOf(uint256 tokenId_)
    public
    view
    override
    _tokenMinted(tokenId_)
    returns (uint256)
  {
    return _collectionFrequencies[tokenId_];
  }

  /// @dev See {ITaxation.taxOwedSince}
  function taxOwedSince(uint256 tokenId_, uint256 time_)
    public
    view
    override
    _tokenMinted(tokenId_)
    returns (uint256 taxDue)
  {
    uint256 valuation = valuationOf(tokenId_);
    return
      (((valuation * time_) / collectionFrequencyOf(tokenId_)) *
        taxRateOf(tokenId_)) / TAX_DENOMINATOR;
  }

  /// @dev See {ITaxation.taxOwed}
  function taxOwed(uint256 tokenId_)
    public
    view
    override
    returns (uint256 amount, uint256 timestamp)
  {
    return (_taxOwed(tokenId_), block.timestamp);
  }

  /// @dev See {ITaxation.lastCollectionTimeOf}
  function lastCollectionTimeOf(uint256 tokenId_)
    public
    view
    override
    returns (uint256)
  {
    return _lastCollectionTimes[tokenId_];
  }

  /// @dev See {ITaxation.depositOf}
  function depositOf(uint256 tokenId_)
    public
    view
    override
    _tokenMinted(tokenId_)
    returns (uint256)
  {
    return _deposits[tokenId_];
  }

  /// @dev See {ITaxation.withdrawableDeposit}
  function withdrawableDeposit(uint256 tokenId_)
    public
    view
    override
    returns (uint256)
  {
    if (foreclosed(tokenId_)) {
      return 0;
    } else {
      return depositOf(tokenId_) - _taxOwed(tokenId_);
    }
  }

  /// @dev See {ITaxation.foreclosed}
  function foreclosed(uint256 tokenId_) public view override returns (bool) {
    uint256 owed = _taxOwed(tokenId_);
    if (owed >= depositOf(tokenId_)) {
      return true;
    } else {
      return false;
    }
  }

  /// @dev See {ITaxation.foreclosureTime}
  function foreclosureTime(uint256 tokenId_)
    public
    view
    override
    returns (uint256)
  {
    uint256 taxPerSecond = taxOwedSince(tokenId_, 1);
    uint256 withdrawable = withdrawableDeposit(tokenId_);
    if (withdrawable > 0) {
      // Time until deposited surplus no longer surpasses amount owed.
      return block.timestamp + withdrawable / taxPerSecond;
    } else if (taxPerSecond > 0) {
      // Token is active but in foreclosed state.
      // Returns when foreclosure should have occured i.e. when tax owed > deposits.
      return _backdatedForeclosureTime(tokenId_);
    } else {
      // Actively foreclosed (valuation is 0)
      return lastCollectionTimeOf(tokenId_);
    }
  }

  //////////////////////////////
  /// Internal Methods
  //////////////////////////////

  /// @notice Forecloses if no deposit for a given token.
  /// @param tokenId_ ID of token to potentially foreclose.
  function _forecloseIfNecessary(uint256 tokenId_) internal {
    // If there are not enough funds to cover the entire amount owed, `__collectTax`
    // will take whatever's left of the deposit, resulting in a zero balance.
    if (depositOf(tokenId_) == 0) {
      // Unset the valuation
      _setValuation(tokenId_, 0);

      // Become steward of asset (aka foreclose)
      address currentOwner = ownerOf(tokenId_);

      _transfer(currentOwner, address(this), tokenId_);

      emit LogForeclosure(tokenId_, currentOwner);
    }
  }

  /// @notice Withdraws deposit back to its owner.
  /// @dev Parent callers must enforce `ownerOnly(tokenId_)`.
  /// @param tokenId_ ID of token to withdraw deposit for.
  /// @param wei_ Amount of Wei to withdraw.
  function _withdrawDeposit(uint256 tokenId_, uint256 wei_) internal {
    // If triggered with no wei, return.
    if (wei_ == 0) return;

    // Note: Can withdraw whole deposit, which immediately triggers foreclosure.
    require(wei_ <= depositOf(tokenId_), "Cannot withdraw more than deposited");

    address currentOwner = ownerOf(tokenId_);
    require(currentOwner != address(this), "Cannot withdraw deposit to self");

    _setDeposit(tokenId_, depositOf(tokenId_) - wei_);

    _remit(currentOwner, wei_, RemittanceTriggers.WithdrawnDeposit);

    _forecloseIfNecessary(tokenId_);
  }

  /// @notice Collect Tax
  function _beforeTokenTransfer(
    address from_,
    address to_,
    uint256 tokenId_
  ) internal virtual override(ERC721) {
    collectTax(tokenId_);
    super._beforeTokenTransfer(from_, to_, tokenId_);
  }

  /// @notice Reset tax collected
  function _afterTokenTransfer(
    address from_,
    address to_,
    uint256 tokenId_
  ) internal virtual override(ERC721) {
    _setTaxCollectedSinceLastTransfer(tokenId_, 0);
    super._afterTokenTransfer(from_, to_, tokenId_);
  }

  //////////////////////////////
  /// Internal Setters
  //////////////////////////////

  /// @notice Sets tax collected since last transfer.
  /// @param tokenId_ ID of token.
  /// @param amount_ Amount in Wei.
  function _setTaxCollectedSinceLastTransfer(uint256 tokenId_, uint256 amount_)
    internal
  {
    _taxCollectedSinceLastTransfer[tokenId_] = amount_;
  }

  /// @notice Sets last collection time for a given token.
  /// @param tokenId_ ID of token.
  /// @param collectionTime_ Timestamp.
  function _setLastCollectionTime(uint256 tokenId_, uint256 collectionTime_)
    internal
    _tokenMinted(tokenId_)
  {
    _lastCollectionTimes[tokenId_] = collectionTime_;
  }

  /// @notice Internal tax rate setter.
  /// @dev Should be invoked immediately after calling `#_safeMint`
  /// @param tokenId_ Token to set
  /// @param rate_ The taxation rate up to 10 decimal places. See `_taxNumerators` declaration.
  function _setTaxRate(uint256 tokenId_, uint256 rate_)
    internal
    _tokenMinted(tokenId_)
  {
    _taxNumerators[tokenId_] = rate_;
  }

  /// @notice Internal period setter.
  /// @dev Should be invoked immediately after calling `#_safeMint`
  /// @param tokenId_ Token to set
  /// @param days_ How many days are between subsequent tax collections?
  function _setCollectionFrequency(uint256 tokenId_, uint256 days_)
    internal
    _tokenMinted(tokenId_)
  {
    _collectionFrequencies[tokenId_] = days_ * 1 days;
  }

  /// @notice Sets deposit for a given token.
  /// @param tokenId_ ID of token.
  /// @param amount_ New deposit amount.
  function _setDeposit(uint256 tokenId_, uint256 amount_) internal {
    _deposits[tokenId_] = amount_;
  }

  //////////////////////////////
  /// Internal Getters
  //////////////////////////////

  /// @notice How much is owed from the last collection until now?
  /// @param tokenId_ ID of token requesting amount for.
  /// @return Tax Due in wei
  function _taxOwed(uint256 tokenId_) internal view returns (uint256) {
    // If the token is owned by its beneficiary, nothing is owed.
    // (e.g. beneficiary wrapped a token).
    if (ownerOf(tokenId_) == beneficiaryOf(tokenId_)) return 0;

    uint256 timeElapsed = block.timestamp - _lastCollectionTimes[tokenId_];
    return taxOwedSince(tokenId_, timeElapsed);
  }

  /// @notice Returns the time when tax owed initially exceeded deposits.
  /// @dev last collected time + ((time_elapsed * deposit) / owed)
  /// @dev Returns within +/- 2s of previous values due to Solidity rounding
  /// down integer division without regard for significant digits, which produces
  /// variable results e.g. `599.9999999999851` becomes `599`.
  /// @param tokenId_ ID of token requesting
  /// @return Unix timestamp
  function _backdatedForeclosureTime(uint256 tokenId_)
    internal
    view
    returns (uint256)
  {
    uint256 last = lastCollectionTimeOf(tokenId_);
    uint256 timeElapsed = block.timestamp - last;
    return last + ((timeElapsed * depositOf(tokenId_)) / _taxOwed(tokenId_));
  }
}
