// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

/// @dev Modern `getRecordedLogs` return shape, kept local until forge-std is upgraded.
interface VmRecordedLogs {
  struct Log {
    bytes32[] topics;
    bytes data;
    address emitter;
  }

  function recordLogs() external;

  function getRecordedLogs() external returns (Log[] memory);
}
