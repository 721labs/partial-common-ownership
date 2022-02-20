// contracts/token/modules/Listed.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AsksV1_1} from "../../../zora/contracts/modules/Asks/V1.1/AsksV1_1.sol";
import {ERC721TransferHelper} from "../../../zora/contracts/transferHelpers/ERC721TransferHelper.sol";
import {ZoraModuleManager} from "../../../zora/contracts/ZoraModuleManager.sol";

abstract contract Listed is ERC721 {

  //////////////////////////////
  /// State
  //////////////////////////////

  /// @notice Mapping from token ID to a listing on an exchange
  mapping(uint256 => address) internal _listings;

  //////////////////////////////
  /// Public Methods
  //////////////////////////////

  // setListing
  // uses ETH as the asking currency
  // doesn't offer any finders fee for the time being
  function setListing(
    uint256 tokenId_,
    address exchangeContract_,
    address moduleManager_,
    uint256 askPrice_, // TODO: perhaps these mappings can be acquired by inheriting from modules
    address owner_ // TODO: perhaps these mappings can be acquired by inheriting from modules
  ) public {

    _listings[tokenId_] = exchangeContract_;

    // TODO: actually, depending on the particular exchangeContract, a different interface should be activated...
    // In order to allow more flexible exchange listings, I feel like we should pass the address as an argument
    _approve(exchangeContract_, tokenId_);
    setApprovalForAll(address(this), true);

    AsksV1_1 exchangeContract = AsksV1_1(exchangeContract_);
    ERC721TransferHelper erc721TransferHelper = ERC721TransferHelper(exchangeContract.erc721TransferHelper());
    setApprovalForAll(address(erc721TransferHelper), true);

    ZoraModuleManager moduleManagerContract = ZoraModuleManager(moduleManager_);
    moduleManagerContract.setApprovalForModule(
      exchangeContract_,
      true
    );
    exchangeContract.createAsk(address(this), tokenId_, askPrice_, address(0), owner_, 0);
  }

  // setAskPrice
  // uses ETH as the asking currency
  function setAskPrice(
    uint256 tokenId_,
    uint256 askPrice_ // TODO: perhaps these mappings can be acquired by inheriting from modules
  ) public {

    address exchangeContractAddress = _listings[tokenId_];

    // TODO: actually, depending on the particular exchangeContract, a different interface should be activated...
    // In order to allow more flexible exchange listings, I feel like we should pass the address as an argument
    AsksV1_1 exchangeContract = AsksV1_1(exchangeContractAddress);
    exchangeContract.setAskPrice(address(this), tokenId_, askPrice_, address(0));
  }

  // cancelAsk
  function cancelAsk(
    uint256 tokenId_
  ) public payable {

    address exchangeContractAddress = _listings[tokenId_];

    // TODO: actually, depending on the particular exchangeContract, a different interface should be activated...
    // In order to allow more flexible exchange listings, I feel like we should pass the address as an argument
    AsksV1_1 exchangeContract = AsksV1_1(exchangeContractAddress);
    exchangeContract.cancelAsk(address(this), tokenId_);
  }

  // listed
  function listed(
    uint256 tokenId_
  ) public payable returns (bool) {
    return _listings[tokenId_] != address(0);
  }
}
