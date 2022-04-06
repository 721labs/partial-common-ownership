/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import { Signer, utils, Contract, ContractFactory, Overrides } from "ethers";
import type { Provider, TransactionRequest } from "@ethersproject/providers";
import type {
  TestNFT,
  TestNFTInterface,
} from "../../../contracts/test/TestNFT";

const _abi = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "approved",
        type: "address",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "Approval",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "operator",
        type: "address",
      },
      {
        indexed: false,
        internalType: "bool",
        name: "approved",
        type: "bool",
      },
    ],
    name: "ApprovalForAll",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "approve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    name: "balanceOf",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "getApproved",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        internalType: "address",
        name: "operator",
        type: "address",
      },
    ],
    name: "isApprovedForAll",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "ownerOf",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "safeTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
      {
        internalType: "bytes",
        name: "_data",
        type: "bytes",
      },
    ],
    name: "safeTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "operator",
        type: "address",
      },
      {
        internalType: "bool",
        name: "approved",
        type: "bool",
      },
    ],
    name: "setApprovalForAll",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes4",
        name: "interfaceId",
        type: "bytes4",
      },
    ],
    name: "supportsInterface",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "tokenURI",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "transferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const _bytecode =
  "0x60806040523480156200001157600080fd5b50604080518082018252600881526715195cdd0813919560c21b6020808301918252835180850190945260048452631d13919560e21b9084015281519192916200005e91600091620003fb565b50805162000074906001906020840190620003fb565b5060019150505b60038160ff1611620000ab57620000963360ff8316620000b2565b80620000a281620004b7565b9150506200007b565b50620005e0565b620000d4828260405180602001604052806000815250620000d860201b60201c565b5050565b620000e4838362000154565b620000f360008484846200029c565b6200014f5760405162461bcd60e51b815260206004820152603260248201526000805160206200185683398151915260448201527131b2b4bb32b91034b6b83632b6b2b73a32b960711b60648201526084015b60405180910390fd5b505050565b6001600160a01b038216620001ac5760405162461bcd60e51b815260206004820181905260248201527f4552433732313a206d696e7420746f20746865207a65726f2061646472657373604482015260640162000146565b6000818152600260205260409020546001600160a01b031615620002135760405162461bcd60e51b815260206004820152601c60248201527f4552433732313a20746f6b656e20616c7265616479206d696e74656400000000604482015260640162000146565b6001600160a01b03821660009081526003602052604081208054600192906200023e908490620004da565b909155505060008181526002602052604080822080546001600160a01b0319166001600160a01b03861690811790915590518392907fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef908290a45050565b6000620002bd846001600160a01b0316620003f560201b620007541760201c565b15620003e957604051630a85bd0160e11b81526001600160a01b0385169063150b7a0290620002f7903390899088908890600401620004f5565b6020604051808303816000875af192505050801562000335575060408051601f3d908101601f19168201909252620003329181019062000570565b60015b620003ce573d80801562000366576040519150601f19603f3d011682016040523d82523d6000602084013e6200036b565b606091505b508051620003c65760405162461bcd60e51b815260206004820152603260248201526000805160206200185683398151915260448201527131b2b4bb32b91034b6b83632b6b2b73a32b960711b606482015260840162000146565b805181602001fd5b6001600160e01b031916630a85bd0160e11b149050620003ed565b5060015b949350505050565b3b151590565b8280546200040990620005a3565b90600052602060002090601f0160209004810192826200042d576000855562000478565b82601f106200044857805160ff191683800117855562000478565b8280016001018555821562000478579182015b82811115620004785782518255916020019190600101906200045b565b50620004869291506200048a565b5090565b5b808211156200048657600081556001016200048b565b634e487b7160e01b600052601160045260246000fd5b600060ff821660ff811415620004d157620004d1620004a1565b60010192915050565b60008219821115620004f057620004f0620004a1565b500190565b600060018060a01b038087168352602081871681850152856040850152608060608501528451915081608085015260005b82811015620005445785810182015185820160a00152810162000526565b828111156200055757600060a084870101525b5050601f01601f19169190910160a00195945050505050565b6000602082840312156200058357600080fd5b81516001600160e01b0319811681146200059c57600080fd5b9392505050565b600181811c90821680620005b857607f821691505b60208210811415620005da57634e487b7160e01b600052602260045260246000fd5b50919050565b61126680620005f06000396000f3fe608060405234801561001057600080fd5b50600436106100cf5760003560e01c80636352211e1161008c578063a22cb46511610066578063a22cb465146101b3578063b88d4fde146101c6578063c87b56dd146101d9578063e985e9c5146101ec57600080fd5b80636352211e1461017757806370a082311461018a57806395d89b41146101ab57600080fd5b806301ffc9a7146100d457806306fdde03146100fc578063081812fc14610111578063095ea7b31461013c57806323b872dd1461015157806342842e0e14610164575b600080fd5b6100e76100e2366004610d76565b610228565b60405190151581526020015b60405180910390f35b61010461027a565b6040516100f39190610deb565b61012461011f366004610dfe565b61030c565b6040516001600160a01b0390911681526020016100f3565b61014f61014a366004610e33565b6103a6565b005b61014f61015f366004610e5d565b6104bc565b61014f610172366004610e5d565b6104ed565b610124610185366004610dfe565b610508565b61019d610198366004610e99565b61057f565b6040519081526020016100f3565b610104610606565b61014f6101c1366004610eb4565b610615565b61014f6101d4366004610f06565b610624565b6101046101e7366004610dfe565b61065c565b6100e76101fa366004610fe2565b6001600160a01b03918216600090815260056020908152604080832093909416825291909152205460ff1690565b60006001600160e01b031982166380ac58cd60e01b148061025957506001600160e01b03198216635b5e139f60e01b145b8061027457506301ffc9a760e01b6001600160e01b03198316145b92915050565b60606000805461028990611015565b80601f01602080910402602001604051908101604052809291908181526020018280546102b590611015565b80156103025780601f106102d757610100808354040283529160200191610302565b820191906000526020600020905b8154815290600101906020018083116102e557829003601f168201915b5050505050905090565b6000818152600260205260408120546001600160a01b031661038a5760405162461bcd60e51b815260206004820152602c60248201527f4552433732313a20617070726f76656420717565727920666f72206e6f6e657860448201526b34b9ba32b73a103a37b5b2b760a11b60648201526084015b60405180910390fd5b506000908152600460205260409020546001600160a01b031690565b60006103b182610508565b9050806001600160a01b0316836001600160a01b0316141561041f5760405162461bcd60e51b815260206004820152602160248201527f4552433732313a20617070726f76616c20746f2063757272656e74206f776e656044820152603960f91b6064820152608401610381565b336001600160a01b038216148061043b575061043b81336101fa565b6104ad5760405162461bcd60e51b815260206004820152603860248201527f4552433732313a20617070726f76652063616c6c6572206973206e6f74206f7760448201527f6e6572206e6f7220617070726f76656420666f7220616c6c00000000000000006064820152608401610381565b6104b7838361075a565b505050565b6104c633826107c8565b6104e25760405162461bcd60e51b815260040161038190611050565b6104b78383836108bf565b6104b783838360405180602001604052806000815250610624565b6000818152600260205260408120546001600160a01b0316806102745760405162461bcd60e51b815260206004820152602960248201527f4552433732313a206f776e657220717565727920666f72206e6f6e657869737460448201526832b73a103a37b5b2b760b91b6064820152608401610381565b60006001600160a01b0382166105ea5760405162461bcd60e51b815260206004820152602a60248201527f4552433732313a2062616c616e636520717565727920666f7220746865207a65604482015269726f206164647265737360b01b6064820152608401610381565b506001600160a01b031660009081526003602052604090205490565b60606001805461028990611015565b610620338383610a5f565b5050565b61062e33836107c8565b61064a5760405162461bcd60e51b815260040161038190611050565b61065684848484610b2e565b50505050565b6000818152600260205260409020546060906001600160a01b03166106db5760405162461bcd60e51b815260206004820152602f60248201527f4552433732314d657461646174613a2055524920717565727920666f72206e6f60448201526e3732bc34b9ba32b73a103a37b5b2b760891b6064820152608401610381565b60006107026040805180820190915260088152673732312e6465762f60c01b602082015290565b90506000815111610722576040518060200160405280600081525061074d565b8061072c84610b61565b60405160200161073d9291906110a1565b6040516020818303038152906040525b9392505050565b3b151590565b600081815260046020526040902080546001600160a01b0319166001600160a01b038416908117909155819061078f82610508565b6001600160a01b03167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b92560405160405180910390a45050565b6000818152600260205260408120546001600160a01b03166108415760405162461bcd60e51b815260206004820152602c60248201527f4552433732313a206f70657261746f7220717565727920666f72206e6f6e657860448201526b34b9ba32b73a103a37b5b2b760a11b6064820152608401610381565b600061084c83610508565b9050806001600160a01b0316846001600160a01b031614806108875750836001600160a01b031661087c8461030c565b6001600160a01b0316145b806108b757506001600160a01b0380821660009081526005602090815260408083209388168352929052205460ff165b949350505050565b826001600160a01b03166108d282610508565b6001600160a01b03161461093a5760405162461bcd60e51b815260206004820152602960248201527f4552433732313a207472616e73666572206f6620746f6b656e2074686174206960448201526839903737ba1037bbb760b91b6064820152608401610381565b6001600160a01b03821661099c5760405162461bcd60e51b8152602060048201526024808201527f4552433732313a207472616e7366657220746f20746865207a65726f206164646044820152637265737360e01b6064820152608401610381565b6109a760008261075a565b6001600160a01b03831660009081526003602052604081208054600192906109d09084906110e6565b90915550506001600160a01b03821660009081526003602052604081208054600192906109fe9084906110fd565b909155505060008181526002602052604080822080546001600160a01b0319166001600160a01b0386811691821790925591518493918716917fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef91a4505050565b816001600160a01b0316836001600160a01b03161415610ac15760405162461bcd60e51b815260206004820152601960248201527f4552433732313a20617070726f766520746f2063616c6c6572000000000000006044820152606401610381565b6001600160a01b03838116600081815260056020908152604080832094871680845294825291829020805460ff191686151590811790915591519182527f17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31910160405180910390a3505050565b610b398484846108bf565b610b4584848484610c5f565b6106565760405162461bcd60e51b815260040161038190611115565b606081610b855750506040805180820190915260018152600360fc1b602082015290565b8160005b8115610baf5780610b9981611167565b9150610ba89050600a83611198565b9150610b89565b60008167ffffffffffffffff811115610bca57610bca610ef0565b6040519080825280601f01601f191660200182016040528015610bf4576020820181803683370190505b5090505b84156108b757610c096001836110e6565b9150610c16600a866111ac565b610c219060306110fd565b60f81b818381518110610c3657610c366111c0565b60200101906001600160f81b031916908160001a905350610c58600a86611198565b9450610bf8565b60006001600160a01b0384163b15610d5257604051630a85bd0160e11b81526001600160a01b0385169063150b7a0290610ca39033908990889088906004016111d6565b6020604051808303816000875af1925050508015610cde575060408051601f3d908101601f19168201909252610cdb91810190611213565b60015b610d38573d808015610d0c576040519150601f19603f3d011682016040523d82523d6000602084013e610d11565b606091505b508051610d305760405162461bcd60e51b815260040161038190611115565b805181602001fd5b6001600160e01b031916630a85bd0160e11b1490506108b7565b506001949350505050565b6001600160e01b031981168114610d7357600080fd5b50565b600060208284031215610d8857600080fd5b813561074d81610d5d565b60005b83811015610dae578181015183820152602001610d96565b838111156106565750506000910152565b60008151808452610dd7816020860160208601610d93565b601f01601f19169290920160200192915050565b60208152600061074d6020830184610dbf565b600060208284031215610e1057600080fd5b5035919050565b80356001600160a01b0381168114610e2e57600080fd5b919050565b60008060408385031215610e4657600080fd5b610e4f83610e17565b946020939093013593505050565b600080600060608486031215610e7257600080fd5b610e7b84610e17565b9250610e8960208501610e17565b9150604084013590509250925092565b600060208284031215610eab57600080fd5b61074d82610e17565b60008060408385031215610ec757600080fd5b610ed083610e17565b915060208301358015158114610ee557600080fd5b809150509250929050565b634e487b7160e01b600052604160045260246000fd5b60008060008060808587031215610f1c57600080fd5b610f2585610e17565b9350610f3360208601610e17565b925060408501359150606085013567ffffffffffffffff80821115610f5757600080fd5b818701915087601f830112610f6b57600080fd5b813581811115610f7d57610f7d610ef0565b604051601f8201601f19908116603f01168101908382118183101715610fa557610fa5610ef0565b816040528281528a6020848701011115610fbe57600080fd5b82602086016020830137600060208483010152809550505050505092959194509250565b60008060408385031215610ff557600080fd5b610ffe83610e17565b915061100c60208401610e17565b90509250929050565b600181811c9082168061102957607f821691505b6020821081141561104a57634e487b7160e01b600052602260045260246000fd5b50919050565b60208082526031908201527f4552433732313a207472616e736665722063616c6c6572206973206e6f74206f6040820152701ddb995c881b9bdc88185c1c1c9bdd9959607a1b606082015260800190565b600083516110b3818460208801610d93565b8351908301906110c7818360208801610d93565b01949350505050565b634e487b7160e01b600052601160045260246000fd5b6000828210156110f8576110f86110d0565b500390565b60008219821115611110576111106110d0565b500190565b60208082526032908201527f4552433732313a207472616e7366657220746f206e6f6e20455243373231526560408201527131b2b4bb32b91034b6b83632b6b2b73a32b960711b606082015260800190565b600060001982141561117b5761117b6110d0565b5060010190565b634e487b7160e01b600052601260045260246000fd5b6000826111a7576111a7611182565b500490565b6000826111bb576111bb611182565b500690565b634e487b7160e01b600052603260045260246000fd5b6001600160a01b038581168252841660208201526040810183905260806060820181905260009061120990830184610dbf565b9695505050505050565b60006020828403121561122557600080fd5b815161074d81610d5d56fea264697066735822122021e90ae5ae472a494df909399b393df14b327ca1519934bba0d78783d8984c6b64736f6c634300080c00334552433732313a207472616e7366657220746f206e6f6e204552433732315265";

type TestNFTConstructorParams =
  | [signer?: Signer]
  | ConstructorParameters<typeof ContractFactory>;

const isSuperArgs = (
  xs: TestNFTConstructorParams
): xs is ConstructorParameters<typeof ContractFactory> => xs.length > 1;

export class TestNFT__factory extends ContractFactory {
  constructor(...args: TestNFTConstructorParams) {
    if (isSuperArgs(args)) {
      super(...args);
    } else {
      super(_abi, _bytecode, args[0]);
    }
  }

  override deploy(
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<TestNFT> {
    return super.deploy(overrides || {}) as Promise<TestNFT>;
  }
  override getDeployTransaction(
    overrides?: Overrides & { from?: string | Promise<string> }
  ): TransactionRequest {
    return super.getDeployTransaction(overrides || {});
  }
  override attach(address: string): TestNFT {
    return super.attach(address) as TestNFT;
  }
  override connect(signer: Signer): TestNFT__factory {
    return super.connect(signer) as TestNFT__factory;
  }

  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): TestNFTInterface {
    return new utils.Interface(_abi) as TestNFTInterface;
  }
  static connect(
    address: string,
    signerOrProvider: Signer | Provider
  ): TestNFT {
    return new Contract(address, _abi, signerOrProvider) as TestNFT;
  }
}