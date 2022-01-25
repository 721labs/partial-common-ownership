// contracts/token/PartialCommonOwnership721.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

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

/// @notice Reasons for sending a remittance
enum RemittanceTriggers {
  LeaseTakeover,
  WithdrawnDeposit,
  OutstandingRemittance,
  TaxCollection
}

/// @title PartialCommonOwnership721
/// @author Simon de la Rouviere, Will Holley
/// @notice Extends the ERC721 standard by requiring tax payments from a token's current owner
/// using a Harberger Tax model; if payments are not made, the token is repossessed by the contract
/// and can be repurchased at any price > 0.
/// @dev This code was originally forked from ThisArtworkIsAlwaysOnSale's `v2_contracts/ArtSteward.sol`
/// contract by Simon de la Rouviere.
contract PartialCommonOwnership721 is ERC721 {
  //////////////////////////////
  /// State
  //////////////////////////////

  /// @notice Map of tokens to their beneficiaries.
  mapping(uint256 => address) private _beneficiaries;

  /// @notice Mapping from token ID to token price in Wei.
  mapping(uint256 => uint256) public prices;

  /// @notice Mapping from token ID to taxation collected over lifetime in Wei.
  mapping(uint256 => uint256) public taxationCollected;

  /// @notice Mapping from token ID to taxation collected since last transfer in Wei.
  mapping(uint256 => uint256) public taxCollectedSinceLastTransfer;

  /// @notice Mapping from token ID to funds for paying tax ("Deposit") in Wei.
  mapping(uint256 => uint256) private _deposits;

  /// @notice Mapping of address to Wei.
  /// @dev If for whatever reason a remittance payment fails during a purchase, the amount
  /// (purchase price + deposit) is added to `outstandingRemittances` so the previous
  /// owner can withdraw it.
  mapping(address => uint256) public outstandingRemittances;

  /// @notice Mapping from token ID to Unix timestamp when last tax collection occured.
  /// @dev This is used to determine how much time has passed since last collection and the present
  /// and resultingly how much tax is due in the present.
  /// @dev In the event that a foreclosure happens AFTER it should have, this
  /// variable is backdated to when it should've occurred. Thus: `_chainOfTitle` is
  /// accurate to the actual possession period.
  mapping(uint256 => uint256) public lastCollectionTimes;

  /// @notice Mapping from token ID to Unix timestamp of when it was last transferred.
  mapping(uint256 => uint256) public lastTransferTimes;

  /// @notice Mapping from token ID to array of transfer events.
  /// @dev This includes foreclosures.
  mapping(uint256 => TitleTransferEvent[]) private _chainOfTitle;

  /// @notice  Percentage taxation rate. e.g. 5% or 100%
  /// @dev Granular to an additionial 10 zeroes.
  /// e.g. 100% => 1000000000000
  /// e.g. 5% => 50000000000
  uint256 private immutable _taxNumerator;
  uint256 private constant TAX_DENOMINATOR = 1000000000000;

  /// @notice Over what period, in days, should taxation be applied?
  uint256 public taxationPeriod;

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

  /// @notice If a remittance failed during token purchase, alert the seller.
  /// @param seller Address of token seller that remittance is owed to.
  event LogOutstandingRemittance(address indexed seller);

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

  /// @notice Alert the remittance recipient that funds have been remitted to her.
  /// @param trigger Reason for the remittance.
  /// @param recipient Recipient address.
  /// @param amount Amount in Wei.
  event LogRemittance(
    RemittanceTriggers indexed trigger,
    address indexed recipient,
    uint256 indexed amount
  );

  //////////////////////////////
  /// Modifiers
  //////////////////////////////

  /// @notice Checks whether message sender owns a given token id
  /// @param tokenId_ ID of token to check ownership again.
  modifier _onlyOwner(uint256 tokenId_) {
    address owner = ownerOf(tokenId_);
    require(msg.sender == owner, "Sender does not own this token");
    _;
  }

  /// @notice Envokes tax collection.
  /// @dev Tax collection is triggered by an external envocation of a method wrapped by
  /// this modifier.
  /// @param tokenId_ ID of token to collect tax for.
  modifier _collectTax(uint256 tokenId_) {
    collectTax(tokenId_);
    _;
  }

  /// @notice Requires that token have been minted.
  /// @param tokenId_ ID of token to verify.
  modifier _tokenMinted(uint256 tokenId_) {
    ownerOf(tokenId_);
    _;
  }

  //////////////////////////////
  /// Constructor
  //////////////////////////////

  /// @notice Creates the token and sets beneficiary & taxation amount.
  /// @param name_ ERC721 Token Name
  /// @param symbol_ ERC721 Token Symbol
  /// @param taxNumerator_ The taxation rate up to 10 decimal places.
  /// @param taxationPeriod_ The number of days that constitute one taxation period.
  constructor(
    string memory name_,
    string memory symbol_,
    uint256 taxNumerator_,
    uint256 taxationPeriod_
  ) ERC721(name_, symbol_) {
    _taxNumerator = taxNumerator_;
    taxationPeriod = taxationPeriod_ * 1 days;
  }

  //////////////////////////////
  /// Public Methods
  //////////////////////////////

  /// @notice Collects tax.
  /// @param tokenId_ ID of token to collect tax for.
  /// @dev Strictly envoked by modifier but can be called publically.
  function collectTax(uint256 tokenId_) public {
    uint256 price = _price(tokenId_);
    if (price != 0) {
      // If price > 0, contract has not foreclosed.
      uint256 owed = _taxOwed(tokenId_);

      // If foreclosure should have occured in the past, last collection time will be
      // backdated to when the tax was last paid for.
      if (foreclosed(tokenId_)) {
        lastCollectionTimes[tokenId_] = _backdatedForeclosureTime(tokenId_);
        // Set remaining deposit to be collected.
        owed = _deposits[tokenId_];
      } else {
        lastCollectionTimes[tokenId_] = block.timestamp;
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
  }

  /// @notice Buy the token.
  /// @param tokenId_ ID of token the buyer wants to purchase.
  /// @param purchasePrice_ Purchasing price. Must be greater or equal to current price.
  /// @param currentPriceForVerification_ Current price must be given to protect against a front-run attack.
  /// The buyer will only complete the purchase at the agreed upon price. This prevents a malicious,
  /// second buyer from purchasing the token before the first trx is complete, changing the price,
  /// and eating into the first buyer's deposit.
  function buy(
    uint256 tokenId_,
    uint256 purchasePrice_,
    uint256 currentPriceForVerification_
  ) public payable _tokenMinted(tokenId_) _collectTax(tokenId_) {
    // Prevent re-entrancy attack
    require(!locked[tokenId_], "Token is locked");

    uint256 currentPrice = _price(tokenId_);
    // Prevent front-run.
    require(
      currentPrice == currentPriceForVerification_,
      "Current Price is incorrect"
    );
    // Purchase price must be greater than zero, even if current price is zero, to ensure that
    // funds are available for deposit.
    require(purchasePrice_ > 0, "New Price cannot be zero");
    // Buyer can offer more than the current price; this renders unnecessary a second gas payment
    // if Buyer wants to immediately self-assess the token at a higher valuation.
    require(
      purchasePrice_ >= currentPrice,
      "New Price must be >= current price"
    );
    // Value sent must be greater than purchase price; surplus is necessary for deposit.
    require(
      msg.value > purchasePrice_,
      "Message does not contain surplus value for deposit"
    );

    // Seller or this contract if foreclosed.
    address currentOwner = ownerOf(tokenId_);

    // Prevent an accidental re-purchase.
    require(msg.sender != currentOwner, "Buyer is already owner");

    // After all security checks have occured, lock the token.
    locked[tokenId_] = true;

    // If token is owned by the contract, remit to the beneficiary.
    address recipient;
    if (currentOwner == address(this)) {
      recipient = beneficiaryOf(tokenId_);
    } else {
      recipient = currentOwner;
    }

    // Remit the purchase price and any available deposit.
    uint256 remittance = purchasePrice_ + _deposits[tokenId_];
    _remit(recipient, remittance, RemittanceTriggers.LeaseTakeover);

    // If the token is being purchased for the first time or is being purchased
    // from foreclosure,last collection time is set to now so that the contract
    // does not incorrectly consider the taxable period to have begun prior to
    // foreclosure and overtax the owner.
    if (currentPrice == 0) {
      lastCollectionTimes[tokenId_] = block.timestamp;
    }

    // Update deposit with surplus value.
    _deposits[tokenId_] = msg.value - purchasePrice_;

    transferToken(tokenId_, currentOwner, msg.sender, purchasePrice_);
    emit LogBuy(tokenId_, msg.sender, purchasePrice_);

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

  /// @notice Enables depositing of Wei for a given token.
  /// @param tokenId_ ID of token depositing Wei for.
  function depositWei(uint256 tokenId_)
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
    uint256 price = prices[tokenId_];
    require(newPrice_ > 0, "New price cannot be zero");
    require(newPrice_ != price, "New price cannot be same");
    prices[tokenId_] = newPrice_;
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
  /// Remittance Methods
  //////////////////////////////

  /// @notice Enables previous owners to withdraw remittances that failed to send.
  /// @dev To reduce complexity, pull funds are entirely separate from current deposit.
  function withdrawOutstandingRemittance() public {
    uint256 outstanding = outstandingRemittances[msg.sender];

    require(outstanding > 0, "No outstanding remittance");

    outstandingRemittances[msg.sender] = 0;

    _remit(msg.sender, outstanding, RemittanceTriggers.OutstandingRemittance);
  }

  //////////////////////////////
  /// Public Getters
  //////////////////////////////

  /// @notice Gets the beneficiary of a given token
  /// @dev This method establishes future compatability for token-specific beneficiaries.
  function beneficiaryOf(uint256 tokenId_)
    public
    view
    _tokenMinted(tokenId_)
    returns (address)
  {
    return _beneficiaries[tokenId_];
  }

  /// @notice Returns tax numerator
  /// @return Tax Rate
  function taxRate() public view returns (uint256) {
    return _taxNumerator;
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

  /// @notice Gets current price for a given token ID. Requires that
  /// the token has been minted.
  /// @param tokenId_ ID of token requesting price for.
  /// @return Price in Wei.
  function priceOf(uint256 tokenId_)
    public
    view
    _tokenMinted(tokenId_)
    returns (uint256)
  {
    return _price(tokenId_);
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

  /// @notice Determines the taxable amount accumulated between now and
  /// a given time in the past.
  /// @param tokenId_ ID of token requesting amount for.
  /// @param time_ Unix timestamp.
  /// @return taxDue Tax Due in Wei.
  function taxOwedSince(uint256 tokenId_, uint256 time_)
    public
    view
    _tokenMinted(tokenId_)
    returns (uint256 taxDue)
  {
    uint256 price = _price(tokenId_);
    return
      (((price * time_) / taxationPeriod) * _taxNumerator) / TAX_DENOMINATOR;
  }

  /// @notice Public method for the tax owed. Returns with the current time.
  /// for use calculating expected tax obligations.
  /// @param tokenId_ ID of token requesting amount for.
  /// @return amount Tax Due in Wei.
  /// @return timestamp Now as Unix timestamp.
  function taxOwed(uint256 tokenId_)
    public
    view
    returns (uint256 amount, uint256 timestamp)
  {
    return (_taxOwed(tokenId_), block.timestamp);
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
      return lastCollectionTimes[tokenId_];
    }
  }

  //////////////////////////////
  /// Internal Methods
  //////////////////////////////

  /// @notice Send a remittance payment.
  /// @dev We're using a push rather than pull strategy as this removes the need for beneficiaries
  /// to check how much they are owed, more closely replicating a "streaming" payment. This comes
  /// at the cost of forcing all callers of `#_remit` to pay the additional gas for sending.
  /// @param recipient_ Address to send remittance to.
  /// @param remittance_ Remittance amount
  /// @param trigger_ What triggered this remittance?
  function _remit(
    address recipient_,
    uint256 remittance_,
    RemittanceTriggers trigger_
  ) internal {
    address payable payableRecipient = payable(recipient_);
    // If the remittance fails, hold funds for the seller to retrieve.
    // For example, if `payableReceipient` is a contract that reverts on receipt or
    // if the call runs out of gas.
    if (payableRecipient.send(remittance_)) {
      emit LogRemittance(trigger_, recipient_, remittance_);
    } else {
      /* solhint-disable reentrancy */
      outstandingRemittances[recipient_] += remittance_;
      emit LogOutstandingRemittance(recipient_);
      /* solhint-enable reentrancy */
    }
  }

  /// @notice Withdraws deposit back to its owner.
  /// @dev Parent callers must enforce `ownerOnly(tokenId_)`.
  /// @param tokenId_ ID of token to withdraw deposit for.
  /// @param wei_ Amount of Wei to withdraw.
  function _withdrawDeposit(uint256 tokenId_, uint256 wei_) internal {
    // Note: Can withdraw whole deposit, which immediately triggers foreclosure.
    uint256 deposit = _deposits[tokenId_];
    require(wei_ <= deposit, "Cannot withdraw more than deposited");

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
      transferToken(tokenId_, currentOwner, address(this), 0);
      emit LogForeclosure(tokenId_, currentOwner);
    }
  }

  /// @notice Transfers possession of a token.
  /// @param tokenId_ ID of token to transfer possession of.
  /// @param currentOwner_ Address of current owner.
  /// @param newOwner_ Address of new owner.
  /// @param newPrice_ New price in Wei.
  function transferToken(
    uint256 tokenId_,
    address currentOwner_,
    address newOwner_,
    uint256 newPrice_
  ) internal {
    // Call `_transfer` directly rather than `_transferFrom()` because `newOwner_`
    // does not require previous approval (as required by `_transferFrom()`) to purchase.
    _transfer(currentOwner_, newOwner_, tokenId_);

    prices[tokenId_] = newPrice_;

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
  /// @dev Should be called immediately after a token is created.
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

  /// @notice Gets current price for a given token ID.
  /// @param tokenId_ ID of token requesting price for.
  /// @return Price in Wei.
  function _price(uint256 tokenId_) private view returns (uint256) {
    return prices[tokenId_];
  }

  /// @notice How much is owed from the last collection until now?
  /// @param tokenId_ ID of token requesting amount for.
  /// @return Tax Due in wei
  function _taxOwed(uint256 tokenId_) private view returns (uint256) {
    uint256 timeElapsed = block.timestamp - lastCollectionTimes[tokenId_];
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
    private
    view
    returns (uint256)
  {
    uint256 last = lastCollectionTimes[tokenId_];
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
