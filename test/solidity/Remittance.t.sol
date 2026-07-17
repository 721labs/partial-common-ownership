// test/solidity/Remittance.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {EnhancedTest} from "./helpers/EnhancedTest.sol";
import {Vm} from "forge-std/Vm.sol";
import {Remittance, RemittanceTriggers} from "../../contracts/token/modules/Remittance.sol";
import {RejectEther} from "./helpers/RejectEther.sol";
import {RemittanceHarness} from "./helpers/RemittanceHarness.sol";

/* solhint-disable func-name-mixedcase */

contract RemittanceTest is EnhancedTest, Remittance {

  bytes32 private constant LOG_REMITTANCE_SIGNATURE =
    keccak256("LogRemittance(uint8,address,uint256)");

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

    // Record logs so the nested Ether send cannot consume an `expectEmit`.
    vm.recordLogs();
    bool success = _remit(recipient_, remittance_, trigger);
    _assertRemittanceLog(address(this), trigger, recipient_, remittance_);

    assertEq(success, true);
    assertEq(outstandingRemittances[recipient_], 0);
    assertEq(initialBalance + remittance_, recipient_.balance);
  }

  /// @dev Is unable to send payment and deposits funds into outstanding `outstandingRemittances.`
  function test__remit_holds() public {
    address recipient = address(new RejectEther());

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

    // Record logs so the nested Ether transfer cannot consume an `expectEmit`.
    vm.recordLogs();
    withdrawOutstandingRemittance();
    _assertRemittanceLog(
      address(this),
      RemittanceTriggers.OutstandingRemittance,
      msg.sender,
      balance_
    );

    assertEq(outstandingRemittances[msg.sender], 0);
    assertEq(address(msg.sender).balance, balance_);
  }

  //////////////////////////////
  /// Failure Criteria
  //////////////////////////////

  /// @dev Fails if sending to zero address
  function test__remit_destinationZeroAddress(uint256 remittance_) public {
    vm.assume(remittance_ > 0);
    RemittanceHarness harness = new RemittanceHarness();
    vm.deal(address(harness), remittance_);

    vm.expectRevert(DestinationZeroAddress.selector);
    harness.remit(address(0), remittance_, RemittanceTriggers.TaxCollection);
  }

  /// @dev Fails if sending no funds
  function test__remit_amountZero(address recipient_) public {
    vm.assume(recipient_ != address(0));
    RemittanceHarness harness = new RemittanceHarness();

    vm.expectRevert(AmountZero.selector);
    harness.remit(recipient_, 0, RemittanceTriggers.TaxCollection);
  }

  function test__remit_insufficientBalance(address recipient_) public {
    vm.assume(recipient_ != address(0));
    RemittanceHarness harness = new RemittanceHarness();

    vm.expectRevert(InsufficientBalance.selector);
    harness.remit(recipient_, 1, RemittanceTriggers.TaxCollection);
  }

  function test_withdrawOutstandingRemittance_noOutstandingBalance() public {
    RemittanceHarness harness = new RemittanceHarness();

    vm.expectRevert(NoOutstandingBalance.selector);
    harness.withdrawOutstandingRemittance();
  }

  function test__remit_destinationContractAddress() public {
    RemittanceHarness harness = new RemittanceHarness();
    vm.deal(address(harness), 1); // provide balance to send

    vm.expectRevert(DestinationContractAddress.selector);
    harness.remit(address(harness), 1, RemittanceTriggers.TaxCollection);
  }

  function _assertRemittanceLog(
    address emitter_,
    RemittanceTriggers trigger_,
    address recipient_,
    uint256 amount_
  ) internal {
    Vm.Log[] memory entries = vm.getRecordedLogs();
    uint256 matchingLogs;

    for (uint256 i = 0; i < entries.length; i++) {
      if (
        entries[i].emitter == emitter_ &&
        entries[i].topics.length == 4 &&
        entries[i].topics[0] == LOG_REMITTANCE_SIGNATURE
      ) {
        matchingLogs++;
        assertEq(entries[i].topics[1], bytes32(uint256(trigger_)));
        assertEq(entries[i].topics[2], bytes32(uint256(uint160(recipient_))));
        assertEq(entries[i].topics[3], bytes32(amount_));
        assertEq(entries[i].data.length, 0);
      }
    }

    assertEq(matchingLogs, 1, "expected exactly one LogRemittance event");
  }
}
