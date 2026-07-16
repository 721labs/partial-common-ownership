// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "../Wrapper.sol";

enum PCOReceiverAction {
  Accept,
  WrongSelector,
  ApproveThenRevert,
  TransferAndAccept,
  UnwrapAndAccept
}

/// @dev Test-only receiver that verifies a wrapped PCO token is fully
/// initialized before its safe-mint callback executes.
contract PCOInitializationReceiver is IERC721Receiver {
  Wrapper public immutable wrapper;
  IERC721 public immutable underlying;
  address public immutable recipient;

  uint256 public callbackCount;

  uint256 private _expectedUnderlyingTokenId;
  uint256 private _expectedWrappedTokenId;
  uint256 private _expectedDeposit;
  uint256 private _expectedValuation;
  address private _expectedBeneficiary;
  uint256 private _expectedTaxRate;
  uint256 private _expectedCollectionFrequency;
  uint256 private _expectedWrapperBalance;
  uint256 private _expectedWrappedBalance;
  PCOReceiverAction private _action;

  event CallbackObserved(
    uint256 indexed wrappedTokenId,
    PCOReceiverAction indexed action
  );

  constructor(
    Wrapper wrapper_,
    IERC721 underlying_,
    address recipient_
  ) {
    wrapper = wrapper_;
    underlying = underlying_;
    recipient = recipient_;
  }

  /* solhint-disable no-empty-blocks */
  receive() external payable {}

  /* solhint-enable no-empty-blocks */

  function wrap(
    uint256 underlyingTokenId_,
    uint256 valuation_,
    address payable beneficiary_,
    uint256 taxRate_,
    uint256 collectionFrequency_,
    PCOReceiverAction action_
  ) external payable returns (uint256 wrappedTokenId_) {
    wrappedTokenId_ = wrapper.wrappedTokenId(
      address(underlying),
      underlyingTokenId_
    );

    _expectedUnderlyingTokenId = underlyingTokenId_;
    _expectedWrappedTokenId = wrappedTokenId_;
    _expectedDeposit = msg.value;
    _expectedValuation = valuation_;
    _expectedBeneficiary = beneficiary_;
    _expectedTaxRate = taxRate_;
    _expectedCollectionFrequency = collectionFrequency_ * 1 days;
    _expectedWrapperBalance = address(wrapper).balance + msg.value;
    _expectedWrappedBalance = wrapper.balanceOf(address(this)) + 1;
    _action = action_;

    underlying.approve(address(wrapper), underlyingTokenId_);
    wrapper.wrap{value: msg.value}(
      address(underlying),
      underlyingTokenId_,
      valuation_,
      beneficiary_,
      taxRate_,
      collectionFrequency_
    );
  }

  function attemptRejectedWrap(
    uint256 underlyingTokenId_,
    uint256 valuation_,
    address payable beneficiary_,
    uint256 taxRate_,
    uint256 collectionFrequency_,
    PCOReceiverAction action_
  ) external payable returns (bytes memory revertData_) {
    bool success;
    /* solhint-disable avoid-low-level-calls */
    (success, revertData_) = address(this).call{value: msg.value}(
      abi.encodeWithSelector(
        this.wrap.selector,
        underlyingTokenId_,
        valuation_,
        beneficiary_,
        taxRate_,
        collectionFrequency_,
        action_
      )
    );
    /* solhint-enable avoid-low-level-calls */
    require(!success, "PCO receiver: callback rejection expected");
  }

  function onERC721Received(
    address operator_,
    address from_,
    uint256 tokenId_,
    bytes calldata data_
  ) external override returns (bytes4) {
    // Accept custody of an underlying token before a test invokes #wrap, and
    // accept it again if #unwrap is exercised reentrantly during the callback.
    if (msg.sender == address(underlying)) {
      return IERC721Receiver.onERC721Received.selector;
    }

    require(msg.sender == address(wrapper), "PCO receiver: wrong caller");
    require(operator_ == address(this), "PCO receiver: wrong operator");
    require(from_ == address(0), "PCO receiver: wrong previous owner");
    require(tokenId_ == _expectedWrappedTokenId, "PCO receiver: wrong token");
    require(data_.length == 0, "PCO receiver: unexpected data");

    require(
      wrapper.ownerOf(tokenId_) == address(this),
      "PCO receiver: owner not initialized"
    );
    require(
      wrapper.balanceOf(address(this)) == _expectedWrappedBalance,
      "PCO receiver: balance not initialized"
    );
    require(
      wrapper.getApproved(tokenId_) == address(0),
      "PCO receiver: approval not clear"
    );
    require(
      wrapper.depositOf(tokenId_) == _expectedDeposit,
      "PCO receiver: deposit not initialized"
    );
    require(
      wrapper.valuationOf(tokenId_) == _expectedValuation,
      "PCO receiver: valuation not initialized"
    );
    require(
      wrapper.beneficiaryOf(tokenId_) == _expectedBeneficiary,
      "PCO receiver: beneficiary not initialized"
    );
    require(
      wrapper.taxRateOf(tokenId_) == _expectedTaxRate,
      "PCO receiver: tax rate not initialized"
    );
    require(
      wrapper.collectionFrequencyOf(tokenId_) == _expectedCollectionFrequency,
      "PCO receiver: frequency not initialized"
    );
    require(
      wrapper.taxationCollected(tokenId_) == 0,
      "PCO receiver: lifetime tax not clear"
    );
    require(
      wrapper.taxCollectedSinceLastTransferOf(tokenId_) == 0,
      "PCO receiver: transfer tax not clear"
    );
    require(
      wrapper.lastCollectionTimeOf(tokenId_) == 0,
      "PCO receiver: collection time changed"
    );
    require(
      address(wrapper).balance == _expectedWrapperBalance,
      "PCO receiver: ether balance incorrect"
    );
    require(
      underlying.ownerOf(_expectedUnderlyingTokenId) == address(wrapper),
      "PCO receiver: underlying not in custody"
    );
    require(
      keccak256(bytes(wrapper.tokenURI(tokenId_))) ==
        keccak256(
          bytes(
            string(
              abi.encodePacked(
                "721.dev/",
                _toString(_expectedUnderlyingTokenId)
              )
            )
          )
        ),
      "PCO receiver: metadata not initialized"
    );

    callbackCount += 1;
    emit CallbackObserved(tokenId_, _action);

    if (_action == PCOReceiverAction.WrongSelector) {
      return bytes4(0);
    }

    if (_action == PCOReceiverAction.ApproveThenRevert) {
      wrapper.approve(recipient, tokenId_);
      require(
        wrapper.getApproved(tokenId_) == recipient,
        "PCO receiver: approval failed"
      );
      revert("PCO receiver: intentional rollback");
    }

    if (_action == PCOReceiverAction.TransferAndAccept) {
      wrapper.transferFrom(address(this), recipient, tokenId_);
      require(
        wrapper.ownerOf(tokenId_) == recipient,
        "PCO receiver: transfer failed"
      );
    } else if (_action == PCOReceiverAction.UnwrapAndAccept) {
      wrapper.unwrap(tokenId_);
      require(
        underlying.ownerOf(_expectedUnderlyingTokenId) == address(this),
        "PCO receiver: unwrap failed"
      );
    }

    return IERC721Receiver.onERC721Received.selector;
  }

  function _toString(uint256 value_) private pure returns (string memory) {
    if (value_ == 0) return "0";

    uint256 digits;
    uint256 remaining = value_;
    while (remaining != 0) {
      digits++;
      remaining /= 10;
    }

    bytes memory buffer = new bytes(digits);
    while (value_ != 0) {
      digits -= 1;
      buffer[digits] = bytes1(uint8(48 + (value_ % 10)));
      value_ /= 10;
    }
    return string(buffer);
  }
}
