// contracts/token/PartialCommonOwnership721.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {TokenManagement} from "./modules/TokenManagement.sol";
import {Valuation} from "./modules/Valuation.sol";
import {Remittance, RemittanceTriggers} from "./modules/Remittance.sol";
import {Taxation} from "./modules/Taxation.sol";

struct TitleTransferEvent {
  /// @notice From address.
  address from;
  /// @notice To address.
  address to;
  /// @notice Unix timestamp.
  uint256 timestamp;
  /// @notice Price in Wei
  uint256 price;
}

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
  Taxation,
  Remittance
{
  //////////////////////////////
  /// State
  //////////////////////////////

  /// @notice Map of tokens to their beneficiaries.
  mapping(uint256 => address) private _beneficiaries;

  /// @notice Mapping from token ID to taxation collected over lifetime in Wei.
  mapping(uint256 => uint256) public taxationCollected;

  /// @notice Mapping from token ID to taxation collected since last transfer in Wei.
  mapping(uint256 => uint256) public taxCollectedSinceLastTransfer;

  /// @notice Mapping from token ID to funds for paying tax ("Deposit") in Wei.
  mapping(uint256 => uint256) private _deposits;

  /// @notice Mapping from token ID to Unix timestamp of when it was last transferred.
  mapping(uint256 => uint256) public lastTransferTimes;

  /// @notice Mapping from token ID to array of transfer events.
  /// @dev This includes foreclosures.
  mapping(uint256 => TitleTransferEvent[]) private _chainOfTitle;

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
  /// Public Methods
  //////////////////////////////

  /// @notice Collects tax.
  /// @param tokenId_ ID of token to collect tax for.
  /// @dev Strictly envoked by modifier but can be called publically.
  function collectTax(uint256 tokenId_) public {
    uint256 price = valuationOf(tokenId_);

    // There's no tax to be collected on an unvalued token.
    if (price == 0) return;

    // If price > 0, contract has not foreclosed.
    uint256 owed = _taxOwed(tokenId_);

    // If foreclosure should have occured in the past, last collection time will be
    // backdated to when the tax was last paid for.
    if (foreclosed(tokenId_)) {
      _setLastCollectionTime(tokenId_, _backdatedForeclosureTime(tokenId_));
      // Set remaining deposit to be collected.
      owed = _deposits[tokenId_];
    } else {
      _setLastCollectionTime(tokenId_, block.timestamp);
    }

    // Normal collection
    _deposits[tokenId_] -= owed;
    taxationCollected[tokenId_] += owed;
    taxCollectedSinceLastTransfer[tokenId_] += owed;

    emit LogCollection(tokenId_, owed);

    /// Remit taxation to beneficiary.
    _remit(beneficiaryOf(tokenId_), owed, RemittanceTriggers.TaxCollection);

    _forecloseIfNecessary(tokenId_);
  }

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
      _deposits[tokenId_] = msg.value;

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
        currentValuation_ + _deposits[tokenId_],
        RemittanceTriggers.LeaseTakeover
      );

      // Set the new owner's deposit
      _deposits[tokenId_] = msg.value - currentValuation_;
    }

    _transferToken(tokenId_, ownerAfterCollection, msg.sender, newValuation_);
    emit LogBuy(tokenId_, msg.sender, newValuation_);

    // Unlock token
    locked[tokenId_] = false;
  }

  //////////////////////////////
  /// Beneficiary Methods
  //////////////////////////////

  /// @notice Sets the beneficiary for a given token.
  /// @dev Should only be called by beneficiary.
  /// @param tokenId_ Token to set beneficiary of.
  /// @param beneficiary_ Address of beneficiary.
  function setBeneficiary(uint256 tokenId_, address payable beneficiary_)
    public
    _tokenMinted(tokenId_)
  {
    require(msg.sender == _beneficiaries[tokenId_], "Current beneficiary only");
    _setBeneficiary(tokenId_, beneficiary_);
  }

  //////////////////////////////
  /// Owner-Only Methods
  //////////////////////////////

  /// @notice Increases owner's deposit by `msg.value` Wei.
  /// @param tokenId_ ID of token.
  function deposit(uint256 tokenId_)
    public
    payable
    _onlyOwner(tokenId_)
    _collectTax(tokenId_)
  {
    _deposits[tokenId_] += msg.value;
  }

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

  /// @notice Enables owner to withdraw some amount of their deposit.
  /// @param tokenId_ ID of token to withdraw against.
  /// @param wei_ Amount of Wei to withdraw.
  function withdrawDeposit(uint256 tokenId_, uint256 wei_)
    public
    _onlyOwner(tokenId_)
    _collectTax(tokenId_)
  {
    _withdrawDeposit(tokenId_, wei_);
  }

  /// @notice Enables owner to withdraw their entire deposit.
  /// @param tokenId_ ID of token to withdraw against.
  function exit(uint256 tokenId_)
    public
    _onlyOwner(tokenId_)
    _collectTax(tokenId_)
  {
    _withdrawDeposit(tokenId_, _deposits[tokenId_]);
  }

  //////////////////////////////
  /// Public Getters
  //////////////////////////////

  /// @notice Gets the beneficiary of a given token
  /// @param tokenId_ Id of token to query for
  /// @return Beneficiary address
  function beneficiaryOf(uint256 tokenId_)
    public
    view
    _tokenMinted(tokenId_)
    returns (address)
  {
    return _beneficiaries[tokenId_];
  }

  /// @notice Returns an array of metadata about transfers for a given token.
  /// @param tokenId_ ID of the token requesting for.
  /// @return Array of TitleTransferEvents.
  function titleChainOf(uint256 tokenId_)
    public
    view
    _tokenMinted(tokenId_)
    returns (TitleTransferEvent[] memory)
  {
    return _chainOfTitle[tokenId_];
  }

  /// @notice Gets current deposit for a given token ID.
  /// @param tokenId_ ID of token requesting deposit for.
  /// @return Deposit in Wei.
  function depositOf(uint256 tokenId_)
    public
    view
    _tokenMinted(tokenId_)
    returns (uint256)
  {
    return _deposits[tokenId_];
  }

  /// @notice Do the taxes owed exceed the deposit?  If so, the token should be
  /// "foreclosed" by the contract.  The price should be zero and anyone can
  /// purchase the token for the cost of the gas fee.
  /// @dev This is a useful helper function when price should be zero, but contract doesn't
  /// reflect it yet because `#_forecloseIfNecessary` has not yet been called..
  /// @param tokenId_ ID of token requesting foreclosure status for.
  /// @return Returns boolean indicating whether or not the contract is foreclosed.
  function foreclosed(uint256 tokenId_) public view returns (bool) {
    uint256 owed = _taxOwed(tokenId_);
    if (owed >= _deposits[tokenId_]) {
      return true;
    } else {
      return false;
    }
  }

  /// @notice The amount of deposit that is withdrawable i.e. any deposited amount greater
  /// than the taxable amount owed.
  /// @param tokenId_ ID of token requesting withdrawable deposit for.
  /// @return amount in Wei.
  function withdrawableDeposit(uint256 tokenId_) public view returns (uint256) {
    if (foreclosed(tokenId_)) {
      return 0;
    } else {
      return _deposits[tokenId_] - _taxOwed(tokenId_);
    }
  }

  /// @notice Determines how long a token owner has until forclosure.
  /// @param tokenId_ ID of token requesting foreclosure time for.
  /// @return Unix timestamp
  function foreclosureTime(uint256 tokenId_) public view returns (uint256) {
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
      // Actively foreclosed (price is 0)
      return lastCollectionTimeOf(tokenId_);
    }
  }

  //////////////////////////////
  /// Internal Methods
  //////////////////////////////

  /// @notice Withdraws deposit back to its owner.
  /// @dev Parent callers must enforce `ownerOnly(tokenId_)`.
  /// @param tokenId_ ID of token to withdraw deposit for.
  /// @param wei_ Amount of Wei to withdraw.
  function _withdrawDeposit(uint256 tokenId_, uint256 wei_) internal {
    // Note: Can withdraw whole deposit, which immediately triggers foreclosure.
    require(wei_ <= _deposits[tokenId_], "Cannot withdraw more than deposited");

    _deposits[tokenId_] -= wei_;

    _remit(msg.sender, wei_, RemittanceTriggers.WithdrawnDeposit);

    _forecloseIfNecessary(tokenId_);
  }

  /// @notice Forecloses if no deposit for a given token.
  /// @param tokenId_ ID of token to potentially foreclose.
  function _forecloseIfNecessary(uint256 tokenId_) internal {
    // If there are not enough funds to cover the entire amount owed, `__collectTax`
    // will take whatever's left of the deposit, resulting in a zero balance.
    if (_deposits[tokenId_] == 0) {
      // Become steward of asset (aka foreclose)
      address currentOwner = ownerOf(tokenId_);
      _transferToken(tokenId_, currentOwner, address(this), 0);
      emit LogForeclosure(tokenId_, currentOwner);
    }
  }

  /// @notice Transfers possession of a token.
  /// @param tokenId_ ID of token to transfer possession of.
  /// @param currentOwner_ Address of current owner.
  /// @param newOwner_ Address of new owner.
  /// @param newPrice_ New price in Wei.
  function _transferToken(
    uint256 tokenId_,
    address currentOwner_,
    address newOwner_,
    uint256 newPrice_
  ) internal {
    // Call `_transfer` directly rather than `_transferFrom()` because `newOwner_`
    // does not require previous approval (as required by `_transferFrom()`) to purchase.
    _transfer(currentOwner_, newOwner_, tokenId_);

    _setValuation(tokenId_, newPrice_);

    TitleTransferEvent memory transferEvent = TitleTransferEvent(
      currentOwner_,
      newOwner_,
      block.timestamp,
      newPrice_
    );
    _chainOfTitle[tokenId_].push(transferEvent);

    lastTransferTimes[tokenId_] = block.timestamp;

    taxCollectedSinceLastTransfer[tokenId_] = 0;
  }

  /// @notice Internal beneficiary setter.
  /// @dev Should be invoked immediately after calling `#_safeMint`
  /// @param tokenId_ Token to set beneficiary of.
  /// @param beneficiary_ Address of beneficiary.
  function _setBeneficiary(uint256 tokenId_, address payable beneficiary_)
    internal
    _tokenMinted(tokenId_)
  {
    _beneficiaries[tokenId_] = beneficiary_;
  }

  //////////////////////////////
  /// Prviate Getters
  //////////////////////////////

  /// @notice Returns the time when tax owed initially exceeded deposits.
  /// @dev last collected time + ((time_elapsed * deposit) / owed)
  /// @dev Returns within +/- 2s of previous values due to Solidity rounding
  /// down integer division without regard for significant digits, which produces
  /// variable results e.g. `599.9999999999851` becomes `599`.
  /// @param tokenId_ ID of token requesting
  /// @return Unix timestamp
  function _backdatedForeclosureTime(uint256 tokenId_)
    private
    view
    returns (uint256)
  {
    uint256 last = lastCollectionTimeOf(tokenId_);
    uint256 timeElapsed = block.timestamp - last;
    return last + ((timeElapsed * _deposits[tokenId_]) / _taxOwed(tokenId_));
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
