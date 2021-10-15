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

/// @title PartialCommonOwnership721
/// @author Simon de la Rouviere, Will Holley
/// @notice Extends the ERC721 standard by requiring tax payments from a token's current owner
/// using a Harberger Tax model; if payments are not made, the token is repossessed by the contract
/// and can be repurchased at any price > 0.
/// @dev This code was originally forked from ThisArtworkIsAlwaysOnSale's `v2_contracts/ArtSteward.sol`
/// contract by Simon de la Rouviere.
contract PartialCommonOwnership721 is ERC721 {
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

  /// @notice Alert the beneficiary that funds have been remitted to her.
  /// @param tokenId ID of token.
  /// @param collected Amount in wei.
  event LogBeneficiaryRemittance(
    uint256 indexed tokenId,
    uint256 indexed collected
  );

  /// @notice Alert the remittance recipient that funds have been remitted to her.
  /// @param tokenId ID of token.
  /// @param recipient Recipient address.
  /// @param amount Amount in Wei.
  event LogRemittance(
    uint256 indexed tokenId,
    address indexed recipient,
    uint256 indexed amount
  );

  /// @notice Alert deposit withdrawn.
  /// @param tokenId ID of token deposit.
  /// @param amount Amount withdrawn in Wei.
  event LogDepositWithdrawal(uint256 indexed tokenId, uint256 indexed amount);

  /// @notice Single (for now) beneficiary of tax payments.
  address payable public beneficiary;

  /// @notice Mapping from token ID to token price in Wei.
  mapping(uint256 => uint256) public prices;

  /// @notice Mapping from token ID to taxation collected over lifetime in Wei.
  mapping(uint256 => uint256) public taxationCollected;

  /// @notice Mapping from token ID to taxation collected since last transfer in Wei.
  mapping(uint256 => uint256) public taxCollectedSinceLastTransfer;

  /// @notice Mapping from token ID to funds for paying tax ("Deposit") in Wei.
  mapping(uint256 => uint256) private deposits;

  /// @notice Mapping of address to Wei.
  /// @dev If for whatever reason a remittance payment fails during a purchase, the amount
  /// (purchase price + deposit) is added to `outstandingRemittances` so the previous
  /// owner can withdraw it.
  mapping(address => uint256) public outstandingRemittances;

  /// @notice Mapping from token ID to Unix timestamp when last tax collection occured.
  /// @dev This is used to determine how much time has passed since last collection and the present
  /// and resultingly how much tax is due in the present.
  /// @dev In the event that a foreclosure happens AFTER it should have, this
  /// variable is backdated to when it should've occurred. Thus: `chainOfTitle` is
  /// accurate to the actual possession period.
  mapping(uint256 => uint256) public lastCollectionTimes;

  /// @notice Mapping from token ID to Unix timestamp of when it was last transferred.
  mapping(uint256 => uint256) public lastTransferTimes;

  /// @notice Mapping from token ID to array of transfer events.
  /// @dev This includes foreclosures.
  mapping(uint256 => TitleTransferEvent[]) private chainOfTitle;

  /// @notice  Percentage taxation rate. e.g. 5% or 100%
  /// @dev Granular to an additionial 10 zeroes.
  /// e.g. 100% => 1000000000000
  /// e.g. 5% => 50000000000
  uint256 private immutable taxNumerator;
  uint256 private constant taxDenominator = 1000000000000;

  /// @notice Over what period, in days, should taxation be applied?
  uint256 public taxationPeriod;

  /// @notice Mapping from token ID to purchase lock status
  /// @dev Used to prevent reentrancy attacks
  mapping(uint256 => bool) private locked;

  /// @notice Creates the token and sets beneficiary & taxation amount.
  /// @param name_ ERC721 Token Name
  /// @param symbol_ ERC721 Token Symbol
  /// @param beneficiary_ Recipient of tax payments
  /// @param taxNumerator_ The taxation rate up to 10 decimal places.
  /// @param taxationPeriod_ The number of days that constitute one taxation period.
  constructor(
    string memory name_,
    string memory symbol_,
    address payable beneficiary_,
    uint256 taxNumerator_,
    uint256 taxationPeriod_
  ) ERC721(name_, symbol_) {
    beneficiary = beneficiary_;
    taxNumerator = taxNumerator_;
    taxationPeriod = taxationPeriod_ * 1 days;
  }

  /// @notice Checks whether message sender owns a given token id
  /// @param _tokenId ID of token to check ownership again.
  modifier onlyOwner(uint256 _tokenId) {
    address owner = ownerOf(_tokenId);
    require(msg.sender == owner, "Sender does not own this token");
    _;
  }

  /// @notice Envokes tax collection.
  /// @dev Tax collection is triggered by an external envocation of a method wrapped by
  /// this modifier.
  /// @param _tokenId ID of token to collect tax for.
  modifier collectTax(uint256 _tokenId) {
    _collectTax(_tokenId);
    _;
  }

  /// @notice Requires that token have been minted.
  /// @param _tokenId ID of token to verify.
  modifier tokenMinted(uint256 _tokenId) {
    ownerOf(_tokenId);
    _;
  }

  /// @notice Returns tax numerator
  /// @return Tax Rate
  function taxRate() public view returns (uint256) {
    return taxNumerator;
  }

  function titleChainOf(uint256 _tokenId)
    public
    view
    tokenMinted(_tokenId)
    returns (TitleTransferEvent[] memory)
  {
    return chainOfTitle[_tokenId];
  }

  /**
   * Public View Functions
   * Used internally by external methods.
   */

  /// @notice Gets current price for a given token ID. Requires that
  /// the token has been minted.
  /// @param _tokenId ID of token requesting price for.
  /// @return Price in Wei.
  function priceOf(uint256 _tokenId)
    public
    view
    tokenMinted(_tokenId)
    returns (uint256)
  {
    return _price(_tokenId);
  }

  /// @notice Gets current deposit for a given token ID.
  /// @param _tokenId ID of token requesting deposit for.
  /// @return Deposit in Wei.
  function depositOf(uint256 _tokenId)
    public
    view
    tokenMinted(_tokenId)
    returns (uint256)
  {
    return deposits[_tokenId];
  }

  /// @notice Gets current price for a given token ID.
  /// @param _tokenId ID of token requesting price for.
  /// @return Price in Wei.
  function _price(uint256 _tokenId) private view returns (uint256) {
    return prices[_tokenId];
  }

  /// @notice How much is owed from the last collection until now?
  /// @param _tokenId ID of token requesting amount for.
  /// @return Tax Due in wei
  function _taxOwed(uint256 _tokenId) private view returns (uint256) {
    uint256 price = _price(_tokenId);
    uint256 timeElapsed = block.timestamp - lastCollectionTimes[_tokenId];
    return taxOwedSince(_tokenId, timeElapsed);
  }

  /// @notice Determines the taxable amount accumulated between now and
  /// a given time in the past.
  /// @param _tokenId ID of token requesting amount for.
  /// @param _time Unix timestamp.
  /// @return taxDue Tax Due in Wei.
  function taxOwedSince(uint256 _tokenId, uint256 _time)
    public
    view
    tokenMinted(_tokenId)
    returns (uint256 taxDue)
  {
    uint256 price = _price(_tokenId);
    return (((price * _time) / taxationPeriod) * taxNumerator) / taxDenominator;
  }

  /// @notice Public method for the tax owed. Returns with the current time.
  /// for use calculating expected tax obligations.
  /// @param _tokenId ID of token requesting amount for.
  /// @return amount Tax Due in Wei.
  /// @return timestamp Now as Unix timestamp.
  function taxOwed(uint256 _tokenId)
    public
    view
    returns (uint256 amount, uint256 timestamp)
  {
    return (_taxOwed(_tokenId), block.timestamp);
  }

  /// @notice Is the token in a foreclosed state?  If so, price should be zero and anyone can
  /// purchase this asset for the cost of the gas fee.
  /// Token enters forclosure if deposit cannot cover the taxation due.
  /// @dev This is a useful helper function when price should be zero, but contract doesn't
  /// reflect it yet.
  /// @param _tokenId ID of token requesting foreclosure status for.
  /// @return Returns boolean indicating whether or not the contract is foreclosed.
  function foreclosed(uint256 _tokenId) public view returns (bool) {
    uint256 owed = _taxOwed(_tokenId);
    if (owed >= deposits[_tokenId]) {
      return true;
    } else {
      return false;
    }
  }

  /// @notice The amount of deposit that is withdrawable i.e. any deposited amount greater
  /// than the taxable amount owed.
  /// @param _tokenId ID of token requesting withdrawable deposit for.
  /// @return amount in Wei.
  function withdrawableDeposit(uint256 _tokenId) public view returns (uint256) {
    if (foreclosed(_tokenId)) {
      return 0;
    } else {
      return deposits[_tokenId] - _taxOwed(_tokenId);
    }
  }

  /// @notice Returns the time when tax owed initially exceeded deposits.
  /// @dev last collected time + ((time_elapsed * deposit) / owed)
  /// @dev Returns within +/- 2s of previous values due to Solidity rounding
  /// down integer division without regard for significant digits, which produces
  /// variable results e.g. `599.9999999999851` becomes `599`.
  /// @param _tokenId ID of token requesting
  /// @return Unix timestamp
  function _backdatedForeclosureTime(uint256 _tokenId)
    private
    view
    returns (uint256)
  {
    uint256 last = lastCollectionTimes[_tokenId];
    uint256 timeElapsed = block.timestamp - last;
    return last + ((timeElapsed * deposits[_tokenId]) / _taxOwed(_tokenId));
  }

  /// @notice Determines how long a token owner has until forclosure.
  /// @param _tokenId ID of token requesting foreclosure time for.
  /// @return Unix timestamp
  function foreclosureTime(uint256 _tokenId) public view returns (uint256) {
    uint256 taxPerSecond = taxOwedSince(_tokenId, 1);
    uint256 withdrawable = withdrawableDeposit(_tokenId);
    if (withdrawable > 0) {
      // Time until deposited surplus no longer surpasses amount owed.
      return block.timestamp + withdrawable / taxPerSecond;
    } else if (taxPerSecond > 0) {
      // Token is active but in foreclosed state.
      // Returns when foreclosure should have occured i.e. when tax owed > deposits.
      return _backdatedForeclosureTime(_tokenId);
    } else {
      // Actively foreclosed (price is 0)
      return lastCollectionTimes[_tokenId];
    }
  }

  /// @notice Collects tax.
  /// @param _tokenId ID of token to collect tax for.
  /// @dev Strictly envoked by modifier but can be called publically.
  function _collectTax(uint256 _tokenId) public {
    uint256 price = _price(_tokenId);
    if (price != 0) {
      // If price > 0, contract has not foreclosed.
      uint256 owed = _taxOwed(_tokenId);

      // If foreclosure should have occured in the past, last collection time will be
      // backdated to when the tax was last paid for.
      if (foreclosed(_tokenId)) {
        lastCollectionTimes[_tokenId] = _backdatedForeclosureTime(_tokenId);
        // Set remaining deposit to be collected.
        owed = deposits[_tokenId];
      } else {
        lastCollectionTimes[_tokenId] = block.timestamp;
      }

      // Normal collection
      deposits[_tokenId] -= owed;
      taxationCollected[_tokenId] += owed;
      taxCollectedSinceLastTransfer[_tokenId] += owed;

      emit LogCollection(_tokenId, owed);

      /// Remit taxation to beneficiary.
      /// Note: This increases gas costs for all callers of `#_collectTax()`.
      beneficiary.transfer(owed);
      emit LogBeneficiaryRemittance(_tokenId, owed);

      _forecloseIfNecessary(_tokenId);
    }
  }

  /**
   * Public Methods
   */

  /// @notice Buy the token.
  /// @param _tokenId ID of token the buyer wants to purchase.
  /// @param _purchasePrice Purchasing price. Must be greater or equal to current price.
  /// @param _currentPriceForVerification Current price must be given to protect against a front-run attack.
  /// The buyer will only complete the purchase at the agreed upon price. This prevents a malicious,
  /// second buyer from purchasing the token before the first trx is complete, changing the price,
  /// and eating into the first buyer's deposit.
  function buy(
    uint256 _tokenId,
    uint256 _purchasePrice,
    uint256 _currentPriceForVerification
  ) public payable tokenMinted(_tokenId) collectTax(_tokenId) {
    // Prevent re-entrancy attack
    require(!locked[_tokenId], "Token is locked");

    uint256 currentPrice = _price(_tokenId);
    // Prevent front-run.
    require(
      currentPrice == _currentPriceForVerification,
      "Current Price is incorrect"
    );
    // Purchase price must be greater than zero, even if current price is zero, to ensure that
    // funds are available for deposit.
    require(_purchasePrice > 0, "New Price cannot be zero");
    // Buyer can offer more than the current price; this renders unnecessary a second gas payment
    // if Buyer wants to immediately self-assess the token at a higher valuation.
    require(
      _purchasePrice >= currentPrice,
      "New Price must be >= current price"
    );
    // Value sent must be greater than purchase price; surplus is necessary for deposit.
    require(
      msg.value > _purchasePrice,
      "Message does not contain surplus value for deposit"
    );

    // Seller or this contract if foreclosed.
    address currentOwner = ownerOf(_tokenId);

    // Prevent an accidental re-purchase.
    require(msg.sender != currentOwner, "Buyer is already owner");

    // After all security checks have occured, lock the token.
    locked[_tokenId] = true;

    // Remit the purchase price and any available deposit.
    uint256 remittance = _purchasePrice + deposits[_tokenId];

    if (remittance > 0) {
      // If token is owned by the contract, remit to the beneficiary.
      address recipient;
      if (currentOwner == address(this)) {
        recipient = beneficiary;
      } else {
        recipient = currentOwner;
      }

      // Remit.
      address payable payableRecipient = payable(recipient);
      bool success = payableRecipient.send(remittance);

      // If the remittance fails, hold funds for the seller to retrieve.
      if (!success) {
        outstandingRemittances[recipient] += remittance;
        emit LogOutstandingRemittance(recipient);
      } else {
        emit LogRemittance(_tokenId, recipient, remittance);
      }
    }

    // If the token is being purchased for the first time or is being purchased
    // from foreclosure,last collection time is set to now so that the contract
    // does not incorrectly consider the taxable period to have begun prior to
    // foreclosure and overtax the owner.
    if (currentPrice == 0) {
      lastCollectionTimes[_tokenId] = block.timestamp;
    }

    // Update deposit with surplus value.
    deposits[_tokenId] = msg.value - _purchasePrice;

    transferToken(_tokenId, currentOwner, msg.sender, _purchasePrice);
    emit LogBuy(_tokenId, msg.sender, _purchasePrice);

    // Unlock token
    locked[_tokenId] = false;
  }

  /**
   * Owner only actions.
   */
  /// @notice Enables depositing of Wei for a given token.
  /// @param _tokenId ID of token depositing Wei for.
  function depositWei(uint256 _tokenId)
    public
    payable
    onlyOwner(_tokenId)
    collectTax(_tokenId)
  {
    deposits[_tokenId] += msg.value;
  }

  /// @notice Enables owner to change price in accordance with
  /// self-assessed value.
  /// @param _tokenId ID of token to change price of.
  /// @param _newPrice New price in Wei.
  function changePrice(uint256 _tokenId, uint256 _newPrice)
    public
    onlyOwner(_tokenId)
    collectTax(_tokenId)
  {
    uint256 price = prices[_tokenId];
    require(_newPrice > 0, "New price cannot be zero");
    require(_newPrice != price, "New price cannot be same");
    prices[_tokenId] = _newPrice;
    emit LogPriceChange(_tokenId, _newPrice);
  }

  /// @notice Enables owner to withdraw some amount of their deposit.
  /// @param _tokenId ID of token to withdraw against.
  /// @param _wei Amount of Wei to withdraw.
  function withdrawDeposit(uint256 _tokenId, uint256 _wei)
    public
    onlyOwner(_tokenId)
    collectTax(_tokenId)
  {
    _withdrawDeposit(_tokenId, _wei);
  }

  /// @notice Enables owner to withdraw their entire deposit.
  /// @param _tokenId ID of token to withdraw against.
  function exit(uint256 _tokenId)
    public
    onlyOwner(_tokenId)
    collectTax(_tokenId)
  {
    _withdrawDeposit(_tokenId, deposits[_tokenId]);
  }

  /* Actions that don't affect state of tokens */

  /// @notice Enables previous owners to withdraw remittances that failed to send.
  /// @dev To reduce complexity, pull funds are entirely separate from current deposit.
  function withdrawOutstandingRemittance() public {
    require(
      outstandingRemittances[msg.sender] > 0,
      "No outstanding remittance"
    );

    uint256 remittance = outstandingRemittances[msg.sender];
    outstandingRemittances[msg.sender] = 0;
    payable(msg.sender).transfer(remittance);
  }

  /// @notice Withdraws deposit back to its owner.
  /// @dev Parent callers must enforce `ownerOnly(_tokenId)`.
  /// @param _tokenId ID of token to withdraw deposit for.
  /// @param _wei Amount of Wei to withdraw.
  function _withdrawDeposit(uint256 _tokenId, uint256 _wei) internal {
    // Note: Can withdraw whole deposit, which immediately triggers foreclosure.
    uint256 deposit = deposits[_tokenId];
    require(_wei <= deposit, "Cannot withdraw more than deposited");

    deposits[_tokenId] -= _wei;
    payable(msg.sender).transfer(_wei);

    emit LogDepositWithdrawal(_tokenId, _wei);

    _forecloseIfNecessary(_tokenId);
  }

  /// @notice Forecloses if no deposit for a given token.
  /// @param _tokenId ID of token to potentially foreclose.
  function _forecloseIfNecessary(uint256 _tokenId) internal {
    // If there are not enough funds to cover the entire amount owed, `_collectTax`
    // will take whatever's left of the deposit, resulting in a zero balance.
    if (deposits[_tokenId] == 0) {
      // Become steward of asset (aka foreclose)
      address currentOwner = ownerOf(_tokenId);
      transferToken(_tokenId, currentOwner, address(this), 0);
      emit LogForeclosure(_tokenId, currentOwner);
    }
  }

  /// @notice Transfers possession of a token.
  /// @param _tokenId ID of token to transfer possession of.
  /// @param _currentOwner Address of current owner.
  /// @param _newOwner Address of new owner.
  /// @param _newPrice New price in Wei.
  function transferToken(
    uint256 _tokenId,
    address _currentOwner,
    address _newOwner,
    uint256 _newPrice
  ) internal {
    // Call `_transfer` directly rather than `_transferFrom()` because `_newOwner`
    // does not require previous approval (as required by `_transferFrom()`) to purchase.
    _transfer(_currentOwner, _newOwner, _tokenId);

    prices[_tokenId] = _newPrice;

    TitleTransferEvent memory transferEvent = TitleTransferEvent(
      _currentOwner,
      _newOwner,
      block.timestamp,
      _newPrice
    );
    chainOfTitle[_tokenId].push(transferEvent);

    lastTransferTimes[_tokenId] = block.timestamp;

    taxCollectedSinceLastTransfer[_tokenId] = 0;
  }

  /**
   * Override ERC721 public transfer methods to ensure that purchasing and
   * foreclosure are the only way tokens can transfer possession.
   */

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
}
