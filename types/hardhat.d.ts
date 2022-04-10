/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { ethers } from "ethers";
import {
  FactoryOptions,
  HardhatEthersHelpers as HardhatEthersHelpersBase,
} from "@nomiclabs/hardhat-ethers/types";

import * as Contracts from ".";

declare module "hardhat/types/runtime" {
  interface HardhatEthersHelpers extends HardhatEthersHelpersBase {
    getContractFactory(
      name: "ERC721",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ERC721__factory>;
    getContractFactory(
      name: "IERC721Metadata",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC721Metadata__factory>;
    getContractFactory(
      name: "IERC721",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC721__factory>;
    getContractFactory(
      name: "IERC721Receiver",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC721Receiver__factory>;
    getContractFactory(
      name: "ERC165",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ERC165__factory>;
    getContractFactory(
      name: "IERC165",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC165__factory>;
    getContractFactory(
      name: "Blocker",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.Blocker__factory>;
    getContractFactory(
      name: "TestNFT",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.TestNFT__factory>;
    getContractFactory(
      name: "TestPCOToken",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.TestPCOToken__factory>;
    getContractFactory(
      name: "TestWrapper",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.TestWrapper__factory>;
    getContractFactory(
      name: "Beneficiary",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.Beneficiary__factory>;
    getContractFactory(
      name: "ERC721",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ERC721__factory>;
    getContractFactory(
      name: "IBeneficiary",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IBeneficiary__factory>;
    getContractFactory(
      name: "ILease",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ILease__factory>;
    getContractFactory(
      name: "IRemittance",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IRemittance__factory>;
    getContractFactory(
      name: "ITaxation",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ITaxation__factory>;
    getContractFactory(
      name: "IValuation",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IValuation__factory>;
    getContractFactory(
      name: "Lease",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.Lease__factory>;
    getContractFactory(
      name: "Remittance",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.Remittance__factory>;
    getContractFactory(
      name: "Taxation",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.Taxation__factory>;
    getContractFactory(
      name: "Valuation",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.Valuation__factory>;
    getContractFactory(
      name: "PartialCommonOwnership",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.PartialCommonOwnership__factory>;
    getContractFactory(
      name: "Wrapper",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.Wrapper__factory>;

    getContractAt(
      name: "ERC721",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.ERC721>;
    getContractAt(
      name: "IERC721Metadata",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC721Metadata>;
    getContractAt(
      name: "IERC721",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC721>;
    getContractAt(
      name: "IERC721Receiver",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC721Receiver>;
    getContractAt(
      name: "ERC165",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.ERC165>;
    getContractAt(
      name: "IERC165",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC165>;
    getContractAt(
      name: "Blocker",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.Blocker>;
    getContractAt(
      name: "TestNFT",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.TestNFT>;
    getContractAt(
      name: "TestPCOToken",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.TestPCOToken>;
    getContractAt(
      name: "TestWrapper",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.TestWrapper>;
    getContractAt(
      name: "Beneficiary",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.Beneficiary>;
    getContractAt(
      name: "ERC721",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.ERC721>;
    getContractAt(
      name: "IBeneficiary",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IBeneficiary>;
    getContractAt(
      name: "ILease",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.ILease>;
    getContractAt(
      name: "IRemittance",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IRemittance>;
    getContractAt(
      name: "ITaxation",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.ITaxation>;
    getContractAt(
      name: "IValuation",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IValuation>;
    getContractAt(
      name: "Lease",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.Lease>;
    getContractAt(
      name: "Remittance",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.Remittance>;
    getContractAt(
      name: "Taxation",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.Taxation>;
    getContractAt(
      name: "Valuation",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.Valuation>;
    getContractAt(
      name: "PartialCommonOwnership",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.PartialCommonOwnership>;
    getContractAt(
      name: "Wrapper",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.Wrapper>;

    // default types
    getContractFactory(
      name: string,
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<ethers.ContractFactory>;
    getContractFactory(
      abi: any[],
      bytecode: ethers.utils.BytesLike,
      signer?: ethers.Signer
    ): Promise<ethers.ContractFactory>;
    getContractAt(
      nameOrAbi: string | any[],
      address: string,
      signer?: ethers.Signer
    ): Promise<ethers.Contract>;
  }
}
