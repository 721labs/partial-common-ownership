// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {PCOFuzzBase} from "./PCOFuzzBase.t.sol";

/* solhint-disable func-name-mixedcase */

/// @notice Bounded tax arithmetic, rounding, collection, and foreclosure
/// regressions. All products are capped far below uint256 overflow and all
/// collection cases retain enough deposit to isolate the intended branch.
contract PCOFuzzTaxTest is PCOFuzzBase {
    struct CollectionCase {
        uint256 valuation;
        uint256 rate;
        uint256 frequencyDays;
        uint256 frequency;
        uint256 elapsed;
        uint256 due;
        uint256 cushion;
        uint256 initialDeposit;
    }

    function testFuzz_taxRounding_matchesProductionOrderAndIsMonotonic(
        uint96 valuationSeed_,
        uint64 rateSeed_,
        uint16 frequencyDaysSeed_,
        uint32 elapsedSeed_
    ) public {
        uint256 valuation = bound(uint256(valuationSeed_), 1, 100 ether);
        uint256 rate = bound(uint256(rateSeed_), 0, 2 * TAX_DENOMINATOR);
        uint256 frequencyDays = bound(uint256(frequencyDaysSeed_), 1, 365);
        uint256 frequency = frequencyDays * 1 days;
        uint256 elapsed = bound(uint256(elapsedSeed_), 0, 730 days);

        token.configureTax(rate, frequencyDays);
        _buyFromContract(alice, valuation, 1);
        vm.warp(START_TIME + elapsed);

        uint256 expected = _taxDue(valuation, elapsed, frequency, rate);
        uint256 expectedNext = _taxDue(valuation, elapsed + 1, frequency, rate);
        (uint256 actual, uint256 timestamp) = token.taxOwed(TOKEN_ID);

        assertEq(token.taxOwedSince(TOKEN_ID, elapsed), expected);
        assertEq(token.taxOwedSince(TOKEN_ID, elapsed + 1), expectedNext);
        assertGe(expectedNext, expected);
        assertEq(actual, expected);
        assertEq(timestamp, block.timestamp);
        assertEq(token.valuationOf(TOKEN_ID), valuation);
        assertEq(token.taxRateOf(TOKEN_ID), rate);
        assertEq(token.collectionFrequencyOf(TOKEN_ID), frequency);
    }

    function testFuzz_partialCollection_conservesDepositTaxAndEther(
        uint96 valuationSeed_,
        uint64 rateSeed_,
        uint16 frequencyDaysSeed_,
        uint32 elapsedSeed_,
        uint96 cushionSeed_
    ) public {
        CollectionCase memory c;
        c.valuation = bound(uint256(valuationSeed_), 1 ether, 100 ether);
        c.rate = bound(uint256(rateSeed_), TAX_DENOMINATOR / 100, TAX_DENOMINATOR);
        c.frequencyDays = bound(uint256(frequencyDaysSeed_), 1, 365);
        c.frequency = c.frequencyDays * 1 days;
        c.elapsed = bound(uint256(elapsedSeed_), 1 hours, 30 days);
        c.due = _taxDue(c.valuation, c.elapsed, c.frequency, c.rate);
        c.cushion = bound(uint256(cushionSeed_), 1, 50 ether);
        c.initialDeposit = c.due + c.cushion;

        assertGt(c.due, 0);
        token.configureTax(c.rate, c.frequencyDays);
        _buyFromContract(alice, c.valuation, c.initialDeposit);
        vm.warp(START_TIME + c.elapsed);

        uint256 beneficiaryBalanceBefore = beneficiary.balance;
        uint256 aliceBalanceBefore = alice.balance;

        token.collectTax(TOKEN_ID);

        assertEq(token.ownerOf(TOKEN_ID), alice);
        assertEq(token.valuationOf(TOKEN_ID), c.valuation);
        assertEq(token.depositOf(TOKEN_ID), c.cushion);
        assertEq(token.lastCollectionTimeOf(TOKEN_ID), block.timestamp);
        assertEq(token.taxationCollected(TOKEN_ID), c.due);
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_ID), c.due);
        assertEq(beneficiary.balance, beneficiaryBalanceBefore + c.due);
        assertEq(alice.balance, aliceBalanceBefore);
        assertEq(address(token).balance, c.cushion);
        assertEq(token.outstandingRemittances(beneficiary), 0);
        assertEq(token.outstandingRemittances(alice), 0);
        assertFalse(token.foreclosed(TOKEN_ID));
    }

    function testFuzz_foreclosureBoundary_collectsExactlyOnceAndBackdates(
        uint96 valuationSeed_,
        uint16 frequencyDaysSeed_,
        uint32 boundarySeed_
    ) public {
        uint256 valuation = bound(uint256(valuationSeed_), 1 ether, 100 ether);
        uint256 frequencyDays = bound(uint256(frequencyDaysSeed_), 1, 30);
        uint256 frequency = frequencyDays * 1 days;
        uint256 boundary = bound(uint256(boundarySeed_), 1, 2 * frequency);
        uint256 deposit = _taxDue(valuation, boundary, frequency, TAX_DENOMINATOR);

        assertGt(deposit, 0);
        token.configureTax(TAX_DENOMINATOR, frequencyDays);
        _buyFromContract(alice, valuation, deposit);

        vm.warp(START_TIME + boundary - 1);
        (uint256 owedBefore,) = token.taxOwed(TOKEN_ID);
        assertEq(owedBefore, _taxDue(valuation, boundary - 1, frequency, TAX_DENOMINATOR));
        assertLt(owedBefore, deposit);
        assertFalse(token.foreclosed(TOKEN_ID));

        vm.warp(START_TIME + boundary);
        (uint256 owedAtBoundary,) = token.taxOwed(TOKEN_ID);
        assertEq(owedAtBoundary, deposit);
        assertTrue(token.foreclosed(TOKEN_ID));

        uint256 beneficiaryBalanceBefore = beneficiary.balance;
        token.collectTax(TOKEN_ID);

        assertEq(token.ownerOf(TOKEN_ID), address(token));
        assertEq(token.valuationOf(TOKEN_ID), 0);
        assertEq(token.depositOf(TOKEN_ID), 0);
        assertEq(token.lastCollectionTimeOf(TOKEN_ID), START_TIME + boundary);
        assertEq(token.taxationCollected(TOKEN_ID), deposit);
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_ID), 0);
        assertEq(beneficiary.balance, beneficiaryBalanceBefore + deposit);
        assertEq(address(token).balance, 0);
        assertEq(token.balanceOf(alice), 0);
        assertEq(token.balanceOf(address(token)), 1);
        assertEq(token.outstandingRemittances(beneficiary), 0);
        assertFalse(token.lockedOf(TOKEN_ID));
    }
}

/* solhint-enable func-name-mixedcase */
