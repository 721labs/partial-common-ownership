import { expect } from "chai";
import { ethers } from "hardhat";

// Utils
import Wallet from "./helpers/Wallet";
import { taxationPeriodToSeconds } from "./helpers/utils";
import { snapshotEVM, revertEVM } from "./helpers/EVM";

// Constants
import { ETH0, ETH1, ETH2, ETH3, GLOBAL_TRX_CONFIG } from "./helpers/constants";

// Types
import {
  TOKENS,
  ERC721ErrorMessages,
  ERC721MetadataErrorMessages,
} from "./helpers/types";
import {
  ErrorMessages as PCOErrorMessages,
  Events as PCOEvents,
  RemittanceTriggers,
} from "./PartialCommonOwnership721/types";
import type { Contract } from "@ethersproject/contracts";
import type { Web3Provider } from "@ethersproject/providers";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { BigNumber } from "ethers";

//$ Local Types

enum ErrorMessages {
  ORIGINATOR_ONLY = "Wrap originator only",
  DEPOSIT_REQUIRED = "Deposit required",
  NO_DEPOSIT_REQUIRED = "No deposit required",
  VALUATION_GREATER_THAN_ZERO = "Valuation must be > 0",
  ADDRESS_ZERO = "Beneficiary cannot be address zero",
  BAD_TAX_RATE = "Tax rate must be > 0",
  BAD_COLLECTION_FREQUENCY = "Tax frequency must be > 0",
}

enum Events {
  TOKEN_WRAPPED = "LogTokenWrapped",
}

//$ Constants

const wrapValuation = ETH1;

const mintedTestNFTs = [TOKENS.ONE, TOKENS.TWO, TOKENS.THREE];

const taxConfig = { collectionFrequency: 365, taxRate: 50000000000 };

//$ State
let provider: Web3Provider;
let signers: Array<SignerWithAddress>;
let testNFTContract: Contract;
let wrapperContract: Contract;
let deployer: Wallet;
let deployerNFT: Wallet;
let bob: Wallet;
let alice: Wallet;
let snapshot: any;
let wallets: Array<Wallet>;
let walletsByAddress: {
  [address: string]: Wallet;
};

//$ Helpers

/**
 * Approves a token for wrapping and successfully wraps it.
 * @param tokenId Token to wrap
 * @returns Transaction data
 */
async function wrap(tokenId: TOKENS, beneficiary: Wallet): Promise<BigNumber> {
  await deployerNFT.contract.approve(wrapperContract.address, tokenId);

  // If wrapper is beneficiary, no deposit is necessary; otherwise, it's required.
  const deposit = beneficiary.address == deployer.address ? ETH0 : ETH3;

  const trx = await deployer.contract.wrap(
    testNFTContract.address,
    tokenId,
    wrapValuation,
    beneficiary.address,
    taxConfig.taxRate,
    taxConfig.collectionFrequency,
    { value: deposit }
  );

  const id = wrappedTokenId(testNFTContract.address, tokenId);

  // NFT is owned by wrapper contract
  expect(await testNFTContract.ownerOf(tokenId)).to.equal(
    wrapperContract.address
  );

  // Token is minted w/ correct ID
  expect(await wrapperContract.ownerOf(id)).to.equal(deployer.address);

  // Deposit is set
  expect(await wrapperContract.depositOf(id)).to.equal(deposit);

  // Valuation is set
  expect(await wrapperContract.valuationOf(id)).to.equal(wrapValuation);

  // Beneficiary is set
  expect(await wrapperContract.beneficiaryOf(id)).to.equal(beneficiary.address);

  // Tax rate is set
  expect(await wrapperContract.taxRateOf(id)).to.equal(taxConfig.taxRate);

  // Collection frequency is set
  expect(await wrapperContract.taxPeriodOf(id)).to.equal(
    taxationPeriodToSeconds(taxConfig.collectionFrequency)
  );

  // Event is emitted
  expect(trx)
    .to.emit(wrapperContract, Events.TOKEN_WRAPPED)
    .withArgs(testNFTContract.address, tokenId, id);

  return id;
}

/**
 * Unwraps a given wrapped token.
 * @param id Wrapped token id
 * @param unwrappedTokenId Id of the underlying token
 */
async function unwrap(id: BigNumber, unwrappedTokenId: TOKENS): Promise<void> {
  const deposit = await wrapperContract.depositOf(id);

  const currentOwner = walletsByAddress[await wrapperContract.ownerOf(id)];
  const beneficiary = await wrapperContract.beneficiaryOf(id);
  const ownedByBeneficiary = currentOwner.address == beneficiary;

  // Deployer is always wrapper so deployer must be un-wrapper.
  const trx = await deployer.contract.unwrap(id);

  // Verify that wrapped token is burned
  await expect(wrapperContract.ownerOf(id)).to.be.revertedWith(
    ERC721ErrorMessages.NONEXISTENT_TOKEN
  );

  // Verify all state is destroyed

  await expect(wrapperContract.beneficiaryOf(id)).to.be.revertedWith(
    PCOErrorMessages.NONEXISTENT_TOKEN
  );

  await expect(deployer.contract.selfAssess(id, ETH2)).to.be.revertedWith(
    ERC721ErrorMessages.NONEXISTENT_TOKEN
  );

  await expect(deployer.contract.valuationOf(id)).to.be.revertedWith(
    PCOErrorMessages.NONEXISTENT_TOKEN
  );

  await expect(wrapperContract.titleChainOf(id)).to.be.revertedWith(
    PCOErrorMessages.NONEXISTENT_TOKEN
  );

  await expect(wrapperContract.taxRateOf(id)).to.be.revertedWith(
    PCOErrorMessages.NONEXISTENT_TOKEN
  );

  await expect(wrapperContract.taxPeriodOf(id)).to.be.revertedWith(
    PCOErrorMessages.NONEXISTENT_TOKEN
  );

  // Underlying token is transferred to the current owner of the wrapped token
  expect(await testNFTContract.ownerOf(unwrappedTokenId)).to.equal(
    currentOwner.address
  );

  // Determine if taxes should have been / were collected
  const receipt = await trx.wait();
  const event = receipt.events.find(
    (event: any) => event.event === PCOEvents.COLLECTION
  );

  let taxCollected = 0;
  if (ownedByBeneficiary) {
    expect(Boolean(event)).to.equal(false);
  } else {
    expect(Boolean(event)).to.equal(true);
    taxCollected = event.args.collected;
  }

  // Verify that deposit is returned
  const depositAfter = deposit.sub(taxCollected);

  if (depositAfter.gt(0)) {
    expect(trx)
      .to.emit(wrapperContract, PCOEvents.REMITTANCE)
      .withArgs(
        RemittanceTriggers.WithdrawnDeposit,
        currentOwner.address,
        depositAfter
      );
  }
}

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
    bob = new Wallet(wrapperContract, signers[1]);
    alice = new Wallet(wrapperContract, signers[2]);

    wallets = [deployer, bob, alice];

    walletsByAddress = wallets.reduce(
      (memo, wallet) => ({ ...memo, [wallet.address]: wallet }),
      {}
    );

    await Promise.all(
      wallets.map(function (wallet) {
        return wallet.setup();
      })
    );

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

  describe("#tokenURI", async function () {
    context("fails", async function () {
      it("when token does not exist", async function () {
        await expect(
          wrapperContract.tokenURI(
            wrappedTokenId(testNFTContract.address, TOKENS.ONE)
          )
        ).to.be.revertedWith(ERC721MetadataErrorMessages.NONEXISTENT_TOKEN);
      });
    });
    context("succeeds", async function () {
      it("returns token's uri", async function () {
        const tokenId = TOKENS.ONE;
        const id = await wrap(tokenId, deployer);
        expect(await wrapperContract.tokenURI(id)).to.equal(
          `721.dev/${tokenId}`
        );
      });
    });
  });

  describe("#wrap", async function () {
    context("fails", async function () {
      it("valuation is 0", async function () {
        await expect(
          alice.contract.wrap(
            testNFTContract.address,
            TOKENS.ONE,
            0,
            alice.address,
            taxConfig.taxRate,
            taxConfig.collectionFrequency,
            { value: 0 }
          )
        ).to.be.revertedWith(ErrorMessages.VALUATION_GREATER_THAN_ZERO);
      });

      it("beneficiary is zero address", async function () {
        await expect(
          alice.contract.wrap(
            testNFTContract.address,
            TOKENS.ONE,
            wrapValuation,
            ethers.constants.AddressZero,
            taxConfig.taxRate,
            taxConfig.collectionFrequency
          )
        ).to.be.revertedWith(ErrorMessages.ADDRESS_ZERO);
      });

      it("tax rate is 0", async function () {
        await expect(
          alice.contract.wrap(
            testNFTContract.address,
            TOKENS.ONE,
            wrapValuation,
            alice.address,
            0,
            taxConfig.collectionFrequency
          )
        ).to.be.revertedWith(ErrorMessages.BAD_TAX_RATE);
      });

      it("tax period is 0", async function () {
        await expect(
          alice.contract.wrap(
            testNFTContract.address,
            TOKENS.ONE,
            wrapValuation,
            alice.address,
            taxConfig.taxRate,
            0
          )
        ).to.be.revertedWith(ErrorMessages.BAD_COLLECTION_FREQUENCY);
      });

      it("when non-owner tries to wrap", async function () {
        await expect(
          alice.contract.wrap(
            testNFTContract.address,
            TOKENS.ONE,
            wrapValuation,
            deployer.address,
            taxConfig.taxRate,
            taxConfig.collectionFrequency,
            { value: ETH1 }
          )
        ).to.be.revertedWith(ERC721ErrorMessages.NOT_APPROVED);
      });

      it("if owner has not approved wrapper", async function () {
        await expect(
          deployer.contract.wrap(
            testNFTContract.address,
            TOKENS.ONE,
            wrapValuation,
            deployer.address,
            taxConfig.taxRate,
            taxConfig.collectionFrequency
          )
        ).to.be.revertedWith(ERC721ErrorMessages.NOT_APPROVED);
      });

      it("if operator is beneficiary and included deposit", async function () {
        await expect(
          deployer.contract.wrap(
            testNFTContract.address,
            TOKENS.ONE,
            wrapValuation,
            deployer.address,
            taxConfig.taxRate,
            taxConfig.collectionFrequency,
            { value: ETH1 }
          )
        ).to.be.revertedWith(ErrorMessages.NO_DEPOSIT_REQUIRED);
      });

      it("if operator is not beneficiary and didn't include deposit", async function () {
        await expect(
          deployer.contract.wrap(
            testNFTContract.address,
            TOKENS.ONE,
            wrapValuation,
            bob.address,
            taxConfig.taxRate,
            taxConfig.collectionFrequency
          )
        ).to.be.revertedWith(ErrorMessages.DEPOSIT_REQUIRED);
      });
    });

    context("succeeds", async function () {
      it("can be wrapped by token owner", async function () {
        await wrap(TOKENS.ONE, bob);
      });

      it("can be unwrapped and then re-wrapped", async function () {
        const tokenId = TOKENS.ONE;
        const id = await wrap(tokenId, deployer);
        await unwrap(id, tokenId);
        await wrap(tokenId, bob);
      });
    });
  });

  describe("#unwrap", async function () {
    context("fails", async function () {
      it("token must exist", async function () {
        await expect(deployer.contract.unwrap(TOKENS.ONE)).to.be.revertedWith(
          PCOErrorMessages.NONEXISTENT_TOKEN
        );
      });

      it("only the address that wrapped the token can unwrap it", async function () {
        const id = await wrap(TOKENS.ONE, deployer);
        await expect(alice.contract.unwrap(id)).to.be.revertedWith(
          ErrorMessages.ORIGINATOR_ONLY
        );
      });
    });

    context("succeeds", async function () {
      it("can be unwrapped after being wrapped by beneficiary", async function () {
        const tokenId = TOKENS.ONE;
        const id = await wrap(tokenId, deployer);
        await unwrap(id, tokenId);
      });

      it("can be unwrapped after being wrapped by non-beneficiary", async function () {
        const tokenId = TOKENS.ONE;
        const id = await wrap(tokenId, bob);
        await unwrap(id, tokenId);
      });

      it("collects taxes and returns deposit", async function () {
        const tokenId = TOKENS.ONE;
        const id = await wrap(tokenId, deployer);

        // Alice buys the wrapped token
        await alice.contract.takeoverLease(id, ETH2, wrapValuation, {
          value: ETH3, // 2 Eth deposit (1 Eth paid to owner)
          ...GLOBAL_TRX_CONFIG,
        });

        expect(await wrapperContract.ownerOf(id)).to.equal(alice.address);

        await unwrap(id, tokenId);
      });
    });
  });
});
