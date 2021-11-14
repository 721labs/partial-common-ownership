async function snapshotEVM(provider: any): Promise<void> {
  return await provider.send("evm_snapshot", []);
}

async function revertEVM(provider: any, snapshot: any): Promise<void> {
  await provider.send("evm_revert", [snapshot]);
}

export { snapshotEVM, revertEVM };
