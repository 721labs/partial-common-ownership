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
    address payable _beneficiary,
    uint256 _taxRate,
    uint256 _taxationPeriod
  ) PartialCommonOwnership721(_name, _symbol, _taxRate, _taxationPeriod) {
    _safeMint(address(this), 1);
    _safeMint(address(this), 2);
    _safeMint(address(this), 3);

    _setBeneficiary(1, _beneficiary);
    _setBeneficiary(2, _beneficiary);
    _setBeneficiary(3, _beneficiary);
  }
}
