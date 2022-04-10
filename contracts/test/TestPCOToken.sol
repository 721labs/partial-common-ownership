// contracts/test/TestPCOToken.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import "../token/PartialCommonOwnership.sol";

/// @title TestPCOToken – Example implementation of PCO for 721 for use in testing.
contract TestPCOToken is PartialCommonOwnership {
  /// @notice Constructs token and mints 1 - 3.
  constructor(address payable _beneficiary) {
    _safeMint(address(this), 1);
    _setBeneficiary(1, _beneficiary);
    // 5% Quarterly
    _setTaxRate(1, 50000000000);
    _setCollectionFrequency(1, 90);

    _safeMint(address(this), 2);
    _setBeneficiary(2, _beneficiary);
    // 100% Monthly
    _setTaxRate(2, 1000000000000);
    _setCollectionFrequency(2, 30);

    _safeMint(address(this), 3);
    _setBeneficiary(3, _beneficiary);
    // 100% Annually
    _setTaxRate(3, 1000000000000);
    _setCollectionFrequency(3, 365);
  }
}
