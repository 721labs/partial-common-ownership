// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {Test} from "forge-std/Test.sol";
import {TestNFT} from "../../../contracts/test/TestNFT.sol";
import {TestWrapper} from "../../../contracts/test/TestWrapper.sol";
import {VmRecordedLogs} from "../helpers/VmRecordedLogs.sol";

/// @dev One-to-one deterministic ports of the 20 legacy Wrapper.ts scenarios.
contract WrapperParityTest is Test {
    VmRecordedLogs private constant VM_RECORDED_LOGS =
        VmRecordedLogs(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant TOKEN_ONE = 1;
    uint256 private constant TOKEN_TWO = 2;
    uint256 private constant TOKEN_THREE = 3;
    uint256 private constant WRAP_VALUATION = 1 ether;
    uint256 private constant TAX_RATE = 50_000_000_000;
    uint256 private constant COLLECTION_FREQUENCY_DAYS = 365;
    uint256 private constant COLLECTION_FREQUENCY_SECONDS = 365 days;
    uint256 private constant NON_BENEFICIARY_DEPOSIT = 3 ether;
    uint256 private constant TEST_TIMESTAMP = 1_650_000_000;
    // Frozen by compatibility/baseline.json's Wrapper storage layout.
    uint256 private constant WRAPPED_TOKEN_MAP_SLOT = 14;

    bytes32 private constant APPROVAL_SIGNATURE = keccak256("Approval(address,address,uint256)");
    bytes32 private constant TRANSFER_SIGNATURE = keccak256("Transfer(address,address,uint256)");
    bytes32 private constant LOG_BENEFICIARY_UPDATED_SIGNATURE = keccak256("LogBeneficiaryUpdated(uint256,address)");
    bytes32 private constant LOG_COLLECTION_SIGNATURE = keccak256("LogCollection(uint256,uint256)");
    bytes32 private constant LOG_FORECLOSURE_SIGNATURE = keccak256("LogForeclosure(uint256,address)");
    bytes32 private constant LOG_REMITTANCE_SIGNATURE = keccak256("LogRemittance(uint8,address,uint256)");
    bytes32 private constant LOG_TOKEN_WRAPPED_SIGNATURE = keccak256("LogTokenWrapped(address,uint256,uint256)");
    bytes32 private constant LOG_VALUATION_SIGNATURE = keccak256("LogValuation(uint256,uint256)");

    address private constant DEPLOYER = address(0xD3);
    address private constant BOB = address(0xB0B);
    address private constant ALICE = address(0xA11CE);

    TestNFT private testNFT;
    TestWrapper private wrapper;

    function setUp() public {
        // Wrapper tax accounting begins at the Unix epoch in the legacy contract.
        // Fixing a realistic timestamp makes the tax-collection ports deterministic.
        vm.warp(TEST_TIMESTAMP);
        vm.deal(DEPLOYER, 100 ether);
        vm.deal(BOB, 100 ether);
        vm.deal(ALICE, 100 ether);

        vm.startPrank(DEPLOYER);
        testNFT = new TestNFT();
        wrapper = new TestWrapper();
        vm.stopPrank();
    }

    function test_onERC721Received_directSafeTransferReverts() public {
        uint256 deployerBalanceBefore = testNFT.balanceOf(DEPLOYER);
        uint256 wrapperBalanceBefore = testNFT.balanceOf(address(wrapper));

        vm.prank(DEPLOYER);
        vm.expectRevert(bytes("Tokens can only be received via #wrap"));
        testNFT.safeTransferFrom(DEPLOYER, address(wrapper), TOKEN_ONE);

        assertEq(testNFT.ownerOf(TOKEN_ONE), DEPLOYER);
        assertEq(testNFT.balanceOf(DEPLOYER), deployerBalanceBefore);
        assertEq(testNFT.balanceOf(address(wrapper)), wrapperBalanceBefore);
    }

    function test_tokenURI_nonexistentTokenReverts() public {
        uint256 wrappedId = wrapper.wrappedTokenId(address(testNFT), TOKEN_ONE);

        vm.expectRevert(bytes("ERC721Metadata: URI query for nonexistent token"));
        wrapper.tokenURI(wrappedId);
    }

    function test_tokenURI_returnsUnderlyingTokenURI() public {
        uint256 wrappedId = _wrap(TOKEN_ONE, DEPLOYER);

        assertEq(wrapper.tokenURI(wrappedId), "721.dev/1");
    }

    function test_unwrap_nonOriginatorReverts() public {
        uint256 wrappedId = _wrap(TOKEN_ONE, DEPLOYER);
        uint256 wrappedBalanceBefore = wrapper.balanceOf(DEPLOYER);

        vm.prank(ALICE);
        vm.expectRevert(bytes("Wrap originator only"));
        wrapper.unwrap(wrappedId);

        assertEq(wrapper.ownerOf(wrappedId), DEPLOYER);
        assertEq(wrapper.balanceOf(DEPLOYER), wrappedBalanceBefore);
        assertEq(testNFT.ownerOf(TOKEN_ONE), address(wrapper));
    }

    function test_unwrap_nonexistentTokenReverts() public {
        vm.prank(DEPLOYER);
        vm.expectRevert(bytes("ERC721: query for nonexistent token"));
        wrapper.unwrap(TOKEN_ONE);
    }

    function test_unwrap_afterBeneficiaryWrap() public {
        uint256 wrappedId = _wrap(TOKEN_ONE, DEPLOYER);
        uint256 ownerBalanceBefore = DEPLOYER.balance;
        uint256 wrappedBalanceBefore = wrapper.balanceOf(DEPLOYER);
        uint256 contractBalanceBefore = address(wrapper).balance;

        // A subsequent Hardhat transaction is mined one second later.
        vm.warp(block.timestamp + 1);
        VM_RECORDED_LOGS.recordLogs();
        vm.prank(DEPLOYER);
        wrapper.unwrap(wrappedId);
        VmRecordedLogs.Log[] memory entries = VM_RECORDED_LOGS.getRecordedLogs();

        _assertWrapperEventOrderForBeneficiaryUnwrap(entries, wrappedId, TOKEN_ONE, DEPLOYER);
        _assertUnwrappedState(wrappedId, TOKEN_ONE, DEPLOYER, wrappedBalanceBefore);
        assertEq(DEPLOYER.balance, ownerBalanceBefore);
        assertEq(address(wrapper).balance, contractBalanceBefore);
        assertEq(wrapper.taxationCollected(wrappedId), 0);
    }

    function test_unwrap_afterNonBeneficiaryWrap() public {
        uint256 wrappedId = _wrap(TOKEN_ONE, BOB);
        // Match the next-block timestamp used by the legacy unwrap transaction.
        vm.warp(block.timestamp + 1);
        (uint256 taxDue,) = wrapper.taxOwed(wrappedId);
        uint256 deployerBalanceBefore = DEPLOYER.balance;
        uint256 beneficiaryBalanceBefore = BOB.balance;
        uint256 wrappedBalanceBefore = wrapper.balanceOf(DEPLOYER);
        uint256 contractBalanceBefore = address(wrapper).balance;

        assertGt(taxDue, 0);
        assertLt(taxDue, NON_BENEFICIARY_DEPOSIT);

        VM_RECORDED_LOGS.recordLogs();
        vm.prank(DEPLOYER);
        wrapper.unwrap(wrappedId);
        VmRecordedLogs.Log[] memory entries = VM_RECORDED_LOGS.getRecordedLogs();

        uint256 returnedDeposit = NON_BENEFICIARY_DEPOSIT - taxDue;
        _assertWrapperEventOrderForTaxedUnwrap(entries, wrappedId, DEPLOYER, taxDue, returnedDeposit, TOKEN_ONE);
        _assertUnwrappedState(wrappedId, TOKEN_ONE, DEPLOYER, wrappedBalanceBefore);
        assertEq(wrapper.taxationCollected(wrappedId), taxDue);
        assertEq(BOB.balance, beneficiaryBalanceBefore + taxDue);
        assertEq(DEPLOYER.balance, deployerBalanceBefore + returnedDeposit);
        assertEq(address(wrapper).balance, contractBalanceBefore - NON_BENEFICIARY_DEPOSIT);
    }

    function test_unwrap_collectsTaxAndReturnsDeposit() public {
        uint256 wrappedId = _wrap(TOKEN_ONE, DEPLOYER);

        uint256 deployerBalanceBeforeTakeover = DEPLOYER.balance;
        uint256 aliceBalanceBeforeTakeover = ALICE.balance;
        vm.warp(block.timestamp + 1);
        vm.prank(ALICE);
        wrapper.takeoverLease{value: 3 ether}(wrappedId, 2 ether, WRAP_VALUATION);

        assertEq(wrapper.ownerOf(wrappedId), ALICE);
        assertEq(wrapper.valuationOf(wrappedId), 2 ether);
        assertEq(wrapper.depositOf(wrappedId), 2 ether);
        assertEq(DEPLOYER.balance, deployerBalanceBeforeTakeover + 1 ether);
        assertEq(ALICE.balance, aliceBalanceBeforeTakeover - 3 ether);

        vm.warp(block.timestamp + 1);
        (uint256 taxDueBeforeCap,) = wrapper.taxOwed(wrappedId);
        assertGt(taxDueBeforeCap, 2 ether);
        uint256 beneficiaryBalanceBeforeUnwrap = DEPLOYER.balance;
        uint256 aliceBalanceBeforeUnwrap = ALICE.balance;
        uint256 wrappedBalanceBefore = wrapper.balanceOf(ALICE);
        uint256 contractBalanceBefore = address(wrapper).balance;

        VM_RECORDED_LOGS.recordLogs();
        vm.prank(DEPLOYER);
        wrapper.unwrap(wrappedId);
        VmRecordedLogs.Log[] memory entries = VM_RECORDED_LOGS.getRecordedLogs();

        _assertWrapperEventOrderForForeclosingUnwrap(entries, wrappedId, ALICE, 2 ether, TOKEN_ONE);
        _assertUnwrappedState(wrappedId, TOKEN_ONE, ALICE, wrappedBalanceBefore);
        assertEq(wrapper.taxationCollected(wrappedId), 2 ether);
        assertEq(DEPLOYER.balance, beneficiaryBalanceBeforeUnwrap + 2 ether);
        assertEq(ALICE.balance, aliceBalanceBeforeUnwrap);
        assertEq(address(wrapper).balance, contractBalanceBefore - 2 ether);
    }

    function test_wrap_zeroBeneficiaryReverts() public {
        vm.prank(ALICE);
        vm.expectRevert(bytes("Beneficiary cannot be address zero"));
        wrapper.wrap(
            address(testNFT), TOKEN_ONE, WRAP_VALUATION, payable(address(0)), TAX_RATE, COLLECTION_FREQUENCY_DAYS
        );
    }

    function test_wrap_beneficiaryCannotIncludeDeposit() public {
        uint256 payerBalanceBefore = DEPLOYER.balance;
        uint256 contractBalanceBefore = address(wrapper).balance;

        vm.prank(DEPLOYER);
        vm.expectRevert(bytes("No deposit required"));
        wrapper.wrap{value: 1 ether}(
            address(testNFT), TOKEN_ONE, WRAP_VALUATION, payable(DEPLOYER), TAX_RATE, COLLECTION_FREQUENCY_DAYS
        );

        assertEq(DEPLOYER.balance, payerBalanceBefore);
        assertEq(address(wrapper).balance, contractBalanceBefore);
    }

    function test_wrap_nonBeneficiaryMustIncludeDeposit() public {
        vm.prank(DEPLOYER);
        vm.expectRevert(bytes("Deposit required"));
        wrapper.wrap(address(testNFT), TOKEN_ONE, WRAP_VALUATION, payable(BOB), TAX_RATE, COLLECTION_FREQUENCY_DAYS);
    }

    function test_wrap_unapprovedOwnerRevertsAndRollsBack() public {
        uint256 wrappedId = wrapper.wrappedTokenId(address(testNFT), TOKEN_ONE);
        address nftOwnerBefore = testNFT.ownerOf(TOKEN_ONE);
        uint256 nftOwnerBalanceBefore = testNFT.balanceOf(nftOwnerBefore);
        uint256 wrapperEtherBalanceBefore = address(wrapper).balance;
        uint256 wrappedBalanceBefore = wrapper.balanceOf(DEPLOYER);
        address approvalBefore = testNFT.getApproved(TOKEN_ONE);

        vm.prank(DEPLOYER);
        vm.expectRevert();
        wrapper.wrap(
            address(testNFT), TOKEN_ONE, WRAP_VALUATION, payable(DEPLOYER), TAX_RATE, COLLECTION_FREQUENCY_DAYS
        );

        assertEq(testNFT.ownerOf(TOKEN_ONE), nftOwnerBefore);
        assertEq(testNFT.balanceOf(nftOwnerBefore), nftOwnerBalanceBefore);
        assertEq(testNFT.getApproved(TOKEN_ONE), approvalBefore);
        assertEq(address(wrapper).balance, wrapperEtherBalanceBefore);
        assertEq(wrapper.balanceOf(DEPLOYER), wrappedBalanceBefore);
        _assertWrappedTokenDoesNotExist(wrappedId);
    }

    function test_wrap_zeroTaxPeriodReverts() public {
        vm.prank(ALICE);
        vm.expectRevert(bytes("Tax frequency must be > 0"));
        wrapper.wrap(address(testNFT), TOKEN_ONE, WRAP_VALUATION, payable(ALICE), TAX_RATE, 0);
    }

    function test_wrap_zeroTaxRateReverts() public {
        vm.prank(ALICE);
        vm.expectRevert(bytes("Tax rate must be > 0"));
        wrapper.wrap(address(testNFT), TOKEN_ONE, WRAP_VALUATION, payable(ALICE), 0, COLLECTION_FREQUENCY_DAYS);
    }

    function test_wrap_zeroValuationReverts() public {
        vm.prank(ALICE);
        vm.expectRevert(bytes("Valuation must be > 0"));
        wrapper.wrap(address(testNFT), TOKEN_ONE, 0, payable(ALICE), TAX_RATE, COLLECTION_FREQUENCY_DAYS);
    }

    function test_wrap_nonOwnerRevertsAndRollsBack() public {
        uint256 wrappedId = wrapper.wrappedTokenId(address(testNFT), TOKEN_ONE);
        address nftOwnerBefore = testNFT.ownerOf(TOKEN_ONE);
        uint256 nftOwnerBalanceBefore = testNFT.balanceOf(nftOwnerBefore);
        uint256 wrapperEtherBalanceBefore = address(wrapper).balance;
        uint256 aliceWrappedBalanceBefore = wrapper.balanceOf(ALICE);
        uint256 aliceEtherBalanceBefore = ALICE.balance;

        vm.prank(ALICE);
        vm.expectRevert();
        wrapper.wrap{value: 1 ether}(
            address(testNFT), TOKEN_ONE, WRAP_VALUATION, payable(DEPLOYER), TAX_RATE, COLLECTION_FREQUENCY_DAYS
        );

        assertEq(testNFT.ownerOf(TOKEN_ONE), nftOwnerBefore);
        assertEq(testNFT.balanceOf(nftOwnerBefore), nftOwnerBalanceBefore);
        assertEq(address(wrapper).balance, wrapperEtherBalanceBefore);
        assertEq(wrapper.balanceOf(ALICE), aliceWrappedBalanceBefore);
        assertEq(ALICE.balance, aliceEtherBalanceBefore);
        _assertWrappedTokenDoesNotExist(wrappedId);
    }

    function test_wrap_canUnwrapAndRewrap() public {
        uint256 wrappedId = _wrap(TOKEN_ONE, DEPLOYER);
        uint256 wrappedBalanceBefore = wrapper.balanceOf(DEPLOYER);

        vm.warp(block.timestamp + 1);
        VM_RECORDED_LOGS.recordLogs();
        vm.prank(DEPLOYER);
        wrapper.unwrap(wrappedId);
        VmRecordedLogs.Log[] memory entries = VM_RECORDED_LOGS.getRecordedLogs();
        _assertWrapperEventOrderForBeneficiaryUnwrap(entries, wrappedId, TOKEN_ONE, DEPLOYER);
        _assertUnwrappedState(wrappedId, TOKEN_ONE, DEPLOYER, wrappedBalanceBefore);

        uint256 rewrappedId = _wrap(TOKEN_ONE, BOB);
        assertEq(rewrappedId, wrappedId);
        assertEq(testNFT.ownerOf(TOKEN_ONE), address(wrapper));
        assertEq(wrapper.ownerOf(rewrappedId), DEPLOYER);
        assertEq(wrapper.depositOf(rewrappedId), NON_BENEFICIARY_DEPOSIT);
    }

    function test_wrap_tokenOwnerCanWrap() public {
        uint256 wrappedId = _wrap(TOKEN_ONE, BOB);

        assertEq(testNFT.ownerOf(TOKEN_ONE), address(wrapper));
        assertEq(wrapper.ownerOf(wrappedId), DEPLOYER);
        assertEq(wrapper.depositOf(wrappedId), NON_BENEFICIARY_DEPOSIT);
        assertEq(wrapper.valuationOf(wrappedId), WRAP_VALUATION);
        assertEq(wrapper.beneficiaryOf(wrappedId), BOB);
        assertEq(wrapper.taxRateOf(wrappedId), TAX_RATE);
        assertEq(wrapper.collectionFrequencyOf(wrappedId), COLLECTION_FREQUENCY_SECONDS);
        assertEq(address(wrapper).balance, NON_BENEFICIARY_DEPOSIT);
    }

    function test_wrappedTokenId_deterministicallyGeneratesIds() public {
        assertEq(
            wrapper.wrappedTokenId(address(testNFT), TOKEN_ONE),
            uint256(keccak256(abi.encode(address(testNFT), TOKEN_ONE)))
        );
        assertEq(
            wrapper.wrappedTokenId(address(testNFT), TOKEN_TWO),
            uint256(keccak256(abi.encode(address(testNFT), TOKEN_TWO)))
        );
        assertEq(
            wrapper.wrappedTokenId(address(testNFT), TOKEN_THREE),
            uint256(keccak256(abi.encode(address(testNFT), TOKEN_THREE)))
        );
    }

    function test_testNFT_setsUpProperly() public {
        assertEq(testNFT.ownerOf(TOKEN_ONE), DEPLOYER);
        assertEq(testNFT.ownerOf(TOKEN_TWO), DEPLOYER);
        assertEq(testNFT.ownerOf(TOKEN_THREE), DEPLOYER);
        assertEq(testNFT.balanceOf(DEPLOYER), 3);
    }

    function _wrap(uint256 tokenId_, address beneficiary_) internal returns (uint256 wrappedId) {
        wrappedId = wrapper.wrappedTokenId(address(testNFT), tokenId_);
        uint256 deposit = beneficiary_ == DEPLOYER ? 0 : NON_BENEFICIARY_DEPOSIT;
        uint256 payerBalanceBefore = DEPLOYER.balance;
        uint256 contractBalanceBefore = address(wrapper).balance;
        uint256 wrappedBalanceBefore = wrapper.balanceOf(DEPLOYER);

        vm.startPrank(DEPLOYER);
        testNFT.approve(address(wrapper), tokenId_);
        VM_RECORDED_LOGS.recordLogs();
        wrapper.wrap{value: deposit}(
            address(testNFT), tokenId_, WRAP_VALUATION, payable(beneficiary_), TAX_RATE, COLLECTION_FREQUENCY_DAYS
        );
        vm.stopPrank();

        VmRecordedLogs.Log[] memory entries = VM_RECORDED_LOGS.getRecordedLogs();
        _assertWrapperEventOrderForWrap(entries, tokenId_, wrappedId, beneficiary_);

        assertEq(testNFT.ownerOf(tokenId_), address(wrapper));
        assertEq(wrapper.ownerOf(wrappedId), DEPLOYER);
        assertEq(wrapper.depositOf(wrappedId), deposit);
        assertEq(wrapper.valuationOf(wrappedId), WRAP_VALUATION);
        assertEq(wrapper.beneficiaryOf(wrappedId), beneficiary_);
        assertEq(wrapper.taxRateOf(wrappedId), TAX_RATE);
        assertEq(wrapper.collectionFrequencyOf(wrappedId), COLLECTION_FREQUENCY_SECONDS);
        assertEq(wrapper.balanceOf(DEPLOYER), wrappedBalanceBefore + 1);
        assertEq(DEPLOYER.balance, payerBalanceBefore - deposit);
        assertEq(address(wrapper).balance, contractBalanceBefore + deposit);
        _assertWrappedTokenStorage(wrappedId, tokenId_);
    }

    function _assertUnwrappedState(
        uint256 wrappedId_,
        uint256 underlyingId_,
        address expectedUnderlyingOwner_,
        uint256 wrappedOwnerBalanceBefore_
    ) internal {
        _assertWrappedTokenDoesNotExist(wrappedId_);
        assertEq(wrapper.beneficiaryOf(wrappedId_), address(0));

        vm.expectRevert(bytes("ERC721: query for nonexistent token"));
        wrapper.selfAssess(wrappedId_, 2 ether);

        assertEq(wrapper.valuationOf(wrappedId_), 0);

        vm.expectRevert(bytes("ERC721: query for nonexistent token"));
        wrapper.taxRateOf(wrappedId_);

        vm.expectRevert(bytes("ERC721: query for nonexistent token"));
        wrapper.collectionFrequencyOf(wrappedId_);

        vm.expectRevert(bytes("ERC721: query for nonexistent token"));
        wrapper.depositOf(wrappedId_);

        vm.expectRevert(bytes("ERC721Metadata: URI query for nonexistent token"));
        wrapper.tokenURI(wrappedId_);

        assertEq(testNFT.ownerOf(underlyingId_), expectedUnderlyingOwner_);
        assertEq(testNFT.getApproved(underlyingId_), address(0));
        assertEq(wrapper.balanceOf(expectedUnderlyingOwner_), wrappedOwnerBalanceBefore_ - 1);
        assertEq(address(wrapper).balance, 0);
        _assertWrappedTokenStorageCleared(wrappedId_);
    }

    function _assertWrappedTokenDoesNotExist(uint256 wrappedId_) internal {
        vm.expectRevert(bytes("ERC721: owner query for nonexistent token"));
        wrapper.ownerOf(wrappedId_);
    }

    function _assertWrappedTokenStorage(uint256 wrappedId_, uint256 underlyingId_) internal {
        bytes32 baseSlot = _wrappedTokenBaseSlot(wrappedId_);
        assertEq(address(uint160(uint256(vm.load(address(wrapper), baseSlot)))), address(testNFT));
        assertEq(uint256(vm.load(address(wrapper), _offsetSlot(baseSlot, 1))), underlyingId_);
        assertEq(address(uint160(uint256(vm.load(address(wrapper), _offsetSlot(baseSlot, 2))))), DEPLOYER);
    }

    function _assertWrappedTokenStorageCleared(uint256 wrappedId_) internal {
        bytes32 baseSlot = _wrappedTokenBaseSlot(wrappedId_);
        assertEq(vm.load(address(wrapper), baseSlot), bytes32(0));
        assertEq(vm.load(address(wrapper), _offsetSlot(baseSlot, 1)), bytes32(0));
        assertEq(vm.load(address(wrapper), _offsetSlot(baseSlot, 2)), bytes32(0));
    }

    function _wrappedTokenBaseSlot(uint256 wrappedId_) internal pure returns (bytes32) {
        return keccak256(abi.encode(wrappedId_, WRAPPED_TOKEN_MAP_SLOT));
    }

    function _offsetSlot(bytes32 baseSlot_, uint256 offset_) internal pure returns (bytes32) {
        return bytes32(uint256(baseSlot_) + offset_);
    }

    function _assertWrapperEventOrderForWrap(
        VmRecordedLogs.Log[] memory entries_,
        uint256 underlyingId_,
        uint256 wrappedId_,
        address beneficiary_
    ) internal {
        assertEq(entries_.length, 5, "wrap transaction event count");
        _assertTransferFromEmitter(entries_[0], address(testNFT), DEPLOYER, address(wrapper), underlyingId_);
        for (uint256 i = 1; i < entries_.length; i++) {
            assertEq(entries_[i].emitter, address(wrapper));
        }

        bytes32[] memory expected = new bytes32[](4);
        expected[0] = TRANSFER_SIGNATURE;
        expected[1] = LOG_VALUATION_SIGNATURE;
        expected[2] = LOG_BENEFICIARY_UPDATED_SIGNATURE;
        expected[3] = LOG_TOKEN_WRAPPED_SIGNATURE;
        VmRecordedLogs.Log[] memory logs = _wrapperLogs(entries_);
        _assertSignatures(logs, expected);

        _assertTransfer(logs[0], address(0), DEPLOYER, wrappedId_);
        _assertValuation(logs[1], wrappedId_, WRAP_VALUATION);
        _assertBeneficiary(logs[2], wrappedId_, beneficiary_);
        assertEq(logs[3].topics.length, 1);
        assertEq(logs[3].data, abi.encode(address(testNFT), underlyingId_, wrappedId_));
    }

    function _assertWrapperEventOrderForBeneficiaryUnwrap(
        VmRecordedLogs.Log[] memory entries_,
        uint256 wrappedId_,
        uint256 underlyingId_,
        address underlyingOwner_
    ) internal {
        assertEq(entries_.length, 3, "beneficiary unwrap event count");
        assertEq(entries_[0].emitter, address(wrapper));
        assertEq(entries_[1].emitter, address(wrapper));
        _assertTransferFromEmitter(entries_[2], address(testNFT), address(wrapper), underlyingOwner_, underlyingId_);

        bytes32[] memory expected = new bytes32[](2);
        expected[0] = APPROVAL_SIGNATURE;
        expected[1] = TRANSFER_SIGNATURE;
        VmRecordedLogs.Log[] memory logs = _wrapperLogs(entries_);
        _assertSignatures(logs, expected);
        _assertApproval(logs[0], DEPLOYER, address(0), wrappedId_);
        _assertTransfer(logs[1], DEPLOYER, address(0), wrappedId_);
    }

    function _assertWrapperEventOrderForTaxedUnwrap(
        VmRecordedLogs.Log[] memory entries_,
        uint256 wrappedId_,
        address owner_,
        uint256 tax_,
        uint256 returnedDeposit_,
        uint256 underlyingId_
    ) internal {
        assertEq(entries_.length, 10, "taxed unwrap event count");
        for (uint256 i = 0; i < 9; i++) {
            assertEq(entries_[i].emitter, address(wrapper));
        }
        _assertTransferFromEmitter(entries_[9], address(testNFT), address(wrapper), owner_, underlyingId_);

        bytes32[] memory expected = new bytes32[](9);
        expected[0] = LOG_COLLECTION_SIGNATURE;
        expected[1] = LOG_REMITTANCE_SIGNATURE;
        expected[2] = LOG_REMITTANCE_SIGNATURE;
        expected[3] = LOG_VALUATION_SIGNATURE;
        expected[4] = APPROVAL_SIGNATURE;
        expected[5] = TRANSFER_SIGNATURE;
        expected[6] = LOG_FORECLOSURE_SIGNATURE;
        expected[7] = APPROVAL_SIGNATURE;
        expected[8] = TRANSFER_SIGNATURE;
        VmRecordedLogs.Log[] memory logs = _wrapperLogs(entries_);
        _assertSignatures(logs, expected);

        _assertCollection(logs[0], wrappedId_, tax_);
        _assertRemittance(logs[1], 3, BOB, tax_);
        _assertRemittance(logs[2], 1, owner_, returnedDeposit_);
        _assertValuation(logs[3], wrappedId_, 0);
        _assertApproval(logs[4], owner_, address(0), wrappedId_);
        _assertTransfer(logs[5], owner_, address(wrapper), wrappedId_);
        _assertForeclosure(logs[6], wrappedId_, owner_);
        _assertApproval(logs[7], address(wrapper), address(0), wrappedId_);
        _assertTransfer(logs[8], address(wrapper), address(0), wrappedId_);
    }

    function _assertWrapperEventOrderForForeclosingUnwrap(
        VmRecordedLogs.Log[] memory entries_,
        uint256 wrappedId_,
        address previousOwner_,
        uint256 collected_,
        uint256 underlyingId_
    ) internal {
        assertEq(entries_.length, 9, "foreclosing unwrap event count");
        for (uint256 i = 0; i < 8; i++) {
            assertEq(entries_[i].emitter, address(wrapper));
        }
        _assertTransferFromEmitter(entries_[8], address(testNFT), address(wrapper), previousOwner_, underlyingId_);

        bytes32[] memory expected = new bytes32[](8);
        expected[0] = LOG_COLLECTION_SIGNATURE;
        expected[1] = LOG_REMITTANCE_SIGNATURE;
        expected[2] = LOG_VALUATION_SIGNATURE;
        expected[3] = APPROVAL_SIGNATURE;
        expected[4] = TRANSFER_SIGNATURE;
        expected[5] = LOG_FORECLOSURE_SIGNATURE;
        expected[6] = APPROVAL_SIGNATURE;
        expected[7] = TRANSFER_SIGNATURE;

        VmRecordedLogs.Log[] memory logs = _wrapperLogs(entries_);
        _assertSignatures(logs, expected);
        _assertCollection(logs[0], wrappedId_, collected_);
        _assertRemittance(logs[1], 3, DEPLOYER, collected_);
        _assertValuation(logs[2], wrappedId_, 0);
        _assertApproval(logs[3], previousOwner_, address(0), wrappedId_);
        _assertTransfer(logs[4], previousOwner_, address(wrapper), wrappedId_);
        _assertForeclosure(logs[5], wrappedId_, previousOwner_);
        _assertApproval(logs[6], address(wrapper), address(0), wrappedId_);
        _assertTransfer(logs[7], address(wrapper), address(0), wrappedId_);
    }

    function _assertApproval(VmRecordedLogs.Log memory entry_, address owner_, address approved_, uint256 tokenId_)
        internal
    {
        assertEq(entry_.topics.length, 4);
        assertEq(entry_.topics[0], APPROVAL_SIGNATURE);
        _assertIndexedAddress(entry_, 1, owner_);
        _assertIndexedAddress(entry_, 2, approved_);
        _assertIndexedUint(entry_, 3, tokenId_);
        assertEq(entry_.data.length, 0);
    }

    function _assertTransfer(VmRecordedLogs.Log memory entry_, address from_, address to_, uint256 tokenId_) internal {
        assertEq(entry_.topics.length, 4);
        assertEq(entry_.topics[0], TRANSFER_SIGNATURE);
        _assertIndexedAddress(entry_, 1, from_);
        _assertIndexedAddress(entry_, 2, to_);
        _assertIndexedUint(entry_, 3, tokenId_);
        assertEq(entry_.data.length, 0);
    }

    function _assertTransferFromEmitter(
        VmRecordedLogs.Log memory entry_,
        address emitter_,
        address from_,
        address to_,
        uint256 tokenId_
    ) internal {
        assertEq(entry_.emitter, emitter_);
        _assertTransfer(entry_, from_, to_, tokenId_);
    }

    function _assertCollection(VmRecordedLogs.Log memory entry_, uint256 tokenId_, uint256 collected_) internal {
        assertEq(entry_.topics.length, 3);
        assertEq(entry_.topics[0], LOG_COLLECTION_SIGNATURE);
        _assertIndexedUint(entry_, 1, tokenId_);
        _assertIndexedUint(entry_, 2, collected_);
        assertEq(entry_.data.length, 0);
    }

    function _assertValuation(VmRecordedLogs.Log memory entry_, uint256 tokenId_, uint256 valuation_) internal {
        assertEq(entry_.topics.length, 3);
        assertEq(entry_.topics[0], LOG_VALUATION_SIGNATURE);
        _assertIndexedUint(entry_, 1, tokenId_);
        _assertIndexedUint(entry_, 2, valuation_);
        assertEq(entry_.data.length, 0);
    }

    function _assertForeclosure(VmRecordedLogs.Log memory entry_, uint256 tokenId_, address previousOwner_) internal {
        assertEq(entry_.topics.length, 3);
        assertEq(entry_.topics[0], LOG_FORECLOSURE_SIGNATURE);
        _assertIndexedUint(entry_, 1, tokenId_);
        _assertIndexedAddress(entry_, 2, previousOwner_);
        assertEq(entry_.data.length, 0);
    }

    function _assertBeneficiary(VmRecordedLogs.Log memory entry_, uint256 tokenId_, address beneficiary_) internal {
        assertEq(entry_.topics.length, 3);
        assertEq(entry_.topics[0], LOG_BENEFICIARY_UPDATED_SIGNATURE);
        _assertIndexedUint(entry_, 1, tokenId_);
        _assertIndexedAddress(entry_, 2, beneficiary_);
        assertEq(entry_.data.length, 0);
    }

    function _assertRemittance(VmRecordedLogs.Log memory entry_, uint256 trigger_, address recipient_, uint256 amount_)
        internal
    {
        assertEq(entry_.topics.length, 4);
        assertEq(entry_.topics[0], LOG_REMITTANCE_SIGNATURE);
        assertEq(entry_.topics[1], bytes32(trigger_));
        assertEq(entry_.topics[2], bytes32(uint256(uint160(recipient_))));
        assertEq(entry_.topics[3], bytes32(amount_));
        assertEq(entry_.data.length, 0);
    }

    function _wrapperLogs(VmRecordedLogs.Log[] memory entries_)
        internal
        view
        returns (VmRecordedLogs.Log[] memory logs)
    {
        uint256 count;
        for (uint256 i = 0; i < entries_.length; i++) {
            if (entries_[i].emitter == address(wrapper)) count++;
        }

        logs = new VmRecordedLogs.Log[](count);
        uint256 outputIndex;
        for (uint256 i = 0; i < entries_.length; i++) {
            if (entries_[i].emitter == address(wrapper)) {
                logs[outputIndex] = entries_[i];
                outputIndex++;
            }
        }
    }

    function _assertSignatures(VmRecordedLogs.Log[] memory entries_, bytes32[] memory expected_) internal {
        assertEq(entries_.length, expected_.length, "unexpected wrapper event count");
        for (uint256 i = 0; i < expected_.length; i++) {
            assertGt(entries_[i].topics.length, 0);
            assertEq(entries_[i].topics[0], expected_[i], "wrapper event order");
        }
    }

    function _assertIndexedAddress(VmRecordedLogs.Log memory entry_, uint256 topic_, address expected_) internal {
        assertGt(entry_.topics.length, topic_);
        assertEq(entry_.topics[topic_], bytes32(uint256(uint160(expected_))));
    }

    function _assertIndexedUint(VmRecordedLogs.Log memory entry_, uint256 topic_, uint256 expected_) internal {
        assertGt(entry_.topics.length, topic_);
        assertEq(entry_.topics[topic_], bytes32(expected_));
    }
}
