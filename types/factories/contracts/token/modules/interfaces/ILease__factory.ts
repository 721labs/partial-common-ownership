/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Contract, Signer, utils } from "ethers";
import type { Provider } from "@ethersproject/providers";
import type {
  ILease,
  ILeaseInterface,
} from "../../../../../contracts/token/modules/interfaces/ILease";

const _abi = [
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId_",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "newValuation_",
        type: "uint256",
      },
    ],
    name: "selfAssess",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId_",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "newValuation_",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "currentValuation_",
        type: "uint256",
      },
    ],
    name: "takeoverLease",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
];

export class ILease__factory {
  static readonly abi = _abi;
  static createInterface(): ILeaseInterface {
    return new utils.Interface(_abi) as ILeaseInterface;
  }
  static connect(address: string, signerOrProvider: Signer | Provider): ILease {
    return new Contract(address, _abi, signerOrProvider) as ILease;
  }
}