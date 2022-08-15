// contracts/token/modules/Beneficiary.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {Test} from "forge-std/Test.sol";
import {Beneficiary} from "./Beneficiary.sol";

/* solhint-disable func-name-mixedcase */
contract BeneficiaryTest is Test, Beneficiary {
  //////////////////////////////
  /// Success Criteria
  //////////////////////////////

  function test__setBeneficiary(uint256 tokenId_, address address_) public {
    // 1. Test that it emits.
    // Emits `LogBeneficiaryUpdated`
    vm.expectEmit(true, true, false, true);

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

    // Call
    setBeneficiary(tokenId_, payable(address_));

    // Because `vm.expectCall` doesn't work, verify that _setBeneficiary properly set
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
    vm.expectRevert(BeneficiaryOnly.selector);
    setBeneficiary(tokenId_, payable(address_));
  }
}
