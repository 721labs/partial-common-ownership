// contracts/token/modules/interfaces/IRemittance.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRemittance {
  error DestinationZeroAddress();
  error DestinationContractAddress();
  error AmountZero();
  error InsufficientBalance();
  error NoOutstandingBalance();

  /// @notice Enables previous owners to withdraw remittances that failed to send.
  /// @dev To reduce complexity, pull funds are entirely separate from current deposit.
  function withdrawOutstandingRemittance() external;
}
