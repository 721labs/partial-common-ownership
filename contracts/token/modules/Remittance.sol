// contracts/token/modules/Remittance.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "./interfaces/IRemittance.sol";

/// @notice Reasons for sending a remittance
enum RemittanceTriggers {
  LeaseTakeover,
  WithdrawnDeposit,
  OutstandingRemittance,
  TaxCollection
}

/// @dev Rather than using the Pull "Withdrawal from Contracts" strategy recommended by the Solidity docs
/// (see: https://docs.soliditylang.org/en/v0.8.13/common-patterns.html#withdrawal-from-contracts),
/// this module implements a "Push" strategy".  It does so to ensure that the party owed tax recieves it
/// without needing to actively collect.
/// @dev TODO: Rename `PushRemittance`
abstract contract Remittance is IRemittance {
  //////////////////////////////
  /// State
  //////////////////////////////

  /// @notice Mapping of address to Wei.
  /// @dev If for whatever reason a remittance payment fails during a lease takeover, the amount
  /// (current valuation) is added to `outstandingRemittances` so the previous
  /// owner can withdraw it.
  mapping(address => uint256) public outstandingRemittances;

  //////////////////////////////
  /// Errors
  //////////////////////////////

  error DestinationZeroAddress();

  error AmountZero();

  error NoOutstandingBalance();

  //////////////////////////////
  /// Events
  //////////////////////////////

  /// @notice If a remittance failed during token purchase, alert the seller.
  /// @param seller Address of token seller that remittance is owed to.
  event LogOutstandingRemittance(address indexed seller);

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
  /// Public Methods
  //////////////////////////////

  /// @dev See {IRemittance.withdrawOutstandingRemittance}
  function withdrawOutstandingRemittance() public override {
    uint256 outstanding = outstandingRemittances[msg.sender];

    if (outstanding == 0) {
      revert NoOutstandingBalance();
    }

    outstandingRemittances[msg.sender] = 0;

    _remit(msg.sender, outstanding, RemittanceTriggers.OutstandingRemittance);
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
    // Opinion: funds cannot be remitted to burn address
    if (recipient_ == address(0)) {
      revert DestinationZeroAddress();
    }

    // Cannot send no funds.
    if (remittance_ == 0) {
      revert AmountZero();
    }

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
}
