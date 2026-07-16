// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {TestPCOToken} from "../../../contracts/test/TestPCOToken.sol";
import {Remittance} from "../../../contracts/token/modules/Remittance.sol";
import {PCOInvariantTargets} from "./PCOInvariantTargets.sol";

/// @dev A stateful actor that can deterministically reject `send`, then accept
/// the one-time outstanding-remittance withdrawal. The assembly path keeps the
/// accepting receive path below the 2,300 gas stipend used by `transfer`.
contract PCOInvariantRemittanceActor {
    bool private _rejectEther = true;

    function setRejectEther(bool rejectEther_) external {
        _rejectEther = rejectEther_;
    }

    function rejectsEther() external view returns (bool) {
        return _rejectEther;
    }

    receive() external payable {
        assembly {
            if sload(0) {
                revert(0, 0)
            }
        }
    }
}

/// @notice Stateful PCO action governor. All inputs are bounded and all actors
/// are known, which keeps liability enumeration exact while still composing
/// acquisitions, tax, foreclosure, exits, and failed remittances.
contract PCOInvariantHandler is Test {
    uint256 private constant TOKEN_COUNT = 3;
    uint256 private constant MIN_VALUATION = 0.01 ether;
    uint256 private constant MAX_VALUATION = 10 ether;
    uint256 private constant MIN_DEPOSIT = 0.01 ether;
    uint256 private constant MAX_DEPOSIT = 10 ether;
    uint256 private constant ACTOR_BALANCE = 1_000_000 ether;

    bytes32 private constant CURRENT_VALUATION_REVERT =
        keccak256(abi.encodeWithSignature("Error(string)", "Current valuation is incorrect"));

    TestPCOToken public immutable token;
    address payable public immutable beneficiary;
    address public immutable alice;
    address public immutable bob;
    address public immutable carol;
    PCOInvariantRemittanceActor public immutable rejectingTaxRecipient;
    PCOInvariantRemittanceActor public immutable rejectingSeller;

    bool public ghostTaxationMonotonic = true;
    bool public ghostTransferTaxReset = true;
    bool public ghostCollectionConserved = true;
    bool public ghostTakeoverLockReleased = true;
    bool public ghostBeneficiaryNoTax = true;
    bool public ghostBeneficiaryTakeoverDepositZero = true;
    bool public ghostOutstandingOneTime = true;

    uint256 public ghostTaxSuccessfullyRemitted;
    uint256 public ghostRejectingTaxWithdrawn;
    uint256 public ghostSuccessfulTakeovers;
    uint256 public ghostFailedTakeovers;
    uint256 public ghostPostLockRevertChecks;
    uint256 public ghostOutstandingWithdrawals;
    uint256 public ghostBeneficiaryChecks;
    uint256 public ghostDirectTransfers;
    uint256 public ghostBeneficiaryDirectTransfers;
    uint256 public ghostBeneficiaryDirectTransfersWithDeposit;

    struct MutationSnapshot {
        address owner;
        uint256 taxation;
        uint256 taxSinceTransfer;
        uint256 rejectingTaxOutstanding;
    }

    constructor(
        TestPCOToken token_,
        address payable beneficiary_,
        address alice_,
        address bob_,
        address carol_,
        PCOInvariantRemittanceActor rejectingTaxRecipient_,
        PCOInvariantRemittanceActor rejectingSeller_
    ) {
        token = token_;
        beneficiary = beneficiary_;
        alice = alice_;
        bob = bob_;
        carol = carol_;
        rejectingTaxRecipient = rejectingTaxRecipient_;
        rejectingSeller = rejectingSeller_;
    }

    //////////////////////////////
    /// Stateful actions
    //////////////////////////////

    function acquireOrTakeover(uint256 tokenSeed_, uint256 buyerSeed_, uint256 valuationSeed_, uint256 depositSeed_)
        external
    {
        uint256 tokenId = _tokenId(tokenSeed_);

        // Pending foreclosure is collected first so beneficiary purchases cannot
        // strand the submitted valuation outside both deposits and liabilities.
        if (token.foreclosed(tokenId)) _collect(tokenId);

        address buyer = _buyer(buyerSeed_);
        address owner = token.ownerOf(tokenId);
        if (buyer == owner) buyer = _nextBuyer(buyer);

        uint256 currentValuation = token.valuationOf(tokenId);
        uint256 newValuation = _range(valuationSeed_, _max(currentValuation, MIN_VALUATION), MAX_VALUATION);
        uint256 desiredDeposit = _range(depositSeed_, MIN_DEPOSIT, MAX_DEPOSIT);
        uint256 value = _takeoverValue(tokenId, buyer, currentValuation, desiredDeposit);

        _takeover(tokenId, buyer, newValuation, currentValuation, value);
    }

    function advanceTime(uint256 secondsSeed_) external {
        vm.warp(block.timestamp + _range(secondsSeed_, 1, 120 days));
    }

    function addDeposit(uint256 tokenSeed_, uint256 amountSeed_) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        address owner = token.ownerOf(tokenId);
        if (owner == address(token) || owner == token.beneficiaryOf(tokenId) || token.foreclosed(tokenId)) {
            _collect(tokenId);
            return;
        }

        uint256 amount = _range(amountSeed_, 1, 2 ether);
        _fund(owner);
        MutationSnapshot memory before = _snapshot(tokenId);
        vm.prank(owner);
        token.deposit{value: amount}(tokenId);
        _accountMutation(tokenId, before);
    }

    function selfAssess(uint256 tokenSeed_, uint256 valuationSeed_) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        address owner = token.ownerOf(tokenId);
        if (owner == address(token) || token.foreclosed(tokenId)) {
            _collect(tokenId);
            return;
        }

        uint256 currentValuation = token.valuationOf(tokenId);
        uint256 newValuation = _range(valuationSeed_, MIN_VALUATION, MAX_VALUATION);
        if (newValuation == currentValuation) {
            newValuation = currentValuation == MAX_VALUATION ? MAX_VALUATION - 1 : currentValuation + 1;
        }

        MutationSnapshot memory before = _snapshot(tokenId);
        vm.prank(owner);
        token.selfAssess(tokenId, newValuation);
        _accountMutation(tokenId, before);
    }

    function collect(uint256 tokenSeed_) external {
        _collect(_tokenId(tokenSeed_));
    }

    function withdrawDeposit(uint256 tokenSeed_, uint256 amountSeed_) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        address owner = token.ownerOf(tokenId);
        if (owner == address(token) || owner == token.beneficiaryOf(tokenId) || token.foreclosed(tokenId)) {
            _collect(tokenId);
            return;
        }

        uint256 withdrawable = token.withdrawableDeposit(tokenId);
        if (withdrawable == 0) {
            _collect(tokenId);
            return;
        }

        uint256 amount = _range(amountSeed_, 1, withdrawable);
        MutationSnapshot memory before = _snapshot(tokenId);
        vm.prank(owner);
        token.withdrawDeposit(tokenId, amount);
        _accountMutation(tokenId, before);
    }

    function exit(uint256 tokenSeed_) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        address owner = token.ownerOf(tokenId);
        if (owner == address(token) || owner == token.beneficiaryOf(tokenId)) {
            _collect(tokenId);
            return;
        }

        MutationSnapshot memory before = _snapshot(tokenId);
        vm.prank(owner);
        token.exit(tokenId);
        _accountMutation(tokenId, before);
    }

    function purchaseForeclosure(uint256 tokenSeed_, uint256 buyerSeed_, uint256 valuationSeed_) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        _ensureOwner(tokenId, alice, 1 ether, 2 ether);

        uint256 foreclosure = token.foreclosureTime(tokenId);
        if (foreclosure >= block.timestamp) vm.warp(foreclosure + 1);

        address buyer = _buyer(buyerSeed_);
        if (buyer == token.ownerOf(tokenId)) buyer = bob;
        if (buyer == token.ownerOf(tokenId)) buyer = carol;
        if (buyer == beneficiary) buyer = bob;

        uint256 currentValuation = token.valuationOf(tokenId);
        uint256 newValuation = _range(valuationSeed_, _max(currentValuation, MIN_VALUATION), MAX_VALUATION);

        _takeover(tokenId, buyer, newValuation, currentValuation, currentValuation + 1 ether);
    }

    function exerciseBeneficiaryOwnership(uint256 tokenSeed_, uint256 valuationSeed_, uint256 secondsSeed_) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        _setBeneficiary(tokenId, beneficiary);
        if (token.foreclosed(tokenId)) _collect(tokenId);

        uint256 currentValuation = token.valuationOf(tokenId);
        uint256 valuation = _range(valuationSeed_, _max(currentValuation, MIN_VALUATION), MAX_VALUATION);
        if (token.ownerOf(tokenId) != beneficiary) {
            uint256 value = token.ownerOf(tokenId) == address(token) ? 0 : currentValuation;
            _takeover(tokenId, beneficiary, valuation, currentValuation, value);
        }

        uint256 taxationBefore = token.taxationCollected(tokenId);
        uint256 depositBefore = token.depositOf(tokenId);
        uint256 collectionTimeBefore = token.lastCollectionTimeOf(tokenId);
        vm.warp(block.timestamp + _range(secondsSeed_, 1, 365 days));
        _collect(tokenId);

        if (
            token.taxationCollected(tokenId) != taxationBefore || token.depositOf(tokenId) != depositBefore
                || token.lastCollectionTimeOf(tokenId) != collectionTimeBefore
        ) ghostBeneficiaryNoTax = false;
        ghostBeneficiaryChecks++;
    }

    /// @notice Exercises the custom ERC721 transfer hook directly. Unlike a
    /// beneficiary takeover, a direct transfer preserves the token's deposit.
    function directTransferToBeneficiary(uint256 tokenSeed_) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        _setBeneficiary(tokenId, beneficiary);
        _ensureOwner(tokenId, alice, 1 ether, 5 ether);
        if (token.ownerOf(tokenId) != alice || token.foreclosed(tokenId)) return;

        MutationSnapshot memory before = _snapshot(tokenId);
        vm.prank(alice);
        token.transferFrom(alice, beneficiary, tokenId);
        _accountMutation(tokenId, before);

        ghostDirectTransfers++;
        if (token.ownerOf(tokenId) == beneficiary) {
            ghostBeneficiaryDirectTransfers++;
            if (token.depositOf(tokenId) > 0) ghostBeneficiaryDirectTransfersWithDeposit++;
        }
    }

    function createRejectingTaxRemittance(uint256 tokenSeed_) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        _setBeneficiary(tokenId, beneficiary);
        _ensureOwner(tokenId, alice, 1 ether, 5 ether);
        _setBeneficiary(tokenId, payable(address(rejectingTaxRecipient)));

        vm.warp(block.timestamp + 1 days);
        _collect(tokenId);

        _setBeneficiary(tokenId, beneficiary);
    }

    function createRejectingSellerRemittance(uint256 tokenSeed_) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        _setBeneficiary(tokenId, beneficiary);
        _ensureOwner(tokenId, address(rejectingSeller), 1 ether, 5 ether);

        vm.warp(block.timestamp + 1 days);
        uint256 currentValuation = token.valuationOf(tokenId);
        _takeover(tokenId, bob, _max(currentValuation, 2 ether), currentValuation, currentValuation + 1 ether);
    }

    function withdrawOutstanding(uint256 recipientSeed_) external {
        PCOInvariantRemittanceActor recipient = recipientSeed_ % 2 == 0 ? rejectingTaxRecipient : rejectingSeller;
        uint256 outstanding = token.outstandingRemittances(address(recipient));
        if (outstanding == 0) return;

        recipient.setRejectEther(false);
        vm.prank(address(recipient));
        (bool success,) = address(token).call(abi.encodeWithSelector(Remittance.withdrawOutstandingRemittance.selector));

        if (!success || token.outstandingRemittances(address(recipient)) != 0) ghostOutstandingOneTime = false;

        if (address(recipient) == address(rejectingTaxRecipient)) {
            ghostRejectingTaxWithdrawn += outstanding;
        }
        ghostOutstandingWithdrawals++;

        vm.prank(address(recipient));
        (bool repeated, bytes memory repeatedData) =
            address(token).call(abi.encodeWithSelector(Remittance.withdrawOutstandingRemittance.selector));
        if (
            repeated
                || keccak256(repeatedData)
                    != keccak256(abi.encodeWithSelector(Remittance.NoOutstandingBalance.selector))
        ) ghostOutstandingOneTime = false;

        recipient.setRejectEther(true);
    }

    function exercisePostLockRevert(uint256 tokenSeed_) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        _setBeneficiary(tokenId, beneficiary);
        _ensureOwner(tokenId, alice, 1 ether, 5 ether);
        _setBeneficiary(tokenId, payable(address(token)));
        vm.warp(block.timestamp + 1 days);

        uint256 currentValuation = token.valuationOf(tokenId);
        (, bytes memory revertData) =
            _takeover(tokenId, bob, _max(currentValuation, 2 ether), currentValuation, currentValuation + 1 ether);

        if (keccak256(revertData) != keccak256(abi.encodeWithSelector(Remittance.DestinationContractAddress.selector)))
        {
            ghostTakeoverLockReleased = false;
        }

        _setBeneficiary(tokenId, beneficiary);
        (bool followupSuccess,) =
            _takeover(tokenId, bob, _max(currentValuation, 2 ether), currentValuation, currentValuation + 1 ether);
        if (!followupSuccess) ghostTakeoverLockReleased = false;
        ghostPostLockRevertChecks++;
    }

    //////////////////////////////
    /// Ghost/accounting helpers
    //////////////////////////////

    function totalDeposits() external view returns (uint256 total) {
        for (uint256 tokenId = 1; tokenId <= TOKEN_COUNT; tokenId++) {
            total += token.depositOf(tokenId);
        }
    }

    function totalOutstandingLiabilities() external view returns (uint256 total) {
        total += token.outstandingRemittances(beneficiary);
        total += token.outstandingRemittances(alice);
        total += token.outstandingRemittances(bob);
        total += token.outstandingRemittances(carol);
        total += token.outstandingRemittances(address(rejectingTaxRecipient));
        total += token.outstandingRemittances(address(rejectingSeller));
    }

    function totalTaxationCollected() external view returns (uint256 total) {
        for (uint256 tokenId = 1; tokenId <= TOKEN_COUNT; tokenId++) {
            total += token.taxationCollected(tokenId);
        }
    }

    function _takeover(
        uint256 tokenId_,
        address buyer_,
        uint256 newValuation_,
        uint256 currentValuation_,
        uint256 value_
    ) internal returns (bool success, bytes memory returnData) {
        _fund(buyer_);
        MutationSnapshot memory before = _snapshot(tokenId_);
        vm.prank(buyer_);
        (success, returnData) = address(token).call{value: value_}(
            abi.encodeWithSelector(token.takeoverLease.selector, tokenId_, newValuation_, currentValuation_)
        );
        _accountMutation(tokenId_, before);

        if (success) {
            ghostSuccessfulTakeovers++;
            if (buyer_ == token.beneficiaryOf(tokenId_) && token.depositOf(tokenId_) != 0) {
                ghostBeneficiaryTakeoverDepositZero = false;
            }
        } else {
            ghostFailedTakeovers++;
        }
        if (!_lockIsReleased(tokenId_)) ghostTakeoverLockReleased = false;
    }

    function _collect(uint256 tokenId_) internal {
        MutationSnapshot memory before = _snapshot(tokenId_);
        token.collectTax(tokenId_);
        _accountMutation(tokenId_, before);
    }

    function _ensureOwner(uint256 tokenId_, address desiredOwner_, uint256 valuation_, uint256 minimumDeposit_)
        internal
    {
        _setBeneficiary(tokenId_, beneficiary);
        if (token.foreclosed(tokenId_)) _collect(tokenId_);

        address owner = token.ownerOf(tokenId_);
        uint256 currentValuation = token.valuationOf(tokenId_);
        if (owner != desiredOwner_) {
            uint256 newValuation = _max(currentValuation, valuation_);
            uint256 value = _takeoverValue(tokenId_, desiredOwner_, currentValuation, minimumDeposit_);
            (bool success,) = _takeover(tokenId_, desiredOwner_, newValuation, currentValuation, value);
            if (!success) return;
        }

        // A beneficiary-owned token keeps its old collection timestamp. A later
        // non-beneficiary purchase can therefore be foreclosed immediately even
        // though the takeover itself succeeds. Materialize that foreclosure and
        // reacquire from contract custody before invoking a modifier-based owner
        // mutation (which would otherwise execute its body after foreclosure).
        if (token.ownerOf(tokenId_) == desiredOwner_ && token.foreclosed(tokenId_)) {
            _collect(tokenId_);
            if (token.ownerOf(tokenId_) == address(token)) {
                (bool reacquired,) = _takeover(tokenId_, desiredOwner_, valuation_, 0, minimumDeposit_);
                if (!reacquired) return;
            }
        }

        if (token.ownerOf(tokenId_) != desiredOwner_ || token.foreclosed(tokenId_)) return;

        if (
            desiredOwner_ != beneficiary && token.ownerOf(tokenId_) == desiredOwner_
                && token.depositOf(tokenId_) < minimumDeposit_
        ) {
            uint256 amount = minimumDeposit_ - token.depositOf(tokenId_);
            _fund(desiredOwner_);
            MutationSnapshot memory before = _snapshot(tokenId_);
            vm.prank(desiredOwner_);
            token.deposit{value: amount}(tokenId_);
            _accountMutation(tokenId_, before);
        }

        if (token.ownerOf(tokenId_) == desiredOwner_ && token.valuationOf(tokenId_) != valuation_) {
            MutationSnapshot memory before = _snapshot(tokenId_);
            vm.prank(desiredOwner_);
            token.selfAssess(tokenId_, valuation_);
            _accountMutation(tokenId_, before);
        }
    }

    function _setBeneficiary(uint256 tokenId_, address payable beneficiary_) internal {
        address current = token.beneficiaryOf(tokenId_);
        if (current == beneficiary_) return;
        vm.prank(current);
        token.setBeneficiary(tokenId_, beneficiary_);
    }

    function _snapshot(uint256 tokenId_) internal view returns (MutationSnapshot memory state) {
        state.owner = token.ownerOf(tokenId_);
        state.taxation = token.taxationCollected(tokenId_);
        state.taxSinceTransfer = token.taxCollectedSinceLastTransferOf(tokenId_);
        state.rejectingTaxOutstanding = token.outstandingRemittances(address(rejectingTaxRecipient));
    }

    function _accountMutation(uint256 tokenId_, MutationSnapshot memory before_) internal {
        uint256 taxationAfter = token.taxationCollected(tokenId_);
        if (taxationAfter < before_.taxation) {
            ghostTaxationMonotonic = false;
            return;
        }

        uint256 collected = taxationAfter - before_.taxation;
        uint256 outstandingAfter = token.outstandingRemittances(address(rejectingTaxRecipient));
        if (outstandingAfter < before_.rejectingTaxOutstanding) {
            ghostCollectionConserved = false;
            return;
        }

        uint256 rejected = outstandingAfter - before_.rejectingTaxOutstanding;
        if (rejected > collected) ghostCollectionConserved = false;
        else ghostTaxSuccessfullyRemitted += collected - rejected;

        uint256 taxSinceTransfer = token.taxCollectedSinceLastTransferOf(tokenId_);
        if (token.ownerOf(tokenId_) != before_.owner) {
            if (taxSinceTransfer != 0) ghostTransferTaxReset = false;
        } else if (taxSinceTransfer != before_.taxSinceTransfer + collected) {
            ghostTransferTaxReset = false;
        }
    }

    function _lockIsReleased(uint256 tokenId_) internal returns (bool) {
        vm.prank(carol);
        (bool success, bytes memory returnData) = address(token)
            .call(abi.encodeWithSelector(token.takeoverLease.selector, tokenId_, MIN_VALUATION, type(uint256).max));
        return !success && keccak256(returnData) == CURRENT_VALUATION_REVERT;
    }

    function _takeoverValue(uint256 tokenId_, address buyer_, uint256 currentValuation_, uint256 desiredDeposit_)
        internal
        view
        returns (uint256)
    {
        bool isBeneficiary = buyer_ == token.beneficiaryOf(tokenId_);
        if (isBeneficiary) {
            return token.ownerOf(tokenId_) == address(token) ? 0 : currentValuation_;
        }
        return token.ownerOf(tokenId_) == address(token) ? desiredDeposit_ : currentValuation_ + desiredDeposit_;
    }

    function _buyer(uint256 seed_) internal view returns (address) {
        uint256 choice = seed_ % 5;
        if (choice == 0) return alice;
        if (choice == 1) return bob;
        if (choice == 2) return carol;
        if (choice == 3) return beneficiary;
        return address(rejectingSeller);
    }

    function _nextBuyer(address buyer_) internal view returns (address) {
        if (buyer_ == alice) return bob;
        if (buyer_ == bob) return carol;
        return alice;
    }

    function _tokenId(uint256 seed_) internal pure returns (uint256) {
        return (seed_ % TOKEN_COUNT) + 1;
    }

    function _range(uint256 seed_, uint256 minimum_, uint256 maximum_) internal pure returns (uint256) {
        if (minimum_ == maximum_) return minimum_;
        return minimum_ + (seed_ % (maximum_ - minimum_ + 1));
    }

    function _max(uint256 a_, uint256 b_) internal pure returns (uint256) {
        return a_ >= b_ ? a_ : b_;
    }

    function _fund(address actor_) internal {
        vm.deal(actor_, ACTOR_BALANCE);
    }
}

contract PCOInvariantTest is Test, PCOInvariantTargets {
    uint256 private constant TOKEN_COUNT = 3;
    uint256 private constant START_TIME = 1_700_000_000;

    TestPCOToken private token;
    PCOInvariantHandler private handler;
    address payable private beneficiary;

    function setUp() public {
        vm.warp(START_TIME);

        beneficiary = payable(makeAddr("invariant-beneficiary"));
        address alice = makeAddr("invariant-alice");
        address bob = makeAddr("invariant-bob");
        address carol = makeAddr("invariant-carol");
        PCOInvariantRemittanceActor rejectingTaxRecipient = new PCOInvariantRemittanceActor();
        PCOInvariantRemittanceActor rejectingSeller = new PCOInvariantRemittanceActor();

        token = new TestPCOToken(beneficiary);
        handler = new PCOInvariantHandler(token, beneficiary, alice, bob, carol, rejectingTaxRecipient, rejectingSeller);

        // Prime every security-critical path once before randomized sequences.
        // `afterInvariant` rechecks these counters at campaign completion so a
        // targeting regression cannot make the suite pass vacuously.
        handler.acquireOrTakeover(0, 0, 1 ether, 2 ether);
        handler.exercisePostLockRevert(0);
        handler.createRejectingTaxRemittance(1);
        handler.withdrawOutstanding(0);
        handler.createRejectingSellerRemittance(2);
        handler.withdrawOutstanding(1);
        handler.exerciseBeneficiaryOwnership(0, 3 ether, 1 days);
        handler.directTransferToBeneficiary(1);
        _assertRequiredPathsReached();

        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](14);
        selectors[0] = handler.acquireOrTakeover.selector;
        selectors[1] = handler.advanceTime.selector;
        selectors[2] = handler.addDeposit.selector;
        selectors[3] = handler.selfAssess.selector;
        selectors[4] = handler.collect.selector;
        selectors[5] = handler.withdrawDeposit.selector;
        selectors[6] = handler.exit.selector;
        selectors[7] = handler.purchaseForeclosure.selector;
        selectors[8] = handler.exerciseBeneficiaryOwnership.selector;
        selectors[9] = handler.createRejectingTaxRemittance.selector;
        selectors[10] = handler.createRejectingSellerRemittance.selector;
        selectors[11] = handler.withdrawOutstanding.selector;
        selectors[12] = handler.exercisePostLockRevert.selector;
        selectors[13] = handler.directTransferToBeneficiary.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function afterInvariant() public {
        _assertRequiredPathsReached();
    }

    /// The contract holds only active deposits and remittances whose push failed.
    function invariant_assetsEqualDepositsPlusOutstandingLiabilities() public {
        assertEq(address(token).balance, handler.totalDeposits() + handler.totalOutstandingLiabilities());
    }

    /// Fully materialized foreclosure is represented by contract custody and
    /// zero valuation/deposit. Pending foreclosure may still have the old owner.
    function invariant_foreclosureCustodyIsConsistent() public {
        for (uint256 tokenId = 1; tokenId <= TOKEN_COUNT; tokenId++) {
            address owner = token.ownerOf(tokenId);
            uint256 valuation = token.valuationOf(tokenId);
            uint256 deposit = token.depositOf(tokenId);

            if (owner == address(token)) {
                assertEq(valuation, 0);
                assertEq(deposit, 0);
                assertEq(token.taxCollectedSinceLastTransferOf(tokenId), 0);
            }
            if (valuation == 0) {
                assertEq(owner, address(token));
                assertEq(deposit, 0);
            }
        }
    }

    /// Beneficiary ownership always owes zero tax. A beneficiary takeover sets
    /// deposit to zero, while a direct ERC721 transfer preserves its deposit.
    function invariant_beneficiaryOwnedTokensRemainTaxFree() public {
        assertTrue(handler.ghostBeneficiaryNoTax());
        assertTrue(handler.ghostBeneficiaryTakeoverDepositZero());
        for (uint256 tokenId = 1; tokenId <= TOKEN_COUNT; tokenId++) {
            if (token.ownerOf(tokenId) == token.beneficiaryOf(tokenId)) {
                (uint256 owed,) = token.taxOwed(tokenId);
                assertEq(owed, 0);
                assertEq(token.taxCollectedSinceLastTransferOf(tokenId), 0);
            }
        }
    }

    function invariant_taxationIsMonotonicAndResetsPerTransfer() public {
        assertTrue(handler.ghostTaxationMonotonic());
        assertTrue(handler.ghostTransferTaxReset());
    }

    /// Every lifetime tax unit was either pushed successfully, is still owed to
    /// the deterministic rejecting beneficiary, or was withdrawn exactly once.
    function invariant_collectionAndRemittanceAreConserved() public {
        uint256 rejectingOutstanding = token.outstandingRemittances(address(handler.rejectingTaxRecipient()));
        assertEq(
            handler.totalTaxationCollected(),
            handler.ghostTaxSuccessfullyRemitted() + rejectingOutstanding + handler.ghostRejectingTaxWithdrawn()
        );
        assertTrue(handler.ghostCollectionConserved());
    }

    function invariant_takeoverLockAlwaysReleases() public {
        assertTrue(handler.ghostTakeoverLockReleased());
    }

    function invariant_outstandingRemittanceIsOneTime() public {
        assertTrue(handler.ghostOutstandingOneTime());
    }

    function _assertRequiredPathsReached() internal {
        assertGt(handler.ghostSuccessfulTakeovers(), 0, "successful takeover not reached");
        assertGt(handler.ghostFailedTakeovers(), 0, "failed takeover not reached");
        assertGt(handler.ghostPostLockRevertChecks(), 0, "post-lock retry not reached");
        assertGt(handler.ghostOutstandingWithdrawals(), 0, "outstanding withdrawal not reached");
        assertGt(handler.ghostBeneficiaryChecks(), 0, "beneficiary tax check not reached");
        assertGt(handler.ghostDirectTransfers(), 0, "direct ERC721 transfer not reached");
        assertGt(handler.ghostBeneficiaryDirectTransfers(), 0, "beneficiary transfer not reached");
        assertGt(handler.ghostBeneficiaryDirectTransfersWithDeposit(), 0, "beneficiary transfer deposit not preserved");
    }
}
