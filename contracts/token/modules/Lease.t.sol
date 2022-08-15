// contracts/token/modules/Lease.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {EnhancedTest} from "./../../test/EnhancedTest.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import {Lease} from "./Lease.sol";
import {RemittanceTriggers} from "./Remittance.sol";

import "forge-std/console2.sol";

/* solhint-disable func-name-mixedcase */
/* solhint-disable ordering */

contract LeaseTest is EnhancedTest, Lease, IERC721Receiver {
  //////////////////////////////
  /// Lifecycle
  //////////////////////////////

  constructor() {
    _safeMint(msg.sender, 0);
    // Mint to random address that is *not* msg.senders
    _safeMint(address(this), 1);
  }

  // function setUp() public {
  //   // Reset locks
  //   _locked[0] = false;
  //   _locked[1] = false;

  //   // Reset valuations
  //   _setValuation(0, 0);
  //   _setValuation(1, 0);
  // }

  //////////////////////////////
  /// Helpers
  //////////////////////////////
  function onERC721Received(
    address,
    address,
    uint256,
    bytes calldata
  ) external pure returns (bytes4) {
    return bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
  }

  function _mint_helper(
    uint256 tokenId_,
    address initialLeasee_,
    uint256 initialDeposit_,
    uint256 initialValuation_,
    address payable beneficiary_,
    uint256 taxRate_,
    uint256 collectionFrequency_
  ) internal {
    // cannot mint to zero address
    vm.assume(initialLeasee_ != address(0));
    // {0,1} are pre-minted
    vm.assume(tokenId_ > 1);
    // 1000 >= valuation > 1
    vm.assume(initialValuation_ > 0);
    // 100 >= tax rate > 0
    vm.assume(taxRate_ > 0);
    vm.assume(taxRate_ <= 100);
    // 10yrs > collection days > 0
    vm.assume(collectionFrequency_ > 0);
    //! Artificial constraint: collection frequency breaks at very large numbers
    // TODO: Fix
    vm.assume(collectionFrequency_ < 365 * 10);

    // Setup token
    _safeMint(initialLeasee_, tokenId_);
    _setDeposit(tokenId_, initialDeposit_);
    _setValuation(tokenId_, initialValuation_);
    _setBeneficiary(tokenId_, beneficiary_);
    _setTaxRate(tokenId_, taxRate_);
    _setCollectionFrequency(tokenId_, collectionFrequency_);

    // Provide contract with value equivalent to deposit.
    if (initialLeasee_ != address(this)) {
      vm.deal(address(this), initialDeposit_);
    }
  }

  function _takeover(
    uint256 tokenId_,
    uint256 newValuation_,
    uint256 currentValuation_,
    uint256 value_
  ) internal {
    // Relay call with original sender
    vm.startPrank(msg.sender);

    this.takeoverLease{value: value_}(
      tokenId_,
      newValuation_,
      currentValuation_
    );
  }

  // //////////////////////////////
  // /// Mixins
  // //////////////////////////////

  // /// @dev Success Expections that must be met by all of the
  // /// cases outlined below.
  // function pre_takeover_success_expectations(
  //   uint256 tokenId_,
  //   uint256 newValuation_
  // ) public {
  //   // Logs Takeover
  //   vm.expectEmit(true, true, true, true);
  //   emit LogLeaseTakeover(tokenId_, msg.sender, newValuation_);
  // }

  // /// @dev Success Expections that must be met by all of the
  // /// cases outlined below.
  // function post_takeover_success_expectations(
  //   uint256 tokenId_,
  //   uint256 newValuation_
  // ) public {
  //   //! TODO: collects tax -> Return to this with Taxation.t.sol

  //   // Sets valuation
  //   assertEq(valuationOf(tokenId_), newValuation_);

  //   // Transfers
  //   assertEq(ownerOf(tokenId_), msg.sender);

  //   // Unlocked
  //   assertEq(_locked[tokenId_], false);
  // }

  //////////////////////////////
  /// Success Criteria
  //////////////////////////////

  /// @dev Token is being purchased for the first time or out of foreclosure
  // function test__takeoverLease_fromContract(
  //   uint256 tokenId_,
  //   uint256 initialDeposit_,
  //   uint256 initialValuation_,
  //   address payable beneficiary_,
  //   uint256 taxRate_,
  //   uint256 collectionFrequency_
  // ) public {
  //   // Setup: Mint to contract.
  //   _mint_helper(
  //     tokenId_,
  //     address(this),
  //     initialDeposit_,
  //     initialValuation_,
  //     beneficiary_,
  //     taxRate_,
  //     collectionFrequency_
  //   );

  //   uint256 newValuation = initialValuation_ + 2;
  //   uint256 value = initialValuation_ + 1;

  //   // Takeover
  //   pre_takeover_success_expectations(tokenId_, newValuation);
  //   _takeover(tokenId_, newValuation, initialValuation_, value);
  //   post_takeover_success_expectations(tokenId_, newValuation);

  //   // Last collection time is now
  //   assertEq(lastCollectionTimeOf(tokenId_), block.timestamp);

  //   // Deposit is entire msg value
  //   assertEq(depositOf(tokenId_), value);
  // }

  // /// @dev Test should fail b/c no remittance
  // function testFail__takeoverLease_fromContract_doesNotRemit(
  //   uint256 tokenId_,
  //   uint256 initialDeposit_,
  //   uint256 initialValuation_,
  //   address payable beneficiary_,
  //   uint256 taxRate_,
  //   uint256 collectionFrequency_
  // ) public {
  //   // Setup: Mint to contract.
  //   _mint_helper(
  //     tokenId_,
  //     address(this),
  //     initialDeposit_,
  //     initialValuation_,
  //     beneficiary_,
  //     taxRate_,
  //     collectionFrequency_
  //   );

  //   // Takeover
  //   uint256 newValuation = initialValuation_ + 2;

  //   // Set up an arbitrary emittance emission
  //   vm.expectEmit(true, true, true, true);
  //   emit LogRemittance(RemittanceTriggers.LeaseTakeover, msg.sender, 0);

  //   _takeover(tokenId_, newValuation, initialValuation_, initialValuation_ + 1);
  // }

  //! TODO – FatalInsufficientBalance should not be reached!
  /// @dev Purchased from account & sender is not beneficiary
  // function test__takeoverLease_fromAccount(
  //   uint256 tokenId_,
  //   address initialOwner_,
  //   uint256 initialDeposit_,
  //   uint256 initialValuation_,
  //   address payable beneficiary_,
  //   uint256 taxRate_,
  //   uint256 collectionFrequency_
  // ) public {
  //   // Setup: Mint to contract.
  //   _mint_helper(
  //     tokenId_,
  //     initialOwner_,
  //     initialDeposit_,
  //     initialValuation_,
  //     beneficiary_,
  //     taxRate_,
  //     collectionFrequency_
  //   );

  //   // Expect: Remits
  //   // vm.expectEmit(true, true, true, true);
  //   // emit LogRemittance(
  //   //   RemittanceTriggers.LeaseTakeover,
  //   //   initialOwner_,
  //   //   initialValuation_
  //   // );

  //   // Takeover

  //   // Provide funds
  //   vm.deal(msg.sender, initialValuation_ + 1000);

  //   uint256 newValuation = initialValuation_ + 2;
  //   uint256 value = initialValuation_ + 1;

  //   pre_takeover_success_expectations(tokenId_, newValuation);
  //   _takeover(tokenId_, newValuation, initialValuation_, value);
  //   post_takeover_success_expectations(tokenId_, newValuation);

  //   // Deposit = msg.value - currentValuation
  //   assertEq(depositOf(tokenId_), 1);
  // }

  //! TODO
  /// @dev Purchased from an account and sender is beneficiary
  // function test__takeoverLease_senderBeneficiary(
  //   uint256 tokenId_,
  //   address initialOwner_,
  //   uint256 initialDeposit_,
  //   uint256 initialValuation_,
  //   uint256 taxRate_,
  //   uint256 collectionFrequency_
  // ) public {
  //   _mint_helper(
  //     tokenId_,
  //     initialOwner_,
  //     initialDeposit_,
  //     initialValuation_,
  //     payable(msg.sender),
  //     taxRate_,
  //     collectionFrequency_
  //   );

  //   // console.log("Initial Valuation", initialValuation_);
  //   // console.log("Balance after mint", address(this).balance);

  //   // // Takeover

  //   // // Provide funds
  //   // vm.deal(msg.sender, initialValuation_ + 10000);

  //   // uint256 newValuation = initialValuation_ + 1000;
  //   // uint256 value = initialValuation_; // Beneficiary pays the current value

  //   // pre_takeover_success_expectations(tokenId_, newValuation);
  //   // _takeover(tokenId_, newValuation, initialValuation_, value);
  //   // post_takeover_success_expectations(tokenId_, newValuation);

  //   // // Remits

  //   // // No deposit
  //   // assertEq(depositOf(tokenId_), 0);
  // }

  // function test__selfAssess_sets(uint256 valuation_) public {
  //   // Avoid fail cases
  //   vm.assume(valuation_ > 0);
  //   selfAssess(0, 1000);
  // }

  //! TODO: Return to this test once Taxation tests are migrated.
  //function test__selfAssess_collectsTax() public {}

  //////////////////////////////
  /// Failure Criteria
  //////////////////////////////

  function test__takeoverLease_mustBeMinted() public {
    vm.expectRevert(NonexistentToken.selector);
    takeoverLease(999, 100, 0);
  }

  function test__takeoverLease_enforcesLock() public {
    _locked[1] = true;

    vm.expectRevert(TokenLocked.selector);
    takeoverLease(1, 1000, 0);
  }

  function test__takeoverLease_requiresCorrectValuation() public {
    _setValuation(1, 300);

    vm.expectRevert(IncorrectCurrentValuation.selector);
    takeoverLease(1, 1000, 0);
  }

  function test__takeoverLease_cannotSetZeroNewValuation() public {
    vm.expectRevert(ZeroValuation.selector);
    takeoverLease(1, 0, 0);
  }

  function test__takeoverLease_requiresGreaterOrEqualValuation() public {
    _setValuation(1, 300);

    vm.expectRevert(GreaterOrEqualValuationRequired.selector);
    takeoverLease(1, 299, 300);
  }

  /// @dev If sender is beneficiary and token is owned by contract,
  /// sender does not need to pay anything.
  function test_takeoverLease_surplusValue_ownedByContract() public {
    uint256 tokenId = 999;
    uint256 initialValuation = 1 ether;

    _mint_helper(
      tokenId,
      address(this),
      10 ether,
      initialValuation,
      payable(msg.sender),
      10,
      365
    );

    vm.expectRevert(SurplusValue.selector);

    _takeover(
      tokenId,
      initialValuation + 2,
      initialValuation,
      initialValuation + 1
    );
  }

  /// @dev If sender is beneficiary and token is not owned by contract,
  /// sender only needs to send enough Wei to pay current leasor, and does
  /// not need to put down a deposit.
  function test_takeoverLease_surplusValue() public {
    uint256 tokenId = 999;
    uint256 initialValuation = 1 ether;

    _mint_helper(
      tokenId,
      msg.sender,
      10 ether,
      initialValuation,
      payable(msg.sender),
      10,
      365
    );

    // Beneficiary should be sending exactly `initialValuation`
    vm.expectRevert(SurplusValue.selector);

    _takeover(
      tokenId,
      initialValuation + 2,
      initialValuation,
      initialValuation + 1
    );
  }

  function test__takeoverLease_nonBeneficiarySender_surplusRequired(
    address beneficiary_
  ) public {
    // Beneficiary should not be msg sender
    vm.assume(beneficiary_ != msg.sender);

    uint256 tokenId = 999;
    uint256 initialValuation = 1 ether;

    _mint_helper(
      tokenId,
      msg.sender,
      10 ether,
      initialValuation,
      payable(beneficiary_),
      10,
      365
    );

    // Beneficiary should be sending exactly `initialValuation`
    vm.expectRevert(SurplusRequired.selector);

    _takeover(
      tokenId,
      initialValuation + 1,
      initialValuation,
      initialValuation
    );
  }

  /// @dev Expect lease failure because takeover requested by current owner.
  function test_takeoverLease_alreadyOwner() public {
    uint256 tokenId = 999;
    uint256 initialValuation = 1 ether;

    _mint_helper(
      tokenId,
      msg.sender,
      10 ether,
      initialValuation,
      payable(msg.sender),
      10,
      365
    );

    vm.expectRevert(AlreadyOwner.selector);
    _takeover(tokenId, initialValuation + 1 ether, initialValuation, 1 ether);
  }

  function test__selfAssess_cannotSetZero() public {
    vm.expectRevert(ZeroValuation.selector);
    selfAssess(0, 0);
  }

  function test__selfAssess_ownerOnly() public {
    vm.expectRevert(ApprovedOnly.selector);
    selfAssess(1, 1000);
  }

  function test__selfAssess_cannotSetSame(
    uint256 tokenId_,
    uint256 initialDeposit_,
    uint256 initialValuation_,
    uint256 taxRate_,
    uint256 collectionFrequency_
  ) public {
    _mint_helper(
      tokenId_,
      msg.sender,
      initialDeposit_,
      initialValuation_,
      payable(msg.sender),
      taxRate_,
      collectionFrequency_
    );

    vm.expectRevert(SameValuation.selector);
    selfAssess(tokenId_, initialValuation_);
  }
}
