// contracts/test/Blocker.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./Test721PCOToken.sol";

contract Blocker {
  Test721PCOToken private _testContract;

  /// @dev Block by default
  bool private _shouldBlock = true;

  constructor(address contractAddress_) {
    _testContract = Test721PCOToken(contractAddress_);
  }

  receive() external payable {
    if (_shouldBlock) revert("");
  }

  function buy(
    uint256 tokenId_,
    uint256 purchasePrice_,
    uint256 currentPriceForVerification_
  ) public payable {
    // solhint-disable avoid-low-level-calls
    address(_testContract).call{value: msg.value}(
      abi.encodeWithSignature(
        "buy(uint256,uint256,uint256)",
        tokenId_,
        purchasePrice_,
        currentPriceForVerification_
      )
    );
  }

  function collect() public {
    _shouldBlock = false; // Stop blocking
    _testContract.withdrawOutstandingRemittance();
  }
}
