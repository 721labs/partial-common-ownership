/// contracts/test/TestDSMath.sol
/// SPDX-License-Identifier: MIT

import "../utils/DSMath.sol";

/// @title TestDSMath.sol
/// @author 721 Labs (https://721.dev)
/// @dev Light-wrapper on top of DSMath functions.
contract TestDSMath {
  function add(uint256 x, uint256 y) public pure returns (uint256) {
    return DSMath.add(x, y);
  }

  function mul(uint256 x, uint256 y) public pure returns (uint256) {
    return DSMath.mul(x, y);
  }

  function wmul(uint256 x, uint256 y) public pure returns (uint256) {
    return DSMath.wmul(x, y);
  }

  function rmul(uint256 x, uint256 y) public pure returns (uint256) {
    return DSMath.rmul(x, y);
  }

  function wdiv(uint256 x, uint256 y) public pure returns (uint256) {
    return DSMath.wdiv(x, y);
  }

  function rdiv(uint256 x, uint256 y) public pure returns (uint256) {
    return DSMath.rdiv(x, y);
  }
}
