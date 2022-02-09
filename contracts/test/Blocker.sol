// contracts/test/Blocker.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./TestPCOToken.sol";

contract Blocker {
  TestPCOToken private _testContract;

  /// @dev Block by default
  bool private _shouldBlock = true;

  constructor(address contractAddress_) {
    _testContract = TestPCOToken(contractAddress_);
  }

  receive() external payable {
    if (_shouldBlock) revert("");
  }

  function takeoverLease(
    uint256 tokenId_,
    uint256 purchasePrice_,
    uint256 currentPriceForVerification_
  ) public payable {
    // solhint-disable avoid-low-level-calls
    address(_testContract).call{value: msg.value}(
      abi.encodeWithSignature(
        "takeoverLease(uint256,uint256,uint256)",
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
