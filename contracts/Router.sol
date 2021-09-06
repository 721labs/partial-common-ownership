// contracts/Router.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./PartialCommonOwnership.sol"; // dont need an interface since it's a test contract

/*
Testing contract
*/

contract Router {
  PartialCommonOwnership steward;
  bool public toBlock = true;

  constructor(address _steward) {
    steward = PartialCommonOwnership(_steward);
  }

  function buy(uint256 currentPrice) public payable {
    // steward.buy{value: msg.value}(1 ether, currentPrice);
    // note: for some reason, it can't determine difference between buy(uint256) & buy(uint256,uint256)
    // Thus: manually creating this call for testing
    address(steward).call{value: msg.value}(
      abi.encodeWithSignature("buy(uint256,uint256)", 1 ether, currentPrice)
    );
  }

  function withdrawPullFunds() public {
    steward.withdrawPullFunds();
  }

  fallback() external payable {
    if (toBlock) {
      revert("blocked");
    }
  }

  function setBlock(bool _tb) public {
    toBlock = _tb;
  }
}
