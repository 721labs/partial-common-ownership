// contracts/test/Attacker.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./Test721Token.sol";

contract Attacker {
  Test721Token private _testContract;

  uint256 private _targetToken;

  constructor(address contractAddress_) {
    _testContract = Test721Token(contractAddress_);
  }

  /// @dev Triggered by `buy` remittance
  /* solhint-disable no-complex-fallback */
  receive() external payable {
    // Re-purchase; this should trigger the lock and cause the remittance
    // payment to fail.
    uint256 price = _testContract.priceOf(_targetToken);
    _buy(msg.value + 1 ether, _targetToken, price + 1 wei, price);
  }

  // solhint-disable no-empty-blocks
  /// @dev Accepts incoming eth deposits
  function depositFunds() public payable {}

  function buy(
    uint256 tokenId_,
    uint256 purchasePrice_,
    uint256 currentPriceForVerification_
  ) public payable {
    _targetToken = tokenId_;
    _buy(msg.value, tokenId_, purchasePrice_, currentPriceForVerification_);
  }

  function _buy(
    uint256 value_,
    uint256 tokenId_,
    uint256 purchasePrice_,
    uint256 currentPriceForVerification_
  ) private {
    // solhint-disable avoid-low-level-calls
    address(_testContract).call{value: value_}(
      abi.encodeWithSignature(
        "buy(uint256,uint256,uint256)",
        tokenId_,
        purchasePrice_,
        currentPriceForVerification_
      )
    );
  }
}
