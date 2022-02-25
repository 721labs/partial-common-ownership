// contracts/token/modules/interfaces/ILease.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

interface ILease {
  /// @notice Takeover the lease of a token. Current owner is remitted the current valuation and all excess value included
  /// in the message gets added to the deposit.
  /// @param tokenId_ ID of token the buyer wants to purchase.
  /// @param newValuation_ New buyer's valuation of the token. Must be greater or equal to current valuation.
  /// @param currentValuation_ Current valuation must be given to protect against a front-run attack.
  /// The buyer will only complete the takeover at the agreed upon valuation. This prevents a malicious,
  /// second buyer from purchasing the token before the first trx is complete, changing the valuation,
  /// and eating into the first buyer's deposit.
  function takeoverLease(
    uint256 tokenId_,
    uint256 newValuation_,
    uint256 currentValuation_
  ) external payable;

  /// @notice Enables owner to self-assess the value of a token.
  /// @param tokenId_ ID of token.
  /// @param newValuation_ New valuation in Wei.
  function selfAssess(uint256 tokenId_, uint256 newValuation_) external;
}
