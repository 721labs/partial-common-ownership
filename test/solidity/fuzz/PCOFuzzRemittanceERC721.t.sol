// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {PCOFuzzBase, PCOFuzzHarness, PCOFuzzRejectingActor} from "./PCOFuzzBase.t.sol";

/* solhint-disable func-name-mixedcase */

/// @notice Bounded remittance-liability and custom ERC721 regression matrix.
/// Failed pushes must remain fully collateralized and withdraw exactly once;
/// successful approval paths must preserve the custom ERC721 semantics.
contract PCOFuzzRemittanceERC721Test is PCOFuzzBase {
    function testFuzz_failedRemittance_isConservedAndWithdrawnExactlyOnce(
        uint96 valuationSeed_,
        uint96 amountASeed_,
        uint96 amountBSeed_,
        uint32 elapsedSeed_,
        bool taxCollectionFailure_
    ) public {
        if (taxCollectionFailure_) {
            _assertTaxRemittanceFailure(valuationSeed_, amountASeed_, elapsedSeed_);
        } else {
            _assertSellerRemittanceFailure(valuationSeed_, amountASeed_, amountBSeed_);
        }
    }

    function testFuzz_approvalsAndTransfers_preserveCustomERC721State(
        uint96 valuationSeed_,
        uint8 approvalModeSeed_,
        bool safeTransfer_,
        bytes32 data_
    ) public {
        uint256 valuation = bound(uint256(valuationSeed_), 1, 100 ether);
        uint256 approvalMode = bound(uint256(approvalModeSeed_), 0, 1);

        vm.prank(beneficiary);
        token.takeoverLease(TOKEN_ID, valuation, 0);

        if (approvalMode == 0) {
            vm.prank(beneficiary);
            token.approve(operator, TOKEN_ID);
            assertEq(token.getApproved(TOKEN_ID), operator);
            assertFalse(token.isApprovedForAll(beneficiary, operator));
        } else {
            vm.prank(beneficiary);
            token.setApprovalForAll(operator, true);
            assertEq(token.getApproved(TOKEN_ID), address(0));
            assertTrue(token.isApprovedForAll(beneficiary, operator));
        }

        uint256 beneficiaryTokensBefore = token.balanceOf(beneficiary);
        uint256 recipientTokensBefore = token.balanceOf(recipient);

        vm.prank(operator);
        if (safeTransfer_) {
            token.safeTransferFrom(beneficiary, recipient, TOKEN_ID, abi.encodePacked(data_));
        } else {
            token.transferFrom(beneficiary, recipient, TOKEN_ID);
        }

        assertEq(token.ownerOf(TOKEN_ID), recipient);
        assertEq(token.balanceOf(beneficiary), beneficiaryTokensBefore - 1);
        assertEq(token.balanceOf(recipient), recipientTokensBefore + 1);
        assertEq(token.getApproved(TOKEN_ID), address(0));
        assertEq(token.isApprovedForAll(beneficiary, operator), approvalMode == 1);
        assertEq(token.valuationOf(TOKEN_ID), valuation);
        assertEq(token.depositOf(TOKEN_ID), 0);
        assertEq(token.lastCollectionTimeOf(TOKEN_ID), START_TIME);
        assertEq(token.taxationCollected(TOKEN_ID), 0);
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_ID), 0);
        assertEq(address(token).balance, 0);
        assertEq(token.outstandingRemittances(beneficiary), 0);
        assertEq(token.outstandingRemittances(recipient), 0);
    }

    function testFuzz_unauthorizedERC721Mutation_revertsAndRollsBack(
        uint96 valuationSeed_,
        uint8 operationSeed_,
        bool safeTransfer_
    ) public {
        uint256 valuation = bound(uint256(valuationSeed_), 1, 100 ether);
        uint256 operation = bound(uint256(operationSeed_), 0, 4);

        vm.prank(beneficiary);
        token.takeoverLease(TOKEN_ID, valuation, 0);

        address expectedApproval;
        if (operation == 2) {
            vm.prank(beneficiary);
            token.approve(operator, TOKEN_ID);
            expectedApproval = operator;
        }

        uint256 beneficiaryBalanceBefore = beneficiary.balance;
        uint256 bobBalanceBefore = bob.balance;

        if (operation == 0) {
            vm.expectRevert(_error("ERC721: approve caller is not owner nor approved for all"));
            vm.prank(bob);
            token.approve(recipient, TOKEN_ID);
        } else if (operation == 1) {
            vm.expectRevert(_error("ERC721: caller is not owner nor approved"));
            vm.prank(bob);
            if (safeTransfer_) {
                token.safeTransferFrom(beneficiary, recipient, TOKEN_ID);
            } else {
                token.transferFrom(beneficiary, recipient, TOKEN_ID);
            }
        } else if (operation == 2) {
            vm.expectRevert(_error("ERC721: transfer from incorrect owner"));
            vm.prank(operator);
            token.transferFrom(alice, recipient, TOKEN_ID);
        } else if (operation == 3) {
            vm.expectRevert(_error("ERC721: approval to current owner"));
            vm.prank(beneficiary);
            token.approve(beneficiary, TOKEN_ID);
        } else {
            vm.expectRevert(_error("ERC721: approve to caller"));
            vm.prank(beneficiary);
            token.setApprovalForAll(beneficiary, true);
        }

        assertEq(token.ownerOf(TOKEN_ID), beneficiary);
        assertEq(token.balanceOf(beneficiary), 1);
        assertEq(token.balanceOf(recipient), 0);
        assertEq(token.getApproved(TOKEN_ID), expectedApproval);
        assertFalse(token.isApprovedForAll(beneficiary, beneficiary));
        assertEq(token.valuationOf(TOKEN_ID), valuation);
        assertEq(token.depositOf(TOKEN_ID), 0);
        assertEq(token.lastCollectionTimeOf(TOKEN_ID), START_TIME);
        assertEq(token.taxationCollected(TOKEN_ID), 0);
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_ID), 0);
        assertEq(address(token).balance, 0);
        assertEq(beneficiary.balance, beneficiaryBalanceBefore);
        assertEq(bob.balance, bobBalanceBefore);
    }

    function _assertTaxRemittanceFailure(uint96 valuationSeed_, uint96 cushionSeed_, uint32 elapsedSeed_) internal {
        PCOFuzzRejectingActor rejectingBeneficiary = new PCOFuzzRejectingActor();
        vm.deal(address(rejectingBeneficiary), FUNDED_BALANCE);
        token = new PCOFuzzHarness(payable(address(rejectingBeneficiary)));

        uint256 valuation = bound(uint256(valuationSeed_), 1 ether, 20 ether);
        uint256 elapsed = bound(uint256(elapsedSeed_), 1 hours, 7 days);
        uint256 due = _taxDue(valuation, elapsed, 30 days, TAX_DENOMINATOR);
        uint256 cushion = bound(uint256(cushionSeed_), 1, 20 ether);
        uint256 initialDeposit = due + cushion;

        token.configureTax(TAX_DENOMINATOR, 30);
        _buyFromContract(alice, valuation, initialDeposit);
        vm.warp(START_TIME + elapsed);

        uint256 recipientBalanceBefore = address(rejectingBeneficiary).balance;
        token.collectTax(TOKEN_ID);

        assertEq(token.ownerOf(TOKEN_ID), alice);
        assertEq(token.valuationOf(TOKEN_ID), valuation);
        assertEq(token.depositOf(TOKEN_ID), cushion);
        assertEq(token.taxationCollected(TOKEN_ID), due);
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_ID), due);
        assertEq(token.outstandingRemittances(address(rejectingBeneficiary)), due);
        assertEq(address(rejectingBeneficiary).balance, recipientBalanceBefore);
        assertEq(address(token).balance, cushion + due);
        assertFalse(token.lockedOf(TOKEN_ID));

        rejectingBeneficiary.setRejectEther(false);
        rejectingBeneficiary.withdrawOutstanding(token);

        assertEq(token.outstandingRemittances(address(rejectingBeneficiary)), 0);
        assertEq(address(rejectingBeneficiary).balance, recipientBalanceBefore + due);
        assertEq(address(token).balance, cushion);

        vm.expectRevert(abi.encodeWithSelector(NO_OUTSTANDING_BALANCE_SELECTOR));
        rejectingBeneficiary.withdrawOutstanding(token);

        assertEq(token.outstandingRemittances(address(rejectingBeneficiary)), 0);
        assertEq(address(token).balance, token.depositOf(TOKEN_ID));
    }

    function _assertSellerRemittanceFailure(uint96 valuationSeed_, uint96 sellerDepositSeed_, uint96 buyerDepositSeed_)
        internal
    {
        PCOFuzzRejectingActor rejectingSeller = new PCOFuzzRejectingActor();
        vm.deal(address(rejectingSeller), FUNDED_BALANCE);

        uint256 valuation = bound(uint256(valuationSeed_), 1 ether, 20 ether);
        uint256 sellerDeposit = bound(uint256(sellerDepositSeed_), 1, 20 ether);
        uint256 buyerDeposit = bound(uint256(buyerDepositSeed_), 1, 20 ether);
        uint256 sellerRemittance = valuation + sellerDeposit;
        uint256 buyerValue = valuation + buyerDeposit;

        token.configureTax(0, 30);
        rejectingSeller.takeover(token, valuation, 0, sellerDeposit);

        uint256 sellerBalanceBefore = address(rejectingSeller).balance;
        uint256 bobBalanceBefore = bob.balance;
        vm.prank(bob);
        token.takeoverLease{value: buyerValue}(TOKEN_ID, valuation, valuation);

        assertEq(token.ownerOf(TOKEN_ID), bob);
        assertEq(token.valuationOf(TOKEN_ID), valuation);
        assertEq(token.depositOf(TOKEN_ID), buyerDeposit);
        assertEq(token.taxationCollected(TOKEN_ID), 0);
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_ID), 0);
        assertEq(token.outstandingRemittances(address(rejectingSeller)), sellerRemittance);
        assertEq(address(rejectingSeller).balance, sellerBalanceBefore);
        assertEq(bob.balance, bobBalanceBefore - buyerValue);
        assertEq(address(token).balance, buyerDeposit + sellerRemittance);
        assertFalse(token.lockedOf(TOKEN_ID));

        rejectingSeller.setRejectEther(false);
        rejectingSeller.withdrawOutstanding(token);

        assertEq(token.outstandingRemittances(address(rejectingSeller)), 0);
        assertEq(address(rejectingSeller).balance, sellerBalanceBefore + sellerRemittance);
        assertEq(address(token).balance, buyerDeposit);

        vm.expectRevert(abi.encodeWithSelector(NO_OUTSTANDING_BALANCE_SELECTOR));
        rejectingSeller.withdrawOutstanding(token);

        assertEq(token.outstandingRemittances(address(rejectingSeller)), 0);
        assertEq(address(token).balance, token.depositOf(TOKEN_ID));
    }
}

/* solhint-enable func-name-mixedcase */
