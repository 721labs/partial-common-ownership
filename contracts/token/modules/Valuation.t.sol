// contracts/token/modules/Valuation.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {Test} from "forge-std/Test.sol";
import {Valuation} from "./Valuation.sol";

/* solhint-disable func-name-mixedcase */

contract ValuationTest is Test, Valuation {
  //////////////////////////////
  /// Success Criteria
  //////////////////////////////

  function test__setValuation(uint256 tokenId_, uint256 valuation_) public {
    // 1. Test that it emits.
    // Emits `LogBeneficiaryUpdated`
    vm.expectEmit(true, true, false, true);

    // Emit the expected event
    emit LogValuation(tokenId_, valuation_);

    // Perform the call
    _setValuation(tokenId_, valuation_);

    // 2. Test that it sets
    assertEq(_valuations[tokenId_], valuation_);
  }

  function test_valuationOf(uint256 tokenId_, uint256 valuation_) public {
    _setValuation(tokenId_, valuation_);
    assertEq(valuationOf(tokenId_), valuation_);
  }

  //////////////////////////////
  /// Failure Criteria
  //////////////////////////////
}
