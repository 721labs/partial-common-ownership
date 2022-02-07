// contracts/token/modules/Lease.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./TokenManagement.sol";
import "./Taxation.sol";

abstract contract Lease is TokenManagement, Taxation {
  //////////////////////////////
  /// Events
  //////////////////////////////

  /// @notice Alert owner re-assessed the valuation.
  /// @param tokenId ID of token.
  /// @param newValuation New valuation in Wei.
  event LogValuationReassessment(
    uint256 indexed tokenId,
    uint256 indexed newValuation
  );

  //////////////////////////////
  /// Public Methods
  //////////////////////////////

  /// @notice Enables owner to self-assess the value of a token.
  /// @param tokenId_ ID of token.
  /// @param newValuation_ New valuation in Wei.
  function selfAssess(uint256 tokenId_, uint256 newValuation_)
    public
    _onlyOwner(tokenId_)
    _collectTax(tokenId_)
  {
    uint256 currentValuation = valuationOf(tokenId_);
    require(newValuation_ > 0, "New price cannot be zero");
    require(newValuation_ != currentValuation, "New price cannot be same");

    _setValuation(tokenId_, newValuation_);
    emit LogValuationReassessment(tokenId_, newValuation_);
  }
}
