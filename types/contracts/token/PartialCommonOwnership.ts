/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import type {
  BaseContract,
  BigNumber,
  BigNumberish,
  BytesLike,
  CallOverrides,
  ContractTransaction,
  Overrides,
  PayableOverrides,
  PopulatedTransaction,
  Signer,
  utils,
} from "ethers";
import type {
  FunctionFragment,
  Result,
  EventFragment,
} from "@ethersproject/abi";
import type { Listener, Provider } from "@ethersproject/providers";
import type {
  TypedEventFilter,
  TypedEvent,
  TypedListener,
  OnEvent,
} from "../../common";

export interface PartialCommonOwnershipInterface extends utils.Interface {
  functions: {
    "approve(address,uint256)": FunctionFragment;
    "balanceOf(address)": FunctionFragment;
    "beneficiaryOf(uint256)": FunctionFragment;
    "collectTax(uint256)": FunctionFragment;
    "collectionFrequencyOf(uint256)": FunctionFragment;
    "deposit(uint256)": FunctionFragment;
    "depositOf(uint256)": FunctionFragment;
    "exit(uint256)": FunctionFragment;
    "foreclosed(uint256)": FunctionFragment;
    "foreclosureTime(uint256)": FunctionFragment;
    "getApproved(uint256)": FunctionFragment;
    "isApprovedForAll(address,address)": FunctionFragment;
    "lastCollectionTimeOf(uint256)": FunctionFragment;
    "outstandingRemittances(address)": FunctionFragment;
    "ownerOf(uint256)": FunctionFragment;
    "safeTransferFrom(address,address,uint256)": FunctionFragment;
    "safeTransferFrom(address,address,uint256,bytes)": FunctionFragment;
    "selfAssess(uint256,uint256)": FunctionFragment;
    "setApprovalForAll(address,bool)": FunctionFragment;
    "setBeneficiary(uint256,address)": FunctionFragment;
    "supportsInterface(bytes4)": FunctionFragment;
    "takeoverLease(uint256,uint256,uint256)": FunctionFragment;
    "taxCollectedSinceLastTransferOf(uint256)": FunctionFragment;
    "taxOwed(uint256)": FunctionFragment;
    "taxOwedSince(uint256,uint256)": FunctionFragment;
    "taxRateOf(uint256)": FunctionFragment;
    "taxationCollected(uint256)": FunctionFragment;
    "transferFrom(address,address,uint256)": FunctionFragment;
    "valuationOf(uint256)": FunctionFragment;
    "withdrawDeposit(uint256,uint256)": FunctionFragment;
    "withdrawOutstandingRemittance()": FunctionFragment;
    "withdrawableDeposit(uint256)": FunctionFragment;
  };

  getFunction(
    nameOrSignatureOrTopic:
      | "approve"
      | "balanceOf"
      | "beneficiaryOf"
      | "collectTax"
      | "collectionFrequencyOf"
      | "deposit"
      | "depositOf"
      | "exit"
      | "foreclosed"
      | "foreclosureTime"
      | "getApproved"
      | "isApprovedForAll"
      | "lastCollectionTimeOf"
      | "outstandingRemittances"
      | "ownerOf"
      | "safeTransferFrom(address,address,uint256)"
      | "safeTransferFrom(address,address,uint256,bytes)"
      | "selfAssess"
      | "setApprovalForAll"
      | "setBeneficiary"
      | "supportsInterface"
      | "takeoverLease"
      | "taxCollectedSinceLastTransferOf"
      | "taxOwed"
      | "taxOwedSince"
      | "taxRateOf"
      | "taxationCollected"
      | "transferFrom"
      | "valuationOf"
      | "withdrawDeposit"
      | "withdrawOutstandingRemittance"
      | "withdrawableDeposit"
  ): FunctionFragment;

  encodeFunctionData(
    functionFragment: "approve",
    values: [string, BigNumberish]
  ): string;
  encodeFunctionData(functionFragment: "balanceOf", values: [string]): string;
  encodeFunctionData(
    functionFragment: "beneficiaryOf",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "collectTax",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "collectionFrequencyOf",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "deposit",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "depositOf",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(functionFragment: "exit", values: [BigNumberish]): string;
  encodeFunctionData(
    functionFragment: "foreclosed",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "foreclosureTime",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "getApproved",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "isApprovedForAll",
    values: [string, string]
  ): string;
  encodeFunctionData(
    functionFragment: "lastCollectionTimeOf",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "outstandingRemittances",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "ownerOf",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "safeTransferFrom(address,address,uint256)",
    values: [string, string, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "safeTransferFrom(address,address,uint256,bytes)",
    values: [string, string, BigNumberish, BytesLike]
  ): string;
  encodeFunctionData(
    functionFragment: "selfAssess",
    values: [BigNumberish, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "setApprovalForAll",
    values: [string, boolean]
  ): string;
  encodeFunctionData(
    functionFragment: "setBeneficiary",
    values: [BigNumberish, string]
  ): string;
  encodeFunctionData(
    functionFragment: "supportsInterface",
    values: [BytesLike]
  ): string;
  encodeFunctionData(
    functionFragment: "takeoverLease",
    values: [BigNumberish, BigNumberish, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "taxCollectedSinceLastTransferOf",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "taxOwed",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "taxOwedSince",
    values: [BigNumberish, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "taxRateOf",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "taxationCollected",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "transferFrom",
    values: [string, string, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "valuationOf",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "withdrawDeposit",
    values: [BigNumberish, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "withdrawOutstandingRemittance",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "withdrawableDeposit",
    values: [BigNumberish]
  ): string;

  decodeFunctionResult(functionFragment: "approve", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "balanceOf", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "beneficiaryOf",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "collectTax", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "collectionFrequencyOf",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "deposit", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "depositOf", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "exit", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "foreclosed", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "foreclosureTime",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getApproved",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "isApprovedForAll",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "lastCollectionTimeOf",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "outstandingRemittances",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "ownerOf", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "safeTransferFrom(address,address,uint256)",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "safeTransferFrom(address,address,uint256,bytes)",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "selfAssess", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "setApprovalForAll",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setBeneficiary",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "supportsInterface",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "takeoverLease",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "taxCollectedSinceLastTransferOf",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "taxOwed", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "taxOwedSince",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "taxRateOf", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "taxationCollected",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "transferFrom",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "valuationOf",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "withdrawDeposit",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "withdrawOutstandingRemittance",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "withdrawableDeposit",
    data: BytesLike
  ): Result;

  events: {
    "Approval(address,address,uint256)": EventFragment;
    "ApprovalForAll(address,address,bool)": EventFragment;
    "LogBeneficiaryUpdated(uint256,address)": EventFragment;
    "LogCollection(uint256,uint256)": EventFragment;
    "LogForeclosure(uint256,address)": EventFragment;
    "LogLeaseTakeover(uint256,address,uint256)": EventFragment;
    "LogOutstandingRemittance(address)": EventFragment;
    "LogRemittance(uint8,address,uint256)": EventFragment;
    "LogValuation(uint256,uint256)": EventFragment;
    "Transfer(address,address,uint256)": EventFragment;
  };

  getEvent(nameOrSignatureOrTopic: "Approval"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "ApprovalForAll"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "LogBeneficiaryUpdated"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "LogCollection"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "LogForeclosure"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "LogLeaseTakeover"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "LogOutstandingRemittance"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "LogRemittance"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "LogValuation"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "Transfer"): EventFragment;
}

export interface ApprovalEventObject {
  owner: string;
  approved: string;
  tokenId: BigNumber;
}
export type ApprovalEvent = TypedEvent<
  [string, string, BigNumber],
  ApprovalEventObject
>;

export type ApprovalEventFilter = TypedEventFilter<ApprovalEvent>;

export interface ApprovalForAllEventObject {
  owner: string;
  operator: string;
  approved: boolean;
}
export type ApprovalForAllEvent = TypedEvent<
  [string, string, boolean],
  ApprovalForAllEventObject
>;

export type ApprovalForAllEventFilter = TypedEventFilter<ApprovalForAllEvent>;

export interface LogBeneficiaryUpdatedEventObject {
  tokenId: BigNumber;
  newBeneficiary: string;
}
export type LogBeneficiaryUpdatedEvent = TypedEvent<
  [BigNumber, string],
  LogBeneficiaryUpdatedEventObject
>;

export type LogBeneficiaryUpdatedEventFilter =
  TypedEventFilter<LogBeneficiaryUpdatedEvent>;

export interface LogCollectionEventObject {
  tokenId: BigNumber;
  collected: BigNumber;
}
export type LogCollectionEvent = TypedEvent<
  [BigNumber, BigNumber],
  LogCollectionEventObject
>;

export type LogCollectionEventFilter = TypedEventFilter<LogCollectionEvent>;

export interface LogForeclosureEventObject {
  tokenId: BigNumber;
  prevOwner: string;
}
export type LogForeclosureEvent = TypedEvent<
  [BigNumber, string],
  LogForeclosureEventObject
>;

export type LogForeclosureEventFilter = TypedEventFilter<LogForeclosureEvent>;

export interface LogLeaseTakeoverEventObject {
  tokenId: BigNumber;
  owner: string;
  newValuation: BigNumber;
}
export type LogLeaseTakeoverEvent = TypedEvent<
  [BigNumber, string, BigNumber],
  LogLeaseTakeoverEventObject
>;

export type LogLeaseTakeoverEventFilter =
  TypedEventFilter<LogLeaseTakeoverEvent>;

export interface LogOutstandingRemittanceEventObject {
  seller: string;
}
export type LogOutstandingRemittanceEvent = TypedEvent<
  [string],
  LogOutstandingRemittanceEventObject
>;

export type LogOutstandingRemittanceEventFilter =
  TypedEventFilter<LogOutstandingRemittanceEvent>;

export interface LogRemittanceEventObject {
  trigger: number;
  recipient: string;
  amount: BigNumber;
}
export type LogRemittanceEvent = TypedEvent<
  [number, string, BigNumber],
  LogRemittanceEventObject
>;

export type LogRemittanceEventFilter = TypedEventFilter<LogRemittanceEvent>;

export interface LogValuationEventObject {
  tokenId: BigNumber;
  newValuation: BigNumber;
}
export type LogValuationEvent = TypedEvent<
  [BigNumber, BigNumber],
  LogValuationEventObject
>;

export type LogValuationEventFilter = TypedEventFilter<LogValuationEvent>;

export interface TransferEventObject {
  from: string;
  to: string;
  tokenId: BigNumber;
}
export type TransferEvent = TypedEvent<
  [string, string, BigNumber],
  TransferEventObject
>;

export type TransferEventFilter = TypedEventFilter<TransferEvent>;

export interface PartialCommonOwnership extends BaseContract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  interface: PartialCommonOwnershipInterface;

  queryFilter<TEvent extends TypedEvent>(
    event: TypedEventFilter<TEvent>,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TEvent>>;

  listeners<TEvent extends TypedEvent>(
    eventFilter?: TypedEventFilter<TEvent>
  ): Array<TypedListener<TEvent>>;
  listeners(eventName?: string): Array<Listener>;
  removeAllListeners<TEvent extends TypedEvent>(
    eventFilter: TypedEventFilter<TEvent>
  ): this;
  removeAllListeners(eventName?: string): this;
  off: OnEvent<this>;
  on: OnEvent<this>;
  once: OnEvent<this>;
  removeListener: OnEvent<this>;

  functions: {
    approve(
      to: string,
      tokenId: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    balanceOf(owner: string, overrides?: CallOverrides): Promise<[BigNumber]>;

    beneficiaryOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<[string]>;

    collectTax(
      tokenId_: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    collectionFrequencyOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<[BigNumber]>;

    deposit(
      tokenId_: BigNumberish,
      overrides?: PayableOverrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    depositOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<[BigNumber]>;

    exit(
      tokenId_: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    foreclosed(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<[boolean]>;

    foreclosureTime(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<[BigNumber]>;

    getApproved(
      tokenId: BigNumberish,
      overrides?: CallOverrides
    ): Promise<[string]>;

    isApprovedForAll(
      owner: string,
      operator: string,
      overrides?: CallOverrides
    ): Promise<[boolean]>;

    lastCollectionTimeOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<[BigNumber]>;

    outstandingRemittances(
      arg0: string,
      overrides?: CallOverrides
    ): Promise<[BigNumber]>;

    ownerOf(
      tokenId: BigNumberish,
      overrides?: CallOverrides
    ): Promise<[string]>;

    "safeTransferFrom(address,address,uint256)"(
      from: string,
      to: string,
      tokenId: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    "safeTransferFrom(address,address,uint256,bytes)"(
      from_: string,
      to_: string,
      tokenId_: BigNumberish,
      data_: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    selfAssess(
      tokenId_: BigNumberish,
      newValuation_: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    setApprovalForAll(
      operator: string,
      approved: boolean,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    setBeneficiary(
      tokenId_: BigNumberish,
      beneficiary_: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    supportsInterface(
      interfaceId: BytesLike,
      overrides?: CallOverrides
    ): Promise<[boolean]>;

    takeoverLease(
      tokenId_: BigNumberish,
      newValuation_: BigNumberish,
      currentValuation_: BigNumberish,
      overrides?: PayableOverrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    taxCollectedSinceLastTransferOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<[BigNumber]>;

    taxOwed(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<
      [BigNumber, BigNumber] & { amount: BigNumber; timestamp: BigNumber }
    >;

    taxOwedSince(
      tokenId_: BigNumberish,
      time_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<[BigNumber] & { taxDue: BigNumber }>;

    taxRateOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<[BigNumber]>;

    taxationCollected(
      arg0: BigNumberish,
      overrides?: CallOverrides
    ): Promise<[BigNumber]>;

    transferFrom(
      from_: string,
      to_: string,
      tokenId_: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    valuationOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<[BigNumber]>;

    withdrawDeposit(
      tokenId_: BigNumberish,
      wei_: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    withdrawOutstandingRemittance(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    withdrawableDeposit(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<[BigNumber]>;
  };

  approve(
    to: string,
    tokenId: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  balanceOf(owner: string, overrides?: CallOverrides): Promise<BigNumber>;

  beneficiaryOf(
    tokenId_: BigNumberish,
    overrides?: CallOverrides
  ): Promise<string>;

  collectTax(
    tokenId_: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  collectionFrequencyOf(
    tokenId_: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  deposit(
    tokenId_: BigNumberish,
    overrides?: PayableOverrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  depositOf(
    tokenId_: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  exit(
    tokenId_: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  foreclosed(
    tokenId_: BigNumberish,
    overrides?: CallOverrides
  ): Promise<boolean>;

  foreclosureTime(
    tokenId_: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  getApproved(
    tokenId: BigNumberish,
    overrides?: CallOverrides
  ): Promise<string>;

  isApprovedForAll(
    owner: string,
    operator: string,
    overrides?: CallOverrides
  ): Promise<boolean>;

  lastCollectionTimeOf(
    tokenId_: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  outstandingRemittances(
    arg0: string,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  ownerOf(tokenId: BigNumberish, overrides?: CallOverrides): Promise<string>;

  "safeTransferFrom(address,address,uint256)"(
    from: string,
    to: string,
    tokenId: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  "safeTransferFrom(address,address,uint256,bytes)"(
    from_: string,
    to_: string,
    tokenId_: BigNumberish,
    data_: BytesLike,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  selfAssess(
    tokenId_: BigNumberish,
    newValuation_: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  setApprovalForAll(
    operator: string,
    approved: boolean,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  setBeneficiary(
    tokenId_: BigNumberish,
    beneficiary_: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  supportsInterface(
    interfaceId: BytesLike,
    overrides?: CallOverrides
  ): Promise<boolean>;

  takeoverLease(
    tokenId_: BigNumberish,
    newValuation_: BigNumberish,
    currentValuation_: BigNumberish,
    overrides?: PayableOverrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  taxCollectedSinceLastTransferOf(
    tokenId_: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  taxOwed(
    tokenId_: BigNumberish,
    overrides?: CallOverrides
  ): Promise<
    [BigNumber, BigNumber] & { amount: BigNumber; timestamp: BigNumber }
  >;

  taxOwedSince(
    tokenId_: BigNumberish,
    time_: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  taxRateOf(
    tokenId_: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  taxationCollected(
    arg0: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  transferFrom(
    from_: string,
    to_: string,
    tokenId_: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  valuationOf(
    tokenId_: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  withdrawDeposit(
    tokenId_: BigNumberish,
    wei_: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  withdrawOutstandingRemittance(
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  withdrawableDeposit(
    tokenId_: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  callStatic: {
    approve(
      to: string,
      tokenId: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    balanceOf(owner: string, overrides?: CallOverrides): Promise<BigNumber>;

    beneficiaryOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<string>;

    collectTax(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    collectionFrequencyOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    deposit(tokenId_: BigNumberish, overrides?: CallOverrides): Promise<void>;

    depositOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    exit(tokenId_: BigNumberish, overrides?: CallOverrides): Promise<void>;

    foreclosed(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<boolean>;

    foreclosureTime(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getApproved(
      tokenId: BigNumberish,
      overrides?: CallOverrides
    ): Promise<string>;

    isApprovedForAll(
      owner: string,
      operator: string,
      overrides?: CallOverrides
    ): Promise<boolean>;

    lastCollectionTimeOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    outstandingRemittances(
      arg0: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    ownerOf(tokenId: BigNumberish, overrides?: CallOverrides): Promise<string>;

    "safeTransferFrom(address,address,uint256)"(
      from: string,
      to: string,
      tokenId: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    "safeTransferFrom(address,address,uint256,bytes)"(
      from_: string,
      to_: string,
      tokenId_: BigNumberish,
      data_: BytesLike,
      overrides?: CallOverrides
    ): Promise<void>;

    selfAssess(
      tokenId_: BigNumberish,
      newValuation_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    setApprovalForAll(
      operator: string,
      approved: boolean,
      overrides?: CallOverrides
    ): Promise<void>;

    setBeneficiary(
      tokenId_: BigNumberish,
      beneficiary_: string,
      overrides?: CallOverrides
    ): Promise<void>;

    supportsInterface(
      interfaceId: BytesLike,
      overrides?: CallOverrides
    ): Promise<boolean>;

    takeoverLease(
      tokenId_: BigNumberish,
      newValuation_: BigNumberish,
      currentValuation_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    taxCollectedSinceLastTransferOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    taxOwed(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<
      [BigNumber, BigNumber] & { amount: BigNumber; timestamp: BigNumber }
    >;

    taxOwedSince(
      tokenId_: BigNumberish,
      time_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    taxRateOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    taxationCollected(
      arg0: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    transferFrom(
      from_: string,
      to_: string,
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    valuationOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    withdrawDeposit(
      tokenId_: BigNumberish,
      wei_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    withdrawOutstandingRemittance(overrides?: CallOverrides): Promise<void>;

    withdrawableDeposit(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;
  };

  filters: {
    "Approval(address,address,uint256)"(
      owner?: string | null,
      approved?: string | null,
      tokenId?: BigNumberish | null
    ): ApprovalEventFilter;
    Approval(
      owner?: string | null,
      approved?: string | null,
      tokenId?: BigNumberish | null
    ): ApprovalEventFilter;

    "ApprovalForAll(address,address,bool)"(
      owner?: string | null,
      operator?: string | null,
      approved?: null
    ): ApprovalForAllEventFilter;
    ApprovalForAll(
      owner?: string | null,
      operator?: string | null,
      approved?: null
    ): ApprovalForAllEventFilter;

    "LogBeneficiaryUpdated(uint256,address)"(
      tokenId?: BigNumberish | null,
      newBeneficiary?: string | null
    ): LogBeneficiaryUpdatedEventFilter;
    LogBeneficiaryUpdated(
      tokenId?: BigNumberish | null,
      newBeneficiary?: string | null
    ): LogBeneficiaryUpdatedEventFilter;

    "LogCollection(uint256,uint256)"(
      tokenId?: BigNumberish | null,
      collected?: BigNumberish | null
    ): LogCollectionEventFilter;
    LogCollection(
      tokenId?: BigNumberish | null,
      collected?: BigNumberish | null
    ): LogCollectionEventFilter;

    "LogForeclosure(uint256,address)"(
      tokenId?: BigNumberish | null,
      prevOwner?: string | null
    ): LogForeclosureEventFilter;
    LogForeclosure(
      tokenId?: BigNumberish | null,
      prevOwner?: string | null
    ): LogForeclosureEventFilter;

    "LogLeaseTakeover(uint256,address,uint256)"(
      tokenId?: BigNumberish | null,
      owner?: string | null,
      newValuation?: BigNumberish | null
    ): LogLeaseTakeoverEventFilter;
    LogLeaseTakeover(
      tokenId?: BigNumberish | null,
      owner?: string | null,
      newValuation?: BigNumberish | null
    ): LogLeaseTakeoverEventFilter;

    "LogOutstandingRemittance(address)"(
      seller?: string | null
    ): LogOutstandingRemittanceEventFilter;
    LogOutstandingRemittance(
      seller?: string | null
    ): LogOutstandingRemittanceEventFilter;

    "LogRemittance(uint8,address,uint256)"(
      trigger?: BigNumberish | null,
      recipient?: string | null,
      amount?: BigNumberish | null
    ): LogRemittanceEventFilter;
    LogRemittance(
      trigger?: BigNumberish | null,
      recipient?: string | null,
      amount?: BigNumberish | null
    ): LogRemittanceEventFilter;

    "LogValuation(uint256,uint256)"(
      tokenId?: BigNumberish | null,
      newValuation?: BigNumberish | null
    ): LogValuationEventFilter;
    LogValuation(
      tokenId?: BigNumberish | null,
      newValuation?: BigNumberish | null
    ): LogValuationEventFilter;

    "Transfer(address,address,uint256)"(
      from?: string | null,
      to?: string | null,
      tokenId?: BigNumberish | null
    ): TransferEventFilter;
    Transfer(
      from?: string | null,
      to?: string | null,
      tokenId?: BigNumberish | null
    ): TransferEventFilter;
  };

  estimateGas: {
    approve(
      to: string,
      tokenId: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    balanceOf(owner: string, overrides?: CallOverrides): Promise<BigNumber>;

    beneficiaryOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    collectTax(
      tokenId_: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    collectionFrequencyOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    deposit(
      tokenId_: BigNumberish,
      overrides?: PayableOverrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    depositOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    exit(
      tokenId_: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    foreclosed(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    foreclosureTime(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getApproved(
      tokenId: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    isApprovedForAll(
      owner: string,
      operator: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    lastCollectionTimeOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    outstandingRemittances(
      arg0: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    ownerOf(
      tokenId: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "safeTransferFrom(address,address,uint256)"(
      from: string,
      to: string,
      tokenId: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    "safeTransferFrom(address,address,uint256,bytes)"(
      from_: string,
      to_: string,
      tokenId_: BigNumberish,
      data_: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    selfAssess(
      tokenId_: BigNumberish,
      newValuation_: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    setApprovalForAll(
      operator: string,
      approved: boolean,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    setBeneficiary(
      tokenId_: BigNumberish,
      beneficiary_: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    supportsInterface(
      interfaceId: BytesLike,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    takeoverLease(
      tokenId_: BigNumberish,
      newValuation_: BigNumberish,
      currentValuation_: BigNumberish,
      overrides?: PayableOverrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    taxCollectedSinceLastTransferOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    taxOwed(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    taxOwedSince(
      tokenId_: BigNumberish,
      time_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    taxRateOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    taxationCollected(
      arg0: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    transferFrom(
      from_: string,
      to_: string,
      tokenId_: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    valuationOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    withdrawDeposit(
      tokenId_: BigNumberish,
      wei_: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    withdrawOutstandingRemittance(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    withdrawableDeposit(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;
  };

  populateTransaction: {
    approve(
      to: string,
      tokenId: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    balanceOf(
      owner: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    beneficiaryOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    collectTax(
      tokenId_: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    collectionFrequencyOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    deposit(
      tokenId_: BigNumberish,
      overrides?: PayableOverrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    depositOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    exit(
      tokenId_: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    foreclosed(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    foreclosureTime(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getApproved(
      tokenId: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    isApprovedForAll(
      owner: string,
      operator: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    lastCollectionTimeOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    outstandingRemittances(
      arg0: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    ownerOf(
      tokenId: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "safeTransferFrom(address,address,uint256)"(
      from: string,
      to: string,
      tokenId: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    "safeTransferFrom(address,address,uint256,bytes)"(
      from_: string,
      to_: string,
      tokenId_: BigNumberish,
      data_: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    selfAssess(
      tokenId_: BigNumberish,
      newValuation_: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    setApprovalForAll(
      operator: string,
      approved: boolean,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    setBeneficiary(
      tokenId_: BigNumberish,
      beneficiary_: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    supportsInterface(
      interfaceId: BytesLike,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    takeoverLease(
      tokenId_: BigNumberish,
      newValuation_: BigNumberish,
      currentValuation_: BigNumberish,
      overrides?: PayableOverrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    taxCollectedSinceLastTransferOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    taxOwed(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    taxOwedSince(
      tokenId_: BigNumberish,
      time_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    taxRateOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    taxationCollected(
      arg0: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    transferFrom(
      from_: string,
      to_: string,
      tokenId_: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    valuationOf(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    withdrawDeposit(
      tokenId_: BigNumberish,
      wei_: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    withdrawOutstandingRemittance(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    withdrawableDeposit(
      tokenId_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;
  };
}
