// contracts/token/modules/interfaces/IForeclosure.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

interface IForeclosure {
  /// @notice Do the taxes owed exceed the deposit?  If so, the token should be
  /// "foreclosed" by the contract.  The price should be zero and anyone can
  /// purchase the token for the cost of the gas fee.
  /// @dev This is a useful helper function when price should be zero, but contract doesn't
  /// reflect it yet because `#_forecloseIfNecessary` has not yet been called..
  /// @param tokenId_ ID of token requesting foreclosure status for.
  /// @return Returns boolean indicating whether or not the contract is foreclosed.
  function foreclosed(uint256 tokenId_) external view returns (bool);
}
