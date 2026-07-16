// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

/// @dev Deterministically rejects Ether sent with the `send` stipend.
contract RejectEther {
  error EtherRejected();

  receive() external payable {
    revert EtherRejected();
  }
}
