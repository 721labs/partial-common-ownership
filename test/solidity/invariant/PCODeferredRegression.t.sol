// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {Test} from "forge-std/Test.sol";
import {TestPCOToken} from "../../../contracts/test/TestPCOToken.sol";
import {Remittance} from "../../../contracts/token/modules/Remittance.sol";

/// @notice Freezes a pre-existing modifier-ordering edge discovered by the
/// Stage 7 stateful suite. This is compatibility evidence, not an endorsement
/// of the behavior. The finding is carried into the Stage 10 custom-ERC721
/// security comparison, but any semantic correction requires a separately
/// authorized project and is outside this modernization.
contract PCODeferredRegressionTest is Test {
    uint256 private constant START_TIME = 1_700_000_000;
    uint256 private constant TOKEN_ID = 3;

    function test_deferredStage10_pendingForeclosureSelfAssessPreservesLegacyBrickedState() public {
        vm.warp(START_TIME);

        address payable beneficiary = payable(makeAddr("deferred-beneficiary"));
        address alice = makeAddr("deferred-alice");
        address bob = makeAddr("deferred-bob");
        vm.deal(beneficiary, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);

        TestPCOToken token = new TestPCOToken(beneficiary);

        // Beneficiary ownership accrues no tax and intentionally leaves the
        // collection timestamp at the original acquisition time.
        vm.prank(beneficiary);
        token.takeoverLease(TOKEN_ID, 1 ether, 0);
        vm.warp(START_TIME + 365 days);

        // The next taxable owner inherits that old timestamp. A one-ether
        // deposit is therefore already at the foreclosure boundary.
        vm.prank(alice);
        token.takeoverLease{value: 2 ether}(TOKEN_ID, 1 ether, 1 ether);
        assertEq(token.ownerOf(TOKEN_ID), alice);
        assertEq(token.depositOf(TOKEN_ID), 1 ether);
        assertTrue(token.foreclosed(TOKEN_ID));

        // `_onlyApprovedOrOwner` runs before `_collectTax`: collection moves
        // custody to the token contract, then the selfAssess body writes the
        // new valuation after foreclosure.
        vm.prank(alice);
        token.selfAssess(TOKEN_ID, 2 ether);

        assertEq(token.ownerOf(TOKEN_ID), address(token));
        assertEq(token.valuationOf(TOKEN_ID), 2 ether);
        assertEq(token.depositOf(TOKEN_ID), 0);
        assertEq(token.taxationCollected(TOKEN_ID), 1 ether);
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_ID), 0);
        assertEq(address(token).balance, 0);

        // Once time advances, the nonzero valuation attempts to remit a zero
        // deposit during collection and preserves today's AmountZero revert.
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(Remittance.AmountZero.selector);
        vm.prank(bob);
        token.takeoverLease{value: 3 ether}(TOKEN_ID, 2 ether, 2 ether);

        assertEq(token.ownerOf(TOKEN_ID), address(token));
        assertEq(token.valuationOf(TOKEN_ID), 2 ether);
        assertEq(token.depositOf(TOKEN_ID), 0);
        assertEq(address(token).balance, 0);
    }
}
