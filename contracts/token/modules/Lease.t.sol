// contracts/token/modules/Lease.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import {Lease} from "./Lease.sol";

/* solhint-disable func-name-mixedcase */
/* solhint-disable ordering */

contract LeaseTest is Test, Lease, IERC721Receiver {
  //////////////////////////////
  /// Lifecycle
  //////////////////////////////

  constructor() {
    _safeMint(msg.sender, 0);
    // Mint to random address that is *not* msg.senders
    _safeMint(address(this), 1);
  }

  function setUp() public {
    // Reset locks
    _locked[0] = false;
    _locked[1] = false;

    // Reset valuations
    _setValuation(0, 0);
    _setValuation(1, 0);
  }

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
    //! Prevent higher valutions from overflowing.
    vm.assume(initialValuation_ <= 1000);
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
  }

  function _takeover(
    uint256 tokenId_,
    uint256 newValuation_,
    uint256 currentValuation_,
    uint256 value_
  ) internal {
    // Ensure takeover call isn't relayed by contract
    vm.startPrank(msg.sender);
    this.takeoverLease{value: value_}(
      tokenId_,
      newValuation_,
      currentValuation_
    );
  }

  //////////////////////////////
  /// Success Criteria
  //////////////////////////////

  // function test__takeoverLease_nonBeneficiary(
  //   uint256 tokenId_,
  //   address initialLeasee_,
  //   uint256 initialDeposit_,
  //   uint256 initialValuation_,
  //   address payable beneficiary_,
  //   uint256 taxRate_,
  //   uint256 collectionFrequency_
  // ) public {
  //   // Mint token
  //   _mint_helper(
  //     tokenId_,
  //     initialLeasee_,
  //     initialDeposit_,
  //     initialValuation_,
  //     beneficiary_,
  //     taxRate_,
  //     collectionFrequency_
  //   );

  //   // Provide funds for takeover
  //   vm.deal(msg.sender, initialValuation_ + 1000);

  //   // Takeover as non-beneficiary
  //   this.takeoverLease{value: initialValuation_ + 100}(
  //     tokenId_,
  //     initialValuation_ + 10,
  //     initialValuation_
  //   );
  // }

  function test__selfAssess_sets(uint256 valuation_) public {
    // Avoid fail cases
    vm.assume(valuation_ > 0);
    selfAssess(0, 1000);
  }

  //! TODO: Takeover first.
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

  function test_takeoverLease_beneficiarySender_cannotContainValueIfOwnedByContract(
    uint256 tokenId_,
    uint256 initialDeposit_,
    uint256 initialValuation_,
    uint256 taxRate_,
    uint256 collectionFrequency_
  ) public {
    _mint_helper(
      tokenId_,
      address(this),
      initialDeposit_,
      initialValuation_,
      payable(msg.sender),
      taxRate_,
      collectionFrequency_
    );

    vm.expectRevert(SurplusValue.selector);

    _takeover(
      tokenId_,
      initialValuation_ + 2,
      initialValuation_,
      initialValuation_ + 1
    );
  }

  function test_takeoverLease_beneficiarySender_cannotContainSurplusValue(
    uint256 tokenId_,
    address initialLeasee_,
    uint256 initialDeposit_,
    uint256 initialValuation_,
    uint256 taxRate_,
    uint256 collectionFrequency_
  ) public {
    _mint_helper(
      tokenId_,
      initialLeasee_,
      initialDeposit_,
      initialValuation_,
      payable(msg.sender),
      taxRate_,
      collectionFrequency_
    );

    // Beneficiary should be sending exactly `initialValuation_`
    vm.expectRevert(SurplusValue.selector);

    _takeover(
      tokenId_,
      initialValuation_ + 2,
      initialValuation_,
      initialValuation_ + 1
    );
  }

  function test__takeoverLease_nonBeneficiarySender_requiresSurplusValue(
    uint256 tokenId_,
    address initialLeasee_,
    uint256 initialDeposit_,
    uint256 initialValuation_,
    address payable beneficiary_,
    uint256 taxRate_,
    uint256 collectionFrequency_
  ) public {
    _mint_helper(
      tokenId_,
      initialLeasee_,
      initialDeposit_,
      initialValuation_,
      beneficiary_,
      taxRate_,
      collectionFrequency_
    );

    // Beneficiary should be sending exactly `initialValuation_`
    vm.expectRevert(GreaterValuationRequired.selector);

    _takeover(
      tokenId_,
      initialValuation_ + 1,
      initialValuation_,
      initialValuation_
    );
  }

  function test_takeoverLease_buyerCannotBeOwner(
    uint256 tokenId_,
    uint256 initialDeposit_,
    uint256 initialValuation_,
    address payable beneficiary_,
    uint256 taxRate_,
    uint256 collectionFrequency_
  ) public {
    _mint_helper(
      tokenId_,
      msg.sender,
      initialDeposit_,
      initialValuation_,
      beneficiary_,
      taxRate_,
      collectionFrequency_
    );

    vm.expectRevert(AlreadyOwner.selector);

    _takeover(
      tokenId_,
      initialValuation_ + 2,
      initialValuation_,
      initialValuation_ + 1
    );
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
    address payable beneficiary_,
    uint256 taxRate_,
    uint256 collectionFrequency_
  ) public {
    _mint_helper(
      tokenId_,
      msg.sender,
      initialDeposit_,
      initialValuation_,
      beneficiary_,
      taxRate_,
      collectionFrequency_
    );

    vm.expectRevert(SameValuation.selector);
    selfAssess(tokenId_, initialValuation_);
  }
}
