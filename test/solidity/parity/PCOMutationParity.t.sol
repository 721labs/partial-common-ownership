// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {TestPCOToken} from "../../../contracts/test/TestPCOToken.sol";
import {VmRecordedLogs} from "../helpers/VmRecordedLogs.sol";

/* solhint-disable func-name-mixedcase */

/// @notice Deterministic Forge ports of the 31 mutation scenarios in the
/// legacy `tests/PartialCommonOwnership/index.ts` Hardhat oracle.
contract PCOMutationParityTest is Test {
    VmRecordedLogs private constant VM_RECORDED_LOGS =
        VmRecordedLogs(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant START_TIME = 1_700_000_000;
    uint256 private constant INVALID_TOKEN_ID = 999;
    uint256 private constant TOKEN_ONE = 1;
    uint256 private constant TOKEN_TWO = 2;
    uint256 private constant ETH1 = 1 ether;
    uint256 private constant ETH2 = 2 ether;
    uint256 private constant ETH3 = 3 ether;
    uint256 private constant ETH4 = 4 ether;
    uint256 private constant TAX_DENOMINATOR = 1_000_000_000_000;

    uint256 private constant LEASE_TAKEOVER = 0;
    uint256 private constant WITHDRAWN_DEPOSIT = 1;
    uint256 private constant TAX_COLLECTION = 3;

    bytes32 private constant APPROVAL_SIGNATURE = keccak256("Approval(address,address,uint256)");
    bytes32 private constant TRANSFER_SIGNATURE = keccak256("Transfer(address,address,uint256)");
    bytes32 private constant LEASE_TAKEOVER_SIGNATURE = keccak256("LogLeaseTakeover(uint256,address,uint256)");
    bytes32 private constant FORECLOSURE_SIGNATURE = keccak256("LogForeclosure(uint256,address)");
    bytes32 private constant COLLECTION_SIGNATURE = keccak256("LogCollection(uint256,uint256)");
    bytes32 private constant REMITTANCE_SIGNATURE = keccak256("LogRemittance(uint8,address,uint256)");
    bytes32 private constant VALUATION_SIGNATURE = keccak256("LogValuation(uint256,uint256)");

    address payable private beneficiary;
    address private alice;
    address private bob;
    TestPCOToken private token;

    struct TokenState {
        address owner;
        address approved;
        uint256 valuation;
        uint256 deposit;
        uint256 lastCollectionTime;
        uint256 taxationCollected;
        uint256 taxCollectedSinceTransfer;
        uint256 contractEther;
        uint256 ownerEther;
        uint256 callerEther;
        uint256 beneficiaryEther;
        uint256 contractTokens;
        uint256 ownerTokens;
        uint256 callerTokens;
    }

    struct TakeoverContext {
        address seller;
        uint256 depositBefore;
        uint256 due;
        uint256 sellerRemittance;
        uint256 expectedDeposit;
        uint256 taxBefore;
        uint256 buyerEtherBefore;
        uint256 sellerEtherBefore;
        uint256 beneficiaryEtherBefore;
        uint256 contractEtherBefore;
        uint256 buyerTokensBefore;
        uint256 sellerTokensBefore;
        uint256 contractTokensBefore;
    }

    function setUp() public {
        vm.warp(START_TIME);

        beneficiary = payable(makeAddr("beneficiary"));
        alice = makeAddr("alice");
        bob = makeAddr("bob");

        vm.deal(beneficiary, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);

        token = new TestPCOToken(beneficiary);
    }

    //////////////////////////////
    /// takeoverLease failures
    //////////////////////////////

    function test_takeoverLease_fails_ownerCannotPreventForeclosure() public {
        _takeoverFromContract(alice, TOKEN_ONE, ETH1, ETH1);
        uint256 foreclosure = token.foreclosureTime(TOKEN_ONE);
        vm.warp(foreclosure + 1);
        assertTrue(token.foreclosed(TOKEN_ONE));

        _expectTakeoverRevert(alice, TOKEN_ONE, ETH1, ETH1, ETH2, "Buyer is already owner");

        // The failed attempt cannot trigger the pending foreclosure.
        assertEq(token.ownerOf(TOKEN_ONE), alice);
        assertEq(token.valuationOf(TOKEN_ONE), ETH1);
        assertEq(token.depositOf(TOKEN_ONE), ETH1);
        assertTrue(token.foreclosed(TOKEN_ONE));
    }

    function test_takeoverLease_fails_unmintedToken() public {
        uint256 contractBalanceBefore = address(token).balance;
        uint256 aliceBalanceBefore = alice.balance;
        uint256 contractTokensBefore = token.balanceOf(address(token));

        VM_RECORDED_LOGS.recordLogs();
        vm.expectRevert(_error("ERC721: query for nonexistent token"));
        vm.prank(alice);
        token.takeoverLease{value: ETH1}(INVALID_TOKEN_ID, ETH1, ETH1);

        VmRecordedLogs.Log[] memory logs = VM_RECORDED_LOGS.getRecordedLogs();
        assertEq(logs.length, 0);
        assertEq(address(token).balance, contractBalanceBefore);
        assertEq(alice.balance, aliceBalanceBefore);
        assertEq(token.balanceOf(address(token)), contractTokensBefore);
        assertEq(token.valuationOf(INVALID_TOKEN_ID), 0);
    }

    function test_takeoverLease_fails_incorrectCurrentValuation() public {
        _expectTakeoverRevert(alice, TOKEN_ONE, ETH1, ETH1, ETH1, "Current valuation is incorrect");
    }

    function test_takeoverLease_fails_zeroWei() public {
        _expectTakeoverRevert(alice, TOKEN_ONE, 0, 0, 0, "New valuation cannot be zero");
    }

    function test_takeoverLease_fails_purchaseValuationLessThanMessageValue() public {
        _expectTakeoverRevert(alice, TOKEN_ONE, 0, 0, ETH1, "New valuation cannot be zero");
    }

    function test_takeoverLease_fails_valuationBelowCurrent() public {
        _takeoverFromContract(bob, TOKEN_TWO, ETH2, ETH3);
        vm.warp(block.timestamp + 1);

        _expectTakeoverRevert(alice, TOKEN_TWO, ETH1, ETH2, ETH1, "New valuation must be >= current valuation");
    }

    function test_takeoverLease_fails_withoutSurplusValue() public {
        _takeoverFromContract(bob, TOKEN_ONE, ETH1, ETH1);
        vm.warp(block.timestamp + 1);

        _expectTakeoverRevert(alice, TOKEN_ONE, ETH2, ETH1, ETH1, "Message does not contain surplus value for deposit");
    }

    function test_takeoverLease_fails_alreadyOwned() public {
        _takeoverFromContract(bob, TOKEN_TWO, ETH2, ETH3);
        vm.warp(block.timestamp + 1);

        _expectTakeoverRevert(bob, TOKEN_TWO, ETH3, ETH2, ETH4, "Buyer is already owner");
    }

    function test_takeoverLease_fails_beneficiaryValueFromContract() public {
        _expectTakeoverRevert(beneficiary, TOKEN_ONE, ETH1, 0, ETH2, "Msg contains value");
    }

    function test_takeoverLease_fails_beneficiarySurplusFromAlice() public {
        _takeoverFromContract(alice, TOKEN_ONE, ETH1, ETH2);
        vm.warp(block.timestamp + 1);

        _expectTakeoverRevert(beneficiary, TOKEN_ONE, ETH4, ETH1, ETH2, "Msg contains surplus value");
    }

    //////////////////////////////
    /// takeoverLease successes
    //////////////////////////////

    function test_takeoverLease_succeeds_firstPurchaseFromContract() public {
        _takeoverFromContract(alice, TOKEN_ONE, ETH1, ETH2);
    }

    function test_takeoverLease_succeeds_purchaseFromCurrentOwner() public {
        _takeoverFromContract(alice, TOKEN_ONE, ETH1, ETH2);
        vm.warp(block.timestamp + 1);
        _takeoverFromOwner(bob, TOKEN_ONE, ETH2, ETH1, ETH3);
    }

    function test_takeoverLease_succeeds_purchaseFromForeclosure() public {
        _takeoverFromContract(alice, TOKEN_ONE, ETH1, ETH2);
        vm.warp(token.foreclosureTime(TOKEN_ONE) + 1);

        _takeoverWhileForeclosurePending(bob, TOKEN_ONE, ETH1, ETH1, ETH2);
    }

    function test_takeoverLease_succeeds_purchaseFromOwnerAfterForeclosure() public {
        _takeoverFromContract(alice, TOKEN_ONE, ETH1, ETH2);
        vm.warp(token.foreclosureTime(TOKEN_ONE) + 1);
        _collectForeclosure(TOKEN_ONE, alice);

        _takeoverFromContract(bob, TOKEN_ONE, ETH1, ETH2);
        vm.warp(block.timestamp + 1);
        _takeoverFromOwner(alice, TOKEN_ONE, ETH2, ETH1, ETH3);
    }

    function test_takeoverLease_succeeds_priorOwnerRepurchasesAfterForeclosure() public {
        _takeoverFromContract(alice, TOKEN_ONE, ETH1, ETH2);
        vm.warp(token.foreclosureTime(TOKEN_ONE) + 1);
        _collectForeclosure(TOKEN_ONE, alice);

        _takeoverFromContract(alice, TOKEN_ONE, ETH1, ETH2);
    }

    function test_takeoverLease_succeeds_updatesChainOfTitle() public {
        uint256 contractTokensBefore = token.balanceOf(address(token));

        _takeoverFromContract(bob, TOKEN_ONE, ETH1, ETH2);
        uint256 firstTransferTime = token.lastCollectionTimeOf(TOKEN_ONE);
        assertEq(token.ownerOf(TOKEN_ONE), bob);
        assertEq(token.balanceOf(bob), 1);
        assertEq(token.balanceOf(address(token)), contractTokensBefore - 1);

        vm.warp(block.timestamp + 1);
        _takeoverFromOwner(alice, TOKEN_ONE, ETH2, ETH1, ETH3);
        uint256 secondTransferTime = token.lastCollectionTimeOf(TOKEN_ONE);

        assertEq(token.ownerOf(TOKEN_ONE), alice);
        assertEq(token.balanceOf(bob), 0);
        assertEq(token.balanceOf(alice), 1);
        assertEq(token.balanceOf(address(token)), contractTokensBefore - 1);
        assertEq(firstTransferTime, START_TIME);
        assertEq(secondTransferTime, START_TIME + 1);
    }

    function test_takeoverLease_succeeds_beneficiaryPaysNothingFromContract() public {
        uint256 beneficiaryBalanceBefore = beneficiary.balance;
        _takeoverFromContract(beneficiary, TOKEN_ONE, ETH1, 0);

        assertEq(beneficiary.balance, beneficiaryBalanceBefore);
        assertEq(token.depositOf(TOKEN_ONE), 0);
        assertEq(address(token).balance, 0);
    }

    function test_takeoverLease_succeeds_beneficiaryPaysOnlyValuationFromAlice() public {
        _takeoverFromContract(alice, TOKEN_ONE, ETH1, ETH2);
        vm.warp(block.timestamp + 1);
        _takeoverFromOwner(beneficiary, TOKEN_ONE, ETH4, ETH1, ETH1);

        assertEq(token.ownerOf(TOKEN_ONE), beneficiary);
        assertEq(token.depositOf(TOKEN_ONE), 0);
        assertEq(token.valuationOf(TOKEN_ONE), ETH4);
        assertEq(address(token).balance, 0);
    }

    function test_takeoverLease_succeeds_collectsTaxAfterAssertions() public {
        uint256 tenMinuteDeposit = _taxDue(TOKEN_ONE, ETH1, 600);
        _takeoverFromContract(alice, TOKEN_ONE, ETH1, tenMinuteDeposit);

        // Match the legacy regression: assertions see Alice's pre-collection
        // valuation, then tax collection forecloses before Bob receives the token.
        vm.warp(block.timestamp + 600);
        assertTrue(token.foreclosed(TOKEN_ONE));
        _takeoverWhileForeclosurePending(bob, TOKEN_ONE, ETH2, ETH1, ETH2);

        assertEq(token.ownerOf(TOKEN_ONE), bob);
        assertEq(token.valuationOf(TOKEN_ONE), ETH2);
        assertEq(token.depositOf(TOKEN_ONE), ETH2);
    }

    //////////////////////////////
    /// deposit
    //////////////////////////////

    function test_deposit_fails_notDepositedByOwner() public {
        _expectDepositRevert(alice, TOKEN_ONE, ETH1, "ERC721: caller is not owner nor approved");
    }

    function test_deposit_succeeds_ownerCanDeposit() public {
        _takeoverFromContract(alice, TOKEN_ONE, ETH1, ETH2);
        vm.warp(block.timestamp + 1);

        uint256 depositBefore = token.depositOf(TOKEN_ONE);
        uint256 taxBefore = token.taxationCollected(TOKEN_ONE);
        uint256 aliceBalanceBefore = alice.balance;
        uint256 beneficiaryBalanceBefore = beneficiary.balance;
        uint256 due = _taxDue(TOKEN_ONE, ETH1, block.timestamp - token.lastCollectionTimeOf(TOKEN_ONE));

        VM_RECORDED_LOGS.recordLogs();
        vm.prank(alice);
        token.deposit{value: ETH1}(TOKEN_ONE);
        VmRecordedLogs.Log[] memory logs = VM_RECORDED_LOGS.getRecordedLogs();

        assertEq(logs.length, 2);
        _assertCollection(logs[0], TOKEN_ONE, due);
        _assertRemittance(logs[1], TAX_COLLECTION, beneficiary, due);

        assertEq(token.ownerOf(TOKEN_ONE), alice);
        assertEq(token.valuationOf(TOKEN_ONE), ETH1);
        assertEq(token.depositOf(TOKEN_ONE), depositBefore - due + ETH1);
        assertEq(token.lastCollectionTimeOf(TOKEN_ONE), block.timestamp);
        assertEq(token.taxationCollected(TOKEN_ONE), taxBefore + due);
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_ONE), due);
        assertEq(alice.balance, aliceBalanceBefore - ETH1);
        assertEq(beneficiary.balance, beneficiaryBalanceBefore + due);
        assertEq(address(token).balance, token.depositOf(TOKEN_ONE));
    }

    //////////////////////////////
    /// selfAssess
    //////////////////////////////

    function test_selfAssess_fails_onlyOwnerCanUpdateValuation() public {
        _expectSelfAssessRevert(alice, TOKEN_ONE, 500, "ERC721: caller is not owner nor approved");
    }

    function test_selfAssess_fails_newValuationZero() public {
        _takeoverFromContract(alice, TOKEN_ONE, ETH1, ETH2);
        vm.warp(block.timestamp + 1);
        _expectSelfAssessRevert(alice, TOKEN_ONE, 0, "New valuation cannot be zero");
    }

    function test_selfAssess_fails_newValuationSame() public {
        _takeoverFromContract(alice, TOKEN_ONE, ETH1, ETH2);
        vm.warp(block.timestamp + 1);
        _expectSelfAssessRevert(alice, TOKEN_ONE, ETH1, "New valuation cannot be same");
    }

    function test_selfAssess_succeeds_ownerIncreasesValuation() public {
        _takeoverFromContract(alice, TOKEN_ONE, ETH1, ETH2);
        vm.warp(block.timestamp + 1);
        _selfAssess(alice, TOKEN_ONE, ETH2);
    }

    function test_selfAssess_succeeds_ownerDecreasesValuation() public {
        _takeoverFromContract(alice, TOKEN_ONE, ETH2, ETH3);
        vm.warp(block.timestamp + 1);
        _selfAssess(alice, TOKEN_ONE, ETH1);
    }

    //////////////////////////////
    /// withdrawDeposit
    //////////////////////////////

    function test_withdrawDeposit_fails_nonOwner() public {
        _expectWithdrawRevert(alice, TOKEN_ONE, 10, "ERC721: caller is not owner nor approved");
    }

    function test_withdrawDeposit_fails_moreThanDeposited() public {
        _takeoverFromContract(alice, TOKEN_ONE, ETH1, ETH2);
        vm.warp(block.timestamp + 1);
        _expectWithdrawRevert(alice, TOKEN_ONE, ETH2, "Cannot withdraw more than deposited");
    }

    function test_withdrawDeposit_succeeds_expectedAmount() public {
        _takeoverFromContract(alice, TOKEN_ONE, ETH1, ETH3);
        vm.warp(block.timestamp + 1);

        uint256 depositBefore = token.depositOf(TOKEN_ONE);
        uint256 taxBefore = token.taxationCollected(TOKEN_ONE);
        uint256 aliceBalanceBefore = alice.balance;
        uint256 beneficiaryBalanceBefore = beneficiary.balance;
        uint256 due = _taxDue(TOKEN_ONE, ETH1, block.timestamp - token.lastCollectionTimeOf(TOKEN_ONE));

        VM_RECORDED_LOGS.recordLogs();
        vm.prank(alice);
        token.withdrawDeposit(TOKEN_ONE, ETH1);
        VmRecordedLogs.Log[] memory logs = VM_RECORDED_LOGS.getRecordedLogs();

        assertEq(logs.length, 3);
        _assertCollection(logs[0], TOKEN_ONE, due);
        _assertRemittance(logs[1], TAX_COLLECTION, beneficiary, due);
        _assertRemittance(logs[2], WITHDRAWN_DEPOSIT, alice, ETH1);

        assertEq(token.ownerOf(TOKEN_ONE), alice);
        assertEq(token.valuationOf(TOKEN_ONE), ETH1);
        assertEq(token.depositOf(TOKEN_ONE), depositBefore - due - ETH1);
        assertEq(token.lastCollectionTimeOf(TOKEN_ONE), block.timestamp);
        assertEq(token.taxationCollected(TOKEN_ONE), taxBefore + due);
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_ONE), due);
        assertEq(alice.balance, aliceBalanceBefore + ETH1);
        assertEq(beneficiary.balance, beneficiaryBalanceBefore + due);
        assertEq(address(token).balance, token.depositOf(TOKEN_ONE));
    }

    //////////////////////////////
    /// exit
    //////////////////////////////

    function test_exit_fails_nonOwner_legacyCallsWithdrawDeposit() public {
        TokenState memory beforeState = _state(TOKEN_ONE, alice);

        VM_RECORDED_LOGS.recordLogs();
        vm.expectRevert(_error("ERC721: caller is not owner nor approved"));
        vm.prank(alice);
        token.withdrawDeposit(TOKEN_ONE, 10);

        VmRecordedLogs.Log[] memory logs = VM_RECORDED_LOGS.getRecordedLogs();
        assertEq(logs.length, 0);
        _assertStateUnchanged(TOKEN_ONE, alice, beforeState);
    }

    function test_exit_succeeds_withdrawsEntireDeposit() public {
        _takeoverFromContract(alice, TOKEN_ONE, ETH1, ETH2);
        vm.warp(block.timestamp + 1);

        uint256 depositBefore = token.depositOf(TOKEN_ONE);
        uint256 aliceBalanceBefore = alice.balance;
        uint256 beneficiaryBalanceBefore = beneficiary.balance;
        uint256 contractTokensBefore = token.balanceOf(address(token));
        uint256 due = _taxDue(TOKEN_ONE, ETH1, block.timestamp - token.lastCollectionTimeOf(TOKEN_ONE));
        uint256 returnedDeposit = depositBefore - due;

        VM_RECORDED_LOGS.recordLogs();
        vm.prank(alice);
        token.exit(TOKEN_ONE);
        VmRecordedLogs.Log[] memory logs = VM_RECORDED_LOGS.getRecordedLogs();

        assertEq(logs.length, 7);
        _assertCollection(logs[0], TOKEN_ONE, due);
        _assertRemittance(logs[1], TAX_COLLECTION, beneficiary, due);
        _assertRemittance(logs[2], WITHDRAWN_DEPOSIT, alice, returnedDeposit);
        _assertValuation(logs[3], TOKEN_ONE, 0);
        _assertApproval(logs[4], alice, address(0), TOKEN_ONE);
        _assertTransfer(logs[5], alice, address(token), TOKEN_ONE);
        _assertForeclosure(logs[6], TOKEN_ONE, alice);

        assertEq(token.ownerOf(TOKEN_ONE), address(token));
        assertEq(token.valuationOf(TOKEN_ONE), 0);
        assertEq(token.depositOf(TOKEN_ONE), 0);
        assertEq(token.lastCollectionTimeOf(TOKEN_ONE), block.timestamp);
        assertEq(token.taxationCollected(TOKEN_ONE), due);
        assertEq(token.taxCollectedSinceLastTransferOf(TOKEN_ONE), 0);
        assertEq(token.getApproved(TOKEN_ONE), address(0));
        assertEq(token.balanceOf(alice), 0);
        assertEq(token.balanceOf(address(token)), contractTokensBefore + 1);
        assertEq(alice.balance, aliceBalanceBefore + returnedDeposit);
        assertEq(beneficiary.balance, beneficiaryBalanceBefore + due);
        assertEq(address(token).balance, 0);
        assertEq(token.outstandingRemittances(alice), 0);
        assertEq(token.outstandingRemittances(beneficiary), 0);
    }

    //////////////////////////////
    /// Success helpers
    //////////////////////////////

    function _takeoverFromContract(address buyer, uint256 tokenId, uint256 newValuation, uint256 value) internal {
        assertEq(token.ownerOf(tokenId), address(token));
        assertEq(token.valuationOf(tokenId), 0);

        uint256 buyerEtherBefore = buyer.balance;
        uint256 contractEtherBefore = address(token).balance;
        uint256 taxBefore = token.taxationCollected(tokenId);
        uint256 buyerTokensBefore = token.balanceOf(buyer);
        uint256 contractTokensBefore = token.balanceOf(address(token));

        VM_RECORDED_LOGS.recordLogs();
        vm.prank(buyer);
        token.takeoverLease{value: value}(tokenId, newValuation, 0);
        VmRecordedLogs.Log[] memory logs = VM_RECORDED_LOGS.getRecordedLogs();

        assertEq(logs.length, 4);
        _assertValuation(logs[0], tokenId, newValuation);
        _assertApproval(logs[1], address(token), address(0), tokenId);
        _assertTransfer(logs[2], address(token), buyer, tokenId);
        _assertLeaseTakeover(logs[3], tokenId, buyer, newValuation);

        uint256 expectedDeposit = buyer == beneficiary ? 0 : value;
        assertEq(token.ownerOf(tokenId), buyer);
        assertEq(token.valuationOf(tokenId), newValuation);
        assertEq(token.depositOf(tokenId), expectedDeposit);
        assertEq(token.lastCollectionTimeOf(tokenId), block.timestamp);
        assertEq(token.taxationCollected(tokenId), taxBefore);
        assertEq(token.taxCollectedSinceLastTransferOf(tokenId), 0);
        assertEq(token.getApproved(tokenId), address(0));
        assertEq(buyer.balance, buyerEtherBefore - value);
        assertEq(address(token).balance, contractEtherBefore + expectedDeposit);
        assertEq(token.balanceOf(buyer), buyerTokensBefore + 1);
        assertEq(token.balanceOf(address(token)), contractTokensBefore - 1);
        assertEq(token.outstandingRemittances(buyer), 0);
    }

    function _takeoverFromOwner(
        address buyer,
        uint256 tokenId,
        uint256 newValuation,
        uint256 currentValuation,
        uint256 value
    ) internal {
        TakeoverContext memory context;
        context.seller = token.ownerOf(tokenId);
        assertTrue(context.seller != address(token));
        assertTrue(context.seller != buyer);

        context.depositBefore = token.depositOf(tokenId);
        context.due = _taxDue(tokenId, currentValuation, block.timestamp - token.lastCollectionTimeOf(tokenId));
        context.sellerRemittance = currentValuation + context.depositBefore - context.due;
        context.expectedDeposit = buyer == beneficiary ? 0 : value - currentValuation;
        context.taxBefore = token.taxationCollected(tokenId);
        context.buyerEtherBefore = buyer.balance;
        context.sellerEtherBefore = context.seller.balance;
        context.beneficiaryEtherBefore = beneficiary.balance;
        context.contractEtherBefore = address(token).balance;
        context.buyerTokensBefore = token.balanceOf(buyer);
        context.sellerTokensBefore = token.balanceOf(context.seller);
        context.contractTokensBefore = token.balanceOf(address(token));

        assertTrue(context.due > 0);
        VM_RECORDED_LOGS.recordLogs();
        vm.prank(buyer);
        token.takeoverLease{value: value}(tokenId, newValuation, currentValuation);
        VmRecordedLogs.Log[] memory logs = VM_RECORDED_LOGS.getRecordedLogs();

        assertEq(logs.length, 7);
        _assertCollection(logs[0], tokenId, context.due);
        _assertRemittance(logs[1], TAX_COLLECTION, beneficiary, context.due);
        _assertRemittance(logs[2], LEASE_TAKEOVER, context.seller, context.sellerRemittance);
        _assertValuation(logs[3], tokenId, newValuation);
        _assertApproval(logs[4], context.seller, address(0), tokenId);
        _assertTransfer(logs[5], context.seller, buyer, tokenId);
        _assertLeaseTakeover(logs[6], tokenId, buyer, newValuation);

        assertEq(token.ownerOf(tokenId), buyer);
        assertEq(token.valuationOf(tokenId), newValuation);
        assertEq(token.depositOf(tokenId), context.expectedDeposit);
        assertEq(token.lastCollectionTimeOf(tokenId), block.timestamp);
        assertEq(token.taxationCollected(tokenId), context.taxBefore + context.due);
        assertEq(token.taxCollectedSinceLastTransferOf(tokenId), 0);
        assertEq(token.getApproved(tokenId), address(0));
        assertEq(context.seller.balance, context.sellerEtherBefore + context.sellerRemittance);
        if (buyer == beneficiary) {
            assertEq(buyer.balance, context.buyerEtherBefore - value + context.due);
        } else {
            assertEq(buyer.balance, context.buyerEtherBefore - value);
            assertEq(beneficiary.balance, context.beneficiaryEtherBefore + context.due);
        }
        assertEq(address(token).balance, context.contractEtherBefore + value - context.due - context.sellerRemittance);
        assertEq(address(token).balance, context.expectedDeposit);
        assertEq(token.balanceOf(buyer), context.buyerTokensBefore + 1);
        assertEq(token.balanceOf(context.seller), context.sellerTokensBefore - 1);
        assertEq(token.balanceOf(address(token)), context.contractTokensBefore);
        assertEq(token.outstandingRemittances(context.seller), 0);
        assertEq(token.outstandingRemittances(beneficiary), 0);
    }

    function _takeoverWhileForeclosurePending(
        address buyer,
        uint256 tokenId,
        uint256 newValuation,
        uint256 currentValuation,
        uint256 value
    ) internal {
        TakeoverContext memory context;
        context.seller = token.ownerOf(tokenId);
        context.depositBefore = token.depositOf(tokenId);
        context.buyerEtherBefore = buyer.balance;
        context.sellerEtherBefore = context.seller.balance;
        context.beneficiaryEtherBefore = beneficiary.balance;
        context.contractEtherBefore = address(token).balance;
        context.taxBefore = token.taxationCollected(tokenId);
        context.buyerTokensBefore = token.balanceOf(buyer);
        context.sellerTokensBefore = token.balanceOf(context.seller);
        context.contractTokensBefore = token.balanceOf(address(token));

        assertTrue(token.foreclosed(tokenId));
        assertTrue(context.seller != buyer);

        VM_RECORDED_LOGS.recordLogs();
        vm.prank(buyer);
        token.takeoverLease{value: value}(tokenId, newValuation, currentValuation);
        VmRecordedLogs.Log[] memory logs = VM_RECORDED_LOGS.getRecordedLogs();

        assertEq(logs.length, 10);
        _assertCollection(logs[0], tokenId, context.depositBefore);
        _assertRemittance(logs[1], TAX_COLLECTION, beneficiary, context.depositBefore);
        _assertValuation(logs[2], tokenId, 0);
        _assertApproval(logs[3], context.seller, address(0), tokenId);
        _assertTransfer(logs[4], context.seller, address(token), tokenId);
        _assertForeclosure(logs[5], tokenId, context.seller);
        _assertValuation(logs[6], tokenId, newValuation);
        _assertApproval(logs[7], address(token), address(0), tokenId);
        _assertTransfer(logs[8], address(token), buyer, tokenId);
        _assertLeaseTakeover(logs[9], tokenId, buyer, newValuation);

        assertEq(token.ownerOf(tokenId), buyer);
        assertEq(token.valuationOf(tokenId), newValuation);
        assertEq(token.depositOf(tokenId), value);
        assertEq(token.lastCollectionTimeOf(tokenId), block.timestamp);
        assertEq(token.taxationCollected(tokenId), context.taxBefore + context.depositBefore);
        assertEq(token.taxCollectedSinceLastTransferOf(tokenId), 0);
        assertEq(token.getApproved(tokenId), address(0));
        assertEq(buyer.balance, context.buyerEtherBefore - value);
        assertEq(context.seller.balance, context.sellerEtherBefore);
        assertEq(beneficiary.balance, context.beneficiaryEtherBefore + context.depositBefore);
        assertEq(address(token).balance, context.contractEtherBefore + value - context.depositBefore);
        assertEq(address(token).balance, value);
        assertEq(token.balanceOf(buyer), context.buyerTokensBefore + 1);
        assertEq(token.balanceOf(context.seller), context.sellerTokensBefore - 1);
        assertEq(token.balanceOf(address(token)), context.contractTokensBefore);
        assertEq(token.outstandingRemittances(context.seller), 0);
        assertEq(token.outstandingRemittances(beneficiary), 0);
    }

    function _collectForeclosure(uint256 tokenId, address expectedOwner) internal {
        uint256 depositBefore = token.depositOf(tokenId);
        uint256 elapsed = block.timestamp - token.lastCollectionTimeOf(tokenId);
        (uint256 owed,) = token.taxOwed(tokenId);
        uint256 expectedBackdated = token.lastCollectionTimeOf(tokenId) + ((elapsed * depositBefore) / owed);
        uint256 beneficiaryBalanceBefore = beneficiary.balance;
        uint256 ownerBalanceBefore = expectedOwner.balance;
        uint256 contractTokensBefore = token.balanceOf(address(token));
        uint256 ownerTokensBefore = token.balanceOf(expectedOwner);

        assertTrue(token.foreclosed(tokenId));
        VM_RECORDED_LOGS.recordLogs();
        token.collectTax(tokenId);
        VmRecordedLogs.Log[] memory logs = VM_RECORDED_LOGS.getRecordedLogs();

        assertEq(logs.length, 6);
        _assertCollection(logs[0], tokenId, depositBefore);
        _assertRemittance(logs[1], TAX_COLLECTION, beneficiary, depositBefore);
        _assertValuation(logs[2], tokenId, 0);
        _assertApproval(logs[3], expectedOwner, address(0), tokenId);
        _assertTransfer(logs[4], expectedOwner, address(token), tokenId);
        _assertForeclosure(logs[5], tokenId, expectedOwner);

        assertEq(token.ownerOf(tokenId), address(token));
        assertEq(token.valuationOf(tokenId), 0);
        assertEq(token.depositOf(tokenId), 0);
        assertEq(token.lastCollectionTimeOf(tokenId), expectedBackdated);
        assertEq(token.taxationCollected(tokenId), depositBefore);
        assertEq(token.taxCollectedSinceLastTransferOf(tokenId), 0);
        assertEq(address(token).balance, 0);
        assertEq(beneficiary.balance, beneficiaryBalanceBefore + depositBefore);
        assertEq(expectedOwner.balance, ownerBalanceBefore);
        assertEq(token.balanceOf(address(token)), contractTokensBefore + 1);
        assertEq(token.balanceOf(expectedOwner), ownerTokensBefore - 1);
    }

    function _selfAssess(address owner, uint256 tokenId, uint256 newValuation) internal {
        uint256 currentValuation = token.valuationOf(tokenId);
        uint256 depositBefore = token.depositOf(tokenId);
        uint256 due = _taxDue(tokenId, currentValuation, block.timestamp - token.lastCollectionTimeOf(tokenId));
        uint256 taxBefore = token.taxationCollected(tokenId);
        uint256 ownerBalanceBefore = owner.balance;
        uint256 beneficiaryBalanceBefore = beneficiary.balance;

        VM_RECORDED_LOGS.recordLogs();
        vm.prank(owner);
        token.selfAssess(tokenId, newValuation);
        VmRecordedLogs.Log[] memory logs = VM_RECORDED_LOGS.getRecordedLogs();

        assertEq(logs.length, 3);
        _assertCollection(logs[0], tokenId, due);
        _assertRemittance(logs[1], TAX_COLLECTION, beneficiary, due);
        _assertValuation(logs[2], tokenId, newValuation);

        assertEq(token.ownerOf(tokenId), owner);
        assertEq(token.valuationOf(tokenId), newValuation);
        assertEq(token.depositOf(tokenId), depositBefore - due);
        assertEq(token.lastCollectionTimeOf(tokenId), block.timestamp);
        assertEq(token.taxationCollected(tokenId), taxBefore + due);
        assertEq(token.taxCollectedSinceLastTransferOf(tokenId), due);
        assertEq(owner.balance, ownerBalanceBefore);
        assertEq(beneficiary.balance, beneficiaryBalanceBefore + due);
        assertEq(address(token).balance, token.depositOf(tokenId));
    }

    //////////////////////////////
    /// Revert helpers
    //////////////////////////////

    function _expectTakeoverRevert(
        address caller,
        uint256 tokenId,
        uint256 newValuation,
        uint256 currentValuation,
        uint256 value,
        string memory reason
    ) internal {
        TokenState memory beforeState = _state(tokenId, caller);

        VM_RECORDED_LOGS.recordLogs();
        vm.expectRevert(_error(reason));
        vm.prank(caller);
        token.takeoverLease{value: value}(tokenId, newValuation, currentValuation);

        VmRecordedLogs.Log[] memory logs = VM_RECORDED_LOGS.getRecordedLogs();
        assertEq(logs.length, 0);
        _assertStateUnchanged(tokenId, caller, beforeState);
    }

    function _expectDepositRevert(address caller, uint256 tokenId, uint256 value, string memory reason) internal {
        TokenState memory beforeState = _state(tokenId, caller);

        VM_RECORDED_LOGS.recordLogs();
        vm.expectRevert(_error(reason));
        vm.prank(caller);
        token.deposit{value: value}(tokenId);

        VmRecordedLogs.Log[] memory logs = VM_RECORDED_LOGS.getRecordedLogs();
        assertEq(logs.length, 0);
        _assertStateUnchanged(tokenId, caller, beforeState);
    }

    /// @dev `recordLogs` observes logs from a reverted sub-context even though
    /// they are absent from the transaction receipt. Assert their transient
    /// order, then `_assertStateUnchanged` proves the whole collection rolled
    /// back with the failed mutation.
    function _assertRolledBackCollectionLogs(
        uint256 tokenId,
        address caller,
        TokenState memory beforeState,
        VmRecordedLogs.Log[] memory logs
    ) internal {
        if (
            caller == beforeState.owner && beforeState.valuation > 0 && block.timestamp > beforeState.lastCollectionTime
        ) {
            uint256 due = _taxDue(tokenId, beforeState.valuation, block.timestamp - beforeState.lastCollectionTime);
            if (due > 0) {
                assertEq(logs.length, 2);
                _assertCollection(logs[0], tokenId, due);
                _assertRemittance(logs[1], TAX_COLLECTION, beneficiary, due);
                return;
            }
        }
        assertEq(logs.length, 0);
    }

    function _expectSelfAssessRevert(address caller, uint256 tokenId, uint256 newValuation, string memory reason)
        internal
    {
        TokenState memory beforeState = _state(tokenId, caller);

        VM_RECORDED_LOGS.recordLogs();
        vm.expectRevert(_error(reason));
        vm.prank(caller);
        token.selfAssess(tokenId, newValuation);

        VmRecordedLogs.Log[] memory logs = VM_RECORDED_LOGS.getRecordedLogs();
        _assertRolledBackCollectionLogs(tokenId, caller, beforeState, logs);
        _assertStateUnchanged(tokenId, caller, beforeState);
    }

    function _expectWithdrawRevert(address caller, uint256 tokenId, uint256 amount, string memory reason) internal {
        TokenState memory beforeState = _state(tokenId, caller);

        VM_RECORDED_LOGS.recordLogs();
        vm.expectRevert(_error(reason));
        vm.prank(caller);
        token.withdrawDeposit(tokenId, amount);

        VmRecordedLogs.Log[] memory logs = VM_RECORDED_LOGS.getRecordedLogs();
        _assertRolledBackCollectionLogs(tokenId, caller, beforeState, logs);
        _assertStateUnchanged(tokenId, caller, beforeState);
    }

    //////////////////////////////
    /// State and event assertions
    //////////////////////////////

    function _state(uint256 tokenId, address caller) internal view returns (TokenState memory state) {
        state.owner = token.ownerOf(tokenId);
        state.approved = token.getApproved(tokenId);
        state.valuation = token.valuationOf(tokenId);
        state.deposit = token.depositOf(tokenId);
        state.lastCollectionTime = token.lastCollectionTimeOf(tokenId);
        state.taxationCollected = token.taxationCollected(tokenId);
        state.taxCollectedSinceTransfer = token.taxCollectedSinceLastTransferOf(tokenId);
        state.contractEther = address(token).balance;
        state.ownerEther = state.owner.balance;
        state.callerEther = caller.balance;
        state.beneficiaryEther = beneficiary.balance;
        state.contractTokens = token.balanceOf(address(token));
        state.ownerTokens = token.balanceOf(state.owner);
        state.callerTokens = token.balanceOf(caller);
    }

    function _assertStateUnchanged(uint256 tokenId, address caller, TokenState memory beforeState) internal {
        assertEq(token.ownerOf(tokenId), beforeState.owner);
        assertEq(token.getApproved(tokenId), beforeState.approved);
        assertEq(token.valuationOf(tokenId), beforeState.valuation);
        assertEq(token.depositOf(tokenId), beforeState.deposit);
        assertEq(token.lastCollectionTimeOf(tokenId), beforeState.lastCollectionTime);
        assertEq(token.taxationCollected(tokenId), beforeState.taxationCollected);
        assertEq(token.taxCollectedSinceLastTransferOf(tokenId), beforeState.taxCollectedSinceTransfer);
        assertEq(address(token).balance, beforeState.contractEther);
        assertEq(beforeState.owner.balance, beforeState.ownerEther);
        assertEq(caller.balance, beforeState.callerEther);
        assertEq(beneficiary.balance, beforeState.beneficiaryEther);
        assertEq(token.balanceOf(address(token)), beforeState.contractTokens);
        assertEq(token.balanceOf(beforeState.owner), beforeState.ownerTokens);
        assertEq(token.balanceOf(caller), beforeState.callerTokens);
    }

    function _taxDue(uint256 tokenId, uint256 valuation, uint256 elapsed) internal view returns (uint256) {
        return
            (((valuation * elapsed) / token.collectionFrequencyOf(tokenId)) * token.taxRateOf(tokenId))
                / TAX_DENOMINATOR;
    }

    function _error(string memory reason) internal pure returns (bytes memory) {
        return abi.encodeWithSignature("Error(string)", reason);
    }

    function _assertApproval(VmRecordedLogs.Log memory entry, address owner, address approved, uint256 tokenId)
        internal
    {
        _assertLogHeader(entry, APPROVAL_SIGNATURE, 4);
        assertEq(entry.topics[1], _addressTopic(owner));
        assertEq(entry.topics[2], _addressTopic(approved));
        assertEq(entry.topics[3], bytes32(tokenId));
    }

    function _assertTransfer(VmRecordedLogs.Log memory entry, address from, address to, uint256 tokenId) internal {
        _assertLogHeader(entry, TRANSFER_SIGNATURE, 4);
        assertEq(entry.topics[1], _addressTopic(from));
        assertEq(entry.topics[2], _addressTopic(to));
        assertEq(entry.topics[3], bytes32(tokenId));
    }

    function _assertLeaseTakeover(VmRecordedLogs.Log memory entry, uint256 tokenId, address owner, uint256 newValuation)
        internal
    {
        _assertLogHeader(entry, LEASE_TAKEOVER_SIGNATURE, 4);
        assertEq(entry.topics[1], bytes32(tokenId));
        assertEq(entry.topics[2], _addressTopic(owner));
        assertEq(entry.topics[3], bytes32(newValuation));
    }

    function _assertForeclosure(VmRecordedLogs.Log memory entry, uint256 tokenId, address previousOwner) internal {
        _assertLogHeader(entry, FORECLOSURE_SIGNATURE, 3);
        assertEq(entry.topics[1], bytes32(tokenId));
        assertEq(entry.topics[2], _addressTopic(previousOwner));
    }

    function _assertCollection(VmRecordedLogs.Log memory entry, uint256 tokenId, uint256 collected) internal {
        _assertLogHeader(entry, COLLECTION_SIGNATURE, 3);
        assertEq(entry.topics[1], bytes32(tokenId));
        assertEq(entry.topics[2], bytes32(collected));
    }

    function _assertRemittance(VmRecordedLogs.Log memory entry, uint256 trigger, address recipient, uint256 amount)
        internal
    {
        _assertLogHeader(entry, REMITTANCE_SIGNATURE, 4);
        assertEq(entry.topics[1], bytes32(trigger));
        assertEq(entry.topics[2], _addressTopic(recipient));
        assertEq(entry.topics[3], bytes32(amount));
    }

    function _assertValuation(VmRecordedLogs.Log memory entry, uint256 tokenId, uint256 valuation) internal {
        _assertLogHeader(entry, VALUATION_SIGNATURE, 3);
        assertEq(entry.topics[1], bytes32(tokenId));
        assertEq(entry.topics[2], bytes32(valuation));
    }

    function _assertLogHeader(VmRecordedLogs.Log memory entry, bytes32 signature, uint256 topicCount) internal {
        assertEq(entry.emitter, address(token));
        assertEq(entry.topics.length, topicCount);
        assertEq(entry.topics[0], signature);
        assertEq(entry.data.length, 0);
    }

    function _addressTopic(address value) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(value)));
    }
}
