// contracts/token/modules/Lease.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./interfaces/ILease.sol";
import "./TokenManagement.sol";
import "./Taxation.sol";

abstract contract Lease is ILease, TokenManagement, Taxation {
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

  /// @dev See {ILease.selfAssess}
  function selfAssess(uint256 tokenId_, uint256 newValuation_)
    public
    override
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
