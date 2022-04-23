// contracts/token/modules/Remittance.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import "ds-test/test.sol";

import {Remittance, RemittanceTriggers} from "./Remittance.sol";

interface CheatCodes {
  function expectEmit(
    bool checkTopic1,
    bool checkTopic2,
    bool checkTopic3,
    bool checkData
  ) external;

  function assume(bool) external;

  function expectRevert(bytes4) external;

  function deal(address who, uint256 newBalance) external;

  function startPrank(address, address) external;

  function stopPrank() external;
}

contract RemittanceTest is DSTest, Remittance {
  CheatCodes constant cheats = CheatCodes(HEVM_ADDRESS);

  //////////////////////////////
  /// Success Criteria
  //////////////////////////////

  /// @dev Sends payment successfully.
  function test__remit_sends(address recipient_, uint256 remittance_) public {
    // Throw out zero-address; tested separately.
    cheats.assume(recipient_ != address(0));
    // Throw out zero amount; tested separately.
    cheats.assume(remittance_ > 0);

    // Provide balance to send
    cheats.deal(address(this), remittance_);

    // Get the starting balance
    uint256 initialBalance = recipient_.balance;

    RemittanceTriggers trigger = RemittanceTriggers.TaxCollection;

    // Check for emittance
    cheats.expectEmit(true, true, true, true);
    emit LogRemittance(trigger, recipient_, remittance_);

    _remit(recipient_, remittance_, trigger);

    assertEq(outstandingRemittances[recipient_], 0);
    assertEq(initialBalance + remittance_, recipient_.balance);
  }

  /// @dev Is unable to send payment and deposits funds into outstanding `outstandingRemittances.`
  function test__remit_holds(address recipient_, uint256 remittance_) public {
    // Throw out zero-address; tested separately.
    cheats.assume(recipient_ != address(0));
    // Throw out zero amount; tested separately.
    cheats.assume(remittance_ > 0);

    // Ensure there is no balance so sending fails.
    cheats.deal(address(this), 0);

    // Check for emittance
    cheats.expectEmit(true, false, false, true);
    emit LogOutstandingRemittance(recipient_);

    _remit(recipient_, remittance_, RemittanceTriggers.TaxCollection);

    assertEq(outstandingRemittances[recipient_], remittance_);
  }

  /// @dev Test that caller can withdraw oustanding remittances.
  /// TODO: Fix this test.
  function test_withdrawOutstandingRemittance(address addr_, uint256 balance_)
    public
  {
    // zero address cannot be caller
    cheats.assume(addr_ != address(0));
    cheats.assume(balance_ >= 1);
    cheats.startPrank(addr_, tx.origin);

    outstandingRemittances[addr_] = balance_;

    withdrawOutstandingRemittance();

    assertEq(outstandingRemittances[addr_], 0);
    assertEq(addr_.balance, balance_);

    cheats.stopPrank();
  }

  //////////////////////////////
  /// Failure Criteria
  //////////////////////////////

  /// @dev Fails if sending to zero address
  function test__remit_addressZero(uint256 remittance_) public {
    cheats.assume(remittance_ > 0);
    cheats.expectRevert(DestinationZeroAddress.selector);
    _remit(address(0), remittance_, RemittanceTriggers.TaxCollection);
  }

  /// @dev Fails if sending no funds
  function test__remit_amountZero(address recipient_) public {
    cheats.assume(recipient_ != address(0));
    cheats.expectRevert(AmountZero.selector);
    _remit(recipient_, 0, RemittanceTriggers.TaxCollection);
  }

  function test_withdrawOutstandingRemittance_noOutstandingBalance() public {
    cheats.expectRevert(NoOutstandingBalance.selector);
    withdrawOutstandingRemittance();
  }
}
