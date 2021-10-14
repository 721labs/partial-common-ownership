// Utils
//@ts-ignore
import { balance } from "@openzeppelin/test-helpers";

// Types
import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";

// Utils
import { bnToBigNumber } from "./Numeric";

class Wallet {
  // Properties
  public address: string;

  // Interfaces
  public contract: Contract;
  private _balanceTracker: any; // no type def available

  // State
  private _hasSetup: boolean = false;

  constructor(contract: Contract, signer: SignerWithAddress) {
    this.address = signer.address;
    this.contract = contract.connect(signer);
  }

  /**
   * Balance Tracker instantiation implicitly calls `get` in order to
   * baseline values so setup must be asynchronously invoked after `Wallet`
   * instantiation.
   */
  public async setup(): Promise<void> {
    this._balanceTracker = await balance.tracker(this.address, "wei");
    this._hasSetup = true;
  }

  private _verifyHasSetup(): void {
    if (!this._hasSetup) throw new Error("#setup() must first be invoked");
  }

  /**
   * Returns current wallet balance. Calling sets baseline for subsequent calls
   * to `this.balanceDelta()`.
   * @returns Balance
   */
  public async balance(): Promise<BigNumber> {
    this._verifyHasSetup();
    const balance = await this._balanceTracker.get();
    return bnToBigNumber(balance);
  }

  /**
   * Returns change in balance and gas paid since previous call to `this.balance()`.
   * @returns Delta
   */
  public async balanceDelta(): Promise<{ delta: BigNumber; fees: BigNumber }> {
    this._verifyHasSetup();
    const { delta, fees } = await this._balanceTracker.deltaWithFees();
    return {
      delta: bnToBigNumber(delta),
      fees: bnToBigNumber(fees),
    };
  }
}

export default Wallet;
