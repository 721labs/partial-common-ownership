// contracts/token/modules/Remittance.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {EnhancedTest} from "./../../test/EnhancedTest.sol";
import {Remittance, RemittanceTriggers} from "./Remittance.sol";

/* solhint-disable func-name-mixedcase */

contract RemittanceTest is EnhancedTest, Remittance {
  //////////////////////////////
  /// Success Criteria
  //////////////////////////////

  /// @dev Sends payment successfully.
  function test__remit_sends(address recipient_, uint256 remittance_) public {
    safeFuzzedAddress(recipient_);

    // Throw out sending to self
    vm.assume(recipient_ != address(this));
    // Throw out zero-address; tested separately.
    vm.assume(recipient_ != address(0));
    // Throw out zero amount; tested separately.
    vm.assume(remittance_ > 0);

    // Provide balance to send
    vm.deal(address(this), remittance_);

    // Get the starting balance
    uint256 initialBalance = recipient_.balance;

    RemittanceTriggers trigger = RemittanceTriggers.TaxCollection;

    // Check for emittance
    vm.expectEmit(true, true, true, true);
    emit LogRemittance(trigger, recipient_, remittance_);

    bool success = _remit(recipient_, remittance_, trigger);

    assertEq(success, true);
    assertEq(outstandingRemittances[recipient_], 0);
    assertEq(initialBalance + remittance_, recipient_.balance);
  }

  /// @dev Is unable to send payment and deposits funds into outstanding `outstandingRemittances.`
  function test__remit_holds() public {
    address recipient = getUnsendableAddress();

    // Provide balance to send
    uint16 amount = 100;
    vm.deal(address(this), amount);

    // Check for emittance
    vm.expectEmit(true, false, false, true);
    emit LogOutstandingRemittance(recipient);

    bool success = _remit(recipient, amount, RemittanceTriggers.TaxCollection);

    assertEq(success, false);
    assertEq(outstandingRemittances[recipient], amount);
  }

  /// @dev Test that caller can withdraw oustanding remittances.
  function test_withdrawOutstandingRemittance(uint256 balance_) public {
    // Tested elsewhere
    vm.assume(balance_ > 0);

    // Ensure msg sender has no initial balance; this prevents post-withdrawal balance
    // from overflowing b/c fuzzed `balance_` value is too high.
    vm.deal(msg.sender, 0);

    // Provide balance to remit
    vm.deal(address(this), balance_);
    outstandingRemittances[msg.sender] = balance_;

    // Expect successful emittance
    vm.expectEmit(true, true, true, true);
    emit LogRemittance(
      RemittanceTriggers.OutstandingRemittance,
      msg.sender,
      balance_
    );

    withdrawOutstandingRemittance();
    assertEq(outstandingRemittances[msg.sender], 0);
    assertEq(address(msg.sender).balance, balance_);
  }

  //////////////////////////////
  /// Failure Criteria
  //////////////////////////////

  /// @dev Fails if sending to zero address
  function test__remit_destinationZeroAddress(uint256 remittance_) public {
    vm.assume(remittance_ > 0);
    vm.expectRevert(DestinationZeroAddress.selector);
    _remit(address(0), remittance_, RemittanceTriggers.TaxCollection);
  }

  /// @dev Fails if sending no funds
  function test__remit_amountZero(address recipient_) public {
    vm.assume(recipient_ != address(0));
    vm.expectRevert(AmountZero.selector);
    _remit(recipient_, 0, RemittanceTriggers.TaxCollection);
  }

  function test__remit_insufficientBalance(address recipient_) public {
    vm.assume(recipient_ != address(0));
    vm.expectRevert(InsufficientBalance.selector);
    _remit(recipient_, 1, RemittanceTriggers.TaxCollection);
  }

  function test_withdrawOutstandingRemittance_noOutstandingBalance() public {
    vm.expectRevert(NoOutstandingBalance.selector);
    withdrawOutstandingRemittance();
  }

  function test__remit_destinationContractAddress() public {
    vm.deal(address(this), 1); // provide balance to send
    vm.expectRevert(DestinationContractAddress.selector);
    _remit(address(this), 1, RemittanceTriggers.TaxCollection);
  }
}
