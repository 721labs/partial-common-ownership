// Utils
//@ts-ignore
import { balance } from "@openzeppelin/test-helpers";

// Types
import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

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
  async setup() {
    this._balanceTracker = await balance.tracker(this.address, "wei");
    this._hasSetup = true;
  }

  get balance() {
    if (!this._hasSetup) throw new Error("#setup() must first be invoked");
    return this._balanceTracker;
  }
}

export default Wallet;
