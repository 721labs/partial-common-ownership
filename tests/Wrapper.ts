import { expect } from "chai";
import { ethers } from "hardhat";

// Utils
import Wallet from "./helpers/Wallet";
import { taxationPeriodToSeconds } from "./helpers/utils";
import { snapshotEVM, revertEVM } from "./helpers/EVM";

// Constants
import { ETH1, GLOBAL_TRX_CONFIG } from "./helpers/constants";

// Types
import { TOKENS } from "./helpers/types";
import type { Contract } from "@ethersproject/contracts";
import type { Web3Provider } from "@ethersproject/providers";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { BigNumber } from "ethers";

//$ Local Types

enum ErrorMessages {
  NOT_APPROVED = "ERC721: transfer caller is not owner nor approved",
}

enum Events {
  TOKEN_WRAPPED = "LogTokenWrapped",
}

//$ Constants

const mintedTestNFTs = [TOKENS.ONE, TOKENS.TWO, TOKENS.THREE];

const taxConfig = { collectionFrequency: 90, taxRate: 50000000000 };

//$ State
let provider: Web3Provider;
let signers: Array<SignerWithAddress>;
let testNFTContract: Contract;
let wrapperContract: Contract;
let deployer: Wallet;
let deployerNFT: Wallet;
let beneficiary: Wallet;
let alice: Wallet;
let snapshot: any;

//$ Helpers

/**
 * Generates the token ID for a wrapper NFT.
 * IDs are generated by taking the first 4 bytes of hash(contract, tokenId).
 * @param contractAddress NFT Contract Address
 * @param tokenId NFT token id
 * @returns ID string
 */
function wrappedTokenId(contractAddress: string, tokenId: TOKENS): BigNumber {
  return ethers.BigNumber.from(
    ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint"],
        [contractAddress, tokenId]
      )
    )
  );
}

//$ Tests

describe("Wrapper.sol", async function () {
  before(async function () {
    //@ts-ignore
    provider = new ethers.providers.Web3Provider(web3.currentProvider);
    signers = await ethers.getSigners();

    // Deploy the test NFT contract
    const testNFTFactory = await ethers.getContractFactory("TestNFT");
    testNFTContract = await testNFTFactory.deploy(GLOBAL_TRX_CONFIG);
    await testNFTContract.deployed();

    // Deploy the test wrapper contract
    const wrapperFactory = await ethers.getContractFactory("TestWrapper");
    wrapperContract = await wrapperFactory.deploy(GLOBAL_TRX_CONFIG);
    await wrapperContract.deployed();

    // Set up wallets
    deployer = new Wallet(wrapperContract, signers[0]);
    deployerNFT = new Wallet(testNFTContract, signers[0]);
    beneficiary = new Wallet(wrapperContract, signers[1]);
    alice = new Wallet(wrapperContract, signers[2]);

    snapshot = await snapshotEVM(provider);
  });

  /**
   * Between each test wipe the state of the contract.
   */
  beforeEach(async function () {
    await revertEVM(provider, snapshot);
    snapshot = await snapshotEVM(provider);
  });

  describe("TestNFT.sol", async function () {
    it("Sets up properly", async function () {
      for await (const tokenId of mintedTestNFTs) {
        expect(await testNFTContract.ownerOf(tokenId)).to.equal(
          deployer.address
        );
      }
    });
  });

  describe("#constructor()", async function () {
    // No fail circumstances.
    context("fails", async function () {});

    context("succeeds", async function () {
      it("Assigns name and symbol to PCO contract", async function () {
        expect(await wrapperContract.name()).to.equal(
          "Partial Common Ownership NFT"
        );
        expect(await wrapperContract.symbol()).to.equal("pcoNFT");
      });
    });
  });

  describe("#wrappedTokenId()", async function () {
    // No fail circumstances.
    context("fails", async function () {});

    context("succeeds", async function () {
      it("Deterministically generates wrapped token IDs", async function () {
        for await (const tokenId of mintedTestNFTs) {
          expect(
            await wrapperContract.wrappedTokenId(
              testNFTContract.address,
              tokenId
            )
          ).to.equal(wrappedTokenId(testNFTContract.address, tokenId));
        }
      });
    });
  });

  describe("#onERC721Received", async function () {
    context("fails", async function () {
      it("cannot be called directly", async function () {
        await expect(
          deployerNFT.contract["safeTransferFrom(address,address,uint256)"](
            deployer.address,
            wrapperContract.address,
            TOKENS.ONE
          )
        ).to.be.revertedWith("Tokens can only be received via #wrap");
      });
    });
  });

  describe("#wrap", async function () {
    context("fails", async function () {
      it("when non-owner tries to wrap", async function () {
        await expect(
          alice.contract.wrap(
            testNFTContract.address,
            TOKENS.ONE,
            ETH1,
            deployer.address,
            taxConfig.taxRate,
            taxConfig.collectionFrequency
          )
        ).to.be.revertedWith(ErrorMessages.NOT_APPROVED);
      });

      it("if owner has not approved wrapper", async function () {
        await expect(
          deployer.contract.wrap(
            testNFTContract.address,
            TOKENS.ONE,
            ETH1,
            deployer.address,
            taxConfig.taxRate,
            taxConfig.collectionFrequency
          )
        ).to.be.revertedWith(ErrorMessages.NOT_APPROVED);
      });
    });
    context("succeeds", async function () {
      it("can be wrapped by token owner", async function () {
        await deployerNFT.contract.approve(wrapperContract.address, TOKENS.ONE);

        const trx = await deployer.contract.wrap(
          testNFTContract.address,
          TOKENS.ONE,
          ETH1,
          beneficiary.address,
          taxConfig.taxRate,
          taxConfig.collectionFrequency
        );

        const id = wrappedTokenId(testNFTContract.address, TOKENS.ONE);

        // Token is minted
        expect(await wrapperContract.ownerOf(id)).to.equal(deployer.address);

        // Price is set
        expect(await wrapperContract.priceOf(id)).to.equal(ETH1);

        // Beneficiary is set
        expect(await wrapperContract.beneficiaryOf(id)).to.equal(
          beneficiary.address
        );

        // Tax rate is set
        expect(await wrapperContract.taxRateOf(id)).to.equal(taxConfig.taxRate);

        // Collection frequency is set
        expect(await wrapperContract.taxPeriodOf(id)).to.equal(
          taxationPeriodToSeconds(taxConfig.collectionFrequency)
        );

        // Event is emitted
        expect(trx)
          .to.emit(wrapperContract, Events.TOKEN_WRAPPED)
          .withArgs(testNFTContract.address, TOKENS.ONE, id);
      });
    });
  });
});