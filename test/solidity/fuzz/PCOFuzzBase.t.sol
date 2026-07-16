// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {Test} from "forge-std/Test.sol";
import {PartialCommonOwnership} from "../../../contracts/token/PartialCommonOwnership.sol";

/// @dev Test-only PCO implementation with narrowly scoped configuration and
/// lock inspection hooks. State transitions under test still go through the
/// production public methods.
contract PCOFuzzHarness is PartialCommonOwnership {
    uint256 public constant TOKEN_ID = 1;

    constructor(address payable beneficiary_) {
        _safeMint(address(this), TOKEN_ID);
        _setBeneficiary(TOKEN_ID, beneficiary_);
        _setTaxRate(TOKEN_ID, 1_000_000_000_000);
        _setCollectionFrequency(TOKEN_ID, 30);
    }

    function configureTax(uint256 rate_, uint256 frequencyDays_) external {
        _setTaxRate(TOKEN_ID, rate_);
        _setCollectionFrequency(TOKEN_ID, frequencyDays_);
    }

    function forceBeneficiary(address payable beneficiary_) external {
        _setBeneficiary(TOKEN_ID, beneficiary_);
    }

    function lockedOf(uint256 tokenId_) external view returns (bool) {
        return _locked[tokenId_];
    }
}

/// @dev Contract owner/beneficiary fixture that can deterministically reject
/// stipend-based Ether remittances, then accept a later pull withdrawal.
contract PCOFuzzRejectingActor {
    error EtherRejected();

    uint256 private constant TOKEN_ID = 1;
    bool private _rejectEther = true;

    receive() external payable {
        if (_rejectEther) revert EtherRejected();
    }

    function setRejectEther(bool rejectEther_) external {
        _rejectEther = rejectEther_;
    }

    function takeover(PCOFuzzHarness token_, uint256 newValuation_, uint256 currentValuation_, uint256 value_)
        external
    {
        token_.takeoverLease{value: value_}(TOKEN_ID, newValuation_, currentValuation_);
    }

    function exit(PCOFuzzHarness token_) external {
        token_.exit(TOKEN_ID);
    }

    function withdrawOutstanding(PCOFuzzHarness token_) external {
        token_.withdrawOutstandingRemittance();
    }
}

abstract contract PCOFuzzBase is Test {
    uint256 internal constant START_TIME = 1_700_000_000;
    uint256 internal constant TOKEN_ID = 1;
    uint256 internal constant TAX_DENOMINATOR = 1_000_000_000_000;
    uint256 internal constant FUNDED_BALANCE = 1_000_000 ether;

    bytes4 internal constant DESTINATION_ZERO_ADDRESS_SELECTOR = bytes4(keccak256("DestinationZeroAddress()"));
    bytes4 internal constant NO_OUTSTANDING_BALANCE_SELECTOR = bytes4(keccak256("NoOutstandingBalance()"));

    address payable internal beneficiary;
    address internal alice;
    address internal bob;
    address internal operator;
    address internal recipient;

    PCOFuzzHarness internal token;

    function setUp() public virtual {
        vm.warp(START_TIME);

        beneficiary = payable(makeAddr("fuzz-beneficiary"));
        alice = makeAddr("fuzz-alice");
        bob = makeAddr("fuzz-bob");
        operator = makeAddr("fuzz-operator");
        recipient = makeAddr("fuzz-recipient");

        vm.deal(beneficiary, FUNDED_BALANCE);
        vm.deal(alice, FUNDED_BALANCE);
        vm.deal(bob, FUNDED_BALANCE);
        vm.deal(operator, FUNDED_BALANCE);
        vm.deal(recipient, FUNDED_BALANCE);

        token = new PCOFuzzHarness(beneficiary);
    }

    function _buyFromContract(address buyer_, uint256 valuation_, uint256 deposit_) internal {
        vm.prank(buyer_);
        token.takeoverLease{value: deposit_}(TOKEN_ID, valuation_, 0);
    }

    function _taxDue(uint256 valuation_, uint256 elapsed_, uint256 frequency_, uint256 rate_)
        internal
        pure
        returns (uint256)
    {
        // Match the production contract's intentional integer-rounding order.
        // forge-lint: disable-next-line(divide-before-multiply)
        return (((valuation_ * elapsed_) / frequency_) * rate_) / TAX_DENOMINATOR;
    }

    function _error(string memory reason_) internal pure returns (bytes memory) {
        return abi.encodeWithSignature("Error(string)", reason_);
    }
}
