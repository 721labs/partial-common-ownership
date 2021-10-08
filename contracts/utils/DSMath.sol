/// contracts/utils/DSMath.sol
/// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

/// @title DSMath
/// @author DappHubb (https://dapp.tools/)
/// @dev Trims unused functions and converts original contract to a library.
library DSMath {
  function add(uint256 x, uint256 y) internal pure returns (uint256 z) {
    require((z = x + y) >= x, "ds-math-add-overflow");
  }

  function mul(uint256 x, uint256 y) internal pure returns (uint256 z) {
    require(y == 0 || (z = x * y) / y == x, "ds-math-mul-overflow");
  }

  uint256 constant WAD = 10**18;
  uint256 constant RAY = 10**27;

  //rounds to zero if x*y < WAD / 2
  function wmul(uint256 x, uint256 y) internal pure returns (uint256) {
    return add(mul(x, y), WAD / 2) / WAD;
  }

  //rounds to zero if x*y < WAD / 2
  function rmul(uint256 x, uint256 y) internal pure returns (uint256) {
    return add(mul(x, y), RAY / 2) / RAY;
  }

  //rounds to zero if x*y < WAD / 2
  function wdiv(uint256 x, uint256 y) internal pure returns (uint256) {
    return add(mul(x, WAD), y / 2) / y;
  }

  //rounds to zero if x*y < RAY / 2
  function rdiv(uint256 x, uint256 y) internal pure returns (uint256) {
    return add(mul(x, RAY), y / 2) / y;
  }
}
