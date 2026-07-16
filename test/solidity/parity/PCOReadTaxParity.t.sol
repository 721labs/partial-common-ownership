// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {TestPCOToken} from "../../../contracts/test/TestPCOToken.sol";
import {RemittanceTriggers} from "../../../contracts/token/modules/Remittance.sol";

/* solhint-disable func-name-mixedcase */

/// @dev Deterministic Forge ports of the construction, access-control, read,
/// taxation, transfer, and foreclosure scenarios in
/// `tests/PartialCommonOwnership/index.ts`.
contract PCOReadTaxParityTest is Test {
    struct TakeoverSnapshot {
        address currentOwner;
        bool contractOwnedBefore;
        bool foreclosedBefore;
        uint256 depositBefore;
        uint256 lastCollectionBefore;
        uint256 taxTotalBefore;
        uint256 buyerBalanceBefore;
        uint256 ownerBalanceBefore;
        uint256 beneficiaryBalanceBefore;
        uint256 contractBalanceBefore;
        uint256 collected;
        uint256 sellerRemittance;
        uint256 expectedDeposit;
    }


    uint256 private constant START_TIME = 1_700_000_000;
    uint256 private constant INVALID_TOKEN_ID = 999;
    uint256 private constant TAX_DENOMINATOR = 1_000_000_000_000;

    uint256 private constant TOKEN_ONE = 1;
    uint256 private constant TOKEN_TWO = 2;
    uint256 private constant TOKEN_THREE = 3;

    uint256 private constant ETH0 = 0;
    uint256 private constant ETH1 = 1 ether;
    uint256 private constant ETH2 = 2 ether;
    uint256 private constant ETH3 = 3 ether;

    bytes32 private constant APPROVAL_SIGNATURE = keccak256("Approval(address,address,uint256)");
    bytes32 private constant TRANSFER_SIGNATURE = keccak256("Transfer(address,address,uint256)");
    bytes32 private constant COLLECTION_SIGNATURE = keccak256("LogCollection(uint256,uint256)");
    bytes32 private constant FORECLOSURE_SIGNATURE = keccak256("LogForeclosure(uint256,address)");
    bytes32 private constant LEASE_TAKEOVER_SIGNATURE = keccak256("LogLeaseTakeover(uint256,address,uint256)");
    bytes32 private constant REMITTANCE_SIGNATURE = keccak256("LogRemittance(uint8,address,uint256)");
    bytes32 private constant VALUATION_SIGNATURE = keccak256("LogValuation(uint256,uint256)");

    TestPCOToken private token;
    address private beneficiary;
    address private alice;
    address private bob;

    function setUp() public {
        vm.warp(START_TIME);

        beneficiary = makeAddr("beneficiary");
        alice = makeAddr("alice");
        bob = makeAddr("bob");

        vm.deal(beneficiary, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);

        token = new TestPCOToken(payable(beneficiary));
    }

    //////////////////////////////
    /// Construction (4)
    //////////////////////////////

    function test_parity_001_construction_mintsThreeTokens() public {
        assertEq(token.ownerOf(TOKEN_ONE), address(token));
        assertEq(token.ownerOf(TOKEN_TWO), address(token));
        assertEq(token.ownerOf(TOKEN_THREE), address(token));
        assertEq(token.balanceOf(address(token)), 3);
    }

    function test_parity_002_construction_setsBeneficiaries() public {
        assertEq(token.beneficiaryOf(TOKEN_ONE), beneficiary);
        assertEq(token.beneficiaryOf(TOKEN_TWO), beneficiary);
        assertEq(token.beneficiaryOf(TOKEN_THREE), beneficiary);
    }

    function test_parity_003_construction_setsTaxRate() public {
        assertEq(token.taxRateOf(TOKEN_ONE), 50_000_000_000);
        assertEq(token.taxRateOf(TOKEN_TWO), 1_000_000_000_000);
        assertEq(token.taxRateOf(TOKEN_THREE), 1_000_000_000_000);
    }

    function test_parity_004_construction_setsTaxPeriod() public {
        assertEq(token.collectionFrequencyOf(TOKEN_ONE), 90 days);
        assertEq(token.collectionFrequencyOf(TOKEN_TWO), 30 days);
        assertEq(token.collectionFrequencyOf(TOKEN_THREE), 365 days);
    }

    //////////////////////////////
    /// Friendly transfers (3)
    //////////////////////////////

    function test_parity_005_friendlyTransfer_transferFrom() public {
        _assertFriendlyTransfer(TOKEN_ONE, 0);
    }

    function test_parity_006_friendlyTransfer_safeTransferFrom() public {
        _assertFriendlyTransfer(TOKEN_TWO, 1);
    }

    function test_parity_007_friendlyTransfer_safeTransferFromWithBytes() public {
        _assertFriendlyTransfer(TOKEN_THREE, 2);
    }

    //////////////////////////////
    /// onlyOwner (4)
    //////////////////////////////

    function test_parity_008_onlyOwner_deposit_revertsForNonOwner() public {
        vm.prank(alice);
        vm.expectRevert(bytes("ERC721: caller is not owner nor approved"));
        token.deposit{value: ETH1}(TOKEN_ONE);

        assertEq(token.ownerOf(TOKEN_ONE), address(token));
        assertEq(token.depositOf(TOKEN_ONE), 0);
        assertEq(address(token).balance, 0);
    }

    function test_parity_009_onlyOwner_selfAssess_revertsForNonOwner() public {
        vm.prank(alice);
        vm.expectRevert(bytes("ERC721: caller is not owner nor approved"));
        token.selfAssess(TOKEN_ONE, 500);

        assertEq(token.ownerOf(TOKEN_ONE), address(token));
        assertEq(token.valuationOf(TOKEN_ONE), 0);
    }

    function test_parity_010_onlyOwner_withdrawDeposit_revertsForNonOwner() public {
        vm.prank(alice);
        vm.expectRevert(bytes("ERC721: caller is not owner nor approved"));
        token.withdrawDeposit(TOKEN_ONE, 10);

        assertEq(token.ownerOf(TOKEN_ONE), address(token));
        assertEq(token.depositOf(TOKEN_ONE), 0);
    }

    function test_parity_011_onlyOwner_exit_revertsForNonOwner() public {
        vm.prank(alice);
        vm.expectRevert(bytes("ERC721: caller is not owner nor approved"));
        token.exit(TOKEN_ONE);

        assertEq(token.ownerOf(TOKEN_ONE), address(token));
        assertEq(token.depositOf(TOKEN_ONE), 0);
    }

    //////////////////////////////
    /// collectTax (3)
    //////////////////////////////

    function test_parity_012_collectTax_beneficiaryOwnedCollectsNothing() public {
        _takeover(beneficiary, TOKEN_ONE, ETH1, ETH0, ETH0);

        uint256 lastCollection = token.lastCollectionTimeOf(TOKEN_ONE);
        uint256 contractBalance = address(token).balance;
        uint256 beneficiaryBalance = beneficiary.balance;

        vm.warp(block.timestamp + 1);
        vm.recordLogs();
        token.collectTax(TOKEN_ONE);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 0, "beneficiary collection emitted a log");
        assertEq(token.ownerOf(TOKEN_ONE), beneficiary);
        assertEq(token.valuationOf(TOKEN_ONE), ETH1);
        assertEq(token.depositOf(TOKEN_ONE), 0);
        assertEq(token.lastCollectionTimeOf(TOKEN_ONE), lastCollection);
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_ONE), 0);
        assertEq(token.taxationCollected(TOKEN_ONE), 0);
        assertEq(address(token).balance, contractBalance);
        assertEq(beneficiary.balance, beneficiaryBalance);
    }

    function test_parity_013_collectTax_collectsAfterTenMinutes() public {
        _takeover(alice, TOKEN_TWO, ETH1, ETH0, ETH2);
        _collectAndAssert(TOKEN_TWO, 10 minutes, ETH1);
    }

    function test_parity_014_collectTax_collectsTwiceAfterTenMinutes() public {
        _takeover(alice, TOKEN_THREE, ETH1, ETH0, ETH2);
        _collectAndAssert(TOKEN_THREE, 10 minutes, ETH1);
        _collectAndAssert(TOKEN_THREE, 10 minutes, ETH1);
    }

    //////////////////////////////
    /// tokenMinted (4)
    //////////////////////////////

    function test_parity_015_tokenMinted_valuationOfGuard() public {
        // The legacy test title says valuationOf, but the oracle intentionally
        // invokes ownerOf and pins that exact ERC721 revert payload.
        vm.expectRevert(bytes("ERC721: owner query for nonexistent token"));
        token.ownerOf(INVALID_TOKEN_ID);
    }

    function test_parity_016_tokenMinted_depositOfGuard() public {
        vm.expectRevert(bytes("ERC721: query for nonexistent token"));
        token.depositOf(INVALID_TOKEN_ID);
    }

    function test_parity_017_tokenMinted_takeoverLeaseGuard() public {
        vm.expectRevert(bytes("ERC721: query for nonexistent token"));
        token.takeoverLease(INVALID_TOKEN_ID, ETH0, ETH0);
    }

    function test_parity_018_tokenMinted_taxOwedSinceGuard() public {
        vm.expectRevert(bytes("ERC721: query for nonexistent token"));
        token.taxOwedSince(INVALID_TOKEN_ID, block.timestamp);
    }

    //////////////////////////////
    /// Simple reads (2)
    //////////////////////////////

    function test_parity_019_taxRateOf_returnsExpectedRate() public {
        vm.prank(alice);
        assertEq(token.taxRateOf(TOKEN_ONE), 50_000_000_000);
    }

    function test_parity_020_depositOf_returnsExpectedZeroDeposit() public {
        // Preserve the legacy oracle: despite its depositOf title, it reads the
        // initial valuation and expects zero.
        assertEq(token.valuationOf(TOKEN_ONE), ETH0);
    }

    //////////////////////////////
    /// taxOwed (4)
    //////////////////////////////

    function test_parity_021_taxOwed_afterOneDayTitle() public {
        _takeover(alice, TOKEN_ONE, ETH1, ETH0, ETH2);
        // The legacy helper passes `1` directly to time.increase; preserve the
        // one-second behavior even though the scenario title says one day.
        _assertTaxOwedAfter(TOKEN_ONE, 1);
    }

    function test_parity_022_taxOwed_beneficiaryOwnedOwesNothing() public {
        _takeover(beneficiary, TOKEN_TWO, ETH1, ETH0, ETH0);
        vm.warp(block.timestamp + 1);

        (uint256 amount, uint256 timestamp) = token.taxOwed(TOKEN_TWO);
        assertEq(amount, 0);
        assertEq(timestamp, block.timestamp);
        assertEq(token.withdrawableDeposit(TOKEN_TWO), 0);
    }

    function test_parity_023_taxOwed_afterOneYearTitle() public {
        _takeover(alice, TOKEN_TWO, ETH1, ETH0, ETH2);
        // The legacy helper passes 365 seconds, not 365 days.
        _assertTaxOwedAfter(TOKEN_TWO, 365);
    }

    function test_parity_024_taxOwed_afterTwoYearsTitle() public {
        _takeover(alice, TOKEN_THREE, ETH1, ETH0, ETH2);
        // The legacy helper passes 730 seconds, not 730 days.
        _assertTaxOwedAfter(TOKEN_THREE, 730);
    }

    //////////////////////////////
    /// taxOwedSince (2)
    //////////////////////////////

    function test_parity_025_taxOwedSince_zeroWithoutPurchase() public {
        assertEq(token.taxOwedSince(TOKEN_ONE, block.timestamp - 1), 0);
        assertEq(token.valuationOf(TOKEN_ONE), 0);
        assertEq(token.ownerOf(TOKEN_ONE), address(token));
    }

    function test_parity_026_taxOwedSince_returnsCorrectAmount() public {
        _takeover(alice, TOKEN_THREE, ETH1, ETH0, ETH2);

        uint256 suppliedTime = block.timestamp - 1;
        uint256 expected = _taxDue(TOKEN_THREE, ETH1, suppliedTime);

        assertEq(token.taxOwedSince(TOKEN_THREE, suppliedTime), expected);
        assertEq(token.ownerOf(TOKEN_THREE), alice);
        assertEq(token.valuationOf(TOKEN_THREE), ETH1);
        assertEq(token.depositOf(TOKEN_THREE), ETH2);
    }

    //////////////////////////////
    /// taxCollectedSinceLastTransferOf (5)
    //////////////////////////////

    function test_parity_027_taxSinceTransfer_zeroIfNeverTransferred() public {
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_ONE), 0);
        assertEq(token.taxationCollected(TOKEN_ONE), 0);
    }

    function test_parity_028_taxSinceTransfer_afterInitialPurchase() public {
        _takeover(alice, TOKEN_ONE, ETH1, ETH0, ETH2);
        _collectAndAssert(TOKEN_ONE, 1 minutes, ETH1);
    }

    function test_parity_029_taxSinceTransfer_afterSecondaryPurchase() public {
        _takeover(alice, TOKEN_TWO, ETH1, ETH0, ETH2);
        _collectAndAssert(TOKEN_TWO, 1 minutes, ETH1);

        _takeover(bob, TOKEN_TWO, ETH2, ETH1, ETH3);
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_TWO), 0);
        _collectAndAssert(TOKEN_TWO, 1 minutes, ETH2);
    }

    function test_parity_030_taxSinceTransfer_zeroWhenForeclosed() public {
        _takeover(alice, TOKEN_THREE, ETH1, ETH0, ETH2);

        uint256 foreclosureAt = token.foreclosureTime(TOKEN_THREE);
        vm.warp(foreclosureAt + 1);
        assertTrue(token.foreclosed(TOKEN_THREE));

        vm.warp(block.timestamp + 1 days);
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_THREE), 0);
        assertEq(token.taxationCollected(TOKEN_THREE), 0);
        assertEq(token.ownerOf(TOKEN_THREE), alice);
        assertEq(token.valuationOf(TOKEN_THREE), ETH1);
        assertEq(token.depositOf(TOKEN_THREE), ETH2);
    }

    function test_parity_031_taxSinceTransfer_afterPurchaseFromForeclosure() public {
        _takeover(alice, TOKEN_ONE, ETH1, ETH0, ETH2);

        uint256 foreclosureAt = token.foreclosureTime(TOKEN_ONE);
        vm.warp(foreclosureAt + 1);
        assertTrue(token.foreclosed(TOKEN_ONE));
        vm.warp(block.timestamp + 1 days);

        _takeover(bob, TOKEN_ONE, ETH1, ETH1, ETH2);
        assertEq(token.ownerOf(TOKEN_ONE), bob);
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_ONE), 0);
        _collectAndAssert(TOKEN_ONE, 1 minutes, ETH1);
    }

    //////////////////////////////
    /// foreclosed (2)
    //////////////////////////////

    function test_parity_032_foreclosed_truePositive() public {
        _takeover(alice, TOKEN_TWO, ETH1, ETH0, ETH2);
        uint256 lastCollection = token.lastCollectionTimeOf(TOKEN_TWO);

        uint256 foreclosureAt = token.foreclosureTime(TOKEN_TWO);
        vm.warp(foreclosureAt + 1);

        assertTrue(token.foreclosed(TOKEN_TWO));
        assertEq(token.ownerOf(TOKEN_TWO), alice);
        assertEq(token.valuationOf(TOKEN_TWO), ETH1);
        assertEq(token.depositOf(TOKEN_TWO), ETH2);
        assertEq(token.lastCollectionTimeOf(TOKEN_TWO), lastCollection);
    }

    function test_parity_033_foreclosed_trueNegative() public {
        _takeover(alice, TOKEN_THREE, ETH1, ETH0, ETH2);
        vm.warp(block.timestamp + 1 minutes);

        assertFalse(token.foreclosed(TOKEN_THREE));
        assertEq(token.ownerOf(TOKEN_THREE), alice);
        assertEq(token.valuationOf(TOKEN_THREE), ETH1);
        assertEq(token.depositOf(TOKEN_THREE), ETH2);
    }

    //////////////////////////////
    /// withdrawableDeposit (2)
    //////////////////////////////

    function test_parity_034_withdrawableDeposit_zeroWhenOwedExceedsDeposit() public {
        _takeover(alice, TOKEN_ONE, ETH1, ETH0, ETH2);

        uint256 foreclosureAt = token.foreclosureTime(TOKEN_ONE);
        vm.warp(foreclosureAt + 1);

        assertTrue(token.foreclosed(TOKEN_ONE));
        assertEq(token.withdrawableDeposit(TOKEN_ONE), 0);
        assertEq(token.depositOf(TOKEN_ONE), ETH2);
    }

    function test_parity_035_withdrawableDeposit_returnsDepositLessOwed() public {
        _takeover(alice, TOKEN_TWO, ETH1, ETH0, ETH2);
        vm.warp(block.timestamp + 1 days);

        (uint256 owed, uint256 timestamp) = token.taxOwed(TOKEN_TWO);
        assertEq(timestamp, block.timestamp);
        assertEq(token.withdrawableDeposit(TOKEN_TWO), ETH2 - owed);
        assertEq(token.depositOf(TOKEN_TWO), ETH2);
        assertFalse(token.foreclosed(TOKEN_TWO));
    }

    //////////////////////////////
    /// foreclosureTime (3)
    //////////////////////////////

    function test_parity_036_foreclosureTime_consistentWithinOneSecondTitle() public {
        uint256 tenMinuteDeposit = _taxDue(TOKEN_ONE, ETH1, 10 minutes);
        _takeover(alice, TOKEN_ONE, ETH1, ETH0, tenMinuteDeposit);

        uint256 shouldForecloseAt = block.timestamp + 10 minutes;
        _assertCloseTo(token.foreclosureTime(TOKEN_ONE), shouldForecloseAt, 2);

        vm.warp(block.timestamp + 10 minutes);
        _assertCloseTo(token.foreclosureTime(TOKEN_ONE), shouldForecloseAt, 2);

        _collectForeclosureAndAssert(TOKEN_ONE, alice);
        assertEq(token.ownerOf(TOKEN_ONE), address(token));

        vm.warp(block.timestamp + 10 minutes);
        _assertCloseTo(token.foreclosureTime(TOKEN_ONE), shouldForecloseAt, 2);
    }

    function test_parity_037_foreclosureTime_tenMinutesInFuture() public {
        uint256 tenMinuteDeposit = _taxDue(TOKEN_TWO, ETH1, 10 minutes);
        _takeover(alice, TOKEN_TWO, ETH1, ETH0, tenMinuteDeposit);

        uint256 tenMinutesFromNow = block.timestamp + 10 minutes;
        _assertCloseTo(token.foreclosureTime(TOKEN_TWO), tenMinutesFromNow, 2);
        assertFalse(token.foreclosed(TOKEN_TWO));
        assertEq(token.withdrawableDeposit(TOKEN_TWO), tenMinuteDeposit);
    }

    function test_parity_038_foreclosureTime_returnsBackdatedTime() public {
        uint256 tenMinuteDeposit = _taxDue(TOKEN_THREE, ETH1, 10 minutes);
        _takeover(alice, TOKEN_THREE, ETH1, ETH0, tenMinuteDeposit);

        vm.warp(block.timestamp + 10 minutes);
        uint256 shouldForecloseAt = block.timestamp;
        _assertCloseTo(token.foreclosureTime(TOKEN_THREE), shouldForecloseAt, 2);

        _collectForeclosureAndAssert(TOKEN_THREE, alice);
        assertEq(token.ownerOf(TOKEN_THREE), address(token));
        assertEq(token.valuationOf(TOKEN_THREE), 0);
        assertEq(token.depositOf(TOKEN_THREE), 0);
        _assertCloseTo(token.foreclosureTime(TOKEN_THREE), shouldForecloseAt, 2);
    }

    //////////////////////////////
    /// Scenario helpers
    //////////////////////////////

    function _assertFriendlyTransfer(uint256 tokenId_, uint8 method_) internal {
        _takeover(alice, tokenId_, ETH1, ETH0, ETH2);

        uint256 depositBefore = token.depositOf(tokenId_);
        uint256 taxBefore = token.taxationCollected(tokenId_);
        uint256 lastCollectionBefore = token.lastCollectionTimeOf(tokenId_);
        uint256 contractBalanceBefore = address(token).balance;
        uint256 beneficiaryBalanceBefore = beneficiary.balance;
        uint256 aliceBalanceBefore = alice.balance;
        uint256 bobBalanceBefore = bob.balance;

        vm.warp(block.timestamp + 1);
        uint256 due = _taxDue(tokenId_, ETH1, block.timestamp - lastCollectionBefore);

        vm.recordLogs();
        vm.startPrank(alice);
        if (method_ == 0) {
            token.transferFrom(alice, bob, tokenId_);
        } else if (method_ == 1) {
            token.safeTransferFrom(alice, bob, tokenId_);
        } else {
            token.safeTransferFrom(alice, bob, tokenId_, hex"72");
        }
        vm.stopPrank();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 4, "friendly transfer event count");
        _assertCollectionLog(logs[0], tokenId_, due);
        _assertRemittanceLog(logs[1], RemittanceTriggers.TaxCollection, beneficiary, due);
        _assertApprovalLog(logs[2], alice, address(0), tokenId_);
        _assertTransferLog(logs[3], alice, bob, tokenId_);

        assertEq(token.ownerOf(tokenId_), bob);
        assertEq(token.valuationOf(tokenId_), ETH1);
        assertEq(token.depositOf(tokenId_), depositBefore - due);
        assertEq(token.lastCollectionTimeOf(tokenId_), block.timestamp);
        assertEq(token.taxCollectedSinceLastTransferOf(tokenId_), 0);
        assertEq(token.taxationCollected(tokenId_), taxBefore + due);
        assertEq(address(token).balance, contractBalanceBefore - due);
        assertEq(beneficiary.balance, beneficiaryBalanceBefore + due);
        assertEq(alice.balance, aliceBalanceBefore);
        assertEq(bob.balance, bobBalanceBefore);
    }

    function _takeover(
        address buyer_,
        uint256 tokenId_,
        uint256 newValuation_,
        uint256 currentValuation_,
        uint256 value_
    ) internal {
        TakeoverSnapshot memory before_;
        before_.currentOwner = token.ownerOf(tokenId_);
        before_.contractOwnedBefore = before_.currentOwner == address(token);
        before_.foreclosedBefore = token.foreclosed(tokenId_);
        before_.depositBefore = token.depositOf(tokenId_);
        before_.lastCollectionBefore = token.lastCollectionTimeOf(tokenId_);
        before_.taxTotalBefore = token.taxationCollected(tokenId_);
        before_.buyerBalanceBefore = buyer_.balance;
        before_.ownerBalanceBefore = before_.currentOwner.balance;
        before_.beneficiaryBalanceBefore = beneficiary.balance;
        before_.contractBalanceBefore = address(token).balance;

        assertEq(token.valuationOf(tokenId_), currentValuation_);

        vm.warp(block.timestamp + 1);

        if (!before_.contractOwnedBefore && before_.currentOwner != beneficiary) {
            uint256 due = _taxDue(tokenId_, currentValuation_, block.timestamp - before_.lastCollectionBefore);
            before_.collected = before_.foreclosedBefore || due >= before_.depositBefore ? before_.depositBefore : due;
        }

        vm.recordLogs();
        vm.prank(buyer_);
        token.takeoverLease{value: value_}(tokenId_, newValuation_, currentValuation_);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bool purchasedFromContract = before_.contractOwnedBefore || before_.foreclosedBefore;
        if (!purchasedFromContract) {
            before_.sellerRemittance = currentValuation_ + before_.depositBefore - before_.collected;
        }

        if (buyer_ == beneficiary) {
            before_.expectedDeposit = 0;
        } else if (purchasedFromContract) {
            before_.expectedDeposit = value_;
        } else {
            before_.expectedDeposit = value_ - currentValuation_;
        }

        assertEq(token.ownerOf(tokenId_), buyer_);
        assertEq(token.valuationOf(tokenId_), newValuation_);
        assertEq(token.depositOf(tokenId_), before_.expectedDeposit);
        assertEq(token.lastCollectionTimeOf(tokenId_), block.timestamp);
        assertEq(token.taxCollectedSinceLastTransferOf(tokenId_), 0);
        assertEq(token.taxationCollected(tokenId_), before_.taxTotalBefore + before_.collected);
        assertEq(buyer_.balance, before_.buyerBalanceBefore - value_);
        assertEq(beneficiary.balance, before_.beneficiaryBalanceBefore + before_.collected);
        assertEq(
            address(token).balance,
            before_.contractBalanceBefore + value_ - before_.collected - before_.sellerRemittance
        );

        if (!purchasedFromContract) {
            assertEq(before_.currentOwner.balance, before_.ownerBalanceBefore + before_.sellerRemittance);
        }

        if (before_.contractOwnedBefore) {
            assertEq(logs.length, 4, "initial takeover event count");
            _assertValuationLog(logs[0], tokenId_, newValuation_);
            _assertApprovalLog(logs[1], address(token), address(0), tokenId_);
            _assertTransferLog(logs[2], address(token), buyer_, tokenId_);
            _assertLeaseTakeoverLog(logs[3], tokenId_, buyer_, newValuation_);
        } else if (before_.foreclosedBefore) {
            assertEq(logs.length, 10, "foreclosure takeover event count");
            _assertCollectionLog(logs[0], tokenId_, before_.collected);
            _assertRemittanceLog(logs[1], RemittanceTriggers.TaxCollection, beneficiary, before_.collected);
            _assertValuationLog(logs[2], tokenId_, 0);
            _assertApprovalLog(logs[3], before_.currentOwner, address(0), tokenId_);
            _assertTransferLog(logs[4], before_.currentOwner, address(token), tokenId_);
            _assertForeclosureLog(logs[5], tokenId_, before_.currentOwner);
            _assertValuationLog(logs[6], tokenId_, newValuation_);
            _assertApprovalLog(logs[7], address(token), address(0), tokenId_);
            _assertTransferLog(logs[8], address(token), buyer_, tokenId_);
            _assertLeaseTakeoverLog(logs[9], tokenId_, buyer_, newValuation_);
        } else {
            assertGt(before_.collected, 0, "active takeover must collect elapsed tax");
            assertEq(logs.length, 7, "secondary takeover event count");
            _assertCollectionLog(logs[0], tokenId_, before_.collected);
            _assertRemittanceLog(logs[1], RemittanceTriggers.TaxCollection, beneficiary, before_.collected);
            _assertRemittanceLog(
                logs[2], RemittanceTriggers.LeaseTakeover, before_.currentOwner, before_.sellerRemittance
            );
            _assertValuationLog(logs[3], tokenId_, newValuation_);
            _assertApprovalLog(logs[4], before_.currentOwner, address(0), tokenId_);
            _assertTransferLog(logs[5], before_.currentOwner, buyer_, tokenId_);
            _assertLeaseTakeoverLog(logs[6], tokenId_, buyer_, newValuation_);
        }
    }

    function _collectAndAssert(uint256 tokenId_, uint256 elapsed_, uint256 valuation_) internal returns (uint256 due) {
        uint256 depositBefore = token.depositOf(tokenId_);
        uint256 taxSinceBefore = token.taxCollectedSinceLastTransferOf(tokenId_);
        uint256 taxTotalBefore = token.taxationCollected(tokenId_);
        uint256 lastCollectionBefore = token.lastCollectionTimeOf(tokenId_);
        uint256 beneficiaryBalanceBefore = beneficiary.balance;
        uint256 contractBalanceBefore = address(token).balance;

        // OpenZeppelin's legacy `time.increase(elapsed_)` mines the time-jump
        // block, then Hardhat mines the `collectTax` transaction one second
        // later. Model the transaction timestamp, not just the jump block.
        vm.warp(block.timestamp + elapsed_ + 1);
        due = _taxDue(tokenId_, valuation_, block.timestamp - lastCollectionBefore);
        assertGt(due, 0);
        assertLt(due, depositBefore);

        vm.recordLogs();
        token.collectTax(tokenId_);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 2, "tax collection event count");
        _assertCollectionLog(logs[0], tokenId_, due);
        _assertRemittanceLog(logs[1], RemittanceTriggers.TaxCollection, beneficiary, due);

        assertEq(token.depositOf(tokenId_), depositBefore - due);
        assertEq(token.lastCollectionTimeOf(tokenId_), block.timestamp);
        assertEq(token.taxCollectedSinceLastTransferOf(tokenId_), taxSinceBefore + due);
        assertEq(token.taxationCollected(tokenId_), taxTotalBefore + due);
        assertEq(beneficiary.balance, beneficiaryBalanceBefore + due);
        assertEq(address(token).balance, contractBalanceBefore - due);
    }

    function _assertTaxOwedAfter(uint256 tokenId_, uint256 elapsed_) internal {
        uint256 lastCollection = token.lastCollectionTimeOf(tokenId_);
        vm.warp(block.timestamp + elapsed_);

        (uint256 amount, uint256 timestamp) = token.taxOwed(tokenId_);
        uint256 expected = _taxDue(tokenId_, token.valuationOf(tokenId_), timestamp - lastCollection);

        assertEq(timestamp, block.timestamp);
        assertEq(amount, expected);
        assertEq(token.depositOf(tokenId_), ETH2);
        assertEq(token.taxationCollected(tokenId_), 0);
    }

    function _collectForeclosureAndAssert(uint256 tokenId_, address owner_) internal {
        uint256 depositBefore = token.depositOf(tokenId_);
        uint256 beneficiaryBalanceBefore = beneficiary.balance;
        uint256 contractBalanceBefore = address(token).balance;
        uint256 taxTotalBefore = token.taxationCollected(tokenId_);

        assertTrue(token.foreclosed(tokenId_));

        vm.recordLogs();
        token.collectTax(tokenId_);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 6, "foreclosure collection event count");
        _assertCollectionLog(logs[0], tokenId_, depositBefore);
        _assertRemittanceLog(logs[1], RemittanceTriggers.TaxCollection, beneficiary, depositBefore);
        _assertValuationLog(logs[2], tokenId_, 0);
        _assertApprovalLog(logs[3], owner_, address(0), tokenId_);
        _assertTransferLog(logs[4], owner_, address(token), tokenId_);
        _assertForeclosureLog(logs[5], tokenId_, owner_);

        assertEq(token.ownerOf(tokenId_), address(token));
        assertEq(token.valuationOf(tokenId_), 0);
        assertEq(token.depositOf(tokenId_), 0);
        assertEq(token.taxCollectedSinceLastTransferOf(tokenId_), 0);
        assertEq(token.taxationCollected(tokenId_), taxTotalBefore + depositBefore);
        assertEq(beneficiary.balance, beneficiaryBalanceBefore + depositBefore);
        assertEq(address(token).balance, contractBalanceBefore - depositBefore);
    }

    //////////////////////////////
    /// Math and log assertions
    //////////////////////////////

    function _taxDue(uint256 tokenId_, uint256 valuation_, uint256 elapsed_) internal view returns (uint256) {
        return (((valuation_ * elapsed_) / token.collectionFrequencyOf(tokenId_)) * token.taxRateOf(tokenId_))
            / TAX_DENOMINATOR;
    }

    function _assertCloseTo(uint256 actual_, uint256 expected_, uint256 tolerance_) internal {
        if (actual_ >= expected_) {
            assertLe(actual_ - expected_, tolerance_);
        } else {
            assertLe(expected_ - actual_, tolerance_);
        }
    }

    function _assertApprovalLog(Vm.Log memory log_, address owner_, address approved_, uint256 tokenId_)
        internal
    {
        _assertFourTopicLog(
            log_, APPROVAL_SIGNATURE, _addressTopic(owner_), _addressTopic(approved_), bytes32(tokenId_)
        );
    }

    function _assertTransferLog(Vm.Log memory log_, address from_, address to_, uint256 tokenId_) internal {
        _assertFourTopicLog(log_, TRANSFER_SIGNATURE, _addressTopic(from_), _addressTopic(to_), bytes32(tokenId_));
    }

    function _assertCollectionLog(Vm.Log memory log_, uint256 tokenId_, uint256 collected_) internal {
        _assertThreeTopicLog(log_, COLLECTION_SIGNATURE, bytes32(tokenId_), bytes32(collected_));
    }

    function _assertForeclosureLog(Vm.Log memory log_, uint256 tokenId_, address previousOwner_) internal {
        _assertThreeTopicLog(log_, FORECLOSURE_SIGNATURE, bytes32(tokenId_), _addressTopic(previousOwner_));
    }

    function _assertLeaseTakeoverLog(
        Vm.Log memory log_,
        uint256 tokenId_,
        address owner_,
        uint256 valuation_
    ) internal {
        _assertFourTopicLog(
            log_, LEASE_TAKEOVER_SIGNATURE, bytes32(tokenId_), _addressTopic(owner_), bytes32(valuation_)
        );
    }

    function _assertRemittanceLog(
        Vm.Log memory log_,
        RemittanceTriggers trigger_,
        address recipient_,
        uint256 amount_
    ) internal {
        _assertFourTopicLog(
            log_, REMITTANCE_SIGNATURE, bytes32(uint256(trigger_)), _addressTopic(recipient_), bytes32(amount_)
        );
    }

    function _assertValuationLog(Vm.Log memory log_, uint256 tokenId_, uint256 valuation_) internal {
        _assertThreeTopicLog(log_, VALUATION_SIGNATURE, bytes32(tokenId_), bytes32(valuation_));
    }

    function _assertThreeTopicLog(
        Vm.Log memory log_,
        bytes32 signature_,
        bytes32 topicOne_,
        bytes32 topicTwo_
    ) internal {
        assertEq(log_.emitter, address(token));
        assertEq(log_.topics.length, 3);
        assertEq(log_.topics[0], signature_);
        assertEq(log_.topics[1], topicOne_);
        assertEq(log_.topics[2], topicTwo_);
        assertEq(log_.data.length, 0);
    }

    function _assertFourTopicLog(
        Vm.Log memory log_,
        bytes32 signature_,
        bytes32 topicOne_,
        bytes32 topicTwo_,
        bytes32 topicThree_
    ) internal {
        assertEq(log_.emitter, address(token));
        assertEq(log_.topics.length, 4);
        assertEq(log_.topics[0], signature_);
        assertEq(log_.topics[1], topicOne_);
        assertEq(log_.topics[2], topicTwo_);
        assertEq(log_.topics[3], topicThree_);
        assertEq(log_.data.length, 0);
    }

    function _addressTopic(address address_) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(address_)));
    }
}
