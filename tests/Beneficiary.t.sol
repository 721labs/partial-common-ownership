// tests/Beneficiary.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import "ds-test/test.sol";
import {Beneficiary} from "../contracts/token/modules/Beneficiary.sol";

// TODO: This test will fail b/c of TokenManagement's implementation of ERC721.
contract BeneficiaryTest is DSTest, Beneficiary {
  //function setUp() public {}

  function testExample() public {
    assertTrue(true);
  }
}
