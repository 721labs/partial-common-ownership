// contracts/test/TestPCO721Token.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title Test721PCOToken – Example implementation of PCO for 721 for use in testing.
contract Test721PCOToken is PartialCommonOwnership721 {
  /// @notice Constructs token and mints 1 - 3.
  constructor(
    string memory _name,
    string memory _symbol,
    address payable _beneficiary,
    uint256 _taxRate,
    uint256 _taxationPeriod
  ) PartialCommonOwnership721(_name, _symbol) {
    _safeMint(address(this), 1);
    _setBeneficiary(1, _beneficiary);
    _setTaxRate(1, _taxRate);
    _setTaxPeriod(1, _taxationPeriod);

    _safeMint(address(this), 2);
    _setBeneficiary(2, _beneficiary);
    _setTaxRate(2, _taxRate);
    _setTaxPeriod(2, _taxationPeriod);

    _safeMint(address(this), 3);
    _setBeneficiary(3, _beneficiary);
    _setTaxRate(3, _taxRate);
    _setTaxPeriod(3, _taxationPeriod);
  //   string memory _symbol
  // )
  //   ERC721(
  //     _name,
  //     _symbol
  //   )
  // {
  //   _safeMint(msg.sender, 1);
  //   _safeMint(msg.sender, 2);
  //   _safeMint(msg.sender, 3);
  }
}
