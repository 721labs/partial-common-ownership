// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

/// @dev Minimal ABI-compatible target registry for the repository's pre-
/// StdInvariant forge-std pin. Replace with StdInvariant after Stage 9.
abstract contract WrapperInvariantTargets {
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

    function targetContract(address target_) internal {
        _targetedContracts.push(target_);
    }

    function targetContracts() public view returns (address[] memory) {
        return _targetedContracts;
    }

    function targetSelectors() public pure returns (FuzzSelector[] memory values_) {}

    function excludeArtifacts() public pure returns (string[] memory values_) {}

    function excludeContracts() public pure returns (address[] memory values_) {}

    function excludeSelectors() public pure returns (FuzzSelector[] memory values_) {}

    function excludeSenders() public pure returns (address[] memory values_) {}

    function targetArtifacts() public pure returns (string[] memory values_) {}

    function targetArtifactSelectors() public pure returns (FuzzArtifactSelector[] memory values_) {}

    function targetInterfaces() public pure returns (FuzzInterface[] memory values_) {}

    function targetSenders() public pure returns (address[] memory values_) {}
}
