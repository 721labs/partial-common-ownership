// contracts/token/modules/interfaces/IBeneficiary.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

interface IBeneficiary {
  /// @notice Sets the beneficiary for a given token.
  /// @dev Should only be called by beneficiary.
  /// @param tokenId_ Token to set beneficiary of.
  /// @param beneficiary_ Address of beneficiary.
  function setBeneficiary(uint256 tokenId_, address payable beneficiary_)
    external;

  /// @notice Gets the beneficiary of a given token
  /// @param tokenId_ Id of token to query for
  /// @return Beneficiary address
  function beneficiaryOf(uint256 tokenId_) external view returns (address);
}
