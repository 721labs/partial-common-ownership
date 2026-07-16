// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {PCOFuzzBase} from "./PCOFuzzBase.t.sol";

/* solhint-disable func-name-mixedcase */

/// @notice Bounded takeover, deposit, and exit matrices. Successful branches
/// assert exact asset/liability conservation; rejected branches assert the
/// public revert payload and a complete state rollback.
contract PCOFuzzLeaseTest is PCOFuzzBase {
    struct ExistingOwnerCase {
        uint256 currentValuation;
        uint256 existingDeposit;
        uint256 newValuation;
        uint256 buyerDeposit;
        uint256 suppliedCurrentValuation;
        uint256 value;
        address buyer;
        string expectedRevert;
    }

    struct DepositExitCase {
        uint256 valuation;
        uint256 elapsed;
        uint256 due;
        uint256 cushion;
        uint256 topUp;
        uint256 initialDeposit;
    }

    function testFuzz_takeoverFromContract_roleValueAndRevertMatrix(
        uint96 valuationSeed_,
        uint96 valueSeed_,
        bool buyerIsBeneficiary_,
        uint8 outcomeSeed_
    ) public {
        uint256 valuation = bound(uint256(valuationSeed_), 1, 100 ether);
        uint256 positiveValue = bound(uint256(valueSeed_), 1, 100 ether);
        uint256 outcome = bound(uint256(outcomeSeed_), 0, 3);
        address buyer = buyerIsBeneficiary_ ? beneficiary : bob;
        uint256 newValuation = valuation;
        uint256 suppliedCurrentValuation;
        uint256 value = buyerIsBeneficiary_ ? 0 : positiveValue;
        string memory expectedRevert;

        if (outcome == 1) {
            value = buyerIsBeneficiary_ ? positiveValue : 0;
            expectedRevert =
                buyerIsBeneficiary_ ? "Msg contains value" : "Message does not contain surplus value for deposit";
        } else if (outcome == 2) {
            newValuation = 0;
            expectedRevert = "New valuation cannot be zero";
        } else if (outcome == 3) {
            suppliedCurrentValuation = 1;
            expectedRevert = "Current valuation is incorrect";
        }

        uint256 buyerBalanceBefore = buyer.balance;

        if (outcome != 0) {
            vm.expectRevert(_error(expectedRevert));
            vm.prank(buyer);
            token.takeoverLease{value: value}(TOKEN_ID, newValuation, suppliedCurrentValuation);

            assertEq(token.ownerOf(TOKEN_ID), address(token));
            assertEq(token.valuationOf(TOKEN_ID), 0);
            assertEq(token.depositOf(TOKEN_ID), 0);
            assertEq(token.lastCollectionTimeOf(TOKEN_ID), 0);
            assertEq(token.taxationCollected(TOKEN_ID), 0);
            assertEq(address(token).balance, 0);
            assertEq(buyer.balance, buyerBalanceBefore);
            assertFalse(token.lockedOf(TOKEN_ID));
            return;
        }

        vm.prank(buyer);
        token.takeoverLease{value: value}(TOKEN_ID, newValuation, 0);

        uint256 expectedDeposit = buyerIsBeneficiary_ ? 0 : value;
        assertEq(token.ownerOf(TOKEN_ID), buyer);
        assertEq(token.valuationOf(TOKEN_ID), valuation);
        assertEq(token.depositOf(TOKEN_ID), expectedDeposit);
        assertEq(token.lastCollectionTimeOf(TOKEN_ID), START_TIME);
        assertEq(token.taxationCollected(TOKEN_ID), 0);
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_ID), 0);
        assertEq(address(token).balance, expectedDeposit);
        assertEq(buyer.balance, buyerBalanceBefore - value);
        assertEq(token.balanceOf(buyer), 1);
        assertEq(token.balanceOf(address(token)), 0);
        assertEq(token.outstandingRemittances(buyer), 0);
        assertFalse(token.lockedOf(TOKEN_ID));
    }

    function testFuzz_takeoverFromOwner_roleValueAndRevertMatrix(
        uint96 currentValuationSeed_,
        uint96 existingDepositSeed_,
        uint96 increaseSeed_,
        uint96 buyerDepositSeed_,
        bool buyerIsBeneficiary_,
        uint8 outcomeSeed_
    ) public {
        ExistingOwnerCase memory c;
        c.currentValuation = bound(uint256(currentValuationSeed_), 1 ether, 20 ether);
        c.existingDeposit = bound(uint256(existingDepositSeed_), 1, 20 ether);
        c.newValuation = c.currentValuation + bound(uint256(increaseSeed_), 0, 20 ether);
        c.buyerDeposit = bound(uint256(buyerDepositSeed_), 1, 20 ether);
        c.suppliedCurrentValuation = c.currentValuation;
        c.buyer = buyerIsBeneficiary_ ? beneficiary : bob;
        c.value = buyerIsBeneficiary_ ? c.currentValuation : c.currentValuation + c.buyerDeposit;

        uint256 outcome = bound(uint256(outcomeSeed_), 0, 4);
        if (outcome == 1) {
            c.value = buyerIsBeneficiary_ ? c.currentValuation + 1 : c.currentValuation;
            c.expectedRevert = buyerIsBeneficiary_
                ? "Msg contains surplus value"
                : "Message does not contain surplus value for deposit";
        } else if (outcome == 2) {
            c.newValuation = c.currentValuation - 1;
            c.expectedRevert = "New valuation must be >= current valuation";
        } else if (outcome == 3) {
            c.suppliedCurrentValuation = c.currentValuation + 1;
            c.expectedRevert = "Current valuation is incorrect";
        } else if (outcome == 4) {
            c.buyer = alice;
            c.value = c.currentValuation + c.buyerDeposit;
            c.expectedRevert = "Buyer is already owner";
        }

        _buyFromContract(alice, c.currentValuation, c.existingDeposit);

        uint256 buyerBalanceBefore = c.buyer.balance;
        uint256 sellerBalanceBefore = alice.balance;

        if (outcome != 0) {
            vm.expectRevert(_error(c.expectedRevert));
            vm.prank(c.buyer);
            token.takeoverLease{value: c.value}(TOKEN_ID, c.newValuation, c.suppliedCurrentValuation);

            assertEq(token.ownerOf(TOKEN_ID), alice);
            assertEq(token.valuationOf(TOKEN_ID), c.currentValuation);
            assertEq(token.depositOf(TOKEN_ID), c.existingDeposit);
            assertEq(token.lastCollectionTimeOf(TOKEN_ID), START_TIME);
            assertEq(token.taxationCollected(TOKEN_ID), 0);
            assertEq(address(token).balance, c.existingDeposit);
            assertEq(c.buyer.balance, buyerBalanceBefore);
            assertEq(alice.balance, sellerBalanceBefore);
            assertFalse(token.lockedOf(TOKEN_ID));
            return;
        }

        vm.prank(c.buyer);
        token.takeoverLease{value: c.value}(TOKEN_ID, c.newValuation, c.currentValuation);

        uint256 sellerRemittance = c.currentValuation + c.existingDeposit;
        uint256 expectedDeposit = buyerIsBeneficiary_ ? 0 : c.buyerDeposit;
        assertEq(token.ownerOf(TOKEN_ID), c.buyer);
        assertEq(token.valuationOf(TOKEN_ID), c.newValuation);
        assertEq(token.depositOf(TOKEN_ID), expectedDeposit);
        assertEq(token.lastCollectionTimeOf(TOKEN_ID), START_TIME);
        assertEq(token.taxationCollected(TOKEN_ID), 0);
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_ID), 0);
        assertEq(address(token).balance, expectedDeposit);
        assertEq(c.buyer.balance, buyerBalanceBefore - c.value);
        assertEq(alice.balance, sellerBalanceBefore + sellerRemittance);
        assertEq(token.balanceOf(c.buyer), 1);
        assertEq(token.balanceOf(alice), 0);
        assertEq(token.outstandingRemittances(alice), 0);
        assertEq(token.outstandingRemittances(beneficiary), 0);
        assertFalse(token.lockedOf(TOKEN_ID));
    }

    function testFuzz_postLockRevert_rollsBackAndAllowsRetry(
        uint96 valuationSeed_,
        uint32 elapsedSeed_,
        uint96 cushionSeed_,
        uint96 buyerDepositSeed_
    ) public {
        uint256 valuation = bound(uint256(valuationSeed_), 1 ether, 20 ether);
        uint256 elapsed = bound(uint256(elapsedSeed_), 1 hours, 1 days);
        uint256 due = _taxDue(valuation, elapsed, 1 days, TAX_DENOMINATOR);
        uint256 cushion = bound(uint256(cushionSeed_), 1, 20 ether);
        uint256 initialDeposit = due + cushion;
        uint256 buyerDeposit = bound(uint256(buyerDepositSeed_), 1, 20 ether);
        uint256 buyerValue = valuation + buyerDeposit;

        token.configureTax(TAX_DENOMINATOR, 1);
        _buyFromContract(alice, valuation, initialDeposit);
        token.forceBeneficiary(payable(address(0)));
        vm.warp(START_TIME + elapsed);

        uint256 aliceBalanceBefore = alice.balance;
        uint256 bobBalanceBefore = bob.balance;

        vm.expectRevert(abi.encodeWithSelector(DESTINATION_ZERO_ADDRESS_SELECTOR));
        vm.prank(bob);
        token.takeoverLease{value: buyerValue}(TOKEN_ID, valuation, valuation);

        assertEq(token.ownerOf(TOKEN_ID), alice);
        assertEq(token.beneficiaryOf(TOKEN_ID), address(0));
        assertEq(token.valuationOf(TOKEN_ID), valuation);
        assertEq(token.depositOf(TOKEN_ID), initialDeposit);
        assertEq(token.lastCollectionTimeOf(TOKEN_ID), START_TIME);
        assertEq(token.taxationCollected(TOKEN_ID), 0);
        assertEq(address(token).balance, initialDeposit);
        assertEq(alice.balance, aliceBalanceBefore);
        assertEq(bob.balance, bobBalanceBefore);
        assertFalse(token.lockedOf(TOKEN_ID));

        token.forceBeneficiary(beneficiary);
        uint256 beneficiaryBalanceBefore = beneficiary.balance;
        vm.prank(bob);
        token.takeoverLease{value: buyerValue}(TOKEN_ID, valuation, valuation);

        assertEq(token.ownerOf(TOKEN_ID), bob);
        assertEq(token.valuationOf(TOKEN_ID), valuation);
        assertEq(token.depositOf(TOKEN_ID), buyerDeposit);
        assertEq(token.lastCollectionTimeOf(TOKEN_ID), block.timestamp);
        assertEq(token.taxationCollected(TOKEN_ID), due);
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_ID), 0);
        assertEq(address(token).balance, buyerDeposit);
        assertEq(beneficiary.balance, beneficiaryBalanceBefore + due);
        assertEq(alice.balance, aliceBalanceBefore + valuation + cushion);
        assertEq(bob.balance, bobBalanceBefore - buyerValue);
        assertEq(token.outstandingRemittances(alice), 0);
        assertFalse(token.lockedOf(TOKEN_ID));
    }

    function testFuzz_depositAndExit_conserveOrRejectExactly(
        uint96 valuationSeed_,
        uint32 elapsedSeed_,
        uint96 cushionSeed_,
        uint96 topUpSeed_,
        bool authorized_
    ) public {
        DepositExitCase memory c;
        c.valuation = bound(uint256(valuationSeed_), 1 ether, 20 ether);
        c.elapsed = bound(uint256(elapsedSeed_), 1 hours, 7 days);
        c.due = _taxDue(c.valuation, c.elapsed, 30 days, TAX_DENOMINATOR);
        c.cushion = bound(uint256(cushionSeed_), 1, 20 ether);
        c.topUp = bound(uint256(topUpSeed_), 1, 20 ether);
        c.initialDeposit = c.due + c.cushion;

        token.configureTax(TAX_DENOMINATOR, 30);
        _buyFromContract(alice, c.valuation, c.initialDeposit);
        vm.warp(START_TIME + c.elapsed);

        if (!authorized_) {
            uint256 bobBalanceBefore = bob.balance;
            uint256 beneficiaryBalanceBeforeUnauthorized = beneficiary.balance;

            vm.expectRevert(_error("ERC721: caller is not owner nor approved"));
            vm.prank(bob);
            token.deposit{value: c.topUp}(TOKEN_ID);

            vm.expectRevert(_error("ERC721: caller is not owner nor approved"));
            vm.prank(bob);
            token.exit(TOKEN_ID);

            assertEq(token.ownerOf(TOKEN_ID), alice);
            assertEq(token.valuationOf(TOKEN_ID), c.valuation);
            assertEq(token.depositOf(TOKEN_ID), c.initialDeposit);
            assertEq(token.lastCollectionTimeOf(TOKEN_ID), START_TIME);
            assertEq(token.taxationCollected(TOKEN_ID), 0);
            assertEq(address(token).balance, c.initialDeposit);
            assertEq(bob.balance, bobBalanceBefore);
            assertEq(beneficiary.balance, beneficiaryBalanceBeforeUnauthorized);
            return;
        }

        uint256 aliceBalanceBeforeDeposit = alice.balance;
        uint256 beneficiaryBalanceBefore = beneficiary.balance;
        vm.prank(alice);
        token.deposit{value: c.topUp}(TOKEN_ID);

        assertEq(token.ownerOf(TOKEN_ID), alice);
        assertEq(token.valuationOf(TOKEN_ID), c.valuation);
        assertEq(token.depositOf(TOKEN_ID), c.cushion + c.topUp);
        assertEq(token.lastCollectionTimeOf(TOKEN_ID), block.timestamp);
        assertEq(token.taxationCollected(TOKEN_ID), c.due);
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_ID), c.due);
        assertEq(alice.balance, aliceBalanceBeforeDeposit - c.topUp);
        assertEq(beneficiary.balance, beneficiaryBalanceBefore + c.due);
        assertEq(address(token).balance, c.cushion + c.topUp);

        uint256 aliceBalanceBeforeExit = alice.balance;
        uint256 returnableDeposit = c.cushion + c.topUp;
        vm.prank(alice);
        token.exit(TOKEN_ID);

        assertEq(token.ownerOf(TOKEN_ID), address(token));
        assertEq(token.valuationOf(TOKEN_ID), 0);
        assertEq(token.depositOf(TOKEN_ID), 0);
        assertEq(token.lastCollectionTimeOf(TOKEN_ID), block.timestamp);
        assertEq(token.taxationCollected(TOKEN_ID), c.due);
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_ID), 0);
        assertEq(alice.balance, aliceBalanceBeforeExit + returnableDeposit);
        assertEq(beneficiary.balance, beneficiaryBalanceBefore + c.due);
        assertEq(address(token).balance, 0);
        assertEq(token.outstandingRemittances(alice), 0);
        assertEq(token.outstandingRemittances(beneficiary), 0);
        assertFalse(token.lockedOf(TOKEN_ID));
    }
}

/* solhint-enable func-name-mixedcase */
