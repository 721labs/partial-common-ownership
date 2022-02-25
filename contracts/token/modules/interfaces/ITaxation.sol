// contracts/token/modules/interfaces/ITaxation.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

interface ITaxation {
  //////////////////////////////
  /// External Methods
  //////////////////////////////

  /// @notice Enables owner to withdraw some amount of their deposit.
  /// @param tokenId_ ID of token to withdraw against.
  /// @param wei_ Amount of Wei to withdraw.
  function withdrawDeposit(uint256 tokenId_, uint256 wei_) external;

  /// @notice Enables owner to withdraw their entire deposit.
  /// @param tokenId_ ID of token to withdraw against.
  function exit(uint256 tokenId_) external;

  /// @notice Increases owner's deposit by `msg.value` Wei.
  /// @param tokenId_ ID of token.
  function deposit(uint256 tokenId_) external payable;

  //////////////////////////////
  /// Taxation Getters
  //////////////////////////////

  /// @notice Returns the amount of tax collected since last transfer of a token.
  /// @param tokenId_ ID of token.
  /// @return Amount in Wei.
  function taxCollectedSinceLastTransferOf(uint256 tokenId_)
    external
    view
    returns (uint256);

  /// @notice Gets the tax rate of a given token
  /// @param tokenId_ Id of token to query for
  /// @return Tax rate as int
  function taxRateOf(uint256 tokenId_) external view returns (uint256);

  /// @notice Gets the tax period of a given token
  /// @param tokenId_ Id of token to query for
  /// @return Tax period as days
  function collectionFrequencyOf(uint256 tokenId_)
    external
    view
    returns (uint256);

  /// @notice Determines the taxable amount accumulated between now and
  /// a given time in the past.
  /// @param tokenId_ ID of token requesting amount for.
  /// @param time_ Unix timestamp.
  /// @return taxDue Tax Due in Wei.
  function taxOwedSince(uint256 tokenId_, uint256 time_)
    external
    view
    returns (uint256 taxDue);

  /// @notice Public method for the tax owed. Returns with the current time.
  /// for use calculating expected tax obligations.
  /// @param tokenId_ ID of token requesting amount for.
  /// @return amount Tax Due in Wei.
  /// @return timestamp Now as Unix timestamp.
  function taxOwed(uint256 tokenId_)
    external
    view
    returns (uint256 amount, uint256 timestamp);

  /// @notice Last colllection time getter.
  /// @param tokenId_ ID of token to query for.
  /// @return Timestamp.
  function lastCollectionTimeOf(uint256 tokenId_)
    external
    view
    returns (uint256);

  //////////////////////////////
  /// Deposit Getters
  //////////////////////////////

  /// @notice Gets current deposit for a given token ID.
  /// @param tokenId_ ID of token requesting deposit for.
  /// @return Deposit in Wei.
  function depositOf(uint256 tokenId_) external view returns (uint256);

  /// @notice The amount of deposit that is withdrawable i.e. any deposited amount greater
  /// than the taxable amount owed.
  /// @param tokenId_ ID of token requesting withdrawable deposit for.
  /// @return amount in Wei.
  function withdrawableDeposit(uint256 tokenId_)
    external
    view
    returns (uint256);

  //////////////////////////////
  /// Foreclosure Getters
  //////////////////////////////

  /// @notice Do the taxes owed exceed the deposit?  If so, the token should be
  /// "foreclosed" by the contract.  The valuation should be zero and anyone can
  /// takeover the token's lease for the cost of the gas fee.
  /// @dev This is a useful helper function when valuation should be zero, but contract doesn't
  /// reflect it yet because `#_forecloseIfNecessary` has not yet been called..
  /// @param tokenId_ ID of token requesting foreclosure status for.
  /// @return Returns boolean indicating whether or not the contract is foreclosed.
  function foreclosed(uint256 tokenId_) external view returns (bool);

  /// @notice Determines how long a token owner has until forclosure.
  /// @param tokenId_ ID of token requesting foreclosure time for.
  /// @return Unix timestamp
  function foreclosureTime(uint256 tokenId_) external view returns (uint256);
}
