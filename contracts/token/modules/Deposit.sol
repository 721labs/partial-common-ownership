// contracts/token/modules/Deposit.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./interfaces/IDeposit.sol";
import "./TokenManagement.sol";

abstract contract Deposit is IDeposit, TokenManagement {
  //////////////////////////////
  /// State
  //////////////////////////////

  /// @notice Mapping from token ID to funds for paying tax ("Deposit") in Wei.
  mapping(uint256 => uint256) private _deposits;

  //////////////////////////////
  /// Public Getters
  //////////////////////////////

  /// @dev See {IDeposit.depositOf}
  function depositOf(uint256 tokenId_)
    public
    view
    override
    _tokenMinted(tokenId_)
    returns (uint256)
  {
    return _deposits[tokenId_];
  }

  //////////////////////////////
  /// Internal Setters
  //////////////////////////////

  /// @notice Sets deposit for a given token.
  /// @param tokenId_ ID of token.
  /// @param amount_ New deposit amount.
  function _setDeposit(uint256 tokenId_, uint256 amount_) internal {
    _deposits[tokenId_] = amount_;
  }
}
