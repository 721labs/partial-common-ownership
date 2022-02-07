// contracts/token/modules/Title.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./interfaces/ITitle.sol";
import "./TokenManagement.sol";

abstract contract Title is ITitle, TokenManagement {
  //////////////////////////////
  /// State
  //////////////////////////////

  /// @notice Mapping from token ID to array of transfer events.
  /// @dev This includes foreclosures.
  mapping(uint256 => TitleTransferEvent[]) private _chainOfTitle;

  //////////////////////////////
  /// Public Getters
  //////////////////////////////

  /// @dev See {ITitle.titleChainOf}
  function titleChainOf(uint256 tokenId_)
    public
    view
    override
    _tokenMinted(tokenId_)
    returns (TitleTransferEvent[] memory)
  {
    return _chainOfTitle[tokenId_];
  }

  /// @dev See {ITitle.lastTransferTimeOf}
  function lastTransferTimeOf(uint256 tokenId_)
    public
    view
    override
    _tokenMinted(tokenId_)
    returns (uint256)
  {
    TitleTransferEvent[] memory chain = _chainOfTitle[tokenId_];
    TitleTransferEvent memory transferEvent = chain[chain.length - 1];
    return transferEvent.timestamp;
  }

  //////////////////////////////
  /// Internal Methods
  //////////////////////////////

  /// @notice Logs transfer of title.
  /// @param tokenId_ ID of token to transfer possession of.
  /// @param currentOwner_ Address of current owner.
  /// @param newOwner_ Address of new owner.
  /// @param newValuation_ New valuation in Wei.
  function _titleTransfer(
    uint256 tokenId_,
    address currentOwner_,
    address newOwner_,
    uint256 newValuation_
  ) internal {
    TitleTransferEvent memory transferEvent = TitleTransferEvent(
      currentOwner_,
      newOwner_,
      block.timestamp,
      newValuation_
    );
    _chainOfTitle[tokenId_].push(transferEvent);
  }
}