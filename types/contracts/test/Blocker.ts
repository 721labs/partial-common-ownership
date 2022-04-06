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
import type { FunctionFragment, Result } from "@ethersproject/abi";
import type { Listener, Provider } from "@ethersproject/providers";
import type {
  TypedEventFilter,
  TypedEvent,
  TypedListener,
  OnEvent,
} from "../../common";

export interface BlockerInterface extends utils.Interface {
  functions: {
    "collect()": FunctionFragment;
    "takeoverLease(uint256,uint256,uint256)": FunctionFragment;
  };

  getFunction(
    nameOrSignatureOrTopic: "collect" | "takeoverLease"
  ): FunctionFragment;

  encodeFunctionData(functionFragment: "collect", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "takeoverLease",
    values: [BigNumberish, BigNumberish, BigNumberish]
  ): string;

  decodeFunctionResult(functionFragment: "collect", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "takeoverLease",
    data: BytesLike
  ): Result;

  events: {};
}

export interface Blocker extends BaseContract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  interface: BlockerInterface;

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
    collect(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    takeoverLease(
      tokenId_: BigNumberish,
      newValuation_: BigNumberish,
      currentValuation_: BigNumberish,
      overrides?: PayableOverrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;
  };

  collect(
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  takeoverLease(
    tokenId_: BigNumberish,
    newValuation_: BigNumberish,
    currentValuation_: BigNumberish,
    overrides?: PayableOverrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  callStatic: {
    collect(overrides?: CallOverrides): Promise<void>;

    takeoverLease(
      tokenId_: BigNumberish,
      newValuation_: BigNumberish,
      currentValuation_: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;
  };

  filters: {};

  estimateGas: {
    collect(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    takeoverLease(
      tokenId_: BigNumberish,
      newValuation_: BigNumberish,
      currentValuation_: BigNumberish,
      overrides?: PayableOverrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;
  };

  populateTransaction: {
    collect(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    takeoverLease(
      tokenId_: BigNumberish,
      newValuation_: BigNumberish,
      currentValuation_: BigNumberish,
      overrides?: PayableOverrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;
  };
}