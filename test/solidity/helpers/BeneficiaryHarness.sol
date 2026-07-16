// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Beneficiary} from "../../../contracts/token/modules/Beneficiary.sol";

/// @dev Provides an external call boundary for tests of Beneficiary behavior.
contract BeneficiaryHarness is Beneficiary {
  function setInitialBeneficiary(uint256 tokenId_, address beneficiary_)
    external
  {
    _setBeneficiary(tokenId_, payable(beneficiary_));
  }
}
