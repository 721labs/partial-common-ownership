// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {TestPCOToken} from "../../../contracts/test/TestPCOToken.sol";

contract PCODeferredRejectingBeneficiary {
    error EtherRejected();

    receive() external payable {
        revert EtherRejected();
    }

    function acquire(TestPCOToken token_, uint256 newValuation_, uint256 currentValuation_) external payable {
        token_.takeoverLease{value: msg.value}(TOKEN_ID, newValuation_, currentValuation_);
    }

    uint256 private constant TOKEN_ID = 3;
}

/// @notice Regression coverage for authorization that can become stale while
/// tax collection materializes foreclosure.
contract PCODeferredRegressionTest is Test {
    struct TokenState {
        address owner;
        address approved;
        bool operatorApproval;
        uint256 valuation;
        uint256 deposit;
        uint256 lastCollectionTime;
        uint256 taxationCollected;
        uint256 taxCollectedSinceTransfer;
        uint256 contractEther;
        uint256 ownerEther;
        uint256 callerEther;
        uint256 beneficiaryEther;
        uint256 beneficiaryOutstanding;
        uint256 contractTokens;
        uint256 ownerTokens;
        uint256 callerTokens;
        bytes32 lock;
    }

    uint256 private constant START_TIME = 1_700_000_000;
    uint256 private constant TOKEN_ID = 3;
    uint256 private constant LOCKED_SLOT = 13;

    bytes32 private constant APPROVAL_SIGNATURE = keccak256("Approval(address,address,uint256)");
    bytes32 private constant TRANSFER_SIGNATURE = keccak256("Transfer(address,address,uint256)");
    bytes32 private constant TAKEOVER_SIGNATURE = keccak256("LogLeaseTakeover(uint256,address,uint256)");
    bytes32 private constant FORECLOSURE_SIGNATURE = keccak256("LogForeclosure(uint256,address)");
    bytes32 private constant COLLECTION_SIGNATURE = keccak256("LogCollection(uint256,uint256)");
    bytes32 private constant REMITTANCE_SIGNATURE = keccak256("LogRemittance(uint8,address,uint256)");
    bytes32 private constant OUTSTANDING_SIGNATURE = keccak256("LogOutstandingRemittance(address)");
    bytes32 private constant VALUATION_SIGNATURE = keccak256("LogValuation(uint256,uint256)");

    /// @dev The legacy identifier is retained for compatibility-inventory
    /// stability. Each mutation now revalidates all three ERC721 authorization
    /// modes after collection and rolls back when collection forecloses.
    function test_deferredStage10_pendingForeclosureSelfAssessPreservesLegacyBrickedState() public {
        for (uint256 authorizationMode = 0; authorizationMode < 3; authorizationMode++) {
            (TestPCOToken token, address payable beneficiary, address alice, address caller) =
                _pendingForeclosureFixture(authorizationMode);

            for (uint256 mutationMode = 0; mutationMode < 4; mutationMode++) {
                _assertPostCollectionAuthorizationRollback(token, beneficiary, alice, caller, mutationMode);
            }

            _assertThirdPartyRetrySucceeds(token, beneficiary, alice);
        }
    }

    function _pendingForeclosureFixture(uint256 authorizationMode_)
        private
        returns (TestPCOToken token_, address payable beneficiary_, address alice_, address caller_)
    {
        vm.warp(START_TIME);

        if (authorizationMode_ == 2) {
            beneficiary_ = payable(address(new PCODeferredRejectingBeneficiary()));
        } else {
            beneficiary_ = payable(makeAddr("deferred-beneficiary"));
        }
        alice_ = makeAddr("deferred-alice");
        address operator = makeAddr("deferred-operator");
        vm.deal(beneficiary_, 100 ether);
        vm.deal(alice_, 100 ether);
        vm.deal(operator, 100 ether);

        token_ = new TestPCOToken(beneficiary_);

        // Beneficiary ownership accrues no tax and preserves this acquisition
        // timestamp through the later transfer to a taxable owner.
        if (beneficiary_.code.length == 0) {
            vm.prank(beneficiary_);
            token_.takeoverLease(TOKEN_ID, 1 ether, 0);
        } else {
            PCODeferredRejectingBeneficiary(beneficiary_).acquire(token_, 1 ether, 0);
        }
        vm.warp(START_TIME + 365 days);

        vm.prank(alice_);
        token_.takeoverLease{value: 2 ether}(TOKEN_ID, 1 ether, 1 ether);

        caller_ = alice_;
        if (authorizationMode_ == 1) {
            vm.prank(alice_);
            token_.approve(operator, TOKEN_ID);
            caller_ = operator;
        } else if (authorizationMode_ == 2) {
            vm.prank(alice_);
            token_.setApprovalForAll(operator, true);
            caller_ = operator;
        }

        assertEq(token_.ownerOf(TOKEN_ID), alice_);
        assertEq(token_.depositOf(TOKEN_ID), 1 ether);
        assertTrue(token_.foreclosed(TOKEN_ID));
    }

    function _assertPostCollectionAuthorizationRollback(
        TestPCOToken token_,
        address beneficiary_,
        address alice_,
        address caller_,
        uint256 mutationMode_
    ) private {
        TokenState memory before_ = _state(token_, beneficiary_, alice_, caller_);

        bool success;
        bytes memory returnData;
        vm.recordLogs();
        vm.prank(caller_);
        if (mutationMode_ == 0) {
            (success, returnData) =
                address(token_).call(abi.encodeWithSelector(token_.selfAssess.selector, TOKEN_ID, 2 ether));
        } else if (mutationMode_ == 1) {
            (success, returnData) =
                address(token_).call{value: 1 ether}(abi.encodeWithSelector(token_.deposit.selector, TOKEN_ID));
        } else if (mutationMode_ == 2) {
            // Exercise the no-op boundary: post-collection authorization must
            // run before `_withdrawDeposit` can return early for zero Wei.
            (success, returnData) =
                address(token_).call(abi.encodeWithSelector(token_.withdrawDeposit.selector, TOKEN_ID, 0));
        } else {
            (success, returnData) = address(token_).call(abi.encodeWithSelector(token_.exit.selector, TOKEN_ID));
        }
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertFalse(success);
        assertEq(returnData, abi.encodeWithSignature("Error(string)", "ERC721: caller is not owner nor approved"));
        assertEq(logs.length, 6);
        _assertForeclosureEventPrefix(logs, token_, beneficiary_, alice_);
        _assertStateUnchanged(token_, beneficiary_, alice_, caller_, before_);
        assertTrue(token_.foreclosed(TOKEN_ID));
    }

    function _assertThirdPartyRetrySucceeds(TestPCOToken token_, address beneficiary_, address alice_) private {
        address buyer = makeAddr("deferred-buyer");
        vm.deal(buyer, 100 ether);

        uint256 buyerBalanceBefore = buyer.balance;
        uint256 aliceBalanceBefore = alice_.balance;
        uint256 beneficiaryBalanceBefore = beneficiary_.balance;
        uint256 outstandingBefore = token_.outstandingRemittances(beneficiary_);
        uint256 buyerTokensBefore = token_.balanceOf(buyer);
        uint256 aliceTokensBefore = token_.balanceOf(alice_);
        uint256 contractTokensBefore = token_.balanceOf(address(token_));

        vm.recordLogs();
        vm.prank(buyer);
        token_.takeoverLease{value: 1 wei}(TOKEN_ID, 1 ether, 1 ether);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 10);
        _assertForeclosureEventPrefix(logs, token_, beneficiary_, alice_);
        _assertLog(logs[6], token_, VALUATION_SIGNATURE);
        assertEq(logs[6].topics[1], bytes32(TOKEN_ID));
        assertEq(logs[6].topics[2], bytes32(uint256(1 ether)));
        _assertLog(logs[7], token_, APPROVAL_SIGNATURE);
        assertEq(logs[7].topics[1], _addressTopic(address(token_)));
        assertEq(logs[7].topics[2], bytes32(0));
        assertEq(logs[7].topics[3], bytes32(TOKEN_ID));
        _assertLog(logs[8], token_, TRANSFER_SIGNATURE);
        assertEq(logs[8].topics[1], _addressTopic(address(token_)));
        assertEq(logs[8].topics[2], _addressTopic(buyer));
        assertEq(logs[8].topics[3], bytes32(TOKEN_ID));
        _assertLog(logs[9], token_, TAKEOVER_SIGNATURE);
        assertEq(logs[9].topics[1], bytes32(TOKEN_ID));
        assertEq(logs[9].topics[2], _addressTopic(buyer));
        assertEq(logs[9].topics[3], bytes32(uint256(1 ether)));

        uint256 expectedOutstanding = outstandingBefore;
        if (beneficiary_.code.length == 0) {
            assertEq(beneficiary_.balance, beneficiaryBalanceBefore + 1 ether);
        } else {
            expectedOutstanding += 1 ether;
            assertEq(beneficiary_.balance, beneficiaryBalanceBefore);
        }

        assertEq(token_.ownerOf(TOKEN_ID), buyer);
        assertEq(token_.valuationOf(TOKEN_ID), 1 ether);
        assertEq(token_.depositOf(TOKEN_ID), 1 wei);
        assertEq(token_.lastCollectionTimeOf(TOKEN_ID), block.timestamp);
        assertEq(token_.taxationCollected(TOKEN_ID), 1 ether);
        assertEq(token_.taxCollectedSinceLastTransferOf(TOKEN_ID), 0);
        assertEq(token_.getApproved(TOKEN_ID), address(0));
        assertEq(token_.balanceOf(buyer), buyerTokensBefore + 1);
        assertEq(token_.balanceOf(alice_), aliceTokensBefore - 1);
        assertEq(token_.balanceOf(address(token_)), contractTokensBefore);
        assertEq(buyer.balance, buyerBalanceBefore - 1 wei);
        assertEq(alice_.balance, aliceBalanceBefore);
        assertEq(token_.outstandingRemittances(beneficiary_), expectedOutstanding);
        assertEq(address(token_).balance, 1 wei + expectedOutstanding);
        assertFalse(token_.foreclosed(TOKEN_ID));
        assertEq(vm.load(address(token_), _mappingSlot(TOKEN_ID, LOCKED_SLOT)), bytes32(0));
    }

    function _assertForeclosureEventPrefix(
        Vm.Log[] memory logs_,
        TestPCOToken token_,
        address beneficiary_,
        address alice_
    ) private view {
        assertGe(logs_.length, 6);
        _assertLog(logs_[0], token_, COLLECTION_SIGNATURE);
        assertEq(logs_[0].topics[1], bytes32(TOKEN_ID));
        assertEq(logs_[0].topics[2], bytes32(uint256(1 ether)));

        if (beneficiary_.code.length == 0) {
            _assertLog(logs_[1], token_, REMITTANCE_SIGNATURE);
            assertEq(logs_[1].topics[1], bytes32(uint256(3)));
            assertEq(logs_[1].topics[2], _addressTopic(beneficiary_));
            assertEq(logs_[1].topics[3], bytes32(uint256(1 ether)));
        } else {
            _assertLog(logs_[1], token_, OUTSTANDING_SIGNATURE);
            assertEq(logs_[1].topics[1], _addressTopic(beneficiary_));
        }

        _assertLog(logs_[2], token_, VALUATION_SIGNATURE);
        assertEq(logs_[2].topics[1], bytes32(TOKEN_ID));
        assertEq(logs_[2].topics[2], bytes32(0));
        _assertLog(logs_[3], token_, APPROVAL_SIGNATURE);
        assertEq(logs_[3].topics[1], _addressTopic(alice_));
        assertEq(logs_[3].topics[2], bytes32(0));
        assertEq(logs_[3].topics[3], bytes32(TOKEN_ID));
        _assertLog(logs_[4], token_, TRANSFER_SIGNATURE);
        assertEq(logs_[4].topics[1], _addressTopic(alice_));
        assertEq(logs_[4].topics[2], _addressTopic(address(token_)));
        assertEq(logs_[4].topics[3], bytes32(TOKEN_ID));
        _assertLog(logs_[5], token_, FORECLOSURE_SIGNATURE);
        assertEq(logs_[5].topics[1], bytes32(TOKEN_ID));
        assertEq(logs_[5].topics[2], _addressTopic(alice_));
    }

    function _assertLog(Vm.Log memory log_, TestPCOToken token_, bytes32 signature_) private pure {
        assertEq(log_.emitter, address(token_));
        assertEq(log_.topics[0], signature_);
        assertEq(log_.data.length, 0);
    }

    function _addressTopic(address value_) private pure returns (bytes32) {
        return bytes32(uint256(uint160(value_)));
    }

    function _state(TestPCOToken token_, address beneficiary_, address alice_, address caller_)
        private
        view
        returns (TokenState memory state_)
    {
        state_.owner = token_.ownerOf(TOKEN_ID);
        state_.approved = token_.getApproved(TOKEN_ID);
        state_.operatorApproval = token_.isApprovedForAll(alice_, caller_);
        state_.valuation = token_.valuationOf(TOKEN_ID);
        state_.deposit = token_.depositOf(TOKEN_ID);
        state_.lastCollectionTime = token_.lastCollectionTimeOf(TOKEN_ID);
        state_.taxationCollected = token_.taxationCollected(TOKEN_ID);
        state_.taxCollectedSinceTransfer = token_.taxCollectedSinceLastTransferOf(TOKEN_ID);
        state_.contractEther = address(token_).balance;
        state_.ownerEther = state_.owner.balance;
        state_.callerEther = caller_.balance;
        state_.beneficiaryEther = beneficiary_.balance;
        state_.beneficiaryOutstanding = token_.outstandingRemittances(beneficiary_);
        state_.contractTokens = token_.balanceOf(address(token_));
        state_.ownerTokens = token_.balanceOf(state_.owner);
        state_.callerTokens = token_.balanceOf(caller_);
        state_.lock = vm.load(address(token_), _mappingSlot(TOKEN_ID, LOCKED_SLOT));
    }

    function _assertStateUnchanged(
        TestPCOToken token_,
        address beneficiary_,
        address alice_,
        address caller_,
        TokenState memory before_
    ) private view {
        assertEq(token_.ownerOf(TOKEN_ID), before_.owner);
        assertEq(token_.getApproved(TOKEN_ID), before_.approved);
        assertEq(token_.isApprovedForAll(alice_, caller_), before_.operatorApproval);
        assertEq(token_.valuationOf(TOKEN_ID), before_.valuation);
        assertEq(token_.depositOf(TOKEN_ID), before_.deposit);
        assertEq(token_.lastCollectionTimeOf(TOKEN_ID), before_.lastCollectionTime);
        assertEq(token_.taxationCollected(TOKEN_ID), before_.taxationCollected);
        assertEq(token_.taxCollectedSinceLastTransferOf(TOKEN_ID), before_.taxCollectedSinceTransfer);
        assertEq(address(token_).balance, before_.contractEther);
        assertEq(before_.owner.balance, before_.ownerEther);
        assertEq(caller_.balance, before_.callerEther);
        assertEq(beneficiary_.balance, before_.beneficiaryEther);
        assertEq(token_.outstandingRemittances(beneficiary_), before_.beneficiaryOutstanding);
        assertEq(token_.balanceOf(address(token_)), before_.contractTokens);
        assertEq(token_.balanceOf(before_.owner), before_.ownerTokens);
        assertEq(token_.balanceOf(caller_), before_.callerTokens);
        assertEq(vm.load(address(token_), _mappingSlot(TOKEN_ID, LOCKED_SLOT)), before_.lock);
    }

    function _mappingSlot(uint256 key_, uint256 slot_) private pure returns (bytes32) {
        return keccak256(abi.encode(key_, slot_));
    }
}
