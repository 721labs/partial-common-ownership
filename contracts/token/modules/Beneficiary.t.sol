// contracts/token/modules/Beneficiary.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import "ds-test/test.sol";
import {Beneficiary} from "./Beneficiary.sol";

interface CheatCodes {
  function expectRevert(bytes calldata msg) external;

  function expectEmit(
    bool checkTopic1,
    bool checkTopic2,
    bool checkTopic3,
    bool checkData
  ) external;

  function expectCall(address where, bytes calldata data) external;
}

contract BeneficiaryTest is DSTest, Beneficiary {
  CheatCodes constant cheats = CheatCodes(HEVM_ADDRESS);

  //////////////////////////////
  /// Success Criteria
  //////////////////////////////

  function test__setBeneficiary(uint256 tokenId_, address address_) public {
    // 1. Test that it emits.
    // Emits `LogBeneficiaryUpdated`
    cheats.expectEmit(true, true, false, true);

    // Emit the expected event
    emit Beneficiary.LogBeneficiaryUpdated(tokenId_, address_);

    // Perform the call.
    _setBeneficiary(tokenId_, payable(address_));

    // 2. Test that it sets.
    assertEq(_beneficiaries[tokenId_], address_);
  }

  /// @dev  Public setter sets.
  function test_setBeneficiary(uint256 tokenId_, address address_) public {
    // Set initial beneficiary
    _setBeneficiary(tokenId_, payable(msg.sender));

    //! DEV: This fails currently; see https://github.com/gakonst/foundry/issues/432
    // setBeneficiary should call _setBeneficiary(tokenId_, payable(address_))
    // cheats.expectCall(
    //   address(this),
    //   abi.encodeCall(_setBeneficiary, (tokenId_, payable(address_)))
    // );

    // Call
    setBeneficiary(tokenId_, payable(address_));

    // Because `cheats.expectCall` doesn't work, verify that _setBeneficiary properly set
    // by verifying its pre-determined successful state.
    assertEq(_beneficiaries[tokenId_], address_);
  }

  /// @dev Tests public getter
  function test_beneficiaryOf(uint256 tokenId_, address address_) public {
    _setBeneficiary(tokenId_, payable(address_));
    assertEq(beneficiaryOf(tokenId_), _beneficiaries[tokenId_]);
    assertEq(beneficiaryOf(tokenId_), payable(address_));
  }

  /// @dev `beneficiaryOf` should return 0 address when beneficiary isn't set
  function test_beneficiaryOf_unsetTokens() public {
    assertEq(beneficiaryOf(0), address(0));
  }

  //////////////////////////////
  /// Fail Criteria
  //////////////////////////////

  /// @dev  Tests that only the current beneficiary can update the beneficiary
  /// for a given token.
  function testCannot_setBeneficiary_calledByNonBeneficiary(
    uint256 tokenId_,
    address address_
  ) public {
    cheats.expectRevert("Current beneficiary only");
    setBeneficiary(tokenId_, payable(address_));
  }
}
