// contracts/test/TestPCO721Token.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "../token/PartialCommonOwnership721.sol";

/// @title TestPCO721Token – Example implementation of PCO for 721 for use in testing.
contract TestPCO721Token is PartialCommonOwnership721 {
  /// @notice Constructs token and mints 1 - 3.
  constructor(
    string memory _name,
    string memory _symbol,
    address payable _beneficiary
  ) PartialCommonOwnership721(_name, _symbol) {
    _safeMint(address(this), 1);
    _setBeneficiary(1, _beneficiary);
    // 5% Quarterly
    _setTaxRate(1, 50000000000);
    _setTaxPeriod(1, 90);

    _safeMint(address(this), 2);
    _setBeneficiary(2, _beneficiary);
    // 100% Monthly
    _setTaxRate(2, 1000000000000);
    _setTaxPeriod(2, 30);

    _safeMint(address(this), 3);
    _setBeneficiary(3, _beneficiary);
    // 100% Annually
    _setTaxRate(3, 1000000000000);
    _setTaxPeriod(3, 365);
  }
}
