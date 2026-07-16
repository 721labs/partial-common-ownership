// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {TestWrapper} from "../../../../contracts/test/TestWrapper.sol";

interface WrapperInvariantVm {
    function deal(address account_, uint256 balance_) external;

    function warp(uint256 timestamp_) external;
}

interface WrapperInvariantActor {
    function execute(address target_, uint256 value_, bytes calldata data_)
        external
        returns (bool success, bytes memory result);
}

abstract contract WrapperInvariantActorBase is IERC721Receiver {
    address internal immutable _handler;

    constructor(address handler_) {
        _handler = handler_;
    }

    modifier onlyHandler() {
        require(msg.sender == _handler, "Handler only");
        _;
    }

    function execute(address target_, uint256 value_, bytes calldata data_)
        external
        onlyHandler
        returns (bool success, bytes memory result)
    {
        (success, result) = target_.call{value: value_}(data_);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}

contract WrapperAcceptingActor is WrapperInvariantActorBase {
    constructor(address handler_) WrapperInvariantActorBase(handler_) {}

    receive() external payable {}
}

contract WrapperRejectingActor is WrapperInvariantActorBase {
    error EtherRejected();

    constructor(address handler_) WrapperInvariantActorBase(handler_) {}

    receive() external payable {
        revert EtherRejected();
    }
}

contract WrapperInvariantNFT is ERC721 {
    constructor(address ownerOne_, address ownerTwo_, address ownerThree_) ERC721("Invariant NFT", "iNFT") {
        _safeMint(ownerOne_, 1);
        _safeMint(ownerTwo_, 2);
        _safeMint(ownerThree_, 3);
    }

    function _baseURI() internal pure override returns (string memory) {
        return "invariant/";
    }
}

/// @dev Stateful action surface targeted by Foundry's invariant runner.
/// Every external protocol call is made through a bounded actor and captured as
/// a low-level result so deliberately invalid actions cannot abort a campaign.
contract WrapperInvariantHandler {
    WrapperInvariantVm private constant VM =
        WrapperInvariantVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant TOKEN_COUNT = 3;
    uint256 private constant ACTOR_COUNT = 4;
    uint256 private constant MAX_VALUATION = 20 ether;
    uint256 private constant MAX_DEPOSIT = 20 ether;
    uint256 private constant MAX_TAX_RATE = 1_000_000_000_000;
    uint256 private constant MAX_FREQUENCY_DAYS = 3650;

    struct TakeoverTerms {
        bool executable;
        address currentOwner;
        address buyer;
        uint256 wrappedId;
        uint256 currentValuation;
        uint256 newValuation;
        uint256 value;
    }

    TestWrapper public immutable wrapper;
    WrapperInvariantNFT public immutable underlying;

    address[4] private _actors;

    mapping(uint256 => address) public ghostOperator;
    mapping(uint256 => address) public ghostLastUnwrapOwner;
    mapping(uint256 => bool) public ghostWasUnwrapped;
    mapping(uint256 => bool) public ghostForeclosedUnwrap;

    uint256 public ghostSuccessfulWraps;
    uint256 public ghostSuccessfulUnwraps;
    uint256 public ghostSuccessfulTakeovers;
    uint256 public ghostSuccessfulTransfers;
    uint256 public ghostFailedCalls;
    uint256 public ghostForeclosedUnwraps;
    bool public ghostUnexpectedValidCallFailure;
    bool public ghostUnexpectedInvalidCallSuccess;

    constructor() {
        wrapper = new TestWrapper();

        _actors[0] = address(new WrapperAcceptingActor(address(this)));
        _actors[1] = address(new WrapperAcceptingActor(address(this)));
        _actors[2] = address(new WrapperAcceptingActor(address(this)));
        _actors[3] = address(new WrapperRejectingActor(address(this)));

        for (uint256 i = 0; i < ACTOR_COUNT; i++) {
            VM.deal(_actors[i], 1_000_000 ether);
        }

        underlying = new WrapperInvariantNFT(_actors[0], _actors[1], _actors[2]);
    }

    function actorAt(uint256 index_) public view returns (address) {
        return _actors[index_ % ACTOR_COUNT];
    }

    function actorCount() external pure returns (uint256) {
        return ACTOR_COUNT;
    }

    function tokenCount() external pure returns (uint256) {
        return TOKEN_COUNT;
    }

    function isKnownActor(address account_) public view returns (bool) {
        for (uint256 i = 0; i < ACTOR_COUNT; i++) {
            if (_actors[i] == account_) return true;
        }
        return false;
    }

    function wrap(
        uint256 tokenSeed_,
        uint256 beneficiarySeed_,
        uint256 valuationSeed_,
        uint256 taxRateSeed_,
        uint256 frequencySeed_,
        uint256 depositSeed_
    ) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        if (_wrappedExists(tokenId)) return;

        address owner = underlying.ownerOf(tokenId);
        if (!isKnownActor(owner)) return;

        address beneficiary = actorAt(beneficiarySeed_);
        uint256 valuation = (valuationSeed_ % MAX_VALUATION) + 1;
        uint256 taxRate = (taxRateSeed_ % MAX_TAX_RATE) + 1;
        uint256 frequencyDays = (frequencySeed_ % MAX_FREQUENCY_DAYS) + 1;
        uint256 initialDeposit = owner == beneficiary ? 0 : (depositSeed_ % MAX_DEPOSIT) + 1;

        (bool approved,) = _execute(
            owner,
            address(underlying),
            0,
            abi.encodeWithSelector(underlying.approve.selector, address(wrapper), tokenId)
        );
        if (!approved) {
            ghostUnexpectedValidCallFailure = true;
            return;
        }

        (bool success,) = _execute(
            owner,
            address(wrapper),
            initialDeposit,
            abi.encodeWithSelector(
                wrapper.wrap.selector,
                address(underlying),
                tokenId,
                valuation,
                payable(beneficiary),
                taxRate,
                frequencyDays
            )
        );

        if (success) {
            ghostOperator[tokenId] = owner;
            ghostWasUnwrapped[tokenId] = false;
            ghostForeclosedUnwrap[tokenId] = false;
            ghostSuccessfulWraps++;
        } else {
            ghostUnexpectedValidCallFailure = true;
        }
    }

    function takeover(uint256 tokenSeed_, uint256 buyerSeed_, uint256 valuationIncreaseSeed_, uint256 depositSeed_)
        external
    {
        uint256 tokenId = _tokenId(tokenSeed_);
        TakeoverTerms memory terms = _takeoverTerms(tokenId, buyerSeed_, valuationIncreaseSeed_, depositSeed_);
        if (!terms.executable) return;

        (bool success,) = _execute(
            terms.buyer,
            address(wrapper),
            terms.value,
            abi.encodeWithSelector(
                wrapper.takeoverLease.selector, terms.wrappedId, terms.newValuation, terms.currentValuation
            )
        );
        if (success) {
            ghostSuccessfulTakeovers++;
        } else {
            ghostUnexpectedValidCallFailure = true;
        }
    }

    function _takeoverTerms(uint256 tokenId_, uint256 buyerSeed_, uint256 valuationIncreaseSeed_, uint256 depositSeed_)
        private
        view
        returns (TakeoverTerms memory terms)
    {
        terms.wrappedId = _wrappedId(tokenId_);
        (bool live, address currentOwner) = _wrappedOwner(tokenId_);
        if (!live) return terms;
        terms.currentOwner = currentOwner;

        terms.buyer = actorAt(buyerSeed_);
        if (terms.buyer == currentOwner) terms.buyer = _nextActor(buyerSeed_);
        if (terms.buyer == currentOwner) return terms;

        terms.currentValuation = wrapper.valuationOf(terms.wrappedId);
        address beneficiary = wrapper.beneficiaryOf(terms.wrappedId);
        (uint256 taxDueBeforeTakeover,) = wrapper.taxOwed(terms.wrappedId);

        // A beneficiary purchase that starts from an actor but crosses into
        // foreclosure during collectTax retains the required current valuation
        // as untracked contract surplus. Keep that separately deferred legacy
        // semantic out of the intended-state conservation campaign.
        if (
            terms.buyer == beneficiary && currentOwner != address(wrapper) && taxDueBeforeTakeover > 0
                && taxDueBeforeTakeover >= wrapper.depositOf(terms.wrappedId)
        ) return terms;

        uint256 increase = valuationIncreaseSeed_ % (MAX_VALUATION + 1);
        // If rounding makes the pre-takeover tax zero, collectTax deliberately
        // leaves the epoch-based lastCollectionTime unchanged. Raising the
        // valuation in that state can make the transfer hook immediately
        // foreclose and then continue with stale `from` accounting (captured by
        // the deterministic regression suite).
        if (currentOwner != beneficiary && taxDueBeforeTakeover == 0) increase = 0;
        terms.newValuation = terms.currentValuation + increase;
        if (terms.newValuation == 0) terms.newValuation = 1;

        if (terms.buyer == beneficiary) {
            terms.value = currentOwner == address(wrapper) ? 0 : terms.currentValuation;
        } else {
            terms.value = terms.currentValuation + (depositSeed_ % MAX_DEPOSIT) + 1;
        }
        terms.executable = true;
    }

    function warpAndCollect(uint256 tokenSeed_, uint256 elapsedSeed_) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        if (!_wrappedExists(tokenId)) return;

        VM.warp(block.timestamp + (elapsedSeed_ % 30 days) + 1);
        (bool success,) =
            address(wrapper).call(abi.encodeWithSelector(wrapper.collectTax.selector, _wrappedId(tokenId)));
        _recordValidCall(success);
    }

    function deposit(uint256 tokenSeed_, uint256 amountSeed_) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        uint256 wrappedId = _wrappedId(tokenId);
        (bool live, address owner) = _wrappedOwner(tokenId);
        if (!live || !isKnownActor(owner) || wrapper.foreclosed(wrappedId)) return;

        uint256 amount = amountSeed_ % (5 ether + 1);
        (bool success,) =
            _execute(owner, address(wrapper), amount, abi.encodeWithSelector(wrapper.deposit.selector, wrappedId));
        _recordValidCall(success);
    }

    function withdraw(uint256 tokenSeed_, uint256 amountSeed_) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        uint256 wrappedId = _wrappedId(tokenId);
        (bool live, address owner) = _wrappedOwner(tokenId);
        if (!live || !isKnownActor(owner) || wrapper.foreclosed(wrappedId)) return;

        uint256 withdrawable = wrapper.withdrawableDeposit(wrappedId);
        uint256 amount = withdrawable == 0 ? 0 : amountSeed_ % (withdrawable + 1);
        (bool success,) = _execute(
            owner, address(wrapper), 0, abi.encodeWithSelector(wrapper.withdrawDeposit.selector, wrappedId, amount)
        );
        _recordValidCall(success);
    }

    function exit(uint256 tokenSeed_) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        uint256 wrappedId = _wrappedId(tokenId);
        (bool live, address owner) = _wrappedOwner(tokenId);
        if (!live || !isKnownActor(owner) || wrapper.foreclosed(wrappedId)) return;

        (bool success,) = _execute(owner, address(wrapper), 0, abi.encodeWithSelector(wrapper.exit.selector, wrappedId));
        _recordValidCall(success);
    }

    function selfAssess(uint256 tokenSeed_, uint256 valuationSeed_) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        uint256 wrappedId = _wrappedId(tokenId);
        (bool live, address owner) = _wrappedOwner(tokenId);
        if (!live || !isKnownActor(owner) || wrapper.foreclosed(wrappedId)) return;

        uint256 valuation = (valuationSeed_ % MAX_VALUATION) + 1;
        if (valuation == wrapper.valuationOf(wrappedId)) {
            valuation = valuation == MAX_VALUATION ? 1 : valuation + 1;
        }
        (bool success,) = _execute(
            owner, address(wrapper), 0, abi.encodeWithSelector(wrapper.selfAssess.selector, wrappedId, valuation)
        );
        _recordValidCall(success);
    }

    function approve(uint256 tokenSeed_, uint256 approvedSeed_) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        (bool live, address owner) = _wrappedOwner(tokenId);
        if (!live || !isKnownActor(owner)) return;

        address approved = actorAt(approvedSeed_);
        if (approved == owner) approved = address(0);
        (bool success,) = _execute(
            owner, address(wrapper), 0, abi.encodeWithSelector(wrapper.approve.selector, approved, _wrappedId(tokenId))
        );
        _recordValidCall(success);
    }

    function setApprovalForAll(uint256 ownerSeed_, uint256 operatorSeed_, bool approved_) external {
        address owner = actorAt(ownerSeed_);
        address operator = actorAt(operatorSeed_);
        if (owner == operator) return;

        (bool success,) = _execute(
            owner, address(wrapper), 0, abi.encodeWithSelector(wrapper.setApprovalForAll.selector, operator, approved_)
        );
        _recordValidCall(success);
    }

    function transferWrapped(uint256 tokenSeed_, uint256 recipientSeed_, bool safe_) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        uint256 wrappedId = _wrappedId(tokenId);
        (bool live, address owner) = _wrappedOwner(tokenId);
        if (!live || !isKnownActor(owner) || wrapper.foreclosed(wrappedId)) return;

        address recipient = actorAt(recipientSeed_);
        if (recipient == owner) recipient = _nextActor(recipientSeed_);
        if (recipient == owner) return;

        bytes memory data = safe_
            ? abi.encodeWithSignature("safeTransferFrom(address,address,uint256)", owner, recipient, wrappedId)
            : abi.encodeWithSelector(wrapper.transferFrom.selector, owner, recipient, wrappedId);
        (bool success,) = _execute(owner, address(wrapper), 0, data);
        if (success) {
            ghostSuccessfulTransfers++;
        } else {
            ghostUnexpectedValidCallFailure = true;
        }
    }

    function unwrap(uint256 tokenSeed_) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        (bool live, address finalWrappedOwner) = _wrappedOwner(tokenId);
        if (!live) return;

        address operator = ghostOperator[tokenId];
        if (!isKnownActor(operator)) return;

        (uint256 taxDue,) = wrapper.taxOwed(_wrappedId(tokenId));
        if (taxDue > 0 && wrapper.depositOf(_wrappedId(tokenId)) == 0) return;

        (bool success,) = _execute(
            operator, address(wrapper), 0, abi.encodeWithSelector(wrapper.unwrap.selector, _wrappedId(tokenId))
        );
        if (success) {
            ghostLastUnwrapOwner[tokenId] = finalWrappedOwner;
            ghostWasUnwrapped[tokenId] = true;
            ghostOperator[tokenId] = address(0);
            if (finalWrappedOwner == address(wrapper)) {
                ghostForeclosedUnwrap[tokenId] = true;
                ghostForeclosedUnwraps++;
            } else {
                ghostForeclosedUnwrap[tokenId] = false;
                ghostSuccessfulUnwraps++;
            }
        } else {
            ghostUnexpectedValidCallFailure = true;
        }
    }

    function failedCall(uint256 tokenSeed_, uint256 callerSeed_, uint256 failureSeed_) external {
        uint256 tokenId = _tokenId(tokenSeed_);
        address caller = actorAt(callerSeed_);
        uint256 failure = failureSeed_ % 6;
        if (failure == 0) return _failUnwrap(tokenId, caller);
        if (failure == 1) return _failTakeover(tokenId, caller);
        if (failure == 2) return _failSelfAssess(tokenId);
        if (failure == 3) return _failDirectUnderlyingTransfer(tokenId);
        if (failure == 4) return _failDuplicateWrap(tokenId, caller, callerSeed_);
        _failExcessWithdrawal(tokenId);
    }

    function _failUnwrap(uint256 tokenId_, address caller_) private {
        (bool live,) = _wrappedOwner(tokenId_);
        if (!live || caller_ == ghostOperator[tokenId_]) return;

        (bool success,) = _execute(
            caller_, address(wrapper), 0, abi.encodeWithSelector(wrapper.unwrap.selector, _wrappedId(tokenId_))
        );
        _recordExpectedFailure(success);
    }

    function _failTakeover(uint256 tokenId_, address caller_) private {
        uint256 wrappedId = _wrappedId(tokenId_);
        (bool live, address owner) = _wrappedOwner(tokenId_);
        if (!live || caller_ == owner) return;

        uint256 valuation = wrapper.valuationOf(wrappedId);
        (bool success,) = _execute(
            caller_,
            address(wrapper),
            valuation + 1,
            abi.encodeWithSelector(wrapper.takeoverLease.selector, wrappedId, valuation + 1, valuation + 1)
        );
        _recordExpectedFailure(success);
    }

    function _failSelfAssess(uint256 tokenId_) private {
        (bool live, address owner) = _wrappedOwner(tokenId_);
        if (!live || !isKnownActor(owner)) return;

        (bool success,) = _execute(
            owner, address(wrapper), 0, abi.encodeWithSelector(wrapper.selfAssess.selector, _wrappedId(tokenId_), 0)
        );
        _recordExpectedFailure(success);
    }

    function _failDirectUnderlyingTransfer(uint256 tokenId_) private {
        (bool live,) = _wrappedOwner(tokenId_);
        if (live) return;

        address nftOwner = underlying.ownerOf(tokenId_);
        if (!isKnownActor(nftOwner)) return;

        (bool success,) = _execute(
            nftOwner,
            address(underlying),
            0,
            abi.encodeWithSignature("safeTransferFrom(address,address,uint256)", nftOwner, address(wrapper), tokenId_)
        );
        _recordExpectedFailure(success);
    }

    function _failDuplicateWrap(uint256 tokenId_, address caller_, uint256 callerSeed_) private {
        (bool live,) = _wrappedOwner(tokenId_);
        if (!live) return;

        (bool success,) = _execute(
            caller_,
            address(wrapper),
            1,
            abi.encodeWithSelector(
                wrapper.wrap.selector, address(underlying), tokenId_, 1, payable(_nextActor(callerSeed_)), 1, 1
            )
        );
        _recordExpectedFailure(success);
    }

    function _failExcessWithdrawal(uint256 tokenId_) private {
        uint256 wrappedId = _wrappedId(tokenId_);
        (bool live, address owner) = _wrappedOwner(tokenId_);
        if (!live || !isKnownActor(owner)) return;

        uint256 deposited = wrapper.depositOf(wrappedId);
        (bool success,) = _execute(
            owner,
            address(wrapper),
            0,
            abi.encodeWithSelector(wrapper.withdrawDeposit.selector, wrappedId, deposited + 1)
        );
        _recordExpectedFailure(success);
    }

    function _recordValidCall(bool success_) private {
        if (!success_) ghostUnexpectedValidCallFailure = true;
    }

    function _recordExpectedFailure(bool success_) private {
        if (success_) {
            ghostUnexpectedInvalidCallSuccess = true;
        } else {
            ghostFailedCalls++;
        }
    }

    function _execute(address actor_, address target_, uint256 value_, bytes memory data_)
        private
        returns (bool success, bytes memory result)
    {
        return WrapperInvariantActor(actor_).execute(target_, value_, data_);
    }

    function _tokenId(uint256 seed_) private pure returns (uint256) {
        return (seed_ % TOKEN_COUNT) + 1;
    }

    function _nextActor(uint256 seed_) private view returns (address) {
        return actorAt(((seed_ % ACTOR_COUNT) + 1) % ACTOR_COUNT);
    }

    function _wrappedExists(uint256 tokenId_) private view returns (bool) {
        (bool live,) = _wrappedOwner(tokenId_);
        return live;
    }

    function _wrappedOwner(uint256 tokenId_) private view returns (bool live, address owner) {
        (bool success, bytes memory result) =
            address(wrapper).staticcall(abi.encodeWithSelector(wrapper.ownerOf.selector, _wrappedId(tokenId_)));
        if (success) {
            live = true;
            owner = abi.decode(result, (address));
        }
    }

    function _wrappedId(uint256 tokenId_) private view returns (uint256) {
        return wrapper.wrappedTokenId(address(underlying), tokenId_);
    }
}
