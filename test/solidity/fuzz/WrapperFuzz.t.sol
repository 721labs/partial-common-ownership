// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {Test} from "forge-std/Test.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {TestNFT} from "../../../contracts/test/TestNFT.sol";
import {TestWrapper} from "../../../contracts/test/TestWrapper.sol";

contract WrapperFuzzValidReceiver is IERC721Receiver {
    receive() external payable {}

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}

contract WrapperFuzzWrongReceiver is IERC721Receiver {
    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return bytes4(0);
    }
}

/// @dev Bounded Wrapper fuzzing keeps arithmetic beneath overflow thresholds
/// while covering every input field and the beneficiary/operator role split.
contract WrapperFuzzTest is Test {
    uint256 private constant TOKEN_COUNT = 3;
    uint256 private constant MAX_VALUATION = 100 ether;
    uint256 private constant MAX_DEPOSIT = 100 ether;
    uint256 private constant MAX_TAX_RATE = 1_000_000_000_000;
    uint256 private constant MAX_FREQUENCY_DAYS = 3650;
    uint256 private constant TEST_TIMESTAMP = 1_700_000_000;

    uint256 private constant OWNERS_SLOT = 0;
    uint256 private constant TOKEN_APPROVALS_SLOT = 2;
    uint256 private constant VALUATIONS_SLOT = 4;
    uint256 private constant BENEFICIARIES_SLOT = 6;
    uint256 private constant TAX_RATES_SLOT = 9;
    uint256 private constant COLLECTION_FREQUENCIES_SLOT = 10;
    uint256 private constant DEPOSITS_SLOT = 12;
    uint256 private constant LOCKED_SLOT = 13;
    uint256 private constant WRAPPED_TOKEN_MAP_SLOT = 14;

    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);
    address private constant CAROL = address(0xCA901);

    TestNFT private underlying;
    TestWrapper private wrapper;

    function setUp() public {
        vm.warp(TEST_TIMESTAMP);
        vm.deal(ALICE, 10_000 ether);
        vm.deal(BOB, 10_000 ether);
        vm.deal(CAROL, 10_000 ether);

        vm.startPrank(ALICE);
        underlying = new TestNFT();
        wrapper = new TestWrapper();
        vm.stopPrank();
    }

    function testFuzz_wrappedTokenIdIsCanonical(address tokenContract_, uint256 underlyingId_) public {
        assertEq(
            wrapper.wrappedTokenId(tokenContract_, underlyingId_),
            uint256(keccak256(abi.encode(tokenContract_, underlyingId_)))
        );
    }

    function testFuzz_wrapAcceptsBoundedConfigurationAndCustodiesUnderlying(
        uint256 tokenSeed_,
        uint256 beneficiarySeed_,
        uint256 valuationSeed_,
        uint256 taxRateSeed_,
        uint256 frequencySeed_,
        uint256 depositSeed_
    ) public {
        uint256 tokenId = _tokenId(tokenSeed_);
        address beneficiary = _beneficiary(beneficiarySeed_);
        uint256 valuation = bound(valuationSeed_, 1, MAX_VALUATION);
        uint256 taxRate = bound(taxRateSeed_, 1, MAX_TAX_RATE);
        uint256 frequencyDays = bound(frequencySeed_, 1, MAX_FREQUENCY_DAYS);
        uint256 deposit = beneficiary == ALICE ? 0 : bound(depositSeed_, 1, MAX_DEPOSIT);
        uint256 wrappedId = wrapper.wrappedTokenId(address(underlying), tokenId);

        vm.startPrank(ALICE);
        underlying.approve(address(wrapper), tokenId);
        wrapper.wrap{value: deposit}(
            address(underlying), tokenId, valuation, payable(beneficiary), taxRate, frequencyDays
        );
        vm.stopPrank();

        assertEq(underlying.ownerOf(tokenId), address(wrapper));
        assertEq(wrapper.ownerOf(wrappedId), ALICE);
        assertEq(wrapper.valuationOf(wrappedId), valuation);
        assertEq(wrapper.depositOf(wrappedId), deposit);
        assertEq(wrapper.beneficiaryOf(wrappedId), beneficiary);
        assertEq(wrapper.taxRateOf(wrappedId), taxRate);
        assertEq(wrapper.collectionFrequencyOf(wrappedId), frequencyDays * 1 days);
        assertEq(address(wrapper).balance, deposit);

        bytes32 baseSlot = _mappingSlot(wrappedId, WRAPPED_TOKEN_MAP_SLOT);
        assertEq(address(uint160(uint256(vm.load(address(wrapper), baseSlot)))), address(underlying));
        assertEq(uint256(vm.load(address(wrapper), _offsetSlot(baseSlot, 1))), tokenId);
        assertEq(address(uint160(uint256(vm.load(address(wrapper), _offsetSlot(baseSlot, 2))))), ALICE);
    }

    function testFuzz_invalidWrapInputsRevertWithoutChangingCustodyOrWrapperState(
        uint256 tokenSeed_,
        uint256 invalidSeed_
    ) public {
        uint256 tokenId = _tokenId(tokenSeed_);
        uint256 wrappedId = wrapper.wrappedTokenId(address(underlying), tokenId);
        uint256 invalid = invalidSeed_ % 6;

        uint256 valuation = 1 ether;
        address payable beneficiary = payable(ALICE);
        uint256 taxRate = 50_000_000_000;
        uint256 frequencyDays = 365;
        uint256 value;

        if (invalid == 0) valuation = 0;
        if (invalid == 1) beneficiary = payable(address(0));
        if (invalid == 2) taxRate = 0;
        if (invalid == 3) frequencyDays = 0;
        if (invalid == 4) value = 1;
        if (invalid == 5) beneficiary = payable(BOB);

        vm.prank(ALICE);
        underlying.approve(address(wrapper), tokenId);

        uint256 aliceBalanceBefore = ALICE.balance;
        uint256 wrapperBalanceBefore = address(wrapper).balance;
        address approvalBefore = underlying.getApproved(tokenId);

        vm.prank(ALICE);
        (bool success,) = address(wrapper).call{value: value}(
            abi.encodeWithSelector(
                wrapper.wrap.selector, address(underlying), tokenId, valuation, beneficiary, taxRate, frequencyDays
            )
        );

        assertFalse(success);
        assertEq(underlying.ownerOf(tokenId), ALICE);
        assertEq(underlying.getApproved(tokenId), approvalBefore);
        assertEq(ALICE.balance, aliceBalanceBefore);
        assertEq(address(wrapper).balance, wrapperBalanceBefore);
        _assertBurnedAndCleared(wrappedId);
    }

    function testFuzz_takeoverAndOriginatorUnwrapDeliversUnderlyingToFinalOwner(
        uint256 tokenSeed_,
        uint256 initialValuationSeed_,
        uint256 newValuationSeed_,
        uint256 taxRateSeed_,
        uint256 frequencySeed_,
        uint256 buyerDepositSeed_,
        bool buyerIsBob_
    ) public {
        uint256 tokenId = _tokenId(tokenSeed_);
        uint256 initialValuation = bound(initialValuationSeed_, 1, MAX_VALUATION);
        uint256 increase = bound(newValuationSeed_, 0, MAX_VALUATION);
        uint256 newValuation = initialValuation + increase;
        uint256 taxRate = bound(taxRateSeed_, 1, MAX_TAX_RATE);
        uint256 frequencyDays = bound(frequencySeed_, 1, MAX_FREQUENCY_DAYS);
        uint256 buyerDeposit = bound(buyerDepositSeed_, 1, MAX_DEPOSIT);
        address buyer = buyerIsBob_ ? BOB : CAROL;
        uint256 wrappedId = _wrapAsAlice(tokenId, initialValuation, ALICE, taxRate, frequencyDays, 0);

        vm.prank(buyer);
        wrapper.takeoverLease{value: initialValuation + buyerDeposit}(wrappedId, newValuation, initialValuation);

        assertEq(wrapper.ownerOf(wrappedId), buyer);
        assertEq(wrapper.valuationOf(wrappedId), newValuation);
        assertEq(wrapper.depositOf(wrappedId), buyerDeposit);

        vm.prank(buyer);
        (bool nonOriginatorSuccess,) = address(wrapper).call(abi.encodeWithSelector(wrapper.unwrap.selector, wrappedId));
        assertFalse(nonOriginatorSuccess);
        assertEq(wrapper.ownerOf(wrappedId), buyer);
        assertEq(underlying.ownerOf(tokenId), address(wrapper));

        vm.prank(ALICE);
        wrapper.unwrap(wrappedId);

        assertEq(underlying.ownerOf(tokenId), buyer);
        _assertBurnedAndCleared(wrappedId);
        assertEq(vm.load(address(wrapper), _mappingSlot(wrappedId, LOCKED_SLOT)), bytes32(0));
    }

    function testFuzz_wrappedSafeTransferHonorsReceiverAndPreservesStateOnRejection(
        uint256 tokenSeed_,
        bool validReceiver_
    ) public {
        uint256 tokenId = _tokenId(tokenSeed_);
        // Keep a non-zero deposit so moving the token away from its beneficiary
        // remains solvent when the transfer hook collects tax.
        uint256 wrappedId = _wrapAsAlice(tokenId, 1 ether, BOB, 1, MAX_FREQUENCY_DAYS, MAX_DEPOSIT);
        address receiver =
            validReceiver_ ? address(new WrapperFuzzValidReceiver()) : address(new WrapperFuzzWrongReceiver());

        vm.prank(ALICE);
        (bool success,) = address(wrapper)
            .call(abi.encodeWithSignature("safeTransferFrom(address,address,uint256)", ALICE, receiver, wrappedId));

        assertEq(success, validReceiver_);
        assertEq(wrapper.ownerOf(wrappedId), validReceiver_ ? receiver : ALICE);
        assertEq(underlying.ownerOf(tokenId), address(wrapper));

        vm.prank(ALICE);
        wrapper.unwrap(wrappedId);

        assertEq(underlying.ownerOf(tokenId), validReceiver_ ? receiver : ALICE);
        _assertBurnedAndCleared(wrappedId);
    }

    function testFuzz_unwrapAfterElapsedTaxNeverLeaksDepositOrLeavesTheTakeoverLock(
        uint256 tokenSeed_,
        uint256 valuationSeed_,
        uint256 depositSeed_,
        uint256 taxRateSeed_,
        uint256 frequencySeed_,
        uint256 elapsedSeed_
    ) public {
        uint256 tokenId = _tokenId(tokenSeed_);
        uint256 valuation = bound(valuationSeed_, 1, MAX_VALUATION);
        uint256 deposit = bound(depositSeed_, 1, MAX_DEPOSIT);
        uint256 taxRate = bound(taxRateSeed_, 1, MAX_TAX_RATE);
        uint256 frequencyDays = bound(frequencySeed_, 1, MAX_FREQUENCY_DAYS);
        uint256 wrappedId = _wrapAsAlice(tokenId, valuation, BOB, taxRate, frequencyDays, deposit);

        uint256 aliceBalanceBefore = ALICE.balance;
        uint256 bobBalanceBefore = BOB.balance;
        vm.warp(block.timestamp + bound(elapsedSeed_, 1, 10_000 days));

        vm.prank(ALICE);
        wrapper.unwrap(wrappedId);

        assertEq(underlying.ownerOf(tokenId), ALICE);
        assertGe(ALICE.balance, aliceBalanceBefore);
        assertGe(BOB.balance, bobBalanceBefore);
        assertEq(address(wrapper).balance, 0);
        _assertBurnedAndCleared(wrappedId);
        assertEq(vm.load(address(wrapper), _mappingSlot(wrappedId, LOCKED_SLOT)), bytes32(0));
    }

    /// @dev DEFERRED SEMANTIC/SECURITY FINDING: when an owner holds multiple
    /// wrapped tokens, transferFrom can collect a delinquent token's full
    /// deposit and perform a nested foreclosure transfer in the hook, then
    /// continue the original transfer with stale `from` state. The wrapped
    /// ownership/balance accounting below is the exact legacy behavior. It is
    /// frozen here so this safety-only stage neither hides nor silently fixes
    /// a public semantic; remediation requires separate authorization.
    function test_regression_deferredDelinquentTransferContinuesAfterNestedForeclosure() public {
        uint256 firstWrappedId = _wrapAsAlice(1, 1 ether, BOB, MAX_TAX_RATE, 1, 1 ether);
        uint256 secondWrappedId = _wrapAsAlice(2, 1 ether, BOB, MAX_TAX_RATE, 1, 1 ether);

        assertEq(wrapper.balanceOf(ALICE), 2);
        uint256 foreclosureBoundary = wrapper.foreclosureTime(firstWrappedId);
        assertLt(foreclosureBoundary, block.timestamp);
        assertTrue(wrapper.foreclosed(firstWrappedId));
        assertEq(wrapper.ownerOf(firstWrappedId), ALICE);
        assertEq(wrapper.ownerOf(secondWrappedId), ALICE);
        uint256 beneficiaryBalanceBefore = BOB.balance;

        vm.prank(ALICE);
        wrapper.transferFrom(ALICE, CAROL, firstWrappedId);

        assertEq(wrapper.ownerOf(firstWrappedId), CAROL);
        assertEq(wrapper.valuationOf(firstWrappedId), 0);
        assertEq(wrapper.depositOf(firstWrappedId), 0);
        assertEq(wrapper.taxationCollected(firstWrappedId), 1 ether);
        assertEq(BOB.balance, beneficiaryBalanceBefore + 1 ether);
        assertEq(underlying.ownerOf(1), address(wrapper));

        // The nested transfer credited Wrapper, while the continuing outer
        // transfer credited Carol and debited Alice a second time. Token two
        // still reports Alice as owner even though Alice's balance is now zero.
        assertEq(wrapper.balanceOf(address(wrapper)), 1);
        assertEq(wrapper.balanceOf(CAROL), 1);
        assertEq(wrapper.balanceOf(ALICE), 0);
        assertEq(wrapper.ownerOf(secondWrappedId), ALICE);
    }

    /// @dev DEFERRED ACCOUNTING FINDING: a beneficiary takeover validates its
    /// payment while the token still reports the prior owner, but tax collection
    /// can foreclose before the purchase is settled. The purchase is then treated
    /// as coming from Wrapper, so the beneficiary's current-valuation payment is
    /// neither remitted nor retained as a deposit. It remains as exact untracked
    /// contract surplus. This test freezes that legacy behavior pending separately
    /// authorized semantic remediation.
    function test_regression_deferredBeneficiaryTakeoverAcrossForeclosureLeavesUntrackedValuationSurplus() public {
        uint256 currentValuation = 2 ether;
        uint256 wrappedId = _wrapAsAlice(1, currentValuation, BOB, MAX_TAX_RATE, 1, 1 ether);

        assertEq(wrapper.ownerOf(wrappedId), ALICE);
        assertTrue(wrapper.foreclosed(wrappedId));

        vm.prank(BOB);
        wrapper.takeoverLease{value: currentValuation}(wrappedId, currentValuation, currentValuation);

        uint256 deposits = wrapper.depositOf(wrappedId);
        uint256 liabilities = wrapper.outstandingRemittances(ALICE) + wrapper.outstandingRemittances(BOB)
            + wrapper.outstandingRemittances(CAROL);
        uint256 untrackedSurplus = address(wrapper).balance - deposits - liabilities;

        assertEq(wrapper.ownerOf(wrappedId), BOB);
        assertEq(wrapper.valuationOf(wrappedId), currentValuation);
        assertEq(deposits, 0);
        assertEq(liabilities, 0);
        assertEq(address(wrapper).balance, currentValuation);
        assertEq(untrackedSurplus, currentValuation);
    }

    /// @dev DEFERRED CUSTODY-LOSS FINDING: if foreclosure is collected before
    /// the originator unwraps, Wrapper is the wrapped token's current owner.
    /// unwrap burns and clears the wrapper record, then transfers the underlying
    /// from Wrapper back to Wrapper. The underlying is left in custody with no
    /// live wrapper record and no remaining unwrap path. This is frozen as
    /// legacy behavior pending separately authorized semantic remediation.
    function test_regression_deferredForeclosedUnwrapLeavesUnderlyingWithoutWrapperRecord() public {
        uint256 wrappedId = _wrapAsAlice(1, 1 ether, BOB, MAX_TAX_RATE, 1, 1 ether);
        assertTrue(wrapper.foreclosureTime(wrappedId) < block.timestamp);

        wrapper.collectTax(wrappedId);
        assertEq(wrapper.ownerOf(wrappedId), address(wrapper));
        assertEq(wrapper.valuationOf(wrappedId), 0);
        assertEq(wrapper.depositOf(wrappedId), 0);

        vm.prank(ALICE);
        wrapper.unwrap(wrappedId);

        assertEq(underlying.ownerOf(1), address(wrapper));
        _assertBurnedAndCleared(wrappedId);
    }

    function _wrapAsAlice(
        uint256 tokenId_,
        uint256 valuation_,
        address beneficiary_,
        uint256 taxRate_,
        uint256 frequencyDays_,
        uint256 deposit_
    ) private returns (uint256 wrappedId) {
        wrappedId = wrapper.wrappedTokenId(address(underlying), tokenId_);
        vm.startPrank(ALICE);
        underlying.approve(address(wrapper), tokenId_);
        wrapper.wrap{value: deposit_}(
            address(underlying), tokenId_, valuation_, payable(beneficiary_), taxRate_, frequencyDays_
        );
        vm.stopPrank();
    }

    function _assertBurnedAndCleared(uint256 wrappedId_) private {
        (bool ownerQuerySucceeded,) =
            address(wrapper).staticcall(abi.encodeWithSelector(wrapper.ownerOf.selector, wrappedId_));
        assertFalse(ownerQuerySucceeded);

        assertEq(vm.load(address(wrapper), _mappingSlot(wrappedId_, OWNERS_SLOT)), bytes32(0));
        assertEq(vm.load(address(wrapper), _mappingSlot(wrappedId_, TOKEN_APPROVALS_SLOT)), bytes32(0));
        assertEq(vm.load(address(wrapper), _mappingSlot(wrappedId_, VALUATIONS_SLOT)), bytes32(0));
        assertEq(vm.load(address(wrapper), _mappingSlot(wrappedId_, BENEFICIARIES_SLOT)), bytes32(0));
        assertEq(vm.load(address(wrapper), _mappingSlot(wrappedId_, TAX_RATES_SLOT)), bytes32(0));
        assertEq(vm.load(address(wrapper), _mappingSlot(wrappedId_, COLLECTION_FREQUENCIES_SLOT)), bytes32(0));
        assertEq(vm.load(address(wrapper), _mappingSlot(wrappedId_, DEPOSITS_SLOT)), bytes32(0));

        bytes32 baseSlot = _mappingSlot(wrappedId_, WRAPPED_TOKEN_MAP_SLOT);
        assertEq(vm.load(address(wrapper), baseSlot), bytes32(0));
        assertEq(vm.load(address(wrapper), _offsetSlot(baseSlot, 1)), bytes32(0));
        assertEq(vm.load(address(wrapper), _offsetSlot(baseSlot, 2)), bytes32(0));
    }

    function _tokenId(uint256 seed_) private pure returns (uint256) {
        return (seed_ % TOKEN_COUNT) + 1;
    }

    function _beneficiary(uint256 seed_) private pure returns (address) {
        uint256 index = seed_ % 3;
        if (index == 0) return ALICE;
        if (index == 1) return BOB;
        return CAROL;
    }

    function _mappingSlot(uint256 key_, uint256 slot_) private pure returns (bytes32) {
        return keccak256(abi.encode(key_, slot_));
    }

    function _offsetSlot(bytes32 slot_, uint256 offset_) private pure returns (bytes32) {
        return bytes32(uint256(slot_) + offset_);
    }
}
