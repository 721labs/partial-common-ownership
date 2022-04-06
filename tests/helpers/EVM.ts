import type { Web3Provider } from "@ethersproject/providers";

async function snapshotEVM(provider: Web3Provider): Promise<string> {
  return await provider.send("evm_snapshot", []);
}

async function revertEVM(
  provider: Web3Provider,
  snapshot: string
): Promise<void> {
  await provider.send("evm_revert", [snapshot]);
}

export { snapshotEVM, revertEVM };
