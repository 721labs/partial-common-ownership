// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {Remittance, RemittanceTriggers} from "../../../contracts/token/modules/Remittance.sol";

/// @dev Provides an external call boundary for tests of Remittance behavior.
contract RemittanceHarness is Remittance {
  function remit(
    address recipient_,
    uint256 remittance_,
    RemittanceTriggers trigger_
  ) external returns (bool) {
    return _remit(recipient_, remittance_, trigger_);
  }
}
