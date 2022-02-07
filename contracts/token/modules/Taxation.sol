// contracts/token/modules/interfaces/Taxation.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./interfaces/ITaxation.sol";
import "./Valuation.sol";
import "./TokenManagement.sol";

abstract contract Taxation is ITaxation, TokenManagement, Valuation {
  //////////////////////////////
  /// State
  //////////////////////////////

  /// @notice  Percentage taxation rate. e.g. 5% or 100%
  /// @dev Granular to an additionial 10 zeroes.
  /// e.g. 100% => 1000000000000
  /// e.g. 5% => 50000000000
  mapping(uint256 => uint256) private _taxNumerators;
  uint256 private constant TAX_DENOMINATOR = 1000000000000;

  /// @notice Over what period, in days, should taxation be applied?
  mapping(uint256 => uint256) private _taxPeriods;

  /// @notice Mapping from token ID to Unix timestamp when last tax collection occured.
  /// @dev This is used to determine how much time has passed since last collection and the present
  /// and resultingly how much tax is due in the present.
  /// @dev In the event that a foreclosure happens AFTER it should have, this
  /// variable is backdated to when it should've occurred. Thus: `_chainOfTitle` is
  /// accurate to the actual possession period.
  mapping(uint256 => uint256) private _lastCollectionTimes;

  //////////////////////////////
  /// Public Getters
  //////////////////////////////

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

  /// @dev See {ITaxation.taxPeriodOf}
  function taxPeriodOf(uint256 tokenId_)
    public
    view
    override
    _tokenMinted(tokenId_)
    returns (uint256)
  {
    return _taxPeriods[tokenId_];
  }

  /// @dev See {Taxation.taxOwedSince}
  function taxOwedSince(uint256 tokenId_, uint256 time_)
    public
    view
    override
    _tokenMinted(tokenId_)
    returns (uint256 taxDue)
  {
    uint256 price = valuationOf(tokenId_);
    return
      (((price * time_) / taxPeriodOf(tokenId_)) * taxRateOf(tokenId_)) /
      TAX_DENOMINATOR;
  }

  /// @dev See {Taxation.taxOwed}
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

  //////////////////////////////
  /// Internal Setters
  //////////////////////////////

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
  /// @param days_ The number of days that constitute one taxation period.
  function _setTaxPeriod(uint256 tokenId_, uint256 days_)
    internal
    _tokenMinted(tokenId_)
  {
    _taxPeriods[tokenId_] = days_ * 1 days;
  }

  //////////////////////////////
  /// Internal Getters
  //////////////////////////////

  /// @notice How much is owed from the last collection until now?
  /// @param tokenId_ ID of token requesting amount for.
  /// @return Tax Due in wei
  function _taxOwed(uint256 tokenId_) internal view returns (uint256) {
    uint256 timeElapsed = block.timestamp - _lastCollectionTimes[tokenId_];
    return taxOwedSince(tokenId_, timeElapsed);
  }
}
