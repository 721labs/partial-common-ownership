// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

/// @dev The repository's pinned forge-std predates StdInvariant. This is the
/// minimal, ABI-compatible target registry consumed by modern Forge. Delete
/// this shim when forge-std is upgraded and inherit StdInvariant instead.
abstract contract PCOInvariantTargets {
    struct FuzzSelector {
        address addr;
        bytes4[] selectors;
    }

    struct FuzzArtifactSelector {
        string artifact;
        bytes4[] selectors;
    }

    struct FuzzInterface {
        address addr;
        string[] artifacts;
    }

    address[] private _targetedContracts;
    FuzzSelector[] private _targetedSelectors;

    function targetContract(address target_) internal {
        _targetedContracts.push(target_);
    }

    function targetSelector(FuzzSelector memory target_) internal {
        _targetedSelectors.push(target_);
    }

    function targetContracts() public view returns (address[] memory) {
        return _targetedContracts;
    }

    function targetSelectors() public view returns (FuzzSelector[] memory) {
        return _targetedSelectors;
    }

    function excludeArtifacts() public pure returns (string[] memory values_) {}

    function excludeContracts() public pure returns (address[] memory values_) {}

    function excludeSelectors() public pure returns (FuzzSelector[] memory values_) {}

    function excludeSenders() public pure returns (address[] memory values_) {}

    function targetArtifacts() public pure returns (string[] memory values_) {}

    function targetArtifactSelectors() public pure returns (FuzzArtifactSelector[] memory values_) {}

    function targetInterfaces() public pure returns (FuzzInterface[] memory values_) {}

    function targetSenders() public pure returns (address[] memory values_) {}
}
