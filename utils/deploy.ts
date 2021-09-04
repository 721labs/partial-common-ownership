import { ethers } from "hardhat";
import { Contract } from "ethers";

type Arrays = Array<string | number | boolean>;

/**
 * Deploys a given contract.
 * @see https://docs.ethers.io/v5/api/contract/contract-factory/
 * @param contractName Name of contract
 * @param params optional contract constructor params
 * @param config optional deployment params
 * @resolves ethers.Contract interface representing deployed contract.
 */
async function deploy(
  contractName: string,
  params: Array<string | number | boolean | Arrays> = [],
  config: {
    value?: string;
    nonce?: string;
    gasLimit?: string;
    gasPrice?: string;
  } = {}
): Promise<Contract> {
  console.log(`Deploying ${contractName}`);

  const factory = await ethers.getContractFactory(contractName);
  const contract = await factory.deploy(...params, config);
  await contract.deployed();

  console.log(`Deployed to: ${contract.address}`);

  return contract;
}

export default deploy;
