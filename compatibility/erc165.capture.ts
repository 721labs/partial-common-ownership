import fs from "fs";

import hre from "hardhat";

async function main() {
  const connection = await hre.network.create("hardhat");
  const { ethers } = connection;
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
  try {
    const results: Record<string, unknown[]> = {};
    for (const contractName of ["Wrapper", "PartialCommonOwnership"]) {
      const factory = await ethers.getContractFactory(contractName);
      const contract = await factory.deploy();

      await contract.waitForDeployment();

      results[contractName] = [];
      for (const probe of probes) {
        results[contractName].push({
          ...probe,
          supported: await contract.supportsInterface(probe.interfaceId),
        });
      }
    }

    fs.writeFileSync(outputPath, `${JSON.stringify(results)}\n`);
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
