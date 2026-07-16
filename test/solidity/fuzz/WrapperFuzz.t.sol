// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {TestNFT} from "../../../contracts/test/TestNFT.sol";
import {TestWrapper} from "../../../contracts/test/TestWrapper.sol";
import {Remittance} from "../../../contracts/token/modules/Remittance.sol";

contract WrapperFuzzValidReceiver is IERC721Receiver {
    address public tokenCaller;
    address public operator;
    address public from;
    uint256 public tokenId;
    bytes32 public dataHash;
    uint256 public callbackCount;

    receive() external payable {}

    function onERC721Received(address operator_, address from_, uint256 tokenId_, bytes calldata data_)
        external
        override
        returns (bytes4)
    {
        tokenCaller = msg.sender;
        operator = operator_;
        from = from_;
        tokenId = tokenId_;
        dataHash = keccak256(data_);
        callbackCount++;
        return IERC721Receiver.onERC721Received.selector;
    }
}

contract WrapperFuzzWrongReceiver is IERC721Receiver {
    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return bytes4(0);
    }
}

contract WrapperFuzzRevertingReceiver is IERC721Receiver {
    error ReceiverRejected();

    bool private immutable _withoutPayload;

    constructor(bool withoutPayload_) {
        _withoutPayload = withoutPayload_;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external view override returns (bytes4) {
        if (_withoutPayload) {
            assembly ("memory-safe") {
                revert(0, 0)
            }
        }
        revert ReceiverRejected();
    }
}

contract WrapperFuzzConstructionReceiver is IERC721Receiver {
    TestNFT public immutable token;
    uint256 public immutable constructionCodeLength;

    address public tokenCaller;
    address public operator;
    address public from;
    uint256 public tokenId;
    bytes32 public dataHash;
    uint256 public callbackCount;

    constructor() {
        constructionCodeLength = address(this).code.length;
        token = new TestNFT();
    }

    function safeTransferToSelf(uint256 tokenId_, bytes calldata data_) external {
        token.safeTransferFrom(address(this), address(this), tokenId_, data_);
    }

    function onERC721Received(address operator_, address from_, uint256 tokenId_, bytes calldata data_)
        external
        override
        returns (bytes4)
    {
        require(msg.sender == address(token), "Construction receiver: wrong token");
        tokenCaller = msg.sender;
        operator = operator_;
        from = from_;
        tokenId = tokenId_;
        dataHash = keccak256(data_);
        callbackCount++;
        return IERC721Receiver.onERC721Received.selector;
    }
}

/// @dev Bounded Wrapper fuzzing keeps arithmetic beneath overflow thresholds
/// while covering every input field and the beneficiary/operator role split.
contract WrapperFuzzTest is Test, IERC721Receiver {
    struct DelinquentTransferSnapshot {
        address approval;
        bool operatorApproval;
        uint256 valuation;
        uint256 deposit;
        uint256 taxation;
        uint256 transferTax;
        uint256 collectionTime;
        uint256 beneficiaryBalance;
        uint256 beneficiaryRemittance;
        uint256 wrapperEth;
    }

    struct TakeoverSnapshot {
        address owner;
        address approval;
        uint256 valuation;
        uint256 deposit;
        uint256 taxation;
        uint256 transferTax;
        uint256 collectionTime;
        uint256 aliceEth;
        uint256 bobEth;
        uint256 carolEth;
        uint256 wrapperEth;
        uint256 aliceOutstanding;
        uint256 bobOutstanding;
        uint256 carolOutstanding;
        uint256 aliceTokens;
        uint256 bobTokens;
        uint256 carolTokens;
        uint256 wrapperTokens;
        bytes32 lock;
    }

    struct UnwrapGuardSnapshot {
        TakeoverSnapshot wrapped;
        address beneficiary;
        uint256 taxRate;
        uint256 collectionFrequency;
        address underlyingOwner;
        address underlyingApproval;
        uint256 underlyingAliceTokens;
        uint256 underlyingBobTokens;
        uint256 underlyingCarolTokens;
        uint256 underlyingWrapperTokens;
        bytes32 rawStorageHash;
    }

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

    bytes32 private constant APPROVAL_SIGNATURE = keccak256("Approval(address,address,uint256)");
    bytes32 private constant TRANSFER_SIGNATURE = keccak256("Transfer(address,address,uint256)");
    bytes32 private constant TAKEOVER_SIGNATURE = keccak256("LogLeaseTakeover(uint256,address,uint256)");
    bytes32 private constant FORECLOSURE_SIGNATURE = keccak256("LogForeclosure(uint256,address)");
    bytes32 private constant COLLECTION_SIGNATURE = keccak256("LogCollection(uint256,uint256)");
    bytes32 private constant REMITTANCE_SIGNATURE = keccak256("LogRemittance(uint8,address,uint256)");
    bytes32 private constant VALUATION_SIGNATURE = keccak256("LogValuation(uint256,uint256)");

    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);
    address private constant CAROL = address(0xCA901);

    TestNFT private underlying;
    TestWrapper private wrapper;

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

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

    /// @dev The retained inventory identifier now deterministically exercises
    /// every code-length and receiver-result branch in the project ERC721.
    function testFuzz_wrappedSafeTransferHonorsReceiverAndPreservesStateOnRejection() public {
        _assertTestNFTCompatibilitySurface();
        _assertWrappedSafeTransfer(true);

        _resetWrapperFixtures();
        _assertWrappedSafeTransfer(false);

        _assertSafeTransferToEOA();
        _assertSafeTransferToValidReceiver();
        _assertRejectedSafeTransfer(
            address(new WrapperFuzzWrongReceiver()), _error("ERC721: transfer to non ERC721Receiver implementer")
        );
        _assertRejectedSafeTransfer(
            address(new WrapperFuzzRevertingReceiver(false)),
            abi.encodeWithSelector(WrapperFuzzRevertingReceiver.ReceiverRejected.selector)
        );
        _assertRejectedSafeTransfer(
            address(new WrapperFuzzRevertingReceiver(true)),
            _error("ERC721: transfer to non ERC721Receiver implementer")
        );
        _assertConstructionTimeCodeLengthBehavior();
    }

    function _assertWrappedSafeTransfer(bool validReceiver_) private {
        uint256 tokenId = 1;
        // Keep a non-zero deposit so moving the token away from its beneficiary
        // remains solvent when the transfer hook collects tax.
        uint256 wrappedId = _wrapAsAlice(tokenId, 1 ether, BOB, 1, MAX_FREQUENCY_DAYS, MAX_DEPOSIT);
        address receiver =
            validReceiver_ ? address(new WrapperFuzzValidReceiver()) : address(new WrapperFuzzWrongReceiver());

        vm.prank(ALICE);
        (bool success, bytes memory returnData) = address(wrapper)
            .call(abi.encodeWithSignature("safeTransferFrom(address,address,uint256)", ALICE, receiver, wrappedId));

        assertEq(success, validReceiver_);
        if (!validReceiver_) {
            assertEq(returnData, _error("ERC721: transfer to non ERC721Receiver implementer"));
        }
        assertEq(wrapper.ownerOf(wrappedId), validReceiver_ ? receiver : ALICE);
        assertEq(underlying.ownerOf(tokenId), address(wrapper));

        vm.prank(ALICE);
        wrapper.unwrap(wrappedId);

        assertEq(underlying.ownerOf(tokenId), validReceiver_ ? receiver : ALICE);
        _assertBurnedAndCleared(wrappedId);
    }

    function _assertTestNFTCompatibilitySurface() private {
        TestNFT token = new TestNFT();

        assertEq(token.name(), "Test NFT");
        assertEq(token.symbol(), "tNFT");
        assertEq(token.tokenURI(1), "721.dev/1");
        assertTrue(token.supportsInterface(type(IERC165).interfaceId));
        assertTrue(token.supportsInterface(type(IERC721).interfaceId));
        assertTrue(token.supportsInterface(type(IERC721Metadata).interfaceId));
        assertFalse(token.supportsInterface(0xffffffff));

        vm.expectRevert(bytes("ERC721: invalid token ID"));
        token.ownerOf(4);
        vm.expectRevert(bytes("ERC721: invalid token ID"));
        token.getApproved(4);
        vm.expectRevert(bytes("ERC721: invalid token ID"));
        token.tokenURI(4);

        vm.expectRevert(bytes("ERC721: approval to current owner"));
        token.approve(address(this), 1);
        vm.expectRevert(bytes("ERC721: approve caller is not token owner or approved for all"));
        vm.prank(ALICE);
        token.approve(BOB, 1);
        vm.expectRevert(bytes("ERC721: caller is not token owner or approved"));
        vm.prank(ALICE);
        token.transferFrom(address(this), ALICE, 1);
    }

    function _assertSafeTransferToEOA() private {
        TestNFT token = new TestNFT();
        assertEq(ALICE.code.length, 0);

        token.approve(BOB, 1);
        vm.recordLogs();
        token.safeTransferFrom(address(this), ALICE, 1);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 1);
        assertEq(logs[0].emitter, address(token));
        assertEq(logs[0].topics[0], TRANSFER_SIGNATURE);
        assertEq(logs[0].topics[1], _addressTopic(address(this)));
        assertEq(logs[0].topics[2], _addressTopic(ALICE));
        assertEq(logs[0].topics[3], bytes32(uint256(1)));
        assertEq(token.ownerOf(1), ALICE);
        assertEq(token.balanceOf(address(this)), 2);
        assertEq(token.balanceOf(ALICE), 1);
        assertEq(token.getApproved(1), address(0));
    }

    function _assertSafeTransferToValidReceiver() private {
        TestNFT token = new TestNFT();
        WrapperFuzzValidReceiver receiver = new WrapperFuzzValidReceiver();
        bytes memory data = hex"0721c0de";

        token.approve(BOB, 1);
        token.safeTransferFrom(address(this), address(receiver), 1, data);

        assertEq(token.ownerOf(1), address(receiver));
        assertEq(token.balanceOf(address(this)), 2);
        assertEq(token.balanceOf(address(receiver)), 1);
        assertEq(token.getApproved(1), address(0));
        assertEq(receiver.callbackCount(), 1);
        assertEq(receiver.tokenCaller(), address(token));
        assertEq(receiver.operator(), address(this));
        assertEq(receiver.from(), address(this));
        assertEq(receiver.tokenId(), 1);
        assertEq(receiver.dataHash(), keccak256(data));
    }

    function _assertRejectedSafeTransfer(address receiver_, bytes memory expectedRevert_) private {
        TestNFT token = new TestNFT();
        bytes memory data = hex"0721dead";

        token.approve(BOB, 1);
        (bool success, bytes memory returnData) = address(token)
            .call(
                abi.encodeWithSignature(
                    "safeTransferFrom(address,address,uint256,bytes)", address(this), receiver_, 1, data
                )
            );

        assertFalse(success);
        assertEq(returnData, expectedRevert_);
        assertEq(token.ownerOf(1), address(this));
        assertEq(token.balanceOf(address(this)), 3);
        assertEq(token.balanceOf(receiver_), 0);
        assertEq(token.getApproved(1), BOB);
    }

    function _assertConstructionTimeCodeLengthBehavior() private {
        WrapperFuzzConstructionReceiver receiver = new WrapperFuzzConstructionReceiver();
        TestNFT token = receiver.token();
        bytes memory data = hex"0721beef";

        assertEq(receiver.constructionCodeLength(), 0);
        assertGt(address(receiver).code.length, 0);
        assertEq(receiver.callbackCount(), 0);
        assertEq(token.balanceOf(address(receiver)), 3);
        assertEq(token.ownerOf(1), address(receiver));
        assertEq(token.ownerOf(2), address(receiver));
        assertEq(token.ownerOf(3), address(receiver));

        receiver.safeTransferToSelf(1, data);

        assertEq(receiver.callbackCount(), 1);
        assertEq(receiver.tokenCaller(), address(token));
        assertEq(receiver.operator(), address(receiver));
        assertEq(receiver.from(), address(receiver));
        assertEq(receiver.tokenId(), 1);
        assertEq(receiver.dataHash(), keccak256(data));
        assertEq(token.ownerOf(1), address(receiver));
        assertEq(token.balanceOf(address(receiver)), 3);
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

    /// @dev The legacy test identifier is retained for compatibility-manifest
    /// inventory stability. The remediated behavior is an exact revert and
    /// complete rollback across all caller and ERC721 transfer entry points.
    function test_regression_deferredDelinquentTransferContinuesAfterNestedForeclosure() public {
        for (uint256 callerMode = 0; callerMode < 3; callerMode++) {
            for (uint256 transferMode = 0; transferMode < 3; transferMode++) {
                _resetWrapperFixtures();
                _assertDelinquentTransferRevertsAndRollsBack(callerMode, transferMode);
            }
        }
    }

    /// @dev Tax collection may foreclose via a nested transfer from the hook.
    /// The outer transfer must then reject its stale `from` value and roll back
    /// the foreclosure, remittance, approvals, and every accounting change.
    function _assertDelinquentTransferRevertsAndRollsBack(uint256 callerMode_, uint256 transferMode_) private {
        uint256 firstWrappedId = _wrapAsAlice(1, 1 ether, BOB, MAX_TAX_RATE, 1, 1 ether);
        uint256 secondWrappedId = _wrapAsAlice(2, 1 ether, BOB, MAX_TAX_RATE, 1, 1 ether);

        address caller = ALICE;
        if (callerMode_ == 1) {
            vm.prank(ALICE);
            wrapper.approve(CAROL, firstWrappedId);
            caller = CAROL;
        } else if (callerMode_ == 2) {
            vm.prank(ALICE);
            wrapper.setApprovalForAll(CAROL, true);
            caller = CAROL;
        }

        assertEq(wrapper.balanceOf(ALICE), 2);
        uint256 foreclosureBoundary = wrapper.foreclosureTime(firstWrappedId);
        assertLt(foreclosureBoundary, block.timestamp);
        assertTrue(wrapper.foreclosed(firstWrappedId));
        assertEq(wrapper.ownerOf(firstWrappedId), ALICE);
        assertEq(wrapper.ownerOf(secondWrappedId), ALICE);

        DelinquentTransferSnapshot memory before_ = _delinquentTransferSnapshot(firstWrappedId);

        vm.expectRevert(
            abi.encodeWithSignature("Error(string)", "ERC721: transfer from incorrect owner"), address(wrapper)
        );
        vm.prank(caller);
        if (transferMode_ == 0) {
            wrapper.transferFrom(ALICE, CAROL, firstWrappedId);
        } else if (transferMode_ == 1) {
            wrapper.safeTransferFrom(ALICE, CAROL, firstWrappedId);
        } else {
            wrapper.safeTransferFrom(ALICE, CAROL, firstWrappedId, hex"0721");
        }

        assertEq(wrapper.ownerOf(firstWrappedId), ALICE);
        assertEq(wrapper.ownerOf(secondWrappedId), ALICE);
        assertEq(wrapper.balanceOf(ALICE), 2);
        assertEq(wrapper.balanceOf(address(wrapper)), 0);
        assertEq(wrapper.balanceOf(CAROL), 0);
        assertEq(wrapper.getApproved(firstWrappedId), before_.approval);
        assertEq(wrapper.isApprovedForAll(ALICE, CAROL), before_.operatorApproval);
        assertEq(wrapper.valuationOf(firstWrappedId), before_.valuation);
        assertEq(wrapper.depositOf(firstWrappedId), before_.deposit);
        assertEq(wrapper.taxationCollected(firstWrappedId), before_.taxation);
        assertEq(wrapper.taxCollectedSinceLastTransferOf(firstWrappedId), before_.transferTax);
        assertEq(wrapper.lastCollectionTimeOf(firstWrappedId), before_.collectionTime);
        assertEq(BOB.balance, before_.beneficiaryBalance);
        assertEq(wrapper.outstandingRemittances(BOB), before_.beneficiaryRemittance);
        assertEq(address(wrapper).balance, before_.wrapperEth);
        assertEq(underlying.ownerOf(1), address(wrapper));
        assertEq(underlying.ownerOf(2), address(wrapper));
    }

    function _delinquentTransferSnapshot(uint256 wrappedId_)
        private
        view
        returns (DelinquentTransferSnapshot memory snapshot_)
    {
        snapshot_.approval = wrapper.getApproved(wrappedId_);
        snapshot_.operatorApproval = wrapper.isApprovedForAll(ALICE, CAROL);
        snapshot_.valuation = wrapper.valuationOf(wrappedId_);
        snapshot_.deposit = wrapper.depositOf(wrappedId_);
        snapshot_.taxation = wrapper.taxationCollected(wrappedId_);
        snapshot_.transferTax = wrapper.taxCollectedSinceLastTransferOf(wrappedId_);
        snapshot_.collectionTime = wrapper.lastCollectionTimeOf(wrappedId_);
        snapshot_.beneficiaryBalance = BOB.balance;
        snapshot_.beneficiaryRemittance = wrapper.outstandingRemittances(BOB);
        snapshot_.wrapperEth = address(wrapper).balance;
    }

    function _resetWrapperFixtures() private {
        vm.startPrank(ALICE);
        underlying = new TestNFT();
        wrapper = new TestWrapper();
        vm.stopPrank();
    }

    /// @dev The legacy identifier is retained for compatibility-inventory
    /// stability. Payment is now validated against the owner after collection,
    /// so crossing foreclosure cannot strand submitted value as surplus.
    function test_regression_deferredBeneficiaryTakeoverAcrossForeclosureLeavesUntrackedValuationSurplus() public {
        _assertBeneficiaryCrossingForeclosureIsStabilized();

        _resetWrapperFixtures();
        _assertNonBeneficiaryCrossingForeclosureIsStabilized();

        _resetWrapperFixtures();
        _assertActiveOwnerMalformedPaymentRollsBackCollection();
    }

    function _assertBeneficiaryCrossingForeclosureIsStabilized() private {
        uint256 currentValuation = 2 ether;
        uint256 wrappedId = _wrapAsAlice(1, currentValuation, BOB, MAX_TAX_RATE, 1, 1 ether);

        assertEq(wrapper.ownerOf(wrappedId), ALICE);
        assertTrue(wrapper.foreclosed(wrappedId));

        TakeoverSnapshot memory before_ = _takeoverSnapshot(wrappedId);
        vm.recordLogs();
        vm.prank(BOB);
        (bool success, bytes memory returnData) = address(wrapper).call{value: currentValuation}(
            abi.encodeWithSelector(wrapper.takeoverLease.selector, wrappedId, currentValuation, currentValuation)
        );
        Vm.Log[] memory revertedLogs = vm.getRecordedLogs();

        assertFalse(success);
        assertEq(returnData, _error("Msg contains value"));
        _assertPendingForeclosurePrefix(revertedLogs, wrappedId);
        assertEq(revertedLogs.length, 6);
        _assertTakeoverStateUnchanged(wrappedId, before_);
        assertEq(underlying.ownerOf(1), address(wrapper));

        uint256 bobBalanceBefore = BOB.balance;
        uint256 aliceBalanceBefore = ALICE.balance;
        vm.recordLogs();
        vm.prank(BOB);
        wrapper.takeoverLease(wrappedId, currentValuation, currentValuation);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        _assertPendingForeclosureTakeoverLogs(logs, wrappedId, BOB, currentValuation);
        assertEq(wrapper.ownerOf(wrappedId), BOB);
        assertEq(wrapper.valuationOf(wrappedId), currentValuation);
        assertEq(wrapper.depositOf(wrappedId), 0);
        assertEq(wrapper.taxationCollected(wrappedId), 1 ether);
        assertEq(wrapper.taxCollectedSinceLastTransferOf(wrappedId), 0);
        assertEq(wrapper.lastCollectionTimeOf(wrappedId), block.timestamp);
        assertEq(wrapper.getApproved(wrappedId), address(0));
        assertEq(BOB.balance, bobBalanceBefore + 1 ether);
        assertEq(ALICE.balance, aliceBalanceBefore);
        assertEq(address(wrapper).balance, 0);
        assertEq(_knownLiabilities(), 0);
        assertEq(underlying.ownerOf(1), address(wrapper));
        assertEq(vm.load(address(wrapper), _mappingSlot(wrappedId, LOCKED_SLOT)), bytes32(0));
    }

    function _assertNonBeneficiaryCrossingForeclosureIsStabilized() private {
        uint256 currentValuation = 2 ether;
        uint256 wrappedId = _wrapAsAlice(1, currentValuation, BOB, MAX_TAX_RATE, 1, 1 ether);

        TakeoverSnapshot memory before_ = _takeoverSnapshot(wrappedId);
        vm.recordLogs();
        vm.prank(CAROL);
        (bool success, bytes memory returnData) = address(wrapper)
            .call(abi.encodeWithSelector(wrapper.takeoverLease.selector, wrappedId, currentValuation, currentValuation));
        Vm.Log[] memory revertedLogs = vm.getRecordedLogs();

        assertFalse(success);
        assertEq(returnData, _error("Message does not contain surplus value for deposit"));
        _assertPendingForeclosurePrefix(revertedLogs, wrappedId);
        assertEq(revertedLogs.length, 6);
        _assertTakeoverStateUnchanged(wrappedId, before_);

        uint256 bobBalanceBefore = BOB.balance;
        uint256 carolBalanceBefore = CAROL.balance;
        uint256 aliceBalanceBefore = ALICE.balance;
        vm.recordLogs();
        vm.prank(CAROL);
        wrapper.takeoverLease{value: 1 wei}(wrappedId, currentValuation, currentValuation);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        _assertPendingForeclosureTakeoverLogs(logs, wrappedId, CAROL, currentValuation);
        assertEq(wrapper.ownerOf(wrappedId), CAROL);
        assertEq(wrapper.valuationOf(wrappedId), currentValuation);
        assertEq(wrapper.depositOf(wrappedId), 1 wei);
        assertEq(wrapper.taxationCollected(wrappedId), 1 ether);
        assertEq(wrapper.taxCollectedSinceLastTransferOf(wrappedId), 0);
        assertEq(wrapper.lastCollectionTimeOf(wrappedId), block.timestamp);
        assertEq(wrapper.getApproved(wrappedId), address(0));
        assertEq(BOB.balance, bobBalanceBefore + 1 ether);
        assertEq(CAROL.balance, carolBalanceBefore - 1 wei);
        assertEq(ALICE.balance, aliceBalanceBefore);
        assertEq(address(wrapper).balance, 1 wei);
        assertEq(address(wrapper).balance, wrapper.depositOf(wrappedId) + _knownLiabilities());
        assertEq(underlying.ownerOf(1), address(wrapper));
        assertEq(vm.load(address(wrapper), _mappingSlot(wrappedId, LOCKED_SLOT)), bytes32(0));
    }

    function _assertActiveOwnerMalformedPaymentRollsBackCollection() private {
        uint256 wrappedId = _wrapAsAlice(1, 2 ether, BOB, MAX_TAX_RATE, 1, 5 ether);
        wrapper.collectTax(wrappedId);

        vm.prank(CAROL);
        wrapper.takeoverLease{value: 10 ether}(wrappedId, 2 ether, 0);
        vm.warp(block.timestamp + 1 hours);

        (uint256 due,) = wrapper.taxOwed(wrappedId);
        assertGt(due, 0);
        assertLt(due, wrapper.depositOf(wrappedId));

        TakeoverSnapshot memory before_ = _takeoverSnapshot(wrappedId);
        vm.recordLogs();
        vm.prank(BOB);
        (bool success, bytes memory returnData) = address(wrapper).call{value: 2 ether + 1 wei}(
            abi.encodeWithSelector(wrapper.takeoverLease.selector, wrappedId, 2 ether, 2 ether)
        );
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertFalse(success);
        assertEq(returnData, _error("Msg contains surplus value"));
        assertEq(logs.length, 2);
        _assertLog(logs[0], COLLECTION_SIGNATURE);
        assertEq(logs[0].topics[1], bytes32(wrappedId));
        assertEq(logs[0].topics[2], bytes32(due));
        _assertLog(logs[1], REMITTANCE_SIGNATURE);
        assertEq(logs[1].topics[1], bytes32(uint256(3)));
        assertEq(logs[1].topics[2], _addressTopic(BOB));
        assertEq(logs[1].topics[3], bytes32(due));
        _assertTakeoverStateUnchanged(wrappedId, before_);
        assertEq(underlying.ownerOf(1), address(wrapper));
    }

    function _takeoverSnapshot(uint256 wrappedId_) private view returns (TakeoverSnapshot memory snapshot_) {
        snapshot_.owner = wrapper.ownerOf(wrappedId_);
        snapshot_.approval = wrapper.getApproved(wrappedId_);
        snapshot_.valuation = wrapper.valuationOf(wrappedId_);
        snapshot_.deposit = wrapper.depositOf(wrappedId_);
        snapshot_.taxation = wrapper.taxationCollected(wrappedId_);
        snapshot_.transferTax = wrapper.taxCollectedSinceLastTransferOf(wrappedId_);
        snapshot_.collectionTime = wrapper.lastCollectionTimeOf(wrappedId_);
        snapshot_.aliceEth = ALICE.balance;
        snapshot_.bobEth = BOB.balance;
        snapshot_.carolEth = CAROL.balance;
        snapshot_.wrapperEth = address(wrapper).balance;
        snapshot_.aliceOutstanding = wrapper.outstandingRemittances(ALICE);
        snapshot_.bobOutstanding = wrapper.outstandingRemittances(BOB);
        snapshot_.carolOutstanding = wrapper.outstandingRemittances(CAROL);
        snapshot_.aliceTokens = wrapper.balanceOf(ALICE);
        snapshot_.bobTokens = wrapper.balanceOf(BOB);
        snapshot_.carolTokens = wrapper.balanceOf(CAROL);
        snapshot_.wrapperTokens = wrapper.balanceOf(address(wrapper));
        snapshot_.lock = vm.load(address(wrapper), _mappingSlot(wrappedId_, LOCKED_SLOT));
    }

    function _assertTakeoverStateUnchanged(uint256 wrappedId_, TakeoverSnapshot memory before_) private view {
        assertEq(wrapper.ownerOf(wrappedId_), before_.owner);
        assertEq(wrapper.getApproved(wrappedId_), before_.approval);
        assertEq(wrapper.valuationOf(wrappedId_), before_.valuation);
        assertEq(wrapper.depositOf(wrappedId_), before_.deposit);
        assertEq(wrapper.taxationCollected(wrappedId_), before_.taxation);
        assertEq(wrapper.taxCollectedSinceLastTransferOf(wrappedId_), before_.transferTax);
        assertEq(wrapper.lastCollectionTimeOf(wrappedId_), before_.collectionTime);
        assertEq(ALICE.balance, before_.aliceEth);
        assertEq(BOB.balance, before_.bobEth);
        assertEq(CAROL.balance, before_.carolEth);
        assertEq(address(wrapper).balance, before_.wrapperEth);
        assertEq(wrapper.outstandingRemittances(ALICE), before_.aliceOutstanding);
        assertEq(wrapper.outstandingRemittances(BOB), before_.bobOutstanding);
        assertEq(wrapper.outstandingRemittances(CAROL), before_.carolOutstanding);
        assertEq(wrapper.balanceOf(ALICE), before_.aliceTokens);
        assertEq(wrapper.balanceOf(BOB), before_.bobTokens);
        assertEq(wrapper.balanceOf(CAROL), before_.carolTokens);
        assertEq(wrapper.balanceOf(address(wrapper)), before_.wrapperTokens);
        assertEq(vm.load(address(wrapper), _mappingSlot(wrappedId_, LOCKED_SLOT)), before_.lock);
    }

    function _assertPendingForeclosureTakeoverLogs(
        Vm.Log[] memory logs_,
        uint256 wrappedId_,
        address buyer_,
        uint256 valuation_
    ) private view {
        assertEq(logs_.length, 10);
        _assertPendingForeclosurePrefix(logs_, wrappedId_);
        _assertLog(logs_[6], VALUATION_SIGNATURE);
        assertEq(logs_[6].topics[1], bytes32(wrappedId_));
        assertEq(logs_[6].topics[2], bytes32(valuation_));
        _assertLog(logs_[7], APPROVAL_SIGNATURE);
        assertEq(logs_[7].topics[1], _addressTopic(address(wrapper)));
        assertEq(logs_[7].topics[2], bytes32(0));
        assertEq(logs_[7].topics[3], bytes32(wrappedId_));
        _assertLog(logs_[8], TRANSFER_SIGNATURE);
        assertEq(logs_[8].topics[1], _addressTopic(address(wrapper)));
        assertEq(logs_[8].topics[2], _addressTopic(buyer_));
        assertEq(logs_[8].topics[3], bytes32(wrappedId_));
        _assertLog(logs_[9], TAKEOVER_SIGNATURE);
        assertEq(logs_[9].topics[1], bytes32(wrappedId_));
        assertEq(logs_[9].topics[2], _addressTopic(buyer_));
        assertEq(logs_[9].topics[3], bytes32(valuation_));
    }

    function _assertPendingForeclosurePrefix(Vm.Log[] memory logs_, uint256 wrappedId_) private view {
        assertGe(logs_.length, 6);
        _assertLog(logs_[0], COLLECTION_SIGNATURE);
        assertEq(logs_[0].topics[1], bytes32(wrappedId_));
        assertEq(logs_[0].topics[2], bytes32(uint256(1 ether)));
        _assertLog(logs_[1], REMITTANCE_SIGNATURE);
        assertEq(logs_[1].topics[1], bytes32(uint256(3)));
        assertEq(logs_[1].topics[2], _addressTopic(BOB));
        assertEq(logs_[1].topics[3], bytes32(uint256(1 ether)));
        _assertLog(logs_[2], VALUATION_SIGNATURE);
        assertEq(logs_[2].topics[1], bytes32(wrappedId_));
        assertEq(logs_[2].topics[2], bytes32(0));
        _assertLog(logs_[3], APPROVAL_SIGNATURE);
        assertEq(logs_[3].topics[1], _addressTopic(ALICE));
        assertEq(logs_[3].topics[2], bytes32(0));
        assertEq(logs_[3].topics[3], bytes32(wrappedId_));
        _assertLog(logs_[4], TRANSFER_SIGNATURE);
        assertEq(logs_[4].topics[1], _addressTopic(ALICE));
        assertEq(logs_[4].topics[2], _addressTopic(address(wrapper)));
        assertEq(logs_[4].topics[3], bytes32(wrappedId_));
        _assertLog(logs_[5], FORECLOSURE_SIGNATURE);
        assertEq(logs_[5].topics[1], bytes32(wrappedId_));
        assertEq(logs_[5].topics[2], _addressTopic(ALICE));
    }

    function _assertLog(Vm.Log memory log_, bytes32 signature_) private view {
        assertEq(log_.emitter, address(wrapper));
        assertEq(log_.topics[0], signature_);
        assertEq(log_.data.length, 0);
    }

    function _knownLiabilities() private view returns (uint256) {
        return wrapper.outstandingRemittances(ALICE) + wrapper.outstandingRemittances(BOB)
            + wrapper.outstandingRemittances(CAROL);
    }

    function _error(string memory reason_) private pure returns (bytes memory) {
        return abi.encodeWithSignature("Error(string)", reason_);
    }

    function _addressTopic(address value_) private pure returns (bytes32) {
        return bytes32(uint256(uint160(value_)));
    }

    /// @dev The legacy identifier is retained for compatibility-inventory
    /// stability. A self-destination unwrap now reverts before deleting or
    /// burning any state. Canonical foreclosure can be recovered by takeover,
    /// after which the original operator can deliver the underlying to the new
    /// wrapped-token owner.
    function test_regression_deferredForeclosedUnwrapLeavesUnderlyingWithoutWrapperRecord() public {
        uint256 wrappedId = _wrapAsAlice(1, 1 ether, BOB, MAX_TAX_RATE, 1, 1 ether);
        assertTrue(wrapper.foreclosureTime(wrappedId) < block.timestamp);

        wrapper.collectTax(wrappedId);
        assertEq(wrapper.ownerOf(wrappedId), address(wrapper));
        assertEq(wrapper.valuationOf(wrappedId), 0);
        assertEq(wrapper.depositOf(wrappedId), 0);

        _assertUnwrapGuardRevertsAndRollsBack(wrappedId, 1, CAROL, _error("Wrap originator only"));
        _assertUnwrapGuardRevertsAndRollsBack(
            wrappedId, 1, ALICE, abi.encodeWithSelector(Remittance.DestinationContractAddress.selector)
        );

        uint256 carolEtherBeforeRecovery = CAROL.balance;
        vm.prank(CAROL);
        wrapper.takeoverLease{value: 1 ether}(wrappedId, 1 ether, 0);

        assertEq(wrapper.ownerOf(wrappedId), CAROL);
        assertEq(wrapper.valuationOf(wrappedId), 1 ether);
        assertEq(wrapper.depositOf(wrappedId), 1 ether);

        vm.prank(ALICE);
        wrapper.unwrap(wrappedId);

        assertEq(underlying.ownerOf(1), CAROL);
        assertEq(CAROL.balance, carolEtherBeforeRecovery);
        assertEq(address(wrapper).balance, 0);
        _assertBurnedAndCleared(wrappedId);

        // A raw, non-safe transfer of a live wrapped token to Wrapper creates
        // the same invalid self-destination. The guard prevents custody loss,
        // but this test does not classify or repair the transfer's economics.
        uint256 directlyTransferredId = _wrapAsAlice(2, 1 ether, ALICE, MAX_TAX_RATE, 1, 0);
        vm.prank(ALICE);
        wrapper.transferFrom(ALICE, address(wrapper), directlyTransferredId);

        assertEq(wrapper.ownerOf(directlyTransferredId), address(wrapper));
        assertEq(wrapper.valuationOf(directlyTransferredId), 1 ether);
        assertEq(wrapper.depositOf(directlyTransferredId), 0);
        _assertUnwrapGuardRevertsAndRollsBack(
            directlyTransferredId, 2, ALICE, abi.encodeWithSelector(Remittance.DestinationContractAddress.selector)
        );
    }

    function _assertUnwrapGuardRevertsAndRollsBack(
        uint256 wrappedId_,
        uint256 underlyingId_,
        address caller_,
        bytes memory expectedRevert_
    ) private {
        UnwrapGuardSnapshot memory before_ = _unwrapGuardSnapshot(wrappedId_, underlyingId_);

        vm.recordLogs();
        vm.prank(caller_);
        (bool success, bytes memory returnData) =
            address(wrapper).call(abi.encodeWithSelector(wrapper.unwrap.selector, wrappedId_));
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertFalse(success);
        assertEq(returnData, expectedRevert_);
        assertEq(logs.length, 0);
        _assertUnwrapGuardStateUnchanged(wrappedId_, underlyingId_, before_);
    }

    function _unwrapGuardSnapshot(uint256 wrappedId_, uint256 underlyingId_)
        private
        view
        returns (UnwrapGuardSnapshot memory snapshot_)
    {
        snapshot_.wrapped = _takeoverSnapshot(wrappedId_);
        snapshot_.beneficiary = wrapper.beneficiaryOf(wrappedId_);
        snapshot_.taxRate = wrapper.taxRateOf(wrappedId_);
        snapshot_.collectionFrequency = wrapper.collectionFrequencyOf(wrappedId_);
        snapshot_.underlyingOwner = underlying.ownerOf(underlyingId_);
        snapshot_.underlyingApproval = underlying.getApproved(underlyingId_);
        snapshot_.underlyingAliceTokens = underlying.balanceOf(ALICE);
        snapshot_.underlyingBobTokens = underlying.balanceOf(BOB);
        snapshot_.underlyingCarolTokens = underlying.balanceOf(CAROL);
        snapshot_.underlyingWrapperTokens = underlying.balanceOf(address(wrapper));
        snapshot_.rawStorageHash = _unwrapGuardStorageHash(wrappedId_);
    }

    function _assertUnwrapGuardStateUnchanged(
        uint256 wrappedId_,
        uint256 underlyingId_,
        UnwrapGuardSnapshot memory before_
    ) private view {
        _assertTakeoverStateUnchanged(wrappedId_, before_.wrapped);
        assertEq(wrapper.beneficiaryOf(wrappedId_), before_.beneficiary);
        assertEq(wrapper.taxRateOf(wrappedId_), before_.taxRate);
        assertEq(wrapper.collectionFrequencyOf(wrappedId_), before_.collectionFrequency);
        assertEq(underlying.ownerOf(underlyingId_), before_.underlyingOwner);
        assertEq(underlying.getApproved(underlyingId_), before_.underlyingApproval);
        assertEq(underlying.balanceOf(ALICE), before_.underlyingAliceTokens);
        assertEq(underlying.balanceOf(BOB), before_.underlyingBobTokens);
        assertEq(underlying.balanceOf(CAROL), before_.underlyingCarolTokens);
        assertEq(underlying.balanceOf(address(wrapper)), before_.underlyingWrapperTokens);
        assertEq(_unwrapGuardStorageHash(wrappedId_), before_.rawStorageHash);
    }

    function _unwrapGuardStorageHash(uint256 wrappedId_) private view returns (bytes32) {
        bytes32[11] memory slots;
        slots[0] = vm.load(address(wrapper), _mappingSlot(wrappedId_, OWNERS_SLOT));
        slots[1] = vm.load(address(wrapper), _mappingSlot(wrappedId_, TOKEN_APPROVALS_SLOT));
        slots[2] = vm.load(address(wrapper), _mappingSlot(wrappedId_, VALUATIONS_SLOT));
        slots[3] = vm.load(address(wrapper), _mappingSlot(wrappedId_, BENEFICIARIES_SLOT));
        slots[4] = vm.load(address(wrapper), _mappingSlot(wrappedId_, TAX_RATES_SLOT));
        slots[5] = vm.load(address(wrapper), _mappingSlot(wrappedId_, COLLECTION_FREQUENCIES_SLOT));
        slots[6] = vm.load(address(wrapper), _mappingSlot(wrappedId_, DEPOSITS_SLOT));
        slots[7] = vm.load(address(wrapper), _mappingSlot(wrappedId_, LOCKED_SLOT));

        bytes32 baseSlot = _mappingSlot(wrappedId_, WRAPPED_TOKEN_MAP_SLOT);
        slots[8] = vm.load(address(wrapper), baseSlot);
        slots[9] = vm.load(address(wrapper), _offsetSlot(baseSlot, 1));
        slots[10] = vm.load(address(wrapper), _offsetSlot(baseSlot, 2));

        return keccak256(abi.encode(slots));
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
