// contracts/test/EnhancedTest.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {Test} from "forge-std/Test.sol";

contract EnhancedTest is Test {
  error UnsupportedChain();

  //////////////////////////////
  /// Global Before Each
  //////////////////////////////

  function setUp() public {
    // Unset contract balance
    vm.deal(address(this), 0);
  }

  //////////////////////////////
  /// Utility Methods
  //////////////////////////////

  /// @dev Ensures that fuzzed address does not throw false-negatives.
  function safeFuzzedAddress(address who) internal {
    noVM(who);
    noPrecompiles(who);
    noCreate2Deployer(who);
  }

  /// @dev Prevents fuzzer from using the Create2Deployer address.
  function noCreate2Deployer(address who) internal {
    vm.assume(who != address(0x4e59b44847b379578588920cA78FbF26c0B4956C));
  }

  /// @dev Prevents fuzzer from using the Forge VM address at
  /// 0x7109709ecfa91a80626ff3989d68f67f5b1dd12d
  function noVM(address who) internal {
    vm.assume(who != address(vm));
  }

  /// @dev Passes over pre-compile addresses when a given address is being fuzzed.
  /// See: https://github.com/foundry-rs/forge-std/issues/134
  function noPrecompiles(address who) internal {
    noPrecompiles(who, block.chainid);
  }

  /// @dev Use this version to specify which chain's precompiles to use.
  function noPrecompiles(address who, uint256 chainId) internal {
    if (chainId == 1 || chainId == 31337) {
      if (who == address(0)) return;
      // Mainnet precompiles: https://www.evm.codes/precompiled
      vm.assume(who > address(9));
    } else if (chainId == 10 || chainId == 69 || chainId == 420) {
      // Optimism precompiles: https://github.com/ethereum-optimism/optimism/blob/master/packages/contracts/contracts/libraries/constants/Lib_PredeployAddresses.sol
      vm.assume(
        who < 0x4200000000000000000000000000000000000000 &&
          who > 0x4200000000000000000000000000000000000013
      );
    } else {
      revert UnsupportedChain();
    }
  }

  /// @dev Returns an address that will throw an error when sending Ether to it.
  /// Currently using precompiled contract addresses
  function getUnsendableAddress() internal pure returns (address) {
    return address(1);
  }
}
