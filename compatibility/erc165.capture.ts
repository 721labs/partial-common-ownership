import fs from "fs";

import { ethers } from "hardhat";

async function main() {
  const outputPath = process.env.COMPAT_ERC165_RESULTS;
  const probesJson = process.env.COMPAT_ERC165_PROBES;

  if (!outputPath || !probesJson) {
    throw new Error(
      "COMPAT_ERC165_RESULTS and COMPAT_ERC165_PROBES must be provided"
    );
  }

  const probes = JSON.parse(probesJson) as Array<{
    name: string;
    interfaceId: string;
  }>;
  const results: Record<string, unknown[]> = {};
  for (const contractName of ["Wrapper", "PartialCommonOwnership"]) {
    const factory = await ethers.getContractFactory(contractName);
    const contract = await factory.deploy();

    // Support ethers 5 now and ethers 6 when the interoperability suite moves.
    if ("waitForDeployment" in contract) {
      await (contract as any).waitForDeployment();
    } else {
      await (contract as any).deployed();
    }

    results[contractName] = [];
    for (const probe of probes) {
      results[contractName].push({
        ...probe,
        supported: await contract.supportsInterface(probe.interfaceId),
      });
    }
  }

  fs.writeFileSync(outputPath, `${JSON.stringify(results)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
