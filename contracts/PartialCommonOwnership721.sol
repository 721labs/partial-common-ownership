// contracts/PartialCommonOwnership.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./interfaces/IPartialCommonOwnership721.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "hardhat/console.sol";

/// @title PartialCommonOwnership721
/// @author Simon de la Rouviere, Will Holley
/// @notice Extends the ERC721 standard by requiring tax payments from the token's current owner
/// using a Harberger Tax model; if payments are not made, the token is claimable by anybody for free.
/// @dev This code was originally forked from ThisArtworkIsAlwaysOnSale's `v2_contracts/ArtSteward.sol` contract.
/// by Simon de la Rouviere.
contract PartialCommonOwnership721 is IPartialCommonOwnership721, ERC721 {
  using SafeMath for uint256;

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

  /// @notice Single (for now) beneficiary of tax payments.
  address payable public beneficiary;

  /// @notice Mapping from token ID to token price in Wei.
  mapping(uint256 => uint256) public prices;

  /// @notice Mapping from token ID to taxation collected over lifetime in Wei.
  mapping(uint256 => uint256) public taxationCollected;

  /// @notice Mapping from token ID to funds for paying tax ("Deposit") in Wei.
  mapping(uint256 => uint256) public deposits;

  /// @notice Mapping of address to Wei.
  /// @dev If for whatever reason a remittance payment fails during a purchase, the amount
  /// (purchase price + deposit) is added to `outstandingRemittances` so the previous
  /// owner can withdraw it.
  mapping(address => uint256) public outstandingRemittances;

  /// @notice Mapping from token ID to Unix timestamp when last purchase occured.
  /// @dev In the event that a foreclosure happens AFTER it should have, this
  /// variable is backdated to when it should've occurred. Thus: `heldTimes` is
  /// accurate to the actual deposit period.
  mapping(uint256 => uint256) public lastCollectionTimes;

  /// @notice Mapping from token ID to Unix timestamp of when it was last transferred.
  mapping(uint256 => uint256) public lastTransferTimes;

  /// @notice Mapping from token ID to map of sales (seller address -> buyer address).
  /// @dev This includes foreclosures (foreclosed address -> contract address)
  mapping(uint256 => mapping(address => address)) public chainOfTitle;

  /// @notice Mapping from token ID to time held by previous owner.
  /// @dev Set during transfer.
  mapping(uint256 => mapping(address => uint256)) public heldTimes;

  /// @notice  Percentage taxation rate. e.g. 5% or 100%
  /// @dev Granular to an additionial 10 zeroes.
  /// e.g. 100% => 1000000000000
  /// e.g. 5% => 50000000000
  uint256 private immutable taxNumerator;
  uint256 private constant taxDenominator = 1000000000000;

  /// @notice Creates the token and sets beneficiary & taxation amount.
  /// @param name_ ERC721 Token Name
  /// @param symbol_ ERC721 Token Symbol
  /// @param beneficiary_ Recipient of tax payments
  /// @param taxNumerator_ The taxation rate up to 10 decimal places.
  constructor(
    string memory name_,
    string memory symbol_,
    address payable beneficiary_,
    uint256 taxNumerator_
  ) ERC721(name_, symbol_) {
    beneficiary = beneficiary_;
    taxNumerator = taxNumerator_;
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

  /**
   * Public View Functions
   * Used internally by external methods.
   */

  /// @notice Gets current price for a given token ID.
  /// @param _tokenId ID of token requesting price for.
  /// @return Price in Wei.
  function _price(uint256 _tokenId) private view returns (uint256) {
    return prices[_tokenId];
  }

  /// @notice How much is owed from the last collection until now?
  /// @param _tokenId ID of token requesting amount for.
  /// @return taxDue Tax Due in wei
  function taxOwed(uint256 _tokenId) public view returns (uint256 taxDue) {
    uint256 price = _price(_tokenId);
    return
      price
        .mul(block.timestamp.sub(lastCollectionTimes[_tokenId]))
        .mul(taxNumerator)
        .div(taxDenominator)
        .div(365 days);
  }

  /// @notice Determines the taxable amount accumulated between now and
  /// a given time in the past.
  /// @param _tokenId ID of token requesting amount for.
  /// @param _time Unix timestamp.
  /// @return taxDue Tax Due in Wei.
  function taxOwedSince(uint256 _tokenId, uint256 _time)
    public
    view
    returns (uint256 taxDue)
  {
    require(_time < block.timestamp, "Time must be in the past");
    uint256 price = _price(_tokenId);
    return price.mul(_time).mul(taxNumerator).div(taxDenominator).div(365 days);
  }

  /// @notice Returns the tax owed with the current time.
  /// @param _tokenId ID of token requesting amount for.
  /// @return taxDue Tax Due in Wei.
  /// @return timestamp Now as Unix timestamp.
  function taxOwedWithTimestamp(uint256 _tokenId)
    public
    view
    returns (uint256 taxDue, uint256 timestamp)
  {
    return (taxOwed(_tokenId), block.timestamp);
  }

  /// @notice How much taxation has been collected since the last purchase?
  /// @param _tokenId ID of token requesting amount for.
  /// @return taxDue Tax Due in Wei.
  function currentCollected(uint256 _tokenId)
    public
    view
    returns (uint256 taxDue)
  {
    uint256 lastCollectionTime = lastCollectionTimes[_tokenId];
    uint256 lastTransferTime = lastTransferTimes[_tokenId];
    if (lastCollectionTime > lastTransferTime) {
      return taxOwedSince(_tokenId, lastCollectionTime.sub(lastTransferTime));
    } else {
      return 0;
    }
  }

  /// @notice Is the token in a foreclosed state?  If so, price should be zero and anyone can
  /// purchase this asset for the cost of the gas fee.
  /// Token enters forclosure if deposit cannot cover the taxation due.
  /// @dev This is a useful helper function when price should be zero, but contract doesn't
  /// reflect it yet.
  /// @param _tokenId ID of token requesting foreclosure status for.
  /// @return Returns boolean indicating whether or not the contract is foreclosed.
  function foreclosed(uint256 _tokenId) public view returns (bool) {
    uint256 owed = taxOwed(_tokenId);
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
    uint256 owed = taxOwed(_tokenId);
    uint256 deposit = deposits[_tokenId];
    if (owed >= deposit) {
      return 0;
    } else {
      return deposit.sub(owed);
    }
  }

  /// @notice Determines how long a token owner has until forclosure.
  /// @param _tokenId ID of token requesting foreclosure time for.
  /// @return Unix timestamp
  function foreclosureTime(uint256 _tokenId) public view returns (uint256) {
    uint256 price = _price(_tokenId);
    uint256 taxPerSecond = price.mul(taxNumerator).div(taxDenominator).div(
      365 days
    );
    uint256 withdrawable = withdrawableDeposit(_tokenId);
    if (withdrawable > 0) {
      // Time until deposited surplus no longer surpasses amount owed.
      return block.timestamp + withdrawableDeposit(_tokenId).div(taxPerSecond);
    } else if (taxPerSecond > 0) {
      // Token is active but in foreclosure state;
      // time <= block.timestamp.
      uint256 owed = taxOwed(_tokenId);
      return
        lastCollectionTimes[_tokenId].add(
          (
            (block.timestamp.sub(lastCollectionTimes[_tokenId]))
              .mul(deposits[_tokenId])
              .div(owed)
          )
        );
    } else {
      // Actively foreclosed (price is 0)
      return lastCollectionTimes[_tokenId];
    }
  }

  /**
   * Public Methods
   */

  /// @notice Collects tax.
  /// @param _tokenId ID of token to collect tax for.
  /// @dev Strictly envoked by modifier.
  function _collectTax(uint256 _tokenId) public {
    uint256 price = _price(_tokenId);
    if (price != 0) {
      // If price > 0, contract has not foreclosed.
      uint256 owed = taxOwed(_tokenId);
      uint256 deposit = deposits[_tokenId];

      // If foreclosure should have occured in the past, last collection time will be
      // backdated to when the tax was last paid for.
      if (owed >= deposit) {
        // TLC + (time_elapsed)*deposit/owed
        lastCollectionTimes[_tokenId] = lastCollectionTimes[_tokenId].add(
          (block.timestamp.sub(lastCollectionTimes[_tokenId])).mul(deposit).div(
            owed
          )
        );
        // Take remaining deposit.
        owed = deposit;
      } else {
        lastCollectionTimes[_tokenId] = block.timestamp;
      }

      // Normal collection
      deposits[_tokenId] = deposit.sub(owed);
      taxationCollected[_tokenId] = taxationCollected[_tokenId].add(owed);
      emit LogCollection(_tokenId, owed);

      // Remit taxation to beneficiary
      beneficiary.transfer(owed);
      emit LogBeneficiaryRemittance(_tokenId, owed);

      _forecloseIfNecessary(_tokenId);
    }
  }

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
  ) public payable collectTax(_tokenId) {
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
      "Message does not contain enough value"
    );

    // Seller or this contract if foreclosed.
    address currentOwner = ownerOf(_tokenId);

    // Is asset currently owned by this contract due to foreclosure?
    // If so, there are no funds to remit.
    if (currentOwner != address(this)) {
      // Remit the purchase price and the seller's deposit.
      uint256 remittance = _purchasePrice.add(deposits[_tokenId]);

      if (remittance > 0) {
        // Remit.
        address payable payableCurrentOwner = payable(currentOwner);
        bool success = payableCurrentOwner.send(remittance);

        // If the remittance fails, hold funds for the seller to retrieve.
        if (!success) {
          outstandingRemittances[currentOwner] = outstandingRemittances[
            currentOwner
          ].add(remittance);
          emit LogOutstandingRemittance(currentOwner);
        }
      }
    }

    /// @notice Update purchase metadata.
    /// @dev Remnant from TAIAOS – seemingly redundant b/c set in
    /// `collectTax` above. TODO: Confirm should remove after completing tests.
    //lastCollectionTimes[_tokenId] = block.timestamp;

    // Update deposit with surplus value.
    deposits[_tokenId] = msg.value.sub(_purchasePrice);

    transferToken(_tokenId, currentOwner, msg.sender, _purchasePrice);
    emit LogBuy(_tokenId, msg.sender, _purchasePrice);
  }

  /**
   * Owner only actions.
   */
  /// @notice Enables depositing of Wei for a given token.
  /// @param _tokenId ID of token depositing Wei for.
  function depositWei(uint256 _tokenId)
    public
    payable
    collectTax(_tokenId)
    onlyOwner(_tokenId)
  {
    deposits[_tokenId] = deposits[_tokenId].add(msg.value);
  }

  /// @notice Enables owner to change price in accordance with
  /// self-assessed value.
  /// @param _tokenId ID of token to change price of.
  /// @param _newPrice New price in Wei.
  function changePrice(uint256 _tokenId, uint256 _newPrice)
    public
    collectTax(_tokenId)
    onlyOwner(_tokenId)
  {
    uint256 price = prices[_tokenId];
    require(_newPrice > 0, "New price cannot be zero");
    require(_newPrice != price, "New price cannot be same");
    price = _newPrice;
    emit LogPriceChange(_tokenId, price);
  }

  /// @notice Enables owner to withdraw some amount of their deposit.
  /// @param _tokenId ID of token to withdraw against.
  /// @param _wei Amount of Wei to withdraw.
  function withdrawDeposit(uint256 _tokenId, uint256 _wei)
    public
    collectTax(_tokenId)
    onlyOwner(_tokenId)
  {
    _withdrawDeposit(_tokenId, _wei);
  }

  /// @notice Enables owner to withdraw their entire deposit.
  /// @param _tokenId ID of token to withdraw against.
  function exit(uint256 _tokenId)
    public
    collectTax(_tokenId)
    onlyOwner(_tokenId)
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

    deposits[_tokenId] = deposit.sub(_wei);
    payable(msg.sender).transfer(_wei);

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
    /// @dev Includes time held in stewardship by this contract.
    heldTimes[_tokenId][_currentOwner] = heldTimes[_tokenId][_currentOwner].add(
      (lastCollectionTimes[_tokenId].sub(lastTransferTimes[_tokenId]))
    );

    transferFrom(_currentOwner, _newOwner, _tokenId);

    prices[_tokenId] = _newPrice;

    chainOfTitle[_tokenId][_currentOwner] = _newOwner;

    lastTransferTimes[_tokenId] = block.timestamp;
  }
}