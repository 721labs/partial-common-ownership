// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {Test} from "forge-std/Test.sol";
import {WrapperInvariantHandler} from "./helpers/WrapperInvariantHarness.sol";
import {WrapperInvariantTargets} from "./helpers/WrapperInvariantTargets.sol";

/// @dev Stateful Wrapper safety properties.
contract WrapperInvariantTest is Test, WrapperInvariantTargets {
    uint256 private constant TOKEN_COUNT = 3;

    uint256 private constant OWNERS_SLOT = 0;
    uint256 private constant TOKEN_APPROVALS_SLOT = 2;
    uint256 private constant VALUATIONS_SLOT = 4;
    uint256 private constant BENEFICIARIES_SLOT = 6;
    uint256 private constant TAX_RATES_SLOT = 9;
    uint256 private constant COLLECTION_FREQUENCIES_SLOT = 10;
    uint256 private constant DEPOSITS_SLOT = 12;
    uint256 private constant LOCKED_SLOT = 13;
    uint256 private constant WRAPPED_TOKEN_MAP_SLOT = 14;

    WrapperInvariantHandler private handler;

    function setUp() public {
        vm.warp(1_700_000_000);
        handler = new WrapperInvariantHandler();

        // Deterministic bootstrap prevents a green but vacuous campaign. It
        // proves one complete intended lifecycle plus one expected rejection
        // before the randomized handler begins: wrap -> takeover -> transfer ->
        // rejected non-originator unwrap -> originator unwrap -> rewrap.
        handler.wrap(0, 0, 0, 0, 3649, 0);
        handler.takeover(0, 1, 0, 1 ether);
        handler.transferWrapped(0, 2, true);
        handler.failedCall(0, 1, 0);
        handler.unwrap(0);
        handler.wrap(0, 2, 0, 0, 3649, 0);

        targetContract(address(handler));
    }

    function invariant_liveWrappedTokensRetainUnderlyingCustodyAndMetadata() public {
        address wrapper = address(handler.wrapper());
        address underlying = address(handler.underlying());

        for (uint256 tokenId = 1; tokenId <= TOKEN_COUNT; tokenId++) {
            (bool live,) = _wrappedOwner(tokenId);
            if (!live) continue;
            uint256 wrappedId = _wrappedId(tokenId);

            assertEq(handler.underlying().ownerOf(tokenId), wrapper, "live underlying custody");

            bytes32 baseSlot = _mappingSlot(wrappedId, WRAPPED_TOKEN_MAP_SLOT);
            assertEq(address(uint160(uint256(vm.load(wrapper, baseSlot)))), underlying, "wrapped contract metadata");
            assertEq(uint256(vm.load(wrapper, _offsetSlot(baseSlot, 1))), tokenId, "wrapped token metadata");
            assertEq(
                address(uint160(uint256(vm.load(wrapper, _offsetSlot(baseSlot, 2))))),
                handler.ghostOperator(tokenId),
                "wrapped operator metadata"
            );
        }
    }

    function invariant_wrappedOwnershipValuationAndDepositRemainConsistent() public {
        address wrapperAddress = address(handler.wrapper());

        for (uint256 tokenId = 1; tokenId <= TOKEN_COUNT; tokenId++) {
            (bool live, address owner) = _wrappedOwner(tokenId);
            if (!live) continue;
            uint256 wrappedId = _wrappedId(tokenId);

            uint256 valuation = handler.wrapper().valuationOf(wrappedId);
            uint256 deposit = handler.wrapper().depositOf(wrappedId);
            assertEq(
                deposit,
                uint256(vm.load(wrapperAddress, _mappingSlot(wrappedId, DEPOSITS_SLOT))),
                "deposit getter/storage"
            );

            assertTrue(handler.wrapper().beneficiaryOf(wrappedId) != address(0), "live beneficiary");
            assertGt(handler.wrapper().taxRateOf(wrappedId), 0, "live tax rate");
            assertGt(handler.wrapper().collectionFrequencyOf(wrappedId), 0, "live collection frequency");

            if (owner == wrapperAddress) {
                assertEq(valuation, 0, "foreclosed valuation");
                assertEq(deposit, 0, "foreclosed deposit");
            } else {
                assertTrue(handler.isKnownActor(owner), "bounded wrapped owner");
                assertGt(valuation, 0, "active valuation");
            }
        }
    }

    function invariant_unwrapBurnsAndCleansAllLiveWrapperState() public {
        address wrapper = address(handler.wrapper());

        for (uint256 tokenId = 1; tokenId <= TOKEN_COUNT; tokenId++) {
            (bool live,) = _wrappedOwner(tokenId);
            if (live) continue;
            uint256 wrappedId = _wrappedId(tokenId);

            assertEq(vm.load(wrapper, _mappingSlot(wrappedId, OWNERS_SLOT)), bytes32(0), "burned owner");
            assertEq(vm.load(wrapper, _mappingSlot(wrappedId, TOKEN_APPROVALS_SLOT)), bytes32(0), "burned approval");
            assertEq(vm.load(wrapper, _mappingSlot(wrappedId, VALUATIONS_SLOT)), bytes32(0), "burned valuation");
            assertEq(vm.load(wrapper, _mappingSlot(wrappedId, BENEFICIARIES_SLOT)), bytes32(0), "burned beneficiary");
            assertEq(vm.load(wrapper, _mappingSlot(wrappedId, TAX_RATES_SLOT)), bytes32(0), "burned tax rate");
            assertEq(
                vm.load(wrapper, _mappingSlot(wrappedId, COLLECTION_FREQUENCIES_SLOT)),
                bytes32(0),
                "burned collection frequency"
            );
            assertEq(vm.load(wrapper, _mappingSlot(wrappedId, DEPOSITS_SLOT)), bytes32(0), "burned deposit");

            bytes32 baseSlot = _mappingSlot(wrappedId, WRAPPED_TOKEN_MAP_SLOT);
            assertEq(vm.load(wrapper, baseSlot), bytes32(0), "burned wrapped contract");
            assertEq(vm.load(wrapper, _offsetSlot(baseSlot, 1)), bytes32(0), "burned wrapped token id");
            assertEq(vm.load(wrapper, _offsetSlot(baseSlot, 2)), bytes32(0), "burned wrapped operator");
        }
    }

    function invariant_successfulUnwrapTransfersUnderlyingToCapturedFinalOwner() public {
        for (uint256 tokenId = 1; tokenId <= TOKEN_COUNT; tokenId++) {
            if (!handler.ghostWasUnwrapped(tokenId) || handler.ghostForeclosedUnwrap(tokenId)) continue;

            (bool live,) = _wrappedOwner(tokenId);
            assertFalse(live, "unwrapped token reminted without ghost reset");
            assertEq(
                handler.underlying().ownerOf(tokenId),
                handler.ghostLastUnwrapOwner(tokenId),
                "underlying delivered to final wrapped owner"
            );
        }
    }

    /// @dev A wrapper that was already foreclosed before unwrap captures
    /// Wrapper itself as the final wrapped owner. Burning the record then
    /// transfers the underlying from Wrapper to Wrapper, leaving custody with no
    /// live wrapper record. This deferred legacy finding is classified
    /// separately and is never counted as a successful delivery.
    function invariant_deferredForeclosedUnwrapCustodyLossIsClassified() public {
        for (uint256 tokenId = 1; tokenId <= TOKEN_COUNT; tokenId++) {
            if (!handler.ghostForeclosedUnwrap(tokenId)) continue;

            (bool live,) = _wrappedOwner(tokenId);
            assertFalse(live, "foreclosed unwrap burned wrapper record");
            assertEq(
                handler.underlying().ownerOf(tokenId),
                address(handler.wrapper()),
                "foreclosed unwrap leaves underlying in Wrapper"
            );
        }
    }

    function invariant_atMostOneLiveWrapperExistsPerUnderlying() public {
        for (uint256 tokenId = 1; tokenId <= TOKEN_COUNT; tokenId++) {
            uint256 wrappedId = _wrappedId(tokenId);

            (bool live,) = _wrappedOwner(tokenId);
            bytes32 rawOwner = vm.load(address(handler.wrapper()), _mappingSlot(wrappedId, OWNERS_SLOT));
            assertEq(rawOwner != bytes32(0), live, "single canonical wrapper liveness");
        }
    }

    function invariant_wrapperAssetsCoverDepositsAndOutstandingRemittances() public {
        uint256 deposits;
        uint256 liabilities;
        address wrapper = address(handler.wrapper());

        for (uint256 tokenId = 1; tokenId <= TOKEN_COUNT; tokenId++) {
            deposits += uint256(vm.load(wrapper, _mappingSlot(_wrappedId(tokenId), DEPOSITS_SLOT)));
        }
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            liabilities += handler.wrapper().outstandingRemittances(handler.actorAt(i));
        }

        assertEq(wrapper.balance, deposits + liabilities, "Wrapper assets exactly match liabilities");
    }

    function invariant_takeoverLockAlwaysReleases() public {
        address wrapper = address(handler.wrapper());
        for (uint256 tokenId = 1; tokenId <= TOKEN_COUNT; tokenId++) {
            assertEq(
                vm.load(wrapper, _mappingSlot(_wrappedId(tokenId), LOCKED_SLOT)), bytes32(0), "takeover lock released"
            );
        }
    }

    function invariant_handlerReachabilityAndCallResultsAreNonVacuous() public {
        assertFalse(handler.ghostUnexpectedValidCallFailure(), "intended-valid call reverted");
        assertFalse(handler.ghostUnexpectedInvalidCallSuccess(), "intended-invalid call succeeded");
        assertGe(handler.ghostSuccessfulWraps(), 2, "wrap and rewrap reached");
        assertGe(handler.ghostSuccessfulTakeovers(), 1, "takeover reached");
        assertGe(handler.ghostSuccessfulTransfers(), 1, "wrapped transfer reached");
        assertGe(handler.ghostSuccessfulUnwraps(), 1, "non-foreclosed unwrap reached");
        assertGe(handler.ghostFailedCalls(), 1, "expected rejection reached");
    }

    function _wrappedOwner(uint256 tokenId_) private view returns (bool live, address owner) {
        (bool success, bytes memory result) = address(handler.wrapper())
            .staticcall(abi.encodeWithSelector(handler.wrapper().ownerOf.selector, _wrappedId(tokenId_)));
        if (success) {
            live = true;
            owner = abi.decode(result, (address));
        }
    }

    function _wrappedId(uint256 tokenId_) private view returns (uint256) {
        return handler.wrapper().wrappedTokenId(address(handler.underlying()), tokenId_);
    }

    function _mappingSlot(uint256 key_, uint256 slot_) private pure returns (bytes32) {
        return keccak256(abi.encode(key_, slot_));
    }

    function _offsetSlot(bytes32 slot_, uint256 offset_) private pure returns (bytes32) {
        return bytes32(uint256(slot_) + offset_);
    }
}
