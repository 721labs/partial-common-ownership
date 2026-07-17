#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { verifySafetyBaselines } = require("./check-safety-baselines");

const ROOT = path.resolve(__dirname, "..");
const BASELINE_PATH = path.join(ROOT, "compatibility", "baseline.json");
const REVIEW_PATH = process.env.COMPATIBILITY_REVIEW
  ? path.resolve(ROOT, process.env.COMPATIBILITY_REVIEW)
  : path.join(ROOT, "compatibility", "reviewed-differences.json");
const FORGE_BIN = process.env.FORGE_BIN || "forge";
const HARDHAT_CONFIG = path.join(
  ROOT,
  "compatibility",
  "hardhat.capture.config.ts"
);

const TARGETS = [
  ["contracts/Wrapper.sol", "Wrapper"],
  ["contracts/token/PartialCommonOwnership.sol", "PartialCommonOwnership"],
  ["contracts/token/modules/interfaces/IBeneficiary.sol", "IBeneficiary"],
  ["contracts/token/modules/interfaces/ILease.sol", "ILease"],
  ["contracts/token/modules/interfaces/IRemittance.sol", "IRemittance"],
  ["contracts/token/modules/interfaces/ITaxation.sol", "ITaxation"],
  ["contracts/token/modules/interfaces/IValuation.sol", "IValuation"],
];

const PROJECT_INTERFACES = TARGETS.slice(2);
const REQUIRED_OUTPUTS = [
  "abi",
  "evm.bytecode",
  "evm.deployedBytecode",
  "evm.methodIdentifiers",
  "metadata",
  "storageLayout",
];

const STAGE_04_RAW_BYTECODE_HASH_PATHS = new Set([
  "$.contracts.contracts/Wrapper.sol:Wrapper.creationBytecode.keccak256",
  "$.contracts.contracts/Wrapper.sol:Wrapper.runtimeBytecode.keccak256",
  "$.contracts.contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership.creationBytecode.keccak256",
  "$.contracts.contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership.runtimeBytecode.keccak256",
]);

const STAGE_05_RAW_BYTECODE_HASH_PATHS = new Set([
  "$.contracts.contracts/Wrapper.sol:Wrapper.creationBytecode.keccak256",
  "$.contracts.contracts/Wrapper.sol:Wrapper.runtimeBytecode.keccak256",
  "$.contracts.contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership.creationBytecode.keccak256",
  "$.contracts.contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership.runtimeBytecode.keccak256",
]);

const STAGE_06_FORGE_TEST_PATH =
  /^\$\.tests\.forge\.(?:count|names(?:\.length|\[\d+\]))$/;
const STAGE_07_SAFETY_ARTIFACTS = Object.freeze([
  "compatibility/safety-baselines.json",
  "compatibility/safety-test-inventory.json",
  "coverage/lcov.info",
  "gas/key-flows.snap",
]);

const STAGE_08_COMPILER_VERSION = "0.8.36";
const STAGE_08_COMPILER_LONG_VERSION = "0.8.36+commit.8a079791";
const STAGE_08_OPCODE_EVIDENCE_PATH =
  "compatibility/evidence/stage-08-solidity-0-8-36.json";
const STAGE_08_PRODUCTION_CONTRACTS = Object.freeze([
  "contracts/Wrapper.sol:Wrapper",
  "contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership",
]);
const STAGE_08_BYTECODE_PATH =
  /^\$\.contracts\.(?:contracts\/Wrapper\.sol:Wrapper|contracts\/token\/PartialCommonOwnership\.sol:PartialCommonOwnership)\.(?:creationBytecode|runtimeBytecode)\.(?:keccak256|metadataBytes|metadataStrippedKeccak256|metadataStrippedOpcodes|metadataStrippedSizeBytes|sizeBytes)$/;
const STAGE_08_GAS_SNAPSHOT_PATH = /^\$\.gasSnapshot\.entries\[\d+\]$/;
const STAGE_08_KEY_FLOW_GAS_PATH = path.join(ROOT, "gas", "key-flows.snap");
const STAGE_08_EVIDENCE_SHA256 =
  "8e80ae9a9af5c14a0ab57446a4254a300f8a494dd9d54cbf283bd9aeae95b530";
const STAGE_08_LEGACY_GAS_ENTRIES = Object.freeze([
  "BeneficiaryTest:testCannot_setBeneficiary_calledByNonBeneficiary(uint256,address) (runs: 256, μ: 249780, ~: 249780)",
  "BeneficiaryTest:test__setBeneficiary(uint256,address) (runs: 256, μ: 29635, ~: 29635)",
  "BeneficiaryTest:test_beneficiaryOf(uint256,address) (runs: 256, μ: 25312, ~: 25312)",
  "BeneficiaryTest:test_beneficiaryOf_unsetTokens() (gas: 2559)",
  "BeneficiaryTest:test_setBeneficiary(uint256,address) (runs: 256, μ: 26994, ~: 26994)",
  "RemittanceTest:test__remit_amountZero(address) (runs: 256, μ: 417600, ~: 417600)",
  "RemittanceTest:test__remit_destinationContractAddress() (gas: 417556)",
  "RemittanceTest:test__remit_destinationZeroAddress(uint256) (runs: 256, μ: 417992, ~: 417992)",
  "RemittanceTest:test__remit_holds() (gas: 92196)",
  "RemittanceTest:test__remit_insufficientBalance(address) (runs: 256, μ: 417604, ~: 417604)",
  "RemittanceTest:test__remit_sends(address,uint256) (runs: 256, μ: 52298, ~: 52298)",
  "RemittanceTest:test_withdrawOutstandingRemittance(uint256) (runs: 256, μ: 29796, ~: 29809)",
  "RemittanceTest:test_withdrawOutstandingRemittance_noOutstandingBalance() (gas: 417458)",
  "ValuationTest:test__setValuation(uint256,uint256) (runs: 256, μ: 28928, ~: 29473)",
  "ValuationTest:test_valuationOf(uint256,uint256) (runs: 256, μ: 24094, ~: 24639)",
]);
const STAGE_09_CANDIDATE = "stage-09-forge-std-1-16-2";
const STAGE_09_OPCODE_EVIDENCE_PATH =
  "compatibility/evidence/stage-09-forge-std-1-16-2.json";
const STAGE_09_FORGE_STD_PATH = "lib/forge-std";
const STAGE_09_FORGE_STD_PREVIOUS_COMMIT =
  "8d93b5273ca94b1c50b055ffc0e1b8b0a3c03d78";
const STAGE_09_FORGE_STD_COMMIT = "bf647bd6046f2f7da30d0c2bf435e5c76a780c1b";
const STAGE_09_FORGE_STD_TAG = "v1.16.2";
const STAGE_09_FORGE_STD_VERSION = "1.16.2";
const STAGE_09_EVIDENCE_SHA256 =
  "af78d4af44966d9155737e909a1fbce30cee17e21c927a273d0a3aff972dee54";
const STAGE_09_RELATIVE_GAS_PATHS = new Set([
  0, 1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13,
]);
const SECURITY_01_CANDIDATE = "security-01-erc721-post-hook-owner-recheck";
const SECURITY_01_POLICY = "security-01-erc721-post-hook-owner-recheck";
const SECURITY_01_EVIDENCE_PATH =
  "compatibility/evidence/security-01-erc721-post-hook-owner-recheck.json";
const SECURITY_01_BASE_COMMIT = "4b42e69201df9d9d541954ae2c077e39434bc711";
const SECURITY_01_ERC721_SOURCE = "contracts/token/modules/ERC721.sol";
const SECURITY_01_ERC721_BASE_SHA256 =
  "c2debc745b27c3043604ac968a5dc429de115574bae6d6b8901f5151480b7925";
const SECURITY_01_ERC721_CANDIDATE_SHA256 =
  "afbe4a4fc6ec42e8d515fc517524c825f5a4cb9a4d954a8f2e0f9bb306caede7";
const SECURITY_01_REGRESSION_SOURCE = "test/solidity/fuzz/WrapperFuzz.t.sol";
const SECURITY_01_REGRESSION_SOURCE_SHA256 =
  "76e10b5e1ab71d8c7c8ff9296bea55fa4894d362263f66fa1a1d93d9d14a371b";
const SECURITY_01_REGRESSION_TEST =
  "test/solidity/fuzz/WrapperFuzz.t.sol:WrapperFuzzTest:test_regression_deferredDelinquentTransferContinuesAfterNestedForeclosure";
const SECURITY_01_REVERT_VALUE = "ERC721: transfer from incorrect owner";
const SECURITY_01_HARDHAT_COUNT = 89;
const SECURITY_01_HARDHAT_NAMES_SHA256 =
  "861cda9b6fe70b931fd4c049c2e75585fd53a2ba502a3f89a70980a520f9a3ce";
const SECURITY_01_FORGE_COUNT = 140;
const SECURITY_01_FORGE_NAMES_SHA256 =
  "09b141a8c69c4522288cfdbf67373661052764ab019c865ea850dc5eb645f173";
const SECURITY_01_PARITY_FILES = Object.freeze({
  "compatibility/parity-map.json":
    "72f66deac5693d553a681afa755856cc87f2d52d4b109938862ba731da9443b4",
  "compatibility/parity/cohort-0-existing-forge.json":
    "3384ae9039fad21bb7800d61f181bd4ca6b68a8e1e8525815c3cc8ecd434df69",
  "compatibility/parity/cohort-1-pco-read-tax.json":
    "632c07354ab5f4e0d71290e2631da59bacad8cc3c0bc1d22cc129674098891fc",
  "compatibility/parity/cohort-2-pco-mutations.json":
    "47b93d5ecd3734b09533c8af0c514274ad4ff3c90185a6724364060bf5eef5c1",
  "compatibility/parity/cohort-3-wrapper.json":
    "4932bd7dd4da1cf55b2723e98cbe865737c9e735528ad70f05f8de85c2baecca",
  "compatibility/safety-test-inventory.json":
    "52f7c77b9ebec5093ad484f6695e46194b3ed0b9e737943946843e4f19c4d83a",
});
const SECURITY_01_CONFIG_FILES = Object.freeze({
  ".gitmodules":
    "f7a36b9847ca53567350f90b53c943ff1dbc74bf4fdf63e44a1c2a661977ee80",
  ".nvmrc": "8f9258d5e9da5443c42966a661aee09292b49d1c64e718dcc5f72976500bac48",
  ".prettierrc":
    "945e4acc046f6d8f283c15c4278a8057da0c079d9b41ad5cb4dc9a90ff367308",
  ".solhint.json":
    "03ea2d2c0e470e33b1a5647ca0bbe087bf6a5f672af368270b4e31c2a81b1508",
  "compatibility/hardhat.capture.config.ts":
    "4c59c6f6b3a58ac52039732bf7467bed38281b8c13e52f8657d26058e91c2e42",
  "compatibility/hardhat.reporter.js":
    "7310d6f2fafa336097c7ef260394272bc60571fb837325af0d4c5ddc756f0e9b",
  "compatibility/compiler-warning-allowlist.json":
    "1c094e82427028224a3c6ac353616e722c103c6020a52f9df90f5c0bb4452315",
  "foundry.toml":
    "15356b92e608367cc58458371448d51172a39ebc03fe461cd6fe77b21b3584a4",
  "hardhat.config.d.ts":
    "c6c3a72314c52b1127b70fa3ca8989602349fdffddbe906bd26bf05d4c45a58f",
  "hardhat.config.ts":
    "e49a971942946f32b59f52020445f727ef17c4bbb6434be3ce42e446619838a4",
  "package.json":
    "e0c7032655e11f96e5c81c5ad38a4035351f4e1b179cdaa9b0bc7a24051ae401",
  "pnpm-lock.yaml":
    "8b2a9145f7a11b591fa70e8196673ee895d828dc991541ffa792461bcc864c43",
  "pnpm-workspace.yaml":
    "807a021b3d4ff32c08e5fe5c9996bb41ecd2a26f4708f0f530ecf29c124ad4da",
  "remappings.txt":
    "ff6af4f5f016d740713659bae831093a516370283d19a66bc5f2c43147772b42",
  "slither.config.json":
    "cb2e3107f3f00d822eea68f92ab56b03b8efac79870017fbc94702232299add1",
  "tsconfig.json":
    "b7fba44234a569bfceaafd92e81f27fc3de945a2050e1a031a5401b36f2f3dc3",
});
const SECURITY_01_COMPILER_SOURCE_COUNT = 28;
const SECURITY_01_COMPILER_SOURCE_NAMES_SHA256 =
  "e86bca0a6260d6b06d7cbd21a978888007b3564a8dcc5e64df44791dd0eb9599";
const SECURITY_01_COMPILER_BASE_CLOSURE_SHA256 =
  "a9823354dbcc80b56b846d25578ad355b01803277b719c103e5c1947a4e07da9";
const SECURITY_01_COMPILER_CANDIDATE_CLOSURE_SHA256 =
  "0edeaddcec7f1a80e324033d44906ba1a6011083f0c9017c06e1988952b994a0";
const SECURITY_01_BEHAVIOR_EVIDENCE = Object.freeze({
  sourcePath: SECURITY_01_REGRESSION_SOURCE,
  sourceSha256: SECURITY_01_REGRESSION_SOURCE_SHA256,
  test: SECURITY_01_REGRESSION_TEST,
  inventoryChange: "none",
  callerCases: Object.freeze([
    "owner",
    "token-approved caller",
    "approved-for-all operator",
  ]),
  transferOverloads: Object.freeze([
    "transferFrom(address,address,uint256)",
    "safeTransferFrom(address,address,uint256)",
    "safeTransferFrom(address,address,uint256,bytes)",
  ]),
  expectedRevert: `Error(string): ${SECURITY_01_REVERT_VALUE}`,
  expectedOutcome:
    "The stale outer transfer reverts after nested foreclosure and the complete transaction rolls back.",
});
const SECURITY_02_CANDIDATE = "security-02-pco-init-before-callback";
const SECURITY_02_POLICY = "security-02-pco-init-before-callback";
const SECURITY_02_EVIDENCE_PATH =
  "compatibility/evidence/security-02-pco-init-before-callback.json";
const SECURITY_02_BASE_COMMIT = "b8be19e6ae6676d445127b38a47c7f73f1c45917";
const SECURITY_01_CHECKPOINT_EVIDENCE_SHA256 =
  "0f14f8b0dc4f21694d495411e37306a04133b7e9f5527514fa18a32eae16e8bb";
const SECURITY_01_CHECKPOINT_REVIEW_SHA256 =
  "9a89589b6e0e2029150152fd1738ecb9b284137f01b91324f98acecdef14af0c";
const SECURITY_02_ERC721_SOURCE = "contracts/token/modules/ERC721.sol";
const SECURITY_02_PCO_SOURCE = "contracts/token/PartialCommonOwnership.sol";
const SECURITY_02_FIXTURE_SOURCE =
  "contracts/test/PCOInitializationReceiver.sol";
const SECURITY_02_HARDHAT_TEST_SOURCE = "tests/Wrapper.ts";
const SECURITY_02_FORGE_TEST_SOURCE =
  "test/solidity/parity/WrapperParity.t.sol";
const SECURITY_02_HARDHAT_TEST =
  "Wrapper.sol #onERC721Received fails cannot be called directly";
const SECURITY_02_FORGE_TEST =
  "test/solidity/parity/WrapperParity.t.sol:WrapperParityTest:test_onERC721Received_directSafeTransferReverts";
const SECURITY_02_CHECKPOINT_BINDING = Object.freeze({
  commit: SECURITY_02_BASE_COMMIT,
  evidence: Object.freeze({
    path: SECURITY_01_EVIDENCE_PATH,
    sha256: SECURITY_01_CHECKPOINT_EVIDENCE_SHA256,
  }),
  review: Object.freeze({
    path: "compatibility/reviewed-differences.json",
    sha256: SECURITY_01_CHECKPOINT_REVIEW_SHA256,
  }),
});
const SECURITY_02_ERC721_BASE_SHA256 =
  "afbe4a4fc6ec42e8d515fc517524c825f5a4cb9a4d954a8f2e0f9bb306caede7";
const SECURITY_02_ERC721_CANDIDATE_SHA256 =
  "1ae25d804306f2167ccf8b89b12ddde3bdd983dbe1dd433129fc1545048662a7";
const SECURITY_02_PCO_BASE_SHA256 =
  "8309cb7445fef330c882822914961f62adbe02c0ba4a077312a2362786978d1d";
const SECURITY_02_PCO_CANDIDATE_SHA256 =
  "8a65ab36d6749306902385273a281c439b708320d82e8c84eb5c8e344027b927";
const SECURITY_02_FIXTURE_SHA256 =
  "0fe50d69c4878217b6bf772a4d2aff4a8c6129ea418c43bfbc79366f053f588f";
const SECURITY_02_HARDHAT_TEST_SOURCE_SHA256 =
  "35377ba00ea68479a517bcfe3873552a13e07563a040091c3b436345111b6a1c";
const SECURITY_02_FORGE_TEST_SOURCE_SHA256 =
  "07b21216d9d5dd35591f6b3693a62a5ffbb313d4da3013dbdf24cd101a8ce964";
const SECURITY_02_BEHAVIOR_EVIDENCE = Object.freeze({
  inventoryChange: "none",
  hardhat: Object.freeze({
    sourcePath: SECURITY_02_HARDHAT_TEST_SOURCE,
    sourceSha256: SECURITY_02_HARDHAT_TEST_SOURCE_SHA256,
    test: SECURITY_02_HARDHAT_TEST,
  }),
  forge: Object.freeze({
    sourcePath: SECURITY_02_FORGE_TEST_SOURCE,
    sourceSha256: SECURITY_02_FORGE_TEST_SOURCE_SHA256,
    test: SECURITY_02_FORGE_TEST,
  }),
  receiverFixture: Object.freeze({
    sourcePath: SECURITY_02_FIXTURE_SOURCE,
    sourceSha256: SECURITY_02_FIXTURE_SHA256,
  }),
  callbackState: Object.freeze([
    "wrapped ownership, balance, approval, deposit, valuation, beneficiary, tax rate, frequency, tax totals, collection time, metadata, ETH balance, and underlying custody are initialized before the callback",
    "acceptance preserves initialized state and exact event order",
    "wrong-selector and explicit receiver reverts roll back token, ETH, approvals, logs, and raw storage",
    "the initialized receiver may transfer or unwrap reentrantly without leaving stale wrapped-token state",
  ]),
  receiverActions: Object.freeze([
    "Accept",
    "WrongSelector",
    "ApproveThenRevert",
    "TransferAndAccept",
    "UnwrapAndAccept",
  ]),
});
const SECURITY_02_BOUND_FILES = Object.freeze({
  "compatibility/README.md":
    "c7de1ca81f11ab60228c638f9077a08c9ecaeb326e0dff4a0b126e4afa474e2d",
  [SECURITY_02_FIXTURE_SOURCE]: SECURITY_02_FIXTURE_SHA256,
  [SECURITY_02_HARDHAT_TEST_SOURCE]: SECURITY_02_HARDHAT_TEST_SOURCE_SHA256,
  [SECURITY_02_FORGE_TEST_SOURCE]: SECURITY_02_FORGE_TEST_SOURCE_SHA256,
  "scripts/run-slither.js":
    "1c11f0879dd8d4499e8d31a54df7675c51b19a80c939c4186690895cbaf0a9d1",
  "docs/security/slither-0.11.5-triage.md":
    "5a8c13bb0e1a2092eb14c377ce6b3f9081c3989b77b698861e301bd459becc7a",
  "docs/security/deferred-semantic-findings.md":
    "94aeada4e145afb29c9ae7bf67750e5ad9fe0bac4b19c7713a83d63a3767e8a3",
});
const SECURITY_02_CONFIG_FILES = Object.freeze({
  ...SECURITY_01_CONFIG_FILES,
  "compatibility/compiler-warning-allowlist.json":
    "c58ed5c3d0601018f68b31d1d0b93bc883ed026e25ecb5f87afe894fa8e3c7ca",
});
const SECURITY_02_CORE_CHANGED_PATHS = Object.freeze(
  [
    "compatibility/README.md",
    "compatibility/compiler-warning-allowlist.json",
    SECURITY_02_ERC721_SOURCE,
    SECURITY_02_PCO_SOURCE,
    SECURITY_02_FIXTURE_SOURCE,
    "docs/security/deferred-semantic-findings.md",
    "docs/security/slither-0.11.5-triage.md",
    "scripts/compatibility.js",
    "scripts/run-slither.js",
    SECURITY_02_FORGE_TEST_SOURCE,
    SECURITY_02_HARDHAT_TEST_SOURCE,
  ].sort()
);
const SECURITY_02_FINAL_CHANGED_PATHS = Object.freeze(
  [
    ...SECURITY_02_CORE_CHANGED_PATHS,
    SECURITY_02_EVIDENCE_PATH,
    "compatibility/reviewed-differences.json",
  ].sort()
);
const SECURITY_02_COMPILER_SOURCE_COUNT = 29;
const SECURITY_02_COMPILER_SOURCE_NAMES_SHA256 =
  "e0fad97cd536ee22fdd2d9f3da46b483190352856d175166a763cc0c2667d4d5";
const SECURITY_02_COMPILER_CANDIDATE_CLOSURE_SHA256 =
  "6a22c2752395f05857b7911e5613df456a67970f749b6efd659eec8805cef33b";
const SECURITY_03_CANDIDATE = "security-03-post-tax-stabilization";
const SECURITY_03_POLICY = "security-03-post-tax-stabilization";
const SECURITY_03_EVIDENCE_PATH =
  "compatibility/evidence/security-03-post-tax-stabilization.json";
const SECURITY_03_BASE_COMMIT = "02c2b6cfef5807e01fad80d81f1eb72519d74456";
const SECURITY_02_CHECKPOINT_EVIDENCE_SHA256 =
  "de260dc24d9ca44def7022c9b87804aa5d9909e62b89fd2e57e71245302ff963";
const SECURITY_02_CHECKPOINT_REVIEW_SHA256 =
  "1b4cc0db830026a9005a3e2f1d09ad532c45e3bbca116a81b131a3c7ef7c7504";
const SECURITY_03_LEASE_SOURCE = "contracts/token/modules/Lease.sol";
const SECURITY_03_TAXATION_SOURCE = "contracts/token/modules/Taxation.sol";
const SECURITY_03_LEASE_BASE_SHA256 =
  "d54560b1dc08c81127282aacf2facc05a2800a9604a838e5aba075a0bbfbd61b";
const SECURITY_03_LEASE_CANDIDATE_SHA256 =
  "adf81aa5c07420f00579492d949c0f53221adb1e986230f88ee795471384c0a9";
const SECURITY_03_TAXATION_BASE_SHA256 =
  "0e7f83ab785c5588f3e4ba1069abb1de261270b4fce60f2fae58ec3e4d669852";
const SECURITY_03_TAXATION_CANDIDATE_SHA256 =
  "8f9ed173f460a453380d071c915b14881292b70fe54a52283f27d5e353707131";
const SECURITY_03_POST_TAX_TEST_SOURCE =
  "test/solidity/invariant/PCODeferredRegression.t.sol";
const SECURITY_03_POST_TAX_TEST =
  "test/solidity/invariant/PCODeferredRegression.t.sol:PCODeferredRegressionTest:test_deferredStage10_pendingForeclosureSelfAssessPreservesLegacyBrickedState";
const SECURITY_03_TAKEOVER_TEST_SOURCE = "test/solidity/fuzz/WrapperFuzz.t.sol";
const SECURITY_03_TAKEOVER_TEST =
  "test/solidity/fuzz/WrapperFuzz.t.sol:WrapperFuzzTest:test_regression_deferredBeneficiaryTakeoverAcrossForeclosureLeavesUntrackedValuationSurplus";
const SECURITY_03_CHECKPOINT_BINDING = Object.freeze({
  commit: SECURITY_03_BASE_COMMIT,
  evidence: Object.freeze({
    path: SECURITY_02_EVIDENCE_PATH,
    sha256: SECURITY_02_CHECKPOINT_EVIDENCE_SHA256,
  }),
  review: Object.freeze({
    path: "compatibility/reviewed-differences.json",
    sha256: SECURITY_02_CHECKPOINT_REVIEW_SHA256,
  }),
});
const SECURITY_03_BEHAVIOR_EVIDENCE = Object.freeze({
  inventoryChange: "none",
  inventories: Object.freeze({
    hardhat: Object.freeze({
      count: SECURITY_01_HARDHAT_COUNT,
      namesSha256: SECURITY_01_HARDHAT_NAMES_SHA256,
    }),
    forge: Object.freeze({
      count: SECURITY_01_FORGE_COUNT,
      namesSha256: SECURITY_01_FORGE_NAMES_SHA256,
    }),
  }),
  postTaxAuthorization: Object.freeze({
    sourcePath: SECURITY_03_POST_TAX_TEST_SOURCE,
    sourceSha256:
      "fbba30318497a2d621a5399f163e26776679b00829b7ac50e2f5611805af3bcf",
    test: SECURITY_03_POST_TAX_TEST,
    authorizationModes: Object.freeze([
      "owner",
      "token-approved operator",
      "approved-for-all operator",
    ]),
    mutations: Object.freeze([
      "selfAssess",
      "deposit",
      "withdrawDeposit",
      "exit",
    ]),
    expectedRevert: "Error(string): ERC721: caller is not owner nor approved",
    expectedOutcome:
      "Tax collection may transiently foreclose, but stale pre-collection authorization cannot mutate state and the complete call rolls back.",
  }),
  takeoverPayment: Object.freeze({
    sourcePath: SECURITY_03_TAKEOVER_TEST_SOURCE,
    sourceSha256:
      "18d32cf9476c7a46362df42d7b8c4979048200b81d8e1ace84e3e86c172be6cc",
    test: SECURITY_03_TAKEOVER_TEST,
    buyerClasses: Object.freeze(["beneficiary", "non-beneficiary"]),
    successfulEventOrder: Object.freeze([
      "LogCollection",
      "LogRemittance or LogOutstandingRemittance",
      "LogValuation(0)",
      "Approval",
      "Transfer(to contract)",
      "LogForeclosure",
      "LogValuation(new)",
      "Approval",
      "Transfer(to buyer)",
      "LogLeaseTakeover",
    ]),
    accounting:
      "No submitted value is left untracked; contract assets equal deposits plus outstanding-remittance liabilities.",
    rollback:
      "Malformed active-owner payment exposes transient Collection then Remittance to the Foundry recorder while committed state and receipt logs roll back.",
  }),
  invariantSources: Object.freeze({
    "test/solidity/invariant/PCOInvariant.t.sol":
      "8a1f76de69c21233608992678ace76e8a72225d5361d50063bcaa0c7069c4efb",
    "test/solidity/invariant/WrapperInvariant.t.sol":
      "bce81fd95029aae12fd8eb35c21061cbe3c539ab27e870040898a7da6be06cee",
    "test/solidity/invariant/helpers/WrapperInvariantHarness.sol":
      "c683246b1958083d0e675d190305c74296f69083ce2f11c50b85e485d917fe95",
    "test/solidity/parity/PCOMutationParity.t.sol":
      "3aee5877b76da7143bf3b678f86d76e670f7ce86b49ec9a8d13216cf4cd78aea",
  }),
});
const SECURITY_03_BOUND_FILES = Object.freeze({
  "compatibility/README.md":
    "1824e84a0115d2814fecb1a16d8b7eb524a849e9cfbfc73e76f9cee8e864bcd8",
  "docs/security/deferred-semantic-findings.md":
    "108baaf737f4b8e58a772bc065f041090b65e01807f1ecf38a92dd3c2c696e08",
  "scripts/run-slither.js":
    "26437c5be98b3334ac46c24155a471d2ddec3d2dbcf304a27a50c895fb583f1e",
  "test/solidity/fuzz/WrapperFuzz.t.sol":
    "18d32cf9476c7a46362df42d7b8c4979048200b81d8e1ace84e3e86c172be6cc",
  "test/solidity/invariant/PCODeferredRegression.t.sol":
    "fbba30318497a2d621a5399f163e26776679b00829b7ac50e2f5611805af3bcf",
  "test/solidity/invariant/PCOInvariant.t.sol":
    "8a1f76de69c21233608992678ace76e8a72225d5361d50063bcaa0c7069c4efb",
  "test/solidity/invariant/WrapperInvariant.t.sol":
    "bce81fd95029aae12fd8eb35c21061cbe3c539ab27e870040898a7da6be06cee",
  "test/solidity/invariant/helpers/WrapperInvariantHarness.sol":
    "c683246b1958083d0e675d190305c74296f69083ce2f11c50b85e485d917fe95",
  "test/solidity/parity/PCOMutationParity.t.sol":
    "3aee5877b76da7143bf3b678f86d76e670f7ce86b49ec9a8d13216cf4cd78aea",
});
const SECURITY_03_CONFIG_FILES = Object.freeze({
  ...SECURITY_02_CONFIG_FILES,
  "compatibility/compiler-warning-allowlist.json":
    "e9da00fd5108aa12a3d3514672502f1637bda9feeec3db4bc64396d1410ad824",
});
const SECURITY_03_CORE_CHANGED_PATHS = Object.freeze(
  [
    "compatibility/README.md",
    "compatibility/compiler-warning-allowlist.json",
    SECURITY_03_LEASE_SOURCE,
    SECURITY_03_TAXATION_SOURCE,
    "docs/security/deferred-semantic-findings.md",
    "scripts/compatibility.js",
    "scripts/run-slither.js",
    ...Object.keys(SECURITY_03_BEHAVIOR_EVIDENCE.invariantSources),
    SECURITY_03_POST_TAX_TEST_SOURCE,
    SECURITY_03_TAKEOVER_TEST_SOURCE,
  ].sort()
);
const SECURITY_03_FINAL_CHANGED_PATHS = Object.freeze(
  [
    ...SECURITY_03_CORE_CHANGED_PATHS,
    SECURITY_03_EVIDENCE_PATH,
    "compatibility/reviewed-differences.json",
  ].sort()
);
const SECURITY_03_COMPILER_SOURCE_COUNT = 29;
const SECURITY_03_COMPILER_SOURCE_NAMES_SHA256 =
  "e0fad97cd536ee22fdd2d9f3da46b483190352856d175166a763cc0c2667d4d5";
const SECURITY_03_COMPILER_CANDIDATE_CLOSURE_SHA256 =
  "ae84ad645afd12641f10ee2634af301eaca52f1e568267dd20f7858aef0dacc8";
const SECURITY_04_CANDIDATE = "security-04-foreclosed-unwrap-guard";
const SECURITY_04_POLICY = "security-04-foreclosed-unwrap-guard";
const SECURITY_04_EVIDENCE_PATH =
  "compatibility/evidence/security-04-foreclosed-unwrap-guard.json";
const SECURITY_04_BASE_COMMIT = "f7e98cbc778c279af82b6514d70df886ba0af6cd";
const SECURITY_03_CHECKPOINT_EVIDENCE_SHA256 =
  "38d8551d97cb810f11cc963b81054ffb0fc2dd33dc1761e1dade9ec56d13b69a";
const SECURITY_03_CHECKPOINT_REVIEW_SHA256 =
  "21f427c71a6cccf9026801c634cdd8957edefa571993bcc5f207dbe31ad48cb4";
const SECURITY_04_WRAPPER_SOURCE = "contracts/Wrapper.sol";
const SECURITY_04_WRAPPER_BASE_SHA256 =
  "60e71c963513d7878d080c1460892304667eea8ff31d1bab4f1bda99b5436ce4";
const SECURITY_04_WRAPPER_CANDIDATE_SHA256 =
  "074f4296a91c734b1a419b3ac4066bc609e8f6c08d230176b58769354660bdc5";
const SECURITY_04_ERROR_SIGNATURE = "DestinationContractAddress()";
const SECURITY_04_ERROR_SELECTOR = "0x8ec2449e";
const SECURITY_04_REGRESSION_SOURCE = "test/solidity/fuzz/WrapperFuzz.t.sol";
const SECURITY_04_REGRESSION_TEST =
  "test/solidity/fuzz/WrapperFuzz.t.sol:WrapperFuzzTest:test_regression_deferredForeclosedUnwrapLeavesUnderlyingWithoutWrapperRecord";
const SECURITY_04_INVARIANT_SOURCE =
  "test/solidity/invariant/WrapperInvariant.t.sol";
const SECURITY_04_INVARIANT_HELPER =
  "test/solidity/invariant/helpers/WrapperInvariantHarness.sol";
const SECURITY_04_RETAINED_FORGE_TESTS = Object.freeze([
  SECURITY_04_REGRESSION_TEST,
  "test/solidity/invariant/WrapperInvariant.t.sol:WrapperInvariantTest:invariant_deferredForeclosedUnwrapCustodyLossIsClassified",
  "test/solidity/parity/WrapperParity.t.sol:WrapperParityTest:test_unwrap_nonOriginatorReverts",
  "test/solidity/parity/WrapperParity.t.sol:WrapperParityTest:test_unwrap_nonexistentTokenReverts",
  "test/solidity/parity/WrapperParity.t.sol:WrapperParityTest:test_unwrap_afterBeneficiaryWrap",
  "test/solidity/parity/WrapperParity.t.sol:WrapperParityTest:test_unwrap_afterNonBeneficiaryWrap",
  "test/solidity/parity/WrapperParity.t.sol:WrapperParityTest:test_unwrap_collectsTaxAndReturnsDeposit",
]);
const SECURITY_04_CHECKPOINT_BINDING = Object.freeze({
  commit: SECURITY_04_BASE_COMMIT,
  evidence: Object.freeze({
    path: SECURITY_03_EVIDENCE_PATH,
    sha256: SECURITY_03_CHECKPOINT_EVIDENCE_SHA256,
  }),
  review: Object.freeze({
    path: "compatibility/reviewed-differences.json",
    sha256: SECURITY_03_CHECKPOINT_REVIEW_SHA256,
  }),
});
const SECURITY_04_BEHAVIOR_EVIDENCE = Object.freeze({
  inventoryChange: "none",
  inventories: Object.freeze({
    hardhat: Object.freeze({
      count: SECURITY_01_HARDHAT_COUNT,
      namesSha256: SECURITY_01_HARDHAT_NAMES_SHA256,
    }),
    forge: Object.freeze({
      count: SECURITY_01_FORGE_COUNT,
      namesSha256: SECURITY_01_FORGE_NAMES_SHA256,
    }),
  }),
  guard: Object.freeze({
    sourcePath: SECURITY_04_REGRESSION_SOURCE,
    sourceSha256:
      "866f5bf4ee563f43315af96c436d720a55146bb429fdb6587d825775a350e86e",
    test: SECURITY_04_REGRESSION_TEST,
    error: Object.freeze({
      signature: SECURITY_04_ERROR_SIGNATURE,
      selector: SECURITY_04_ERROR_SELECTOR,
      declarationChange: "none; reuse the inherited Remittance custom error",
    }),
    precedence: Object.freeze([
      "_tokenMinted outer nonexistent-token gate",
      "read _wrappedTokenMap",
      "Wrap originator only require",
      "capture ownerOf",
      "DestinationContractAddress guard",
      "delete _wrappedTokenMap",
      "_burn",
      "underlying safeTransferFrom",
    ]),
    callerOutcomes: Object.freeze({
      nonOriginator:
        "Error(string): Wrap originator only, including after materialized foreclosure",
      originator:
        "DestinationContractAddress() when the wrapped owner is Wrapper",
    }),
    rollback:
      "The guard emits no committed logs and preserves wrapped ownership, metadata, underlying custody, balances, approvals, tax, deposit, remittance, and lock state.",
    recovery:
      "A takeover from contract custody restores an external wrapped owner, after which the original operator can unwrap to that owner.",
    adjacentPath:
      "The same guard preserves metadata after a raw non-safe wrapped-token transfer to Wrapper without reclassifying that transfer's economics.",
  }),
  pendingForeclosure:
    "Owner capture occurs before _burn tax collection, so a not-yet-materialized foreclosure retains its successful nine-event collection, foreclosure, burn, and underlying delivery behavior.",
  retainedForgeTests: SECURITY_04_RETAINED_FORGE_TESTS,
  invariantSources: Object.freeze({
    [SECURITY_04_INVARIANT_SOURCE]:
      "aae1d8fbdef2d2793e8c6c39cd7da09cee146971c5909574fea8243875beb829",
    [SECURITY_04_INVARIANT_HELPER]:
      "c69db0ef5cc4015f9e4a47a540b1c3ae688a6b0fb37ba1376a042b57161f1cf3",
  }),
});
const SECURITY_04_BOUND_FILES = Object.freeze({
  "compatibility/README.md":
    "940d69135432484c320c07adcb7ddb6a3b23cffa30dc8361aae5be48b18e541f",
  "docs/security/deferred-semantic-findings.md":
    "429ecb9b5bbefdf2a39df12e760988b14fcd785ee41477ae64094ea895175ff1",
  [SECURITY_04_REGRESSION_SOURCE]:
    "866f5bf4ee563f43315af96c436d720a55146bb429fdb6587d825775a350e86e",
  [SECURITY_04_INVARIANT_SOURCE]:
    "aae1d8fbdef2d2793e8c6c39cd7da09cee146971c5909574fea8243875beb829",
  [SECURITY_04_INVARIANT_HELPER]:
    "c69db0ef5cc4015f9e4a47a540b1c3ae688a6b0fb37ba1376a042b57161f1cf3",
});
const SECURITY_04_CONFIG_FILES = Object.freeze({
  ...SECURITY_03_CONFIG_FILES,
  "compatibility/compiler-warning-allowlist.json":
    "3dfbd1a79d97a077fe78c25f5a3d5fb6ae11327868b806caa1c54f0143a1cf57",
});
const SECURITY_04_CORE_CHANGED_PATHS = Object.freeze(
  [
    "compatibility/README.md",
    "compatibility/compiler-warning-allowlist.json",
    SECURITY_04_WRAPPER_SOURCE,
    "docs/security/deferred-semantic-findings.md",
    "scripts/compatibility.js",
    SECURITY_04_REGRESSION_SOURCE,
    SECURITY_04_INVARIANT_SOURCE,
    SECURITY_04_INVARIANT_HELPER,
  ].sort()
);
const SECURITY_04_FINAL_CHANGED_PATHS = Object.freeze(
  [
    ...SECURITY_04_CORE_CHANGED_PATHS,
    SECURITY_04_EVIDENCE_PATH,
    "compatibility/reviewed-differences.json",
  ].sort()
);
const SECURITY_04_COMPILER_SOURCE_COUNT = 29;
const SECURITY_04_COMPILER_SOURCE_NAMES_SHA256 =
  "e0fad97cd536ee22fdd2d9f3da46b483190352856d175166a763cc0c2667d4d5";
const SECURITY_04_COMPILER_CANDIDATE_CLOSURE_SHA256 =
  "1c174ffca1bd590e4dff0842a22f38ef6c7b07a8bdb2443c9e132446df50022e";
const SECURITY_04_WRAPPER_BYTECODE_PATH =
  /^\$\.contracts\.contracts\/Wrapper\.sol:Wrapper\.(?:creationBytecode|runtimeBytecode)\.(?:keccak256|metadataBytes|metadataStrippedKeccak256|metadataStrippedOpcodes|metadataStrippedSizeBytes|sizeBytes)$/;
const STAGE_10_CANDIDATE = "stage-10-openzeppelin-5-6-1";
const STAGE_10_POLICY =
  "stage-10-openzeppelin-5-6-1-security-04-relative-full-diff";
const STAGE_10_EVIDENCE_PATH =
  "compatibility/evidence/stage-10-openzeppelin-5-6-1.json";
const STAGE_10_BASE_COMMIT = "face4310d072b062487f988dad8796a027cf1bae";
const STAGE_10_SECURITY_04_EVIDENCE_SHA256 =
  "4e31e694ffe950d906b37a86186c2f2978b80ea9bf8a8d3425f92d815a95ccac";
const STAGE_10_SECURITY_04_REVIEW_SHA256 =
  "2c924c1b8f3f6c4818b0866099adc7a2e6e7d3c4349a36341764332cb4c6ed3f";
const STAGE_10_CHECKPOINT_BINDING = Object.freeze({
  commit: STAGE_10_BASE_COMMIT,
  evidence: Object.freeze({
    path: SECURITY_04_EVIDENCE_PATH,
    sha256: STAGE_10_SECURITY_04_EVIDENCE_SHA256,
  }),
  review: Object.freeze({
    path: "compatibility/reviewed-differences.json",
    sha256: STAGE_10_SECURITY_04_REVIEW_SHA256,
  }),
});
const STAGE_10_OPENZEPPELIN_VERSION = "5.6.1";
const STAGE_10_OPENZEPPELIN_INTEGRITY =
  "sha512-Ly6SlsVJ3mj+b18W3R8gNufB7dTICT105fJhodGAGgyC2oqnBAhqSiNDJ8V8DLY05cCz81GLI0CU5vNYA1EC/w==";
const STAGE_10_PRODUCTION_PRAGMA = "^0.8.20";
const STAGE_10_PRODUCTION_SOURCES = Object.freeze([
  "contracts/Wrapper.sol",
  "contracts/token/PartialCommonOwnership.sol",
  "contracts/token/modules/Beneficiary.sol",
  "contracts/token/modules/ERC721.sol",
  "contracts/token/modules/Lease.sol",
  "contracts/token/modules/Remittance.sol",
  "contracts/token/modules/Taxation.sol",
  "contracts/token/modules/Valuation.sol",
  "contracts/token/modules/interfaces/IBeneficiary.sol",
  "contracts/token/modules/interfaces/ILease.sol",
  "contracts/token/modules/interfaces/IRemittance.sol",
  "contracts/token/modules/interfaces/ITaxation.sol",
  "contracts/token/modules/interfaces/IValuation.sol",
]);
const STAGE_10_ERC721_SOURCE = "contracts/token/modules/ERC721.sol";
const STAGE_10_RECEIVER_INVENTORY_PATH =
  "compatibility/stage-10-receiver-test-inventory.json";
const STAGE_10_EXPECTED_PRODUCTION_OPENZEPPELIN_IMPORTS = Object.freeze([
  "@openzeppelin/contracts/token/ERC721/IERC721.sol",
  "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol",
  "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol",
  "@openzeppelin/contracts/utils/Context.sol",
  "@openzeppelin/contracts/utils/introspection/ERC165.sol",
  "@openzeppelin/contracts/utils/introspection/IERC165.sol",
]);
// Candidate-specific provenance values are intentionally frozen only after the
// production, receiver, packaging, and security-document work is complete.
// The Stage 10 generator refuses to proceed while any placeholder remains.
const STAGE_10_COMPILER_SOURCE_COUNT = 24;
const STAGE_10_COMPILER_SOURCE_NAMES_SHA256 =
  "c2b32297ccca42832b645845a77dc45bc2991141c7d7e2bc1244125c595dc805";
const STAGE_10_COMPILER_CLOSURE_SHA256 =
  "38d2428df3ed7472afb28ad76273ea14ed05c89bbfcc165a9540378b9ca317df";
const STAGE_10_SECURITY_04_COMPILER_SOURCE_NAMES = Object.freeze([
  "@openzeppelin/contracts/token/ERC721/ERC721.sol",
  "@openzeppelin/contracts/token/ERC721/IERC721.sol",
  "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol",
  "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol",
  "@openzeppelin/contracts/utils/Address.sol",
  "@openzeppelin/contracts/utils/Context.sol",
  "@openzeppelin/contracts/utils/Strings.sol",
  "@openzeppelin/contracts/utils/introspection/ERC165.sol",
  "@openzeppelin/contracts/utils/introspection/IERC165.sol",
  "@openzeppelin/contracts/utils/math/Math.sol",
  "@openzeppelin/contracts/utils/math/SignedMath.sol",
  "contracts/Wrapper.sol",
  "contracts/test/Blocker.sol",
  "contracts/test/PCOInitializationReceiver.sol",
  "contracts/test/TestNFT.sol",
  "contracts/test/TestPCOToken.sol",
  "contracts/test/TestWrapper.sol",
  "contracts/token/PartialCommonOwnership.sol",
  "contracts/token/modules/Beneficiary.sol",
  "contracts/token/modules/ERC721.sol",
  "contracts/token/modules/Lease.sol",
  "contracts/token/modules/Remittance.sol",
  "contracts/token/modules/Taxation.sol",
  "contracts/token/modules/Valuation.sol",
  "contracts/token/modules/interfaces/IBeneficiary.sol",
  "contracts/token/modules/interfaces/ILease.sol",
  "contracts/token/modules/interfaces/IRemittance.sol",
  "contracts/token/modules/interfaces/ITaxation.sol",
  "contracts/token/modules/interfaces/IValuation.sol",
]);
const STAGE_10_COMPILER_ADDED_SOURCES = Object.freeze([]);
const STAGE_10_COMPILER_REMOVED_SOURCES = Object.freeze([
  "@openzeppelin/contracts/token/ERC721/ERC721.sol",
  "@openzeppelin/contracts/utils/Address.sol",
  "@openzeppelin/contracts/utils/Strings.sol",
  "@openzeppelin/contracts/utils/math/Math.sol",
  "@openzeppelin/contracts/utils/math/SignedMath.sol",
]);
const STAGE_10_BOUND_FILES = Object.freeze({
  "compatibility/README.md":
    "84412fc6493eac9d92873f538237d65869a76d3ca684737fc913bfc7a05731c2",
  "compatibility/compiler-warning-allowlist.json":
    "0ad1d055e0192a115d0c27c9bd5c6f606705ac1b441ba0f6537c8604d3d15d10",
  "compatibility/stage-10-receiver-test-inventory.json":
    "c4613826a275d50f4fe0e8ba0f9973e1640bc390d325e9c6790a554f9fa391be",
  "contracts/Wrapper.sol":
    "4d8766bd7baa0a1bd2b021c0de27a04c59219d86fd0c907973e7873e5b069915",
  "contracts/test/TestNFT.sol":
    "110fadbf1c0d3052ebd517512596e62d63085137c3c81261271f9da65997c0b6",
  "contracts/token/PartialCommonOwnership.sol":
    "5429da466a15811ce0196b99b710f247b3d6392c81cce2b84cab5ab83129c825",
  "contracts/token/modules/Beneficiary.sol":
    "91e507656ebd6ec2d5ae5dfe2fe24ba0e30cea87b3deb14dd5e6140479e61500",
  "contracts/token/modules/ERC721.sol":
    "7bcb9d453294af951005305c25003c0754643c1c53cb3f310436b31931192e1b",
  "contracts/token/modules/Lease.sol":
    "269ec676c2a8bdd8148b0e2ce8743da676c220109583df569f95673bfaaac34f",
  "contracts/token/modules/Remittance.sol":
    "3b9c9c0efea65e5256c7faad8061342b9764f58d5676550088b587d46d73bcc6",
  "contracts/token/modules/Taxation.sol":
    "72aa02e63d76e28e6f04e29ea49e81a764f2211955e032a907fe0a7e524b0027",
  "contracts/token/modules/Valuation.sol":
    "10b3450c7a2bc9c0b1f12f774c34abd70338480f908dc77d448d0de425adca02",
  "contracts/token/modules/interfaces/IBeneficiary.sol":
    "b65dfa02ee1a1a6d89694323bc5b621f6c5504d8d1ab640a9ae03189fb3dceff",
  "contracts/token/modules/interfaces/ILease.sol":
    "6373d8ce3d99fca346278de04dfedaaefc46ed7b4e4812b1b8737a03abbccfa1",
  "contracts/token/modules/interfaces/IRemittance.sol":
    "aec91c493f5b6482d97a55031a559ba8084e93c6112e49742dadc1c91af987eb",
  "contracts/token/modules/interfaces/ITaxation.sol":
    "78b7663a40929bfd7afc0c4315abf6365287fd17ca9986479c963aedfb28de42",
  "contracts/token/modules/interfaces/IValuation.sol":
    "d7fd7c28b9a78a1e194b20f7e1a1c8c0b13b47df237f1c7defa95e45f6201e06",
  "docs/development.md":
    "e7b3530c87cc303843b28bd02d9151bbc74d8c411a40e799337e8342310de1d3",
  "docs/security/custom-erc721-vs-openzeppelin-5.6.1.md":
    "8408dc4e8380371b434db443381efc9ea4c37380633b825ed8b60ba6328b53b0",
  "docs/security/deferred-semantic-findings.md":
    "cd77fbe31de319fefc825f6865615d8a9be00226acdc75db3dcf7f0925b4381f",
  "docs/security/slither-0.11.5-triage.md":
    "f5f85f7b8d403310a2fdd2e67c5ebf5f805b66ebec5dd2ed6f68a054eabe5448",
  "package.json":
    "725271913cf42b7ff0cf8f28f2b90d6830860f3e023e70f0e7a5cc8a6be7b1eb",
  "pnpm-lock.yaml":
    "b3074d21c3e9db6fe5361ddf43d03ed1ea4aaef8f28b9e47fd92c04baf2367ff",
  "scripts/check-compiler-warnings.js":
    "77960e50ce80beff59853c663d0d7b6c8b043eef1bae905d21d3d1648d3e7098",
  "scripts/test-package.js":
    "2198d75e1ff351cc0cc3b20b66aec18ea3c08416b9886d22aed4d55531080ce7",
  "test/solidity/fuzz/WrapperFuzz.t.sol":
    "ecd22eec5c14af50f0837f45b8ec72714729bf449645d82752ab430b7b4a8795",
  "test/solidity/invariant/helpers/WrapperInvariantHarness.sol":
    "b01897c621a8c0357956361db01384039b3d97982ee8399d0d4ace36a07ca0ed",
});
const STAGE_10_CORE_CHANGED_PATHS = Object.freeze([
  "compatibility/README.md",
  "compatibility/compiler-warning-allowlist.json",
  "compatibility/stage-10-receiver-test-inventory.json",
  "contracts/Wrapper.sol",
  "contracts/test/TestNFT.sol",
  "contracts/token/PartialCommonOwnership.sol",
  "contracts/token/modules/Beneficiary.sol",
  "contracts/token/modules/ERC721.sol",
  "contracts/token/modules/Lease.sol",
  "contracts/token/modules/Remittance.sol",
  "contracts/token/modules/Taxation.sol",
  "contracts/token/modules/Valuation.sol",
  "contracts/token/modules/interfaces/IBeneficiary.sol",
  "contracts/token/modules/interfaces/ILease.sol",
  "contracts/token/modules/interfaces/IRemittance.sol",
  "contracts/token/modules/interfaces/ITaxation.sol",
  "contracts/token/modules/interfaces/IValuation.sol",
  "docs/development.md",
  "docs/security/custom-erc721-vs-openzeppelin-5.6.1.md",
  "docs/security/deferred-semantic-findings.md",
  "docs/security/slither-0.11.5-triage.md",
  "package.json",
  "pnpm-lock.yaml",
  "scripts/check-compiler-warnings.js",
  "scripts/compatibility.js",
  "scripts/test-package.js",
  "test/solidity/fuzz/WrapperFuzz.t.sol",
  "test/solidity/invariant/helpers/WrapperInvariantHarness.sol",
]);
const STAGE_10_FINAL_CHANGED_PATHS = Object.freeze(
  [
    ...STAGE_10_CORE_CHANGED_PATHS,
    STAGE_10_EVIDENCE_PATH,
    "compatibility/reviewed-differences.json",
  ].sort()
);
const STAGE_10_BYTECODE_PATH = STAGE_08_BYTECODE_PATH;
const STAGE_11_CANDIDATE = "stage-11-foundry-first-cutover";
const STAGE_11_POLICY = "stage-11-foundry-first-cutover";
const STAGE_11_EVIDENCE_PATH =
  "compatibility/evidence/stage-11-foundry-first-cutover.json";
const STAGE_11_BASE_COMMIT = "14720718787046af58be50c110be40c18f5b1364";
const STAGE_11_STAGE_10_EVIDENCE_SHA256 =
  "41997589806cfb2549751713ad754816bab1259a172bebdea6ec957494437d60";
const STAGE_11_STAGE_10_REVIEW_SHA256 =
  "9940b3d2e4408ea7221bf05b98d7d16a97078aa0f2334c4dfec9af83b5533cef";
const STAGE_11_CHECKPOINT_BINDING = Object.freeze({
  commit: STAGE_11_BASE_COMMIT,
  evidence: Object.freeze({
    path: STAGE_10_EVIDENCE_PATH,
    sha256: STAGE_11_STAGE_10_EVIDENCE_SHA256,
  }),
  review: Object.freeze({
    path: "compatibility/reviewed-differences.json",
    sha256: STAGE_11_STAGE_10_REVIEW_SHA256,
  }),
});
const STAGE_11_SMOKE_INVENTORY_PATH =
  "compatibility/stage-11-hardhat-smoke-inventory.json";
const STAGE_11_HISTORICAL_HARDHAT_COUNT = 89;
const STAGE_11_HISTORICAL_HARDHAT_NAMES_SHA256 =
  "861cda9b6fe70b931fd4c049c2e75585fd53a2ba502a3f89a70980a520f9a3ce";
const STAGE_11_FORGE_COUNT = 140;
const STAGE_11_FORGE_NAMES_SHA256 =
  "09b141a8c69c4522288cfdbf67373661052764ab019c865ea850dc5eb645f173";
const STAGE_11_DELETED_LEGACY_TESTS = Object.freeze({
  "tests/PartialCommonOwnership/index.ts":
    "729d6297377a6be11ebb122a8413a27985da990c108e70522512c70d98e7c134",
  "tests/Wrapper.ts":
    "35377ba00ea68479a517bcfe3873552a13e07563a040091c3b436345111b6a1c",
});
const STAGE_11_BOUND_FILES = Object.freeze({
  ".github/workflows/tests.yml":
    "cee6c5967377045fc2150ebde494d2efd8ad53fea6216b1cac06ae83c120f6e6",
  "compatibility/README.md":
    "1160df1b45c17f5ea20bec5382151a1967268e48370045d4098fe463b5d8294c",
  "compatibility/stage-11-hardhat-smoke-inventory.json":
    "abea926d3e3cf7928a7693565aa01c2e59c22e442ce97c4a0271c7be46095cf4",
  "docs/development.md":
    "4ae7d76e3195d11112cd83a0b78733e1eebe62e591b66944c64c7784e35aade2",
  "package.json":
    "2fa2275dff0c0bd62903536e401e5b61774064df2057a105621b69673704bb3b",
  "scripts/check-parity.js":
    "7bdbc18f87cdc138769ff94a5a721f4d89180e6b9dc08573b4482119103f87b4",
  "tests/Interoperability.smoke.ts":
    "7fe9df8fca7273886e8eb8cbe96cd8053a9d4061c4034cb46a34831b59ae065a",
});
const STAGE_11_CORE_CHANGED_PATHS = Object.freeze(
  [
    ".github/workflows/tests.yml",
    "compatibility/README.md",
    "compatibility/stage-11-hardhat-smoke-inventory.json",
    "docs/development.md",
    "package.json",
    "scripts/check-parity.js",
    "scripts/compatibility.js",
    "tests/Interoperability.smoke.ts",
    "tests/PartialCommonOwnership/index.ts",
    "tests/Wrapper.ts",
  ].sort()
);
const STAGE_11_FINAL_CHANGED_PATHS = Object.freeze(
  [
    ...STAGE_11_CORE_CHANGED_PATHS,
    "compatibility/evidence/stage-11-foundry-first-cutover.json",
    "compatibility/reviewed-differences.json",
  ].sort()
);
const STAGE_12A_CANDIDATE = "stage-12a-ethers-6";
const STAGE_12A_POLICY = "stage-12a-ethers-6-stage-11-equality";
const STAGE_12A_EVIDENCE_PATH =
  "compatibility/evidence/stage-12a-ethers-6.json";
const STAGE_12A_BASE_COMMIT = "c84870955d77e82e91ed70591f010233675a6880";
const STAGE_12A_STAGE_11_EVIDENCE_SHA256 =
  "0077542e6ac4c5f1af3813ff8e84dcc4d46182f1a8c0b28e290acfae733da412";
const STAGE_12A_STAGE_11_REVIEW_SHA256 =
  "4dfa67856a3d5d04a1057df5064926a07fd1dcde314b05bbdd1927a3080b7731";
const STAGE_12A_CHECKPOINT_BINDING = Object.freeze({
  commit: STAGE_12A_BASE_COMMIT,
  evidence: Object.freeze({
    path: STAGE_11_EVIDENCE_PATH,
    sha256: STAGE_12A_STAGE_11_EVIDENCE_SHA256,
  }),
  review: Object.freeze({
    path: "compatibility/reviewed-differences.json",
    sha256: STAGE_12A_STAGE_11_REVIEW_SHA256,
  }),
});
const STAGE_12A_INVENTORY_PATH =
  "compatibility/stage-12a-ethers6-inventory.json";
const STAGE_12A_INVENTORY_SHA256 =
  "f9f3e23ccd84236ffca10d2eb79b3c0f737e83efd0692f8a57ea3a0ac98f0cc2";
const STAGE_12A_ETHERS_VERSION = "6.17.0";
const STAGE_12A_HARDHAT_ETHERS_VERSION = "3.1.3";
const STAGE_12A_HARDHAT_VERSION = "2.28.6";
const STAGE_12A_RETAINED_LEGACY_DEV_DEPENDENCIES = Object.freeze({
  "@ethersproject/abi": "5.6.0",
  "@ethersproject/contracts": "5.6.0",
  "@ethersproject/providers": "5.6.2",
  "@nomiclabs/hardhat-ethers": "2.0.5",
  "@nomiclabs/hardhat-waffle": "2.0.3",
  "@nomiclabs/hardhat-web3": "2.0.0",
  "@typechain/ethers-v5": "10.0.0",
  "@typechain/hardhat": "6.0.0",
  "ethereum-waffle": "3.4.4",
  typechain: "8.0.0",
});
const STAGE_12A_DORMANT_ETHERS5_TOOLING = Object.freeze({
  "@nomiclabs/hardhat-ethers": "2.0.5",
  "@nomiclabs/hardhat-waffle": "2.0.3",
  "@typechain/ethers-v5": "10.0.0",
  "@typechain/hardhat": "6.0.0",
  "ethereum-waffle": "3.4.4",
  typechain: "8.0.0",
});
const STAGE_12A_RETAINED_LEGACY_HELPERS = Object.freeze({
  "@ethersproject/abi": "5.6.0",
  "@ethersproject/contracts": "5.6.0",
  "@ethersproject/providers": "5.6.2",
});
const STAGE_12A_ACTIVE_LEGACY_PLUGIN = Object.freeze({
  "@nomiclabs/hardhat-web3": "2.0.0",
});
const STAGE_12A_ETHERS_INTEGRITY =
  "sha512-BpyrpIPJ3ydEVow8zGaz1DuPS7YU8DcWxuBnY9a0UA/lvAPwrMr+EPXsfrul628SRaekPNeIM4UFh/91GWZang==";
const STAGE_12A_HARDHAT_ETHERS_INTEGRITY =
  "sha512-208JcDeVIl+7Wu3MhFUUtiA8TJ7r2Rn3Wr+lSx9PfsDTKkbsAsWPY6N6wQ4mtzDv0/pB9nIbJhkjoHe1EsgNsA==";
const STAGE_12A_LOCKFILE_SHA256 =
  "7ee226b9a5f69123376f1f7429dd7e34b5262c3673a776d1c6cc4ee7ff9e46b4";
const STAGE_12A_PACKAGE_SHA256 =
  "fa57c6f6ac2429bcd3b4dcf5c3d8c3121d926999f902baea190488aff854d7a7";
const STAGE_12A_EXPECTED_PACKAGE_DIFFERENCE_PATHS = Object.freeze([
  "$.packageJson.devDependencies.@nomicfoundation/hardhat-ethers",
  "$.packageJson.devDependencies.ethers",
  "$.packageJson.scripts.test:hardhat:smoke",
  "$.packageJson.scripts.typechain",
]);
const STAGE_12A_BOUND_FILES = Object.freeze({
  "compatibility/README.md":
    "cccac2d4fb89015cdbe20197a9c08d78ecc90c11384d485690b471e42e390df8",
  "compatibility/stage-12a-ethers6-inventory.json":
    "f9f3e23ccd84236ffca10d2eb79b3c0f737e83efd0692f8a57ea3a0ac98f0cc2",
  "docs/development.md":
    "ab764805a0d8d4679dca1f6b2043ba3f21ea2b5420d567558719a3d5c2109727",
  "hardhat.config.d.ts":
    "279ba3be547bf4369a358eafee9bf89d2f6733813010c588f70164512a8158a4",
  "hardhat.config.ts":
    "a1fe8c8ee149838e99cd8a93a249a50a1655777589c1341ce6c2e93c8fe1e2ab",
  "package.json":
    "fa57c6f6ac2429bcd3b4dcf5c3d8c3121d926999f902baea190488aff854d7a7",
  "pnpm-lock.yaml":
    "7ee226b9a5f69123376f1f7429dd7e34b5262c3673a776d1c6cc4ee7ff9e46b4",
  "scripts/check-parity.js":
    "540ef384dda01295a357a048290bb89004d3aa64a5e7455b73ff3c08fe37f53a",
  "tests/Interoperability.smoke.ts":
    "2cfc8c3fe6599499433874440ed885b19f6ec39e6510eae0c881b19c5aed3350",
  "tsconfig.json":
    "79498bc723d15551590dfcc9ce33d2e69f1023895b24d4d680be6c67e97cd488",
});
const STAGE_12A_CORE_CHANGED_PATHS = Object.freeze(
  [...Object.keys(STAGE_12A_BOUND_FILES), "scripts/compatibility.js"].sort()
);
const STAGE_12A_FINAL_CHANGED_PATHS = Object.freeze(
  [
    ...STAGE_12A_CORE_CHANGED_PATHS,
    STAGE_12A_EVIDENCE_PATH,
    "compatibility/reviewed-differences.json",
  ].sort()
);
const PROJECT_REVERT_STRINGS_PATH = path.join(
  ROOT,
  "compatibility",
  "project-revert-strings.json"
);
const PROJECT_REVERT_STRINGS_SHA256 =
  "027be662c5a30bc124afd2f8965e39fcd18c3681bd76fddd659bf78396190b68";
const BASELINE_SOURCE_COMMIT = "ca72ca7f13dd0a2103d592b39a4fcaa749e9045f";

function stage06ParityForgeTests() {
  const mapPath = path.join(ROOT, "compatibility", "parity-map.json");
  const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  if (map.schemaVersion !== 1 || !Array.isArray(map.fragments)) {
    throw new Error("Stage 6 parity map has an invalid schema");
  }
  const parityRoot = `${path.join(ROOT, "compatibility", "parity")}${path.sep}`;
  const forgeTestRoot = `${path.join(ROOT, "test", "solidity")}${path.sep}`;
  const names = [];
  const legacyIds = [];
  const legacyKeys = [];
  const legacyTitles = { hardhat: [], forge: [] };
  for (const fragmentPath of map.fragments) {
    if (path.isAbsolute(fragmentPath)) {
      throw new Error(
        `Stage 6 parity fragment must be relative: ${fragmentPath}`
      );
    }
    const resolvedFragmentPath = path.resolve(ROOT, fragmentPath);
    if (!resolvedFragmentPath.startsWith(parityRoot)) {
      throw new Error(
        `Stage 6 parity fragment must be stored under compatibility/parity: ${fragmentPath}`
      );
    }
    const fragment = JSON.parse(fs.readFileSync(resolvedFragmentPath, "utf8"));
    if (
      fragment.schemaVersion !== 1 ||
      !Array.isArray(fragment.entries) ||
      fragment.entries.length !== fragment.expectedCount ||
      !["hardhat", "forge"].includes(fragment.legacySuite)
    ) {
      throw new Error(`Stage 6 parity fragment is invalid: ${fragmentPath}`);
    }
    for (const entry of fragment.entries) {
      if (path.isAbsolute(entry.forgeFile)) {
        throw new Error(
          `Stage 6 Forge target must be repository-relative: ${entry.forgeFile}`
        );
      }
      const resolvedForgeFile = path.resolve(ROOT, entry.forgeFile);
      if (!resolvedForgeFile.startsWith(forgeTestRoot)) {
        throw new Error(
          `Stage 6 Forge target must be stored under test/solidity: ${entry.forgeFile}`
        );
      }
      legacyIds.push(entry.legacyId);
      legacyKeys.push(`${fragment.legacySuite}:${entry.legacyTitle}`);
      legacyTitles[fragment.legacySuite].push(entry.legacyTitle);
      names.push(
        `${entry.forgeFile}:${entry.forgeContract}:${entry.forgeTest}`
      );
    }
  }
  const uniqueNames = [...new Set(names)].sort();
  const uniqueLegacyIds = new Set(legacyIds);
  const uniqueLegacyKeys = new Set(legacyKeys);
  if (
    names.length !== map.expectedEntries ||
    uniqueNames.length !== map.expectedForgeTests ||
    uniqueLegacyIds.size !== names.length ||
    uniqueLegacyKeys.size !== names.length ||
    legacyTitles.hardhat.length !== map.expectedLegacyCounts.hardhat ||
    legacyTitles.forge.length !== map.expectedLegacyCounts.forge
  ) {
    throw new Error(
      `Stage 6 parity map must contain ${map.expectedEntries} unique legacy and Forge targets`
    );
  }
  return {
    forgeNames: uniqueNames,
    hardhatLegacyTitles: legacyTitles.hardhat.sort(),
    forgeLegacyTitles: legacyTitles.forge.sort(),
  };
}

function validateStage06Candidate(baseline, candidate) {
  if (!valuesEqual(candidate.tests.hardhat, baseline.tests.hardhat)) {
    throw new Error(
      "Stage 6 must preserve the exact 89-test Hardhat oracle inventory"
    );
  }
  const parity = stage06ParityForgeTests();
  if (
    !valuesEqual(
      parity.hardhatLegacyTitles,
      [...baseline.tests.hardhat.names].sort()
    ) ||
    !valuesEqual(
      parity.forgeLegacyTitles,
      [...baseline.tests.forge.names].sort()
    )
  ) {
    throw new Error(
      "Stage 6 parity map must cover every baseline behavior scenario exactly once"
    );
  }
  const expectedForgeNames = parity.forgeNames;
  if (!valuesEqual(candidate.tests.forge.names, expectedForgeNames)) {
    throw new Error(
      "Stage 6 Forge inventory must exactly match the checked-in 104-entry parity map"
    );
  }
  if (candidate.tests.forge.count !== expectedForgeNames.length) {
    throw new Error("Stage 6 Forge test count does not match its parity map");
  }
  if (
    candidate.tests.total !==
    baseline.tests.hardhat.count + expectedForgeNames.length
  ) {
    throw new Error("Stage 6 combined behavior-test count is inconsistent");
  }
}

function stage07SafetyForgeTests() {
  const inventoryPath = path.join(
    ROOT,
    "compatibility",
    "safety-test-inventory.json"
  );
  if (!fs.existsSync(inventoryPath)) {
    throw new Error("Stage 7 safety-test inventory is missing");
  }
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  if (
    inventory.schemaVersion !== 1 ||
    inventory.candidate !== "stage-07-foundry-safety" ||
    !Array.isArray(inventory.names) ||
    inventory.names.length !== inventory.expectedCount
  ) {
    throw new Error("Stage 7 safety-test inventory has an invalid schema");
  }
  const names = [...new Set(inventory.names)].sort();
  if (names.length !== inventory.names.length) {
    throw new Error("Stage 7 safety-test inventory contains duplicates");
  }
  for (const name of names) {
    const separator = name.indexOf(":");
    const source = separator < 0 ? "" : name.slice(0, separator);
    if (!/^test\/solidity\/(?:fuzz|invariant)\/.+\.t\.sol$/.test(source)) {
      throw new Error(
        `Stage 7 safety test is outside its owned directories: ${name}`
      );
    }
    const resolvedSource = path.resolve(ROOT, source);
    const safetyRoot = `${path.join(ROOT, "test", "solidity")}${path.sep}`;
    if (
      !resolvedSource.startsWith(safetyRoot) ||
      !fs.existsSync(resolvedSource)
    ) {
      throw new Error(`Stage 7 safety-test source is missing: ${source}`);
    }
  }
  return names;
}

function stage07SafetyArtifacts() {
  verifySafetyBaselines();
  const artifacts = {};
  for (const relativePath of STAGE_07_SAFETY_ARTIFACTS) {
    const artifactPath = path.resolve(ROOT, relativePath);
    if (!artifactPath.startsWith(`${ROOT}${path.sep}`)) {
      throw new Error(
        `Stage 7 safety artifact escapes the repository: ${relativePath}`
      );
    }
    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Stage 7 safety artifact is missing: ${relativePath}`);
    }
    const bytes = fs.readFileSync(artifactPath);
    artifacts[relativePath] = {
      sha256: sha256(bytes),
      sizeBytes: bytes.length,
    };
  }
  return sorted({
    candidate: "stage-07-foundry-safety",
    artifacts,
  });
}

function validateStage07Candidate(baseline, candidate) {
  if (!valuesEqual(candidate.tests.hardhat, baseline.tests.hardhat)) {
    throw new Error(
      "Stage 7 must preserve the exact 89-test Hardhat oracle inventory"
    );
  }
  const parity = stage06ParityForgeTests();
  if (
    !valuesEqual(
      parity.hardhatLegacyTitles,
      [...baseline.tests.hardhat.names].sort()
    ) ||
    !valuesEqual(
      parity.forgeLegacyTitles,
      [...baseline.tests.forge.names].sort()
    )
  ) {
    throw new Error(
      "Stage 7 parity map must preserve every baseline behavior scenario"
    );
  }
  const safetyNames = stage07SafetyForgeTests();
  const expectedForgeNames = [...parity.forgeNames, ...safetyNames].sort();
  if (new Set(expectedForgeNames).size !== expectedForgeNames.length) {
    throw new Error("Stage 7 safety tests overlap mapped behavior tests");
  }
  if (!valuesEqual(candidate.tests.forge.names, expectedForgeNames)) {
    throw new Error(
      "Stage 7 Forge inventory must exactly match parity plus safety inventories"
    );
  }
  if (
    candidate.tests.forge.count !== expectedForgeNames.length ||
    candidate.tests.total !==
      baseline.tests.hardhat.count + expectedForgeNames.length
  ) {
    throw new Error("Stage 7 combined test counts are inconsistent");
  }
}

function validateStage08Candidate(baseline, candidate) {
  validateStage07Candidate(baseline, candidate);

  if (
    candidate.compiler.version !== STAGE_08_COMPILER_VERSION ||
    candidate.compiler.longVersion !== STAGE_08_COMPILER_LONG_VERSION
  ) {
    throw new Error(
      `Stage 8 requires exact Solidity ${STAGE_08_COMPILER_LONG_VERSION}`
    );
  }
  if (!valuesEqual(candidate.compiler.settings, baseline.compiler.settings)) {
    throw new Error(
      "Stage 8 may change only the compiler version; all compiler settings must remain identical"
    );
  }
}

function validateStage09Candidate(baseline, candidate) {
  validateStage08Candidate(baseline, candidate);
  stage09ProductionEvidence(baseline, candidate);
  stage09ForgeStdEvidence();
}

function fileDigestEvidence(expectedFiles) {
  return sorted(
    Object.fromEntries(
      Object.keys(expectedFiles).map((relativePath) => {
        const absolutePath = path.join(ROOT, relativePath);
        if (!fs.existsSync(absolutePath)) {
          throw new Error(
            `Required provenance file is missing: ${relativePath}`
          );
        }
        return [relativePath, sha256(fs.readFileSync(absolutePath))];
      })
    )
  );
}

function validateExactFileDigests(actual, expected, label) {
  if (!valuesEqual(actual, expected)) {
    const differences = collectDifferences(expected, actual, `$.${label}`);
    throw new Error(
      `${label} provenance changed:\n${differences
        .slice(0, 20)
        .map((difference) => `- ${formatDifference(difference)}`)
        .join("\n")}`
    );
  }
}

function validateExactChangedPaths(actual, expected, label) {
  const normalizedActual = [...new Set(actual)].sort();
  const normalizedExpected = [...new Set(expected)].sort();
  if (!valuesEqual(normalizedActual, normalizedExpected)) {
    const differences = collectDifferences(
      normalizedExpected,
      normalizedActual,
      `$.${label}`
    );
    throw new Error(
      `${label} changed:\n${differences
        .slice(0, 20)
        .map((difference) => `- ${formatDifference(difference)}`)
        .join("\n")}`
    );
  }
  return normalizedActual;
}

function repositoryChangedPaths(baseCommit) {
  const changed = new Set(
    run("git", ["diff", "--name-only", baseCommit])
      .stdout.split(/\r?\n/)
      .filter(Boolean)
  );
  for (const line of run("git", ["status", "--porcelain"]).stdout.split(
    /\r?\n/
  )) {
    if (!line) continue;
    const relativePath = line.slice(3).split(" -> ").pop();
    if (relativePath) changed.add(relativePath);
  }
  return [...changed].sort();
}

function compilerSourceHashes() {
  const buildInfo = findBuildInfo();
  return sorted(
    Object.fromEntries(
      Object.entries(buildInfo.input.sources).map(([source, description]) => {
        if (typeof description.content !== "string") {
          throw new Error(`Compiler source is missing content: ${source}`);
        }
        return [source, sha256(description.content)];
      })
    )
  );
}

function security01ParityEvidence() {
  const files = fileDigestEvidence(SECURITY_01_PARITY_FILES);
  validateExactFileDigests(files, SECURITY_01_PARITY_FILES, "parityFiles");
  return files;
}

function validateSecurity01Inventory(candidate) {
  const hardhatNamesSha256 = sha256(stableJson(candidate.tests.hardhat.names));
  const forgeNamesSha256 = sha256(stableJson(candidate.tests.forge.names));
  if (
    candidate.tests.hardhat.count !== SECURITY_01_HARDHAT_COUNT ||
    candidate.tests.hardhat.names.length !== SECURITY_01_HARDHAT_COUNT ||
    hardhatNamesSha256 !== SECURITY_01_HARDHAT_NAMES_SHA256 ||
    candidate.tests.forge.count !== SECURITY_01_FORGE_COUNT ||
    candidate.tests.forge.names.length !== SECURITY_01_FORGE_COUNT ||
    forgeNamesSha256 !== SECURITY_01_FORGE_NAMES_SHA256 ||
    candidate.tests.total !==
      SECURITY_01_HARDHAT_COUNT + SECURITY_01_FORGE_COUNT
  ) {
    throw new Error(
      "Security 01 must preserve the exact digest-bound Stage 9 Hardhat and Forge inventories"
    );
  }
  security01ParityEvidence();
  return sorted({
    hardhat: {
      count: candidate.tests.hardhat.count,
      namesSha256: hardhatNamesSha256,
    },
    forge: {
      count: candidate.tests.forge.count,
      namesSha256: forgeNamesSha256,
    },
    total: candidate.tests.total,
  });
}

function validateSecurity01HardFields(baseline, candidate) {
  for (const qualifiedName of Object.keys(baseline.contracts)) {
    const baselineContract = baseline.contracts[qualifiedName];
    const candidateContract = candidate.contracts[qualifiedName];
    for (const field of [
      "abi",
      "functions",
      "events",
      "errors",
      "storageLayout",
    ]) {
      if (!valuesEqual(candidateContract?.[field], baselineContract[field])) {
        throw new Error(
          `Security 01 must preserve ${qualifiedName} ${field} exactly`
        );
      }
    }
  }
  for (const field of ["interfaces", "enums", "erc165"]) {
    if (!valuesEqual(candidate[field], baseline[field])) {
      throw new Error(`Security 01 must preserve ${field} exactly`);
    }
  }
  if (!valuesEqual(candidate.compiler.settings, baseline.compiler.settings)) {
    throw new Error("Security 01 must preserve compiler settings exactly");
  }
}

function validateSecurity01Candidate(baseline, candidate) {
  validateSecurity01Inventory(candidate);
  validateStage08Candidate(baseline, candidate);
  stage09ForgeStdEvidence();
  security01SourceEvidence();
  security01BehaviorEvidence(candidate);

  validateSecurity01RevertBinding(
    protectedProjectRevertStrings(),
    candidate.projectRevertStrings
  );

  validateSecurity01HardFields(baseline, candidate);
}

function validateSecurity02Candidate(baseline, candidate) {
  validateSecurity01Inventory(candidate);
  validateStage08Candidate(baseline, candidate);
  stage09ForgeStdEvidence();
  security01CheckpointAnchor();
  security02SourceEvidence();
  security02BehaviorEvidence(candidate);
  validateSecurity02RevertBinding(
    protectedProjectRevertStrings(),
    candidate.projectRevertStrings
  );
  validateSecurity01HardFields(baseline, candidate);
}

function validateSecurity03Candidate(baseline, candidate) {
  validateSecurity01Inventory(candidate);
  validateStage08Candidate(baseline, candidate);
  stage09ForgeStdEvidence();
  security02CheckpointAnchor();
  security03SourceEvidence();
  security03BehaviorEvidence(candidate);
  validateSecurity03RevertBinding(
    protectedProjectRevertStrings(),
    candidate.projectRevertStrings
  );
  validateSecurity01HardFields(baseline, candidate);
}

function validateSecurity04Candidate(baseline, candidate) {
  validateSecurity01Inventory(candidate);
  validateStage08Candidate(baseline, candidate);
  stage09ForgeStdEvidence();
  const checkpoint = security03CheckpointAnchor();
  security04SourceEvidence();
  security04BehaviorEvidence(candidate);
  validateSecurity04RevertBinding(
    protectedProjectRevertStrings(),
    candidate.projectRevertStrings
  );
  validateSecurity01HardFields(baseline, candidate);
  validateSecurity04PCOEquality(baseline, candidate, checkpoint);
}

function validateStage10Candidate(baseline, candidate) {
  stage10CheckpointAnchor();
  stage09ForgeStdEvidence();
  stage10SourceEvidence(candidate);
  stage10ReceiverInventory(candidate);
  if (
    candidate.compiler.version !== STAGE_08_COMPILER_VERSION ||
    candidate.compiler.longVersion !== STAGE_08_COMPILER_LONG_VERSION ||
    !valuesEqual(candidate.compiler.settings, baseline.compiler.settings)
  ) {
    throw new Error(
      "Stage 10 must preserve exact Solidity 0.8.36 and every compiler setting"
    );
  }
  validateSecurity01HardFields(baseline, candidate);
  const expectedReverts = security04ProjectRevertStrings(
    baseline.projectRevertStrings
  );
  if (!valuesEqual(candidate.projectRevertStrings, expectedReverts)) {
    throw new Error(
      "Stage 10 must preserve every Security 04 project-owned revert payload, callsite, and ordering"
    );
  }
  stage10ProductionEvidence(baseline, candidate, stage10CheckpointAnchor());
}

function validateStage11Candidate(baseline, candidate) {
  const checkpoint = stage11CheckpointAnchor();
  stage09ForgeStdEvidence();
  stage11SourceEvidence(candidate);
  stage11TestInventory(candidate);
  validateSecurity01HardFields(baseline, candidate);
  if (
    candidate.compiler.version !== STAGE_08_COMPILER_VERSION ||
    candidate.compiler.longVersion !== STAGE_08_COMPILER_LONG_VERSION ||
    !valuesEqual(candidate.compiler.settings, baseline.compiler.settings)
  ) {
    throw new Error(
      "Stage 11 must preserve exact Solidity 0.8.36 and every compiler setting"
    );
  }
  const expectedReverts = security04ProjectRevertStrings(
    baseline.projectRevertStrings
  );
  if (!valuesEqual(candidate.projectRevertStrings, expectedReverts)) {
    throw new Error(
      "Stage 11 must preserve every Stage 10 project-owned revert payload, callsite, and ordering"
    );
  }
  stage11ProductionEqualityEvidence(baseline, candidate, checkpoint);
  stage11LegacyGasEqualityEvidence(candidate, checkpoint);
}

function validateStage12aCandidate(baseline, candidate) {
  const checkpoint = stage12aCheckpointAnchor();
  stage09ForgeStdEvidence();
  stage12aSourceEvidence(candidate);
  stage12aTestInventory(candidate, checkpoint);
  validateSecurity01HardFields(baseline, candidate);
  if (
    candidate.compiler.version !== STAGE_08_COMPILER_VERSION ||
    candidate.compiler.longVersion !== STAGE_08_COMPILER_LONG_VERSION ||
    !valuesEqual(candidate.compiler.settings, baseline.compiler.settings)
  ) {
    throw new Error(
      "Stage 12a must preserve exact Solidity 0.8.36 and every compiler setting"
    );
  }
  const expectedReverts = security04ProjectRevertStrings(
    baseline.projectRevertStrings
  );
  if (!valuesEqual(candidate.projectRevertStrings, expectedReverts)) {
    throw new Error(
      "Stage 12a must preserve every Stage 11 project-owned revert payload, callsite, and ordering"
    );
  }
  stage12aProductionEqualityEvidence(baseline, candidate, checkpoint);
  stage12aLegacyGasEqualityEvidence(candidate, checkpoint);
}

const REVIEW_POLICIES = Object.freeze({
  "stage-04-source-path-metadata-and-gas": Object.freeze({
    candidate: "stage-04-package-canonical-openzeppelin",
    requiredOpcodeEvidence: Object.freeze({
      mode: "metadata-stripped-equality",
      path: "compatibility/evidence/stage-04-package-canonical-openzeppelin.json",
      contracts: Object.freeze([
        "contracts/Wrapper.sol:Wrapper",
        "contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership",
      ]),
    }),
    permits(reviewPath) {
      return (
        STAGE_04_RAW_BYTECODE_HASH_PATHS.has(reviewPath) ||
        /^\$\.gasSnapshot\.entries\[\d+\]$/.test(reviewPath)
      );
    },
  }),
  "stage-05-openzeppelin-4-9-6-metadata-bytecode": Object.freeze({
    candidate: "stage-05-openzeppelin-4-9-6",
    requiredOpcodeEvidence: Object.freeze({
      mode: "metadata-stripped-equality",
      path: "compatibility/evidence/stage-05-openzeppelin-4-9-6.json",
      contracts: Object.freeze([
        "contracts/Wrapper.sol:Wrapper",
        "contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership",
      ]),
    }),
    permits(reviewPath) {
      return (
        STAGE_05_RAW_BYTECODE_HASH_PATHS.has(reviewPath) ||
        reviewPath === "$.gasSnapshot.entries[11]"
      );
    },
  }),
  "stage-06-forge-parity-expansion": Object.freeze({
    candidate: "stage-06-forge-parity",
    requiredOpcodeEvidence: Object.freeze({
      mode: "metadata-stripped-equality",
      path: "compatibility/evidence/stage-06-forge-parity.json",
      contracts: Object.freeze([
        "contracts/Wrapper.sol:Wrapper",
        "contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership",
      ]),
    }),
    permits(reviewPath) {
      return (
        STAGE_05_RAW_BYTECODE_HASH_PATHS.has(reviewPath) ||
        reviewPath === "$.gasSnapshot.entries[11]" ||
        reviewPath === "$.tests.total" ||
        STAGE_06_FORGE_TEST_PATH.test(reviewPath)
      );
    },
    permitsProtectedPath(reviewPath) {
      return (
        reviewPath === "$.tests.total" ||
        STAGE_06_FORGE_TEST_PATH.test(reviewPath)
      );
    },
    validateCandidate: validateStage06Candidate,
  }),
  "stage-07-foundry-safety-expansion": Object.freeze({
    candidate: "stage-07-foundry-safety",
    requiredOpcodeEvidence: Object.freeze({
      mode: "metadata-stripped-equality",
      path: "compatibility/evidence/stage-07-foundry-safety.json",
      contracts: Object.freeze([
        "contracts/Wrapper.sol:Wrapper",
        "contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership",
      ]),
    }),
    requiredSafetyEvidence: Object.freeze({
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    }),
    permits(reviewPath) {
      return (
        STAGE_05_RAW_BYTECODE_HASH_PATHS.has(reviewPath) ||
        reviewPath === "$.gasSnapshot.entries[11]" ||
        reviewPath === "$.toolchain.forge[2]" ||
        reviewPath === "$.tests.total" ||
        STAGE_06_FORGE_TEST_PATH.test(reviewPath)
      );
    },
    permitsProtectedPath(reviewPath) {
      return (
        reviewPath === "$.tests.total" ||
        STAGE_06_FORGE_TEST_PATH.test(reviewPath)
      );
    },
    validateCandidate: validateStage07Candidate,
  }),
  "stage-08-solidity-0-8-36-compiler": Object.freeze({
    candidate: "stage-08-solidity-0-8-36",
    requiredOpcodeEvidence: Object.freeze({
      mode: "metadata-stripped-full-diff",
      path: STAGE_08_OPCODE_EVIDENCE_PATH,
      contracts: STAGE_08_PRODUCTION_CONTRACTS,
    }),
    requiredSafetyEvidence: Object.freeze({
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    }),
    permits(reviewPath) {
      return (
        reviewPath === "$.compiler.version" ||
        reviewPath === "$.compiler.longVersion" ||
        STAGE_08_BYTECODE_PATH.test(reviewPath) ||
        STAGE_08_GAS_SNAPSHOT_PATH.test(reviewPath) ||
        reviewPath === "$.toolchain.forge[2]" ||
        reviewPath === "$.tests.total" ||
        STAGE_06_FORGE_TEST_PATH.test(reviewPath)
      );
    },
    permitsProtectedPath(reviewPath) {
      return (
        reviewPath === "$.tests.total" ||
        STAGE_06_FORGE_TEST_PATH.test(reviewPath)
      );
    },
    validateCandidate: validateStage08Candidate,
  }),
  "stage-09-forge-std-1-16-2": Object.freeze({
    candidate: STAGE_09_CANDIDATE,
    requiredOpcodeEvidence: Object.freeze({
      mode: "stage-08-production-equality",
      path: STAGE_09_OPCODE_EVIDENCE_PATH,
      contracts: STAGE_08_PRODUCTION_CONTRACTS,
    }),
    requiredSafetyEvidence: Object.freeze({
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    }),
    requiredStage08Evidence: Object.freeze({
      path: STAGE_08_OPCODE_EVIDENCE_PATH,
      sha256: STAGE_08_EVIDENCE_SHA256,
    }),
    requiredForgeStdEvidence: Object.freeze({
      path: STAGE_09_FORGE_STD_PATH,
      previousCommit: STAGE_09_FORGE_STD_PREVIOUS_COMMIT,
      candidateCommit: STAGE_09_FORGE_STD_COMMIT,
      tag: STAGE_09_FORGE_STD_TAG,
      packageVersion: STAGE_09_FORGE_STD_VERSION,
    }),
    permits(reviewPath) {
      const gasMatch = reviewPath.match(/^\$\.gasSnapshot\.entries\[(\d+)\]$/);
      return (
        reviewPath === "$.compiler.version" ||
        reviewPath === "$.compiler.longVersion" ||
        STAGE_08_BYTECODE_PATH.test(reviewPath) ||
        (gasMatch && STAGE_09_RELATIVE_GAS_PATHS.has(Number(gasMatch[1]))) ||
        reviewPath === "$.toolchain.forge[2]" ||
        reviewPath === "$.tests.total" ||
        STAGE_06_FORGE_TEST_PATH.test(reviewPath)
      );
    },
    permitsProtectedPath(reviewPath) {
      return (
        reviewPath === "$.tests.total" ||
        STAGE_06_FORGE_TEST_PATH.test(reviewPath)
      );
    },
    validateCandidate: validateStage09Candidate,
  }),
  [SECURITY_01_POLICY]: Object.freeze({
    candidate: SECURITY_01_CANDIDATE,
    requiredOpcodeEvidence: Object.freeze({
      mode: "security-01-stage-09-relative-full-diff",
      path: SECURITY_01_EVIDENCE_PATH,
      contracts: STAGE_08_PRODUCTION_CONTRACTS,
    }),
    requiredSafetyEvidence: Object.freeze({
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    }),
    requiredStage09Evidence: Object.freeze({
      path: STAGE_09_OPCODE_EVIDENCE_PATH,
      sha256: STAGE_09_EVIDENCE_SHA256,
    }),
    requiredBehaviorEvidence: SECURITY_01_BEHAVIOR_EVIDENCE,
    permits(reviewPath) {
      return (
        STAGE_08_BYTECODE_PATH.test(reviewPath) ||
        STAGE_08_GAS_SNAPSHOT_PATH.test(reviewPath) ||
        /^\$\.projectRevertStrings(?:\.|\[|$)/.test(reviewPath)
      );
    },
    permitsProtectedPath(reviewPath, protectedDomain) {
      return (
        protectedDomain === "project-owned revert strings" &&
        /^\$\.projectRevertStrings(?:\.|\[|$)/.test(reviewPath)
      );
    },
    validateCandidate: validateSecurity01Candidate,
  }),
  [SECURITY_02_POLICY]: Object.freeze({
    candidate: SECURITY_02_CANDIDATE,
    requiredOpcodeEvidence: Object.freeze({
      mode: "security-02-security-01-relative-full-diff",
      path: SECURITY_02_EVIDENCE_PATH,
      contracts: STAGE_08_PRODUCTION_CONTRACTS,
    }),
    requiredSafetyEvidence: Object.freeze({
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    }),
    requiredSecurity01Checkpoint: SECURITY_02_CHECKPOINT_BINDING,
    requiredBehaviorEvidence: SECURITY_02_BEHAVIOR_EVIDENCE,
    permits(reviewPath) {
      return (
        STAGE_08_BYTECODE_PATH.test(reviewPath) ||
        STAGE_08_GAS_SNAPSHOT_PATH.test(reviewPath) ||
        /^\$\.projectRevertStrings(?:\.|\[|$)/.test(reviewPath)
      );
    },
    permitsProtectedPath(reviewPath, protectedDomain) {
      return (
        protectedDomain === "project-owned revert strings" &&
        /^\$\.projectRevertStrings(?:\.|\[|$)/.test(reviewPath)
      );
    },
    validateCandidate: validateSecurity02Candidate,
  }),
  [SECURITY_03_POLICY]: Object.freeze({
    candidate: SECURITY_03_CANDIDATE,
    requiredOpcodeEvidence: Object.freeze({
      mode: "security-03-security-02-relative-full-diff",
      path: SECURITY_03_EVIDENCE_PATH,
      contracts: STAGE_08_PRODUCTION_CONTRACTS,
    }),
    requiredSafetyEvidence: Object.freeze({
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    }),
    requiredSecurity02Checkpoint: SECURITY_03_CHECKPOINT_BINDING,
    requiredBehaviorEvidence: SECURITY_03_BEHAVIOR_EVIDENCE,
    permits(reviewPath) {
      return (
        STAGE_08_BYTECODE_PATH.test(reviewPath) ||
        STAGE_08_GAS_SNAPSHOT_PATH.test(reviewPath) ||
        /^\$\.projectRevertStrings(?:\.|\[|$)/.test(reviewPath)
      );
    },
    permitsProtectedPath(reviewPath, protectedDomain) {
      return (
        protectedDomain === "project-owned revert strings" &&
        /^\$\.projectRevertStrings(?:\.|\[|$)/.test(reviewPath)
      );
    },
    validateCandidate: validateSecurity03Candidate,
  }),
  [SECURITY_04_POLICY]: Object.freeze({
    candidate: SECURITY_04_CANDIDATE,
    requiredOpcodeEvidence: Object.freeze({
      mode: "security-04-security-03-relative-wrapper-only",
      path: SECURITY_04_EVIDENCE_PATH,
      contracts: STAGE_08_PRODUCTION_CONTRACTS,
    }),
    requiredSafetyEvidence: Object.freeze({
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    }),
    requiredSecurity03Checkpoint: SECURITY_04_CHECKPOINT_BINDING,
    requiredBehaviorEvidence: SECURITY_04_BEHAVIOR_EVIDENCE,
    permits(reviewPath) {
      return (
        SECURITY_04_WRAPPER_BYTECODE_PATH.test(reviewPath) ||
        STAGE_08_GAS_SNAPSHOT_PATH.test(reviewPath)
      );
    },
    validateCandidate: validateSecurity04Candidate,
  }),
  [STAGE_10_POLICY]: Object.freeze({
    candidate: STAGE_10_CANDIDATE,
    requiredOpcodeEvidence: Object.freeze({
      mode: "stage-10-security-04-relative-full-diff",
      path: STAGE_10_EVIDENCE_PATH,
      contracts: STAGE_08_PRODUCTION_CONTRACTS,
    }),
    requiredSafetyEvidence: Object.freeze({
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    }),
    requiredSecurity04Checkpoint: STAGE_10_CHECKPOINT_BINDING,
    requiresStage10ReceiverEvidence: true,
    permits(reviewPath) {
      return (
        STAGE_10_BYTECODE_PATH.test(reviewPath) ||
        STAGE_08_GAS_SNAPSHOT_PATH.test(reviewPath)
      );
    },
    validateCandidate: validateStage10Candidate,
  }),
  [STAGE_11_POLICY]: Object.freeze({
    candidate: STAGE_11_CANDIDATE,
    requiredOpcodeEvidence: Object.freeze({
      mode: "stage-11-stage-10-production-equality",
      path: STAGE_11_EVIDENCE_PATH,
      contracts: STAGE_08_PRODUCTION_CONTRACTS,
    }),
    requiredSafetyEvidence: Object.freeze({
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    }),
    requiredStage10Checkpoint: STAGE_11_CHECKPOINT_BINDING,
    requiresStage11SmokeEvidence: true,
    permits(reviewPath) {
      return (
        /^\$\.tests\.hardhat(?:\.|\[|$)/.test(reviewPath) ||
        reviewPath === "$.tests.total"
      );
    },
    permitsProtectedPath(reviewPath, protectedDomain) {
      return (
        protectedDomain === "the executed behavior-test inventory" &&
        (/^\$\.tests\.hardhat(?:\.|\[|$)/.test(reviewPath) ||
          reviewPath === "$.tests.total")
      );
    },
    validateCandidate: validateStage11Candidate,
  }),
  [STAGE_12A_POLICY]: Object.freeze({
    candidate: STAGE_12A_CANDIDATE,
    requiredOpcodeEvidence: Object.freeze({
      mode: "stage-12a-stage-11-production-equality",
      path: STAGE_12A_EVIDENCE_PATH,
      contracts: STAGE_08_PRODUCTION_CONTRACTS,
    }),
    requiredSafetyEvidence: Object.freeze({
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    }),
    requiredStage11Checkpoint: STAGE_12A_CHECKPOINT_BINDING,
    requiresStage12aMigrationEvidence: true,
    permits() {
      return false;
    },
    validateCandidate: validateStage12aCandidate,
  }),
});

const NON_WAIVABLE_REVIEW_PATHS = [
  {
    name: "contract ABI, functions, events, errors, or storage layout",
    pattern:
      /^\$\.contracts\..+\.(?:abi|functions|events|errors|storageLayout)(?:\.|\[|$)/,
  },
  {
    name: "interfaces, enums, or ERC165 results",
    pattern: /^\$\.(?:interfaces|enums|erc165)(?:\.|\[|$)/,
  },
  {
    name: "project-owned revert strings",
    pattern: /^\$\.projectRevertStrings(?:\.|\[|$)/,
  },
  {
    name: "the executed behavior-test inventory",
    pattern: /^\$\.tests(?:\.|\[|$)/,
  },
];

const OPCODES = {
  0x00: "STOP",
  0x01: "ADD",
  0x02: "MUL",
  0x03: "SUB",
  0x04: "DIV",
  0x05: "SDIV",
  0x06: "MOD",
  0x07: "SMOD",
  0x08: "ADDMOD",
  0x09: "MULMOD",
  0x0a: "EXP",
  0x0b: "SIGNEXTEND",
  0x10: "LT",
  0x11: "GT",
  0x12: "SLT",
  0x13: "SGT",
  0x14: "EQ",
  0x15: "ISZERO",
  0x16: "AND",
  0x17: "OR",
  0x18: "XOR",
  0x19: "NOT",
  0x1a: "BYTE",
  0x1b: "SHL",
  0x1c: "SHR",
  0x1d: "SAR",
  0x20: "KECCAK256",
  0x30: "ADDRESS",
  0x31: "BALANCE",
  0x32: "ORIGIN",
  0x33: "CALLER",
  0x34: "CALLVALUE",
  0x35: "CALLDATALOAD",
  0x36: "CALLDATASIZE",
  0x37: "CALLDATACOPY",
  0x38: "CODESIZE",
  0x39: "CODECOPY",
  0x3a: "GASPRICE",
  0x3b: "EXTCODESIZE",
  0x3c: "EXTCODECOPY",
  0x3d: "RETURNDATASIZE",
  0x3e: "RETURNDATACOPY",
  0x3f: "EXTCODEHASH",
  0x40: "BLOCKHASH",
  0x41: "COINBASE",
  0x42: "TIMESTAMP",
  0x43: "NUMBER",
  0x44: "PREVRANDAO",
  0x45: "GASLIMIT",
  0x46: "CHAINID",
  0x47: "SELFBALANCE",
  0x48: "BASEFEE",
  0x49: "BLOBHASH",
  0x4a: "BLOBBASEFEE",
  0x50: "POP",
  0x51: "MLOAD",
  0x52: "MSTORE",
  0x53: "MSTORE8",
  0x54: "SLOAD",
  0x55: "SSTORE",
  0x56: "JUMP",
  0x57: "JUMPI",
  0x58: "PC",
  0x59: "MSIZE",
  0x5a: "GAS",
  0x5b: "JUMPDEST",
  0x5c: "TLOAD",
  0x5d: "TSTORE",
  0x5e: "MCOPY",
  0x5f: "PUSH0",
  0xf0: "CREATE",
  0xf1: "CALL",
  0xf2: "CALLCODE",
  0xf3: "RETURN",
  0xf4: "DELEGATECALL",
  0xf5: "CREATE2",
  0xfa: "STATICCALL",
  0xfd: "REVERT",
  0xfe: "INVALID",
  0xff: "SELFDESTRUCT",
};

for (let i = 1; i <= 32; i += 1) OPCODES[0x5f + i] = `PUSH${i}`;
for (let i = 1; i <= 16; i += 1) OPCODES[0x7f + i] = `DUP${i}`;
for (let i = 1; i <= 16; i += 1) OPCODES[0x8f + i] = `SWAP${i}`;
for (let i = 0; i <= 4; i += 1) OPCODES[0xa0 + i] = `LOG${i}`;

function hardhatBinary() {
  if (process.env.HARDHAT_BIN) return process.env.HARDHAT_BIN;
  const extension = process.platform === "win32" ? ".cmd" : "";
  return path.join(ROOT, "node_modules", ".bin", `hardhat${extension}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
    maxBuffer: 128 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    throw new Error(
      `${command} ${args.join(" ")} failed with status ${
        result.status
      }\n${output}`
    );
  }

  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sorted(value[key])])
    );
  }
  return value;
}

function stableJson(value) {
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function protectedProjectRevertStrings() {
  if (!fs.existsSync(PROJECT_REVERT_STRINGS_PATH)) {
    throw new Error("Project revert-string baseline is missing");
  }
  const bytes = fs.readFileSync(PROJECT_REVERT_STRINGS_PATH);
  const digest = sha256(bytes);
  if (digest !== PROJECT_REVERT_STRINGS_SHA256) {
    throw new Error(
      `Project revert-string baseline digest changed: expected ${PROJECT_REVERT_STRINGS_SHA256}, received ${digest}`
    );
  }
  const baseline = JSON.parse(bytes);
  if (
    baseline.schemaVersion !== 1 ||
    baseline.baselineSourceCommit !== BASELINE_SOURCE_COMMIT ||
    !Array.isArray(baseline.entries) ||
    baseline.entries.length !== 35
  ) {
    throw new Error("Project revert-string baseline has an invalid schema");
  }
  return baseline.entries;
}

function security01ProjectRevertStrings(baselineEntries) {
  const entries = deepClone(baselineEntries);
  const zeroAddressIndex = entries.findIndex(
    (entry) =>
      entry.source === SECURITY_01_ERC721_SOURCE &&
      entry.contract === "ERC721" &&
      entry.callable === "_transfer(address,address,uint256)" &&
      entry.callKind === "require" &&
      entry.ordinal === 1 &&
      entry.value === "ERC721: transfer to the zero address"
  );
  const ownerEntry = entries[zeroAddressIndex - 1];
  if (
    zeroAddressIndex < 1 ||
    ownerEntry.source !== SECURITY_01_ERC721_SOURCE ||
    ownerEntry.contract !== "ERC721" ||
    ownerEntry.callable !== "_transfer(address,address,uint256)" ||
    ownerEntry.callKind !== "require" ||
    ownerEntry.ordinal !== 0 ||
    ownerEntry.value !== SECURITY_01_REVERT_VALUE
  ) {
    throw new Error(
      "Security 01 could not locate the exact protected ERC721 transfer reverts"
    );
  }
  entries.splice(zeroAddressIndex + 1, 0, {
    source: SECURITY_01_ERC721_SOURCE,
    contract: "ERC721",
    callable: "_transfer(address,address,uint256)",
    callKind: "require",
    ordinal: 2,
    value: SECURITY_01_REVERT_VALUE,
  });
  return entries;
}

function validateSecurity01RevertBinding(baselineEntries, candidateEntries) {
  const expected = security01ProjectRevertStrings(baselineEntries);
  if (!valuesEqual(candidateEntries, expected)) {
    throw new Error(
      "Security 01 permits exactly one duplicate ERC721 incorrect-owner revert callsite"
    );
  }
}

function security02ProjectRevertStrings(baselineEntries) {
  const checkpointEntries = security01ProjectRevertStrings(baselineEntries);
  if (
    checkpointEntries.some((entry) => entry.source === SECURITY_02_PCO_SOURCE)
  ) {
    throw new Error(
      "Security 02 expected no project-owned PCO revert at its Security 01 checkpoint"
    );
  }
  const wrapperIndex = checkpointEntries.findIndex(
    (entry) => entry.source === "contracts/Wrapper.sol"
  );
  if (
    wrapperIndex < 1 ||
    checkpointEntries[wrapperIndex - 1].source !==
      "contracts/token/modules/Taxation.sol"
  ) {
    throw new Error(
      "Security 02 could not locate the exact PCO revert insertion boundary"
    );
  }
  checkpointEntries.splice(wrapperIndex, 0, {
    source: SECURITY_02_PCO_SOURCE,
    contract: "PartialCommonOwnership",
    callable:
      "_mint(uint256,address,uint256,uint256,address payable,uint256,uint256)",
    callKind: "require",
    ordinal: 0,
    value: "ERC721: transfer to non ERC721Receiver implementer",
  });
  return checkpointEntries;
}

function validateSecurity02RevertBinding(baselineEntries, candidateEntries) {
  const expected = security02ProjectRevertStrings(baselineEntries);
  if (!valuesEqual(candidateEntries, expected)) {
    throw new Error(
      "Security 02 permits exactly one PCO receiver-check revert callsite with the existing ERC721 payload"
    );
  }
}

function security03ProjectRevertStrings(baselineEntries) {
  const checkpointEntries = security02ProjectRevertStrings(baselineEntries);
  const takeoverEntries = checkpointEntries.filter(
    (entry) =>
      entry.source === SECURITY_03_LEASE_SOURCE &&
      entry.contract === "Lease" &&
      entry.callable === "takeoverLease(uint256,uint256,uint256)" &&
      entry.callKind === "require"
  );
  const expectedCheckpointValues = [
    "Token is locked",
    "Current valuation is incorrect",
    "New valuation cannot be zero",
    "New valuation must be >= current valuation",
    "Msg contains value",
    "Msg contains surplus value",
    "Message does not contain surplus value for deposit",
    "Buyer is already owner",
  ];
  if (
    takeoverEntries.length !== expectedCheckpointValues.length ||
    !valuesEqual(
      takeoverEntries.map((entry) => entry.value),
      expectedCheckpointValues
    ) ||
    !valuesEqual(
      takeoverEntries.map((entry) => entry.ordinal),
      expectedCheckpointValues.map((_value, index) => index)
    )
  ) {
    throw new Error(
      "Security 03 could not locate the exact Security 02 takeover revert ordering"
    );
  }
  const firstIndex = checkpointEntries.indexOf(takeoverEntries[0]);
  if (
    !takeoverEntries.every(
      (entry, index) => checkpointEntries[firstIndex + index] === entry
    )
  ) {
    throw new Error("Security 03 takeover revert callsites are not contiguous");
  }
  const candidateValues = [
    ...expectedCheckpointValues.slice(0, 4),
    "Buyer is already owner",
    ...expectedCheckpointValues.slice(4, 7),
  ];
  const reordered = candidateValues.map((value, ordinal) => ({
    ...takeoverEntries.find((entry) => entry.value === value),
    ordinal,
  }));
  checkpointEntries.splice(firstIndex, takeoverEntries.length, ...reordered);
  return checkpointEntries;
}

function validateSecurity03RevertBinding(baselineEntries, candidateEntries) {
  const expected = security03ProjectRevertStrings(baselineEntries);
  if (!valuesEqual(candidateEntries, expected)) {
    throw new Error(
      "Security 03 permits only the reviewed takeover revert-callsite ordering; every payload and callsite must remain exact"
    );
  }
}

function security04ProjectRevertStrings(baselineEntries) {
  return security03ProjectRevertStrings(baselineEntries);
}

function validateSecurity04RevertBinding(baselineEntries, candidateEntries) {
  const expected = security04ProjectRevertStrings(baselineEntries);
  if (!valuesEqual(candidateEntries, expected)) {
    throw new Error(
      "Security 04 must preserve every Security 03 project-owned revert string and callsite exactly"
    );
  }
}

function validateSecurity01ChangedPaths(changedPaths) {
  const unexpected = changedPaths.filter(
    (relativePath) =>
      relativePath !== SECURITY_01_ERC721_SOURCE &&
      relativePath !== "scripts/compatibility.js" &&
      !relativePath.startsWith("compatibility/") &&
      !relativePath.startsWith("docs/") &&
      !relativePath.startsWith("test/")
  );
  if (unexpected.length > 0) {
    throw new Error(
      `Security 01 contains unauthorized repository changes: ${unexpected.join(
        ", "
      )}`
    );
  }
}

function security01ChangedPaths() {
  const changed = new Set(
    run("git", ["diff", "--name-only", SECURITY_01_BASE_COMMIT])
      .stdout.split(/\r?\n/)
      .filter(Boolean)
  );
  for (const line of run("git", ["status", "--porcelain"]).stdout.split(
    /\r?\n/
  )) {
    if (!line) continue;
    const relativePath = line.slice(3).split(" -> ").pop();
    if (relativePath) changed.add(relativePath);
  }
  const paths = [...changed].sort();
  validateSecurity01ChangedPaths(paths);
  return paths;
}

function validateSecurity01ConfigEvidence(files) {
  validateExactFileDigests(files, SECURITY_01_CONFIG_FILES, "configFiles");
}

function security01ConfigEvidence() {
  const files = fileDigestEvidence(SECURITY_01_CONFIG_FILES);
  validateSecurity01ConfigEvidence(files);
  return files;
}

function validateSecurity02ChangedPaths(actual) {
  const permittedStates = [
    SECURITY_02_CORE_CHANGED_PATHS,
    [
      ...SECURITY_02_CORE_CHANGED_PATHS,
      "compatibility/reviewed-differences.json",
    ],
    SECURITY_02_FINAL_CHANGED_PATHS,
  ].map((paths) => [...new Set(paths)].sort());
  const normalized = [...new Set(actual)].sort();
  if (!permittedStates.some((expected) => valuesEqual(normalized, expected))) {
    const expected = SECURITY_02_FINAL_CHANGED_PATHS;
    const differences = collectDifferences(
      expected,
      normalized,
      "$.security02ChangedPaths"
    );
    throw new Error(
      `Security 02 repository changes differ from its exact core/review/evidence states:\n${differences
        .slice(0, 20)
        .map((difference) => `- ${formatDifference(difference)}`)
        .join("\n")}`
    );
  }
  return [...SECURITY_02_FINAL_CHANGED_PATHS];
}

function security02BoundFileEvidence() {
  const files = fileDigestEvidence(SECURITY_02_BOUND_FILES);
  validateExactFileDigests(files, SECURITY_02_BOUND_FILES, "security02Files");
  return files;
}

function security02ConfigEvidence() {
  const files = fileDigestEvidence(SECURITY_02_CONFIG_FILES);
  validateExactFileDigests(files, SECURITY_02_CONFIG_FILES, "configFiles");
  return files;
}

function validateSecurity02CompilerSourceEvidence(evidence) {
  if (
    evidence.sourceCount !== SECURITY_02_COMPILER_SOURCE_COUNT ||
    evidence.sourceNamesSha256 !== SECURITY_02_COMPILER_SOURCE_NAMES_SHA256 ||
    evidence.security01ClosureSha256 !==
      SECURITY_01_COMPILER_CANDIDATE_CLOSURE_SHA256 ||
    evidence.candidateClosureSha256 !==
      SECURITY_02_COMPILER_CANDIDATE_CLOSURE_SHA256 ||
    !valuesEqual(evidence.addedSources, [SECURITY_02_FIXTURE_SOURCE]) ||
    !valuesEqual(evidence.changedSources, [
      {
        path: SECURITY_02_ERC721_SOURCE,
        security01Sha256: SECURITY_02_ERC721_BASE_SHA256,
        candidateSha256: SECURITY_02_ERC721_CANDIDATE_SHA256,
      },
      {
        path: SECURITY_02_PCO_SOURCE,
        security01Sha256: SECURITY_02_PCO_BASE_SHA256,
        candidateSha256: SECURITY_02_PCO_CANDIDATE_SHA256,
      },
    ])
  ) {
    throw new Error(
      "Security 02 compiler source closure differs from the exact Security 01 closure plus its two production edits and one fixture"
    );
  }
}

function security02CompilerSourceEvidence() {
  const sourceHashes = compilerSourceHashes();
  if (
    sourceHashes[SECURITY_02_ERC721_SOURCE] !==
      SECURITY_02_ERC721_CANDIDATE_SHA256 ||
    sourceHashes[SECURITY_02_PCO_SOURCE] !== SECURITY_02_PCO_CANDIDATE_SHA256 ||
    sourceHashes[SECURITY_02_FIXTURE_SOURCE] !== SECURITY_02_FIXTURE_SHA256
  ) {
    throw new Error(
      "Security 02 compiler input is missing an exact authorized source"
    );
  }
  const security01Hashes = { ...sourceHashes };
  delete security01Hashes[SECURITY_02_FIXTURE_SOURCE];
  security01Hashes[SECURITY_02_ERC721_SOURCE] = SECURITY_02_ERC721_BASE_SHA256;
  security01Hashes[SECURITY_02_PCO_SOURCE] = SECURITY_02_PCO_BASE_SHA256;

  const evidence = sorted({
    sourceCount: Object.keys(sourceHashes).length,
    sourceNamesSha256: sha256(stableJson(Object.keys(sourceHashes).sort())),
    security01ClosureSha256: sha256(stableJson(security01Hashes)),
    candidateClosureSha256: sha256(stableJson(sourceHashes)),
    addedSources: [SECURITY_02_FIXTURE_SOURCE],
    changedSources: [
      {
        path: SECURITY_02_ERC721_SOURCE,
        security01Sha256: SECURITY_02_ERC721_BASE_SHA256,
        candidateSha256: SECURITY_02_ERC721_CANDIDATE_SHA256,
      },
      {
        path: SECURITY_02_PCO_SOURCE,
        security01Sha256: SECURITY_02_PCO_BASE_SHA256,
        candidateSha256: SECURITY_02_PCO_CANDIDATE_SHA256,
      },
    ],
  });
  validateSecurity02CompilerSourceEvidence(evidence);
  return evidence;
}

function security02SourceEvidence() {
  security01CheckpointAnchor();
  return sorted({
    checkpoint: SECURITY_02_CHECKPOINT_BINDING,
    production: security02ProductionSourceEvidence(),
    changedPaths: validateSecurity02ChangedPaths(
      repositoryChangedPaths(SECURITY_02_BASE_COMMIT)
    ),
    boundFiles: security02BoundFileEvidence(),
    configFiles: security02ConfigEvidence(),
    compilerSources: security02CompilerSourceEvidence(),
  });
}

function validateSecurity03ChangedPaths(actual) {
  const permittedStates = [
    SECURITY_03_CORE_CHANGED_PATHS,
    [
      ...SECURITY_03_CORE_CHANGED_PATHS,
      "compatibility/reviewed-differences.json",
    ],
    SECURITY_03_FINAL_CHANGED_PATHS,
  ].map((paths) => [...new Set(paths)].sort());
  const normalized = [...new Set(actual)].sort();
  if (!permittedStates.some((expected) => valuesEqual(normalized, expected))) {
    const differences = collectDifferences(
      SECURITY_03_FINAL_CHANGED_PATHS,
      normalized,
      "$.security03ChangedPaths"
    );
    throw new Error(
      `Security 03 repository changes differ from its exact core/review/evidence states:\n${differences
        .slice(0, 20)
        .map((difference) => `- ${formatDifference(difference)}`)
        .join("\n")}`
    );
  }
  return [...SECURITY_03_FINAL_CHANGED_PATHS];
}

function security03BoundFileEvidence() {
  const files = fileDigestEvidence(SECURITY_03_BOUND_FILES);
  validateExactFileDigests(files, SECURITY_03_BOUND_FILES, "security03Files");
  return files;
}

function security03ConfigEvidence() {
  const files = fileDigestEvidence(SECURITY_03_CONFIG_FILES);
  validateExactFileDigests(files, SECURITY_03_CONFIG_FILES, "configFiles");
  return files;
}

function validateSecurity03CompilerSourceEvidence(evidence) {
  if (
    evidence.sourceCount !== SECURITY_03_COMPILER_SOURCE_COUNT ||
    evidence.sourceNamesSha256 !== SECURITY_03_COMPILER_SOURCE_NAMES_SHA256 ||
    evidence.security02ClosureSha256 !==
      SECURITY_02_COMPILER_CANDIDATE_CLOSURE_SHA256 ||
    evidence.candidateClosureSha256 !==
      SECURITY_03_COMPILER_CANDIDATE_CLOSURE_SHA256 ||
    !valuesEqual(evidence.addedSources, []) ||
    !valuesEqual(evidence.removedSources, []) ||
    !valuesEqual(evidence.changedSources, [
      {
        path: SECURITY_03_LEASE_SOURCE,
        security02Sha256: SECURITY_03_LEASE_BASE_SHA256,
        candidateSha256: SECURITY_03_LEASE_CANDIDATE_SHA256,
      },
      {
        path: SECURITY_03_TAXATION_SOURCE,
        security02Sha256: SECURITY_03_TAXATION_BASE_SHA256,
        candidateSha256: SECURITY_03_TAXATION_CANDIDATE_SHA256,
      },
    ])
  ) {
    throw new Error(
      "Security 03 compiler source closure differs from the exact Security 02 closure plus its two authorized production edits"
    );
  }
}

function security03CompilerSourceEvidence() {
  const sourceHashes = compilerSourceHashes();
  if (
    sourceHashes[SECURITY_03_LEASE_SOURCE] !==
      SECURITY_03_LEASE_CANDIDATE_SHA256 ||
    sourceHashes[SECURITY_03_TAXATION_SOURCE] !==
      SECURITY_03_TAXATION_CANDIDATE_SHA256
  ) {
    throw new Error(
      "Security 03 compiler input is missing an exact authorized production source"
    );
  }
  const security02Hashes = { ...sourceHashes };
  security02Hashes[SECURITY_03_LEASE_SOURCE] = SECURITY_03_LEASE_BASE_SHA256;
  security02Hashes[SECURITY_03_TAXATION_SOURCE] =
    SECURITY_03_TAXATION_BASE_SHA256;
  const evidence = sorted({
    sourceCount: Object.keys(sourceHashes).length,
    sourceNamesSha256: sha256(stableJson(Object.keys(sourceHashes).sort())),
    security02ClosureSha256: sha256(stableJson(security02Hashes)),
    candidateClosureSha256: sha256(stableJson(sourceHashes)),
    addedSources: [],
    removedSources: [],
    changedSources: [
      {
        path: SECURITY_03_LEASE_SOURCE,
        security02Sha256: SECURITY_03_LEASE_BASE_SHA256,
        candidateSha256: SECURITY_03_LEASE_CANDIDATE_SHA256,
      },
      {
        path: SECURITY_03_TAXATION_SOURCE,
        security02Sha256: SECURITY_03_TAXATION_BASE_SHA256,
        candidateSha256: SECURITY_03_TAXATION_CANDIDATE_SHA256,
      },
    ],
  });
  validateSecurity03CompilerSourceEvidence(evidence);
  return evidence;
}

function security03SourceEvidence() {
  security02CheckpointAnchor();
  return sorted({
    checkpoint: SECURITY_03_CHECKPOINT_BINDING,
    production: security03ProductionSourceEvidence(),
    changedPaths: validateSecurity03ChangedPaths(
      repositoryChangedPaths(SECURITY_03_BASE_COMMIT)
    ),
    boundFiles: security03BoundFileEvidence(),
    configFiles: security03ConfigEvidence(),
    compilerSources: security03CompilerSourceEvidence(),
  });
}

function validateSecurity04ChangedPaths(actual) {
  const permittedStates = [
    SECURITY_04_CORE_CHANGED_PATHS,
    [
      ...SECURITY_04_CORE_CHANGED_PATHS,
      "compatibility/reviewed-differences.json",
    ],
    SECURITY_04_FINAL_CHANGED_PATHS,
  ].map((paths) => [...new Set(paths)].sort());
  const normalized = [...new Set(actual)].sort();
  if (!permittedStates.some((expected) => valuesEqual(normalized, expected))) {
    const differences = collectDifferences(
      SECURITY_04_FINAL_CHANGED_PATHS,
      normalized,
      "$.security04ChangedPaths"
    );
    throw new Error(
      `Security 04 repository changes differ from its exact core/review/evidence states:\n${differences
        .slice(0, 20)
        .map((difference) => `- ${formatDifference(difference)}`)
        .join("\n")}`
    );
  }
  return [...SECURITY_04_FINAL_CHANGED_PATHS];
}

function security04BoundFileEvidence() {
  const files = fileDigestEvidence(SECURITY_04_BOUND_FILES);
  validateExactFileDigests(files, SECURITY_04_BOUND_FILES, "security04Files");
  return files;
}

function security04ConfigEvidence() {
  const files = fileDigestEvidence(SECURITY_04_CONFIG_FILES);
  validateExactFileDigests(files, SECURITY_04_CONFIG_FILES, "configFiles");
  return files;
}

function validateSecurity04CompilerSourceEvidence(evidence) {
  if (
    evidence.sourceCount !== SECURITY_04_COMPILER_SOURCE_COUNT ||
    evidence.sourceNamesSha256 !== SECURITY_04_COMPILER_SOURCE_NAMES_SHA256 ||
    evidence.security03ClosureSha256 !==
      SECURITY_03_COMPILER_CANDIDATE_CLOSURE_SHA256 ||
    evidence.candidateClosureSha256 !==
      SECURITY_04_COMPILER_CANDIDATE_CLOSURE_SHA256 ||
    !valuesEqual(evidence.addedSources, []) ||
    !valuesEqual(evidence.removedSources, []) ||
    !valuesEqual(evidence.changedSources, [
      {
        path: SECURITY_04_WRAPPER_SOURCE,
        security03Sha256: SECURITY_04_WRAPPER_BASE_SHA256,
        candidateSha256: SECURITY_04_WRAPPER_CANDIDATE_SHA256,
      },
    ])
  ) {
    throw new Error(
      "Security 04 compiler source closure differs from the exact Security 03 closure plus its one authorized Wrapper edit"
    );
  }
}

function security04CompilerSourceEvidence() {
  const sourceHashes = compilerSourceHashes();
  if (
    sourceHashes[SECURITY_04_WRAPPER_SOURCE] !==
    SECURITY_04_WRAPPER_CANDIDATE_SHA256
  ) {
    throw new Error(
      "Security 04 compiler input is missing the exact authorized Wrapper source"
    );
  }
  const security03Hashes = { ...sourceHashes };
  security03Hashes[SECURITY_04_WRAPPER_SOURCE] =
    SECURITY_04_WRAPPER_BASE_SHA256;
  const evidence = sorted({
    sourceCount: Object.keys(sourceHashes).length,
    sourceNamesSha256: sha256(stableJson(Object.keys(sourceHashes).sort())),
    security03ClosureSha256: sha256(stableJson(security03Hashes)),
    candidateClosureSha256: sha256(stableJson(sourceHashes)),
    addedSources: [],
    removedSources: [],
    changedSources: [
      {
        path: SECURITY_04_WRAPPER_SOURCE,
        security03Sha256: SECURITY_04_WRAPPER_BASE_SHA256,
        candidateSha256: SECURITY_04_WRAPPER_CANDIDATE_SHA256,
      },
    ],
  });
  validateSecurity04CompilerSourceEvidence(evidence);
  return evidence;
}

function security04SourceEvidence() {
  security03CheckpointAnchor();
  return sorted({
    checkpoint: SECURITY_04_CHECKPOINT_BINDING,
    production: security04ProductionSourceEvidence(),
    changedPaths: validateSecurity04ChangedPaths(
      repositoryChangedPaths(SECURITY_04_BASE_COMMIT)
    ),
    boundFiles: security04BoundFileEvidence(),
    configFiles: security04ConfigEvidence(),
    compilerSources: security04CompilerSourceEvidence(),
  });
}

function validateStage10FrozenConstants() {
  if (
    STAGE_10_COMPILER_SOURCE_COUNT <= 0 ||
    STAGE_10_COMPILER_SOURCE_NAMES_SHA256 === "TO_BE_FROZEN" ||
    STAGE_10_COMPILER_CLOSURE_SHA256 === "TO_BE_FROZEN" ||
    STAGE_10_SECURITY_04_COMPILER_SOURCE_NAMES.length !==
      SECURITY_04_COMPILER_SOURCE_COUNT ||
    Object.keys(STAGE_10_BOUND_FILES).length === 0 ||
    STAGE_10_CORE_CHANGED_PATHS.length === 0 ||
    STAGE_10_FINAL_CHANGED_PATHS.length === 0
  ) {
    throw new Error(
      "Stage 10 candidate provenance has not been frozen after the implementation settled"
    );
  }
}

function validateStage10ChangedPaths(actual) {
  validateStage10FrozenConstants();
  const permittedStates = [
    STAGE_10_CORE_CHANGED_PATHS,
    [...STAGE_10_CORE_CHANGED_PATHS, "compatibility/reviewed-differences.json"],
    STAGE_10_FINAL_CHANGED_PATHS,
  ].map((paths) => [...new Set(paths)].sort());
  const normalized = [...new Set(actual)].sort();
  if (!permittedStates.some((expected) => valuesEqual(normalized, expected))) {
    const differences = collectDifferences(
      STAGE_10_FINAL_CHANGED_PATHS,
      normalized,
      "$.stage10ChangedPaths"
    );
    throw new Error(
      `Stage 10 repository changes differ from its exact core/review/evidence states:\n${differences
        .slice(0, 30)
        .map((difference) => `- ${formatDifference(difference)}`)
        .join("\n")}`
    );
  }
  return [...STAGE_10_FINAL_CHANGED_PATHS];
}

function stage10BoundFileEvidence() {
  validateStage10FrozenConstants();
  const files = fileDigestEvidence(STAGE_10_BOUND_FILES);
  validateExactFileDigests(files, STAGE_10_BOUND_FILES, "stage10Files");
  return files;
}

function stage10DependencyEvidence() {
  const packagePath = path.join(ROOT, "package.json");
  const lockPath = path.join(ROOT, "pnpm-lock.yaml");
  const installedPackagePath = path.join(
    ROOT,
    "node_modules",
    "@openzeppelin",
    "contracts",
    "package.json"
  );
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const lock = fs.readFileSync(lockPath, "utf8");
  const installedPackage = JSON.parse(
    fs.readFileSync(installedPackagePath, "utf8")
  );
  if (
    packageJson.dependencies?.["@openzeppelin/contracts"] !==
      STAGE_10_OPENZEPPELIN_VERSION ||
    installedPackage.version !== STAGE_10_OPENZEPPELIN_VERSION
  ) {
    throw new Error(
      `Stage 10 requires exact @openzeppelin/contracts ${STAGE_10_OPENZEPPELIN_VERSION} in package.json and node_modules`
    );
  }
  const escapedVersion = STAGE_10_OPENZEPPELIN_VERSION.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
  const escapedIntegrity = STAGE_10_OPENZEPPELIN_INTEGRITY.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
  const importerPattern = new RegExp(
    "'@openzeppelin/contracts':\\n\\s+specifier: " +
      escapedVersion +
      "\\n\\s+version: " +
      escapedVersion
  );
  const packagePattern = new RegExp(
    "'@openzeppelin/contracts@" +
      escapedVersion +
      "':\\n\\s+resolution: \\{integrity: " +
      escapedIntegrity +
      "\\}"
  );
  const snapshotPattern = new RegExp(
    "'@openzeppelin/contracts@" + escapedVersion + "': \\{\\}"
  );
  if (
    !importerPattern.test(lock) ||
    !packagePattern.test(lock) ||
    !snapshotPattern.test(lock) ||
    /@openzeppelin\/contracts@4\.9\.6/.test(lock)
  ) {
    throw new Error(
      "Stage 10 pnpm lock does not contain the exact OpenZeppelin 5.6.1 importer, integrity, and snapshot"
    );
  }
  return sorted({
    name: "@openzeppelin/contracts",
    previousVersion: "4.9.6",
    candidateVersion: STAGE_10_OPENZEPPELIN_VERSION,
    registryIntegrity: STAGE_10_OPENZEPPELIN_INTEGRITY,
    packageJsonSha256: sha256(fs.readFileSync(packagePath)),
    lockfileSha256: sha256(fs.readFileSync(lockPath)),
    installedPackageJsonSha256: sha256(fs.readFileSync(installedPackagePath)),
  });
}

function stage10ProductionPragmaEvidence() {
  const sources = {};
  for (const relativePath of STAGE_10_PRODUCTION_SOURCES) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
    const pragmas = source.match(/^pragma solidity [^;]+;/gm) || [];
    if (
      pragmas.length !== 1 ||
      pragmas[0] !== `pragma solidity ${STAGE_10_PRODUCTION_PRAGMA};`
    ) {
      throw new Error(
        `Stage 10 shipped source must use exactly ${STAGE_10_PRODUCTION_PRAGMA}: ${relativePath}`
      );
    }
    sources[relativePath] = {
      pragma: STAGE_10_PRODUCTION_PRAGMA,
      sha256: sha256(source),
    };
  }
  const erc721 = fs.readFileSync(
    path.join(ROOT, STAGE_10_ERC721_SOURCE),
    "utf8"
  );
  const codeLengthOccurrences =
    erc721.match(/if \(to\.code\.length > 0\) \{/g)?.length || 0;
  if (
    codeLengthOccurrences !== 1 ||
    /\.isContract\s*\(/.test(erc721) ||
    /@openzeppelin\/contracts\/utils\/(?:Address|Strings)\.sol/.test(erc721) ||
    /using\s+(?:Address|Strings)\s+for/.test(erc721)
  ) {
    throw new Error(
      "Stage 10 ERC721 must use one to.code.length receiver branch and no Address/Strings import or using declaration"
    );
  }
  return sorted({
    requiredPragma: STAGE_10_PRODUCTION_PRAGMA,
    sources,
    receiverDetection: {
      sourcePath: STAGE_10_ERC721_SOURCE,
      expression: "to.code.length > 0",
      occurrences: codeLengthOccurrences,
      addressImport: false,
      stringsImport: false,
      inheritedOpenZeppelinERC721: false,
    },
  });
}

function solidityImports(source) {
  const imports = [];
  const pattern = /import\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']\s*;/g;
  let match;
  while ((match = pattern.exec(source)) !== null) imports.push(match[1]);
  return imports;
}

function resolveCompilerImport(fromSource, importPath, sourceHashes) {
  const resolved = importPath.startsWith(".")
    ? path.posix.normalize(
        path.posix.join(path.posix.dirname(fromSource), importPath)
      )
    : importPath;
  if (!Object.prototype.hasOwnProperty.call(sourceHashes, resolved)) {
    throw new Error(
      `Stage 10 compiler closure cannot resolve ${importPath} from ${fromSource}`
    );
  }
  return resolved;
}

function stage10ProductionImportClosure(sourceHashes) {
  const pending = [...STAGE_10_PRODUCTION_SOURCES];
  const visited = new Set();
  const buildInfo = findBuildInfo();
  while (pending.length > 0) {
    const sourceName = pending.pop();
    if (visited.has(sourceName)) continue;
    const source = buildInfo.input.sources[sourceName]?.content;
    if (typeof source !== "string") {
      throw new Error(
        `Stage 10 production import source is absent from compiler input: ${sourceName}`
      );
    }
    visited.add(sourceName);
    for (const imported of solidityImports(source)) {
      pending.push(resolveCompilerImport(sourceName, imported, sourceHashes));
    }
  }
  const names = [...visited].sort();
  const openzeppelin = names.filter((name) =>
    name.startsWith("@openzeppelin/contracts/")
  );
  if (
    !valuesEqual(
      openzeppelin,
      [...STAGE_10_EXPECTED_PRODUCTION_OPENZEPPELIN_IMPORTS].sort()
    ) ||
    openzeppelin.some((name) =>
      /\/ERC721\.sol$|\/Address\.sol$|\/Strings\.sol$/.test(name)
    )
  ) {
    throw new Error(
      `Stage 10 production OpenZeppelin import closure changed: ${openzeppelin.join(
        ", "
      )}`
    );
  }
  return sorted({
    names,
    namesSha256: sha256(stableJson(names)),
    sourceHashes: Object.fromEntries(
      names.map((name) => [name, sourceHashes[name]])
    ),
    openzeppelin,
  });
}

function stage10CompilerSourceEvidence() {
  validateStage10FrozenConstants();
  const sourceHashes = compilerSourceHashes();
  const names = Object.keys(sourceHashes).sort();
  const addedSources = names.filter(
    (name) => !STAGE_10_SECURITY_04_COMPILER_SOURCE_NAMES.includes(name)
  );
  const removedSources = STAGE_10_SECURITY_04_COMPILER_SOURCE_NAMES.filter(
    (name) => !names.includes(name)
  );
  if (
    !valuesEqual(addedSources, [...STAGE_10_COMPILER_ADDED_SOURCES]) ||
    !valuesEqual(removedSources, [...STAGE_10_COMPILER_REMOVED_SOURCES])
  ) {
    throw new Error(
      "Stage 10 compiler source additions/removals differ from the exact Security 04 to OpenZeppelin 5.6.1 closure change"
    );
  }
  const projectSourceChanges = names
    .filter((name) => name.startsWith("contracts/"))
    .map((sourcePath) => {
      let security04Sha256 = null;
      const result = spawnSync(
        "git",
        ["show", `${STAGE_10_BASE_COMMIT}:${sourcePath}`],
        {
          cwd: ROOT,
          encoding: "utf8",
          env: process.env,
          maxBuffer: 16 * 1024 * 1024,
        }
      );
      if (result.status === 0) security04Sha256 = sha256(result.stdout);
      if (result.error) throw result.error;
      return {
        path: sourcePath,
        security04Sha256,
        candidateSha256: sourceHashes[sourcePath],
        changed: security04Sha256 !== sourceHashes[sourcePath],
      };
    })
    .filter((entry) => entry.changed);
  const evidence = sorted({
    sourceCount: names.length,
    sourceNames: names,
    sourceNamesSha256: sha256(stableJson(names)),
    candidateClosureSha256: sha256(stableJson(sourceHashes)),
    security04SourceCount: STAGE_10_SECURITY_04_COMPILER_SOURCE_NAMES.length,
    security04SourceNamesSha256: sha256(
      stableJson(STAGE_10_SECURITY_04_COMPILER_SOURCE_NAMES)
    ),
    security04ClosureSha256: SECURITY_04_COMPILER_CANDIDATE_CLOSURE_SHA256,
    addedSources,
    removedSources,
    changedProjectSources: projectSourceChanges,
    completeSourceHashes: sourceHashes,
    productionImportClosure: stage10ProductionImportClosure(sourceHashes),
  });
  if (
    evidence.sourceCount !== STAGE_10_COMPILER_SOURCE_COUNT ||
    evidence.sourceNamesSha256 !== STAGE_10_COMPILER_SOURCE_NAMES_SHA256 ||
    evidence.candidateClosureSha256 !== STAGE_10_COMPILER_CLOSURE_SHA256
  ) {
    throw new Error(
      "Stage 10 Hardhat compiler-input closure differs from its exact frozen OpenZeppelin 5.6.1 closure"
    );
  }
  return evidence;
}

function stage10ReceiverInventory(candidate) {
  const inventoryPath = path.join(ROOT, STAGE_10_RECEIVER_INVENTORY_PATH);
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  if (
    inventory.schemaVersion !== 1 ||
    inventory.candidate !== STAGE_10_CANDIDATE ||
    !Array.isArray(inventory.names) ||
    !Array.isArray(inventory.cases) ||
    inventory.names.length !== inventory.expectedTestCount ||
    inventory.cases.length !== inventory.expectedCaseCount ||
    inventory.expectedTestCount !== 1 ||
    inventory.expectedCaseCount !== 5 ||
    inventory.inventoryChange !== "none"
  ) {
    throw new Error("Stage 10 receiver inventory has an invalid schema");
  }
  const names = [...new Set(inventory.names)].sort();
  if (
    names.length !== inventory.names.length ||
    !valuesEqual(names, [...inventory.names].sort())
  ) {
    throw new Error(
      "Stage 10 receiver inventory must contain one unique retained test name"
    );
  }
  const sourceNames = [...new Set(names.map((name) => name.split(":")[0]))];
  if (sourceNames.length !== 1 || sourceNames[0] !== inventory.sourcePath) {
    throw new Error(
      "Stage 10 receiver tests must remain in their one owned source"
    );
  }
  const sourceBytes = fs.readFileSync(path.join(ROOT, inventory.sourcePath));
  const sourceSha256 = sha256(sourceBytes);
  if (sourceSha256 !== inventory.sourceSha256) {
    throw new Error("Stage 10 receiver test source digest changed");
  }
  const candidateForgeNames = candidate.tests.forge.names;
  if (
    !names.every((name) => candidateForgeNames.includes(name)) ||
    candidateForgeNames.length !== SECURITY_01_FORGE_COUNT ||
    sha256(stableJson(candidateForgeNames)) !==
      SECURITY_01_FORGE_NAMES_SHA256 ||
    candidate.tests.forge.count !== SECURITY_01_FORGE_COUNT ||
    candidate.tests.hardhat.count !== SECURITY_01_HARDHAT_COUNT ||
    sha256(stableJson(candidate.tests.hardhat.names)) !==
      SECURITY_01_HARDHAT_NAMES_SHA256 ||
    candidate.tests.total !==
      SECURITY_01_HARDHAT_COUNT + SECURITY_01_FORGE_COUNT
  ) {
    throw new Error(
      "Stage 10 must retain all 89 Hardhat and 140 Forge identifiers while strengthening the reviewed receiver test"
    );
  }
  return sorted({
    path: STAGE_10_RECEIVER_INVENTORY_PATH,
    sha256: sha256(fs.readFileSync(inventoryPath)),
    sourcePath: inventory.sourcePath,
    sourceSha256,
    names,
    cases: inventory.cases,
    retainedHardhat: {
      count: SECURITY_01_HARDHAT_COUNT,
      namesSha256: SECURITY_01_HARDHAT_NAMES_SHA256,
    },
    retainedForge: {
      count: SECURITY_01_FORGE_COUNT,
      namesSha256: SECURITY_01_FORGE_NAMES_SHA256,
    },
    candidateForgeCount: candidate.tests.forge.count,
    inventoryChange: "none",
  });
}

function stage10ReceiverReviewEvidence() {
  const inventoryPath = path.join(ROOT, STAGE_10_RECEIVER_INVENTORY_PATH);
  const inventoryBytes = fs.readFileSync(inventoryPath);
  const inventory = JSON.parse(inventoryBytes);
  const sourceBytes = fs.readFileSync(path.join(ROOT, inventory.sourcePath));
  return sorted({
    path: STAGE_10_RECEIVER_INVENTORY_PATH,
    sha256: sha256(inventoryBytes),
    sourcePath: inventory.sourcePath,
    sourceSha256: sha256(sourceBytes),
    names: inventory.names,
  });
}

function stage10SourceEvidence(candidate) {
  stage10CheckpointAnchor();
  return sorted({
    checkpoint: STAGE_10_CHECKPOINT_BINDING,
    changedPaths: validateStage10ChangedPaths(
      repositoryChangedPaths(STAGE_10_BASE_COMMIT)
    ),
    boundFiles: stage10BoundFileEvidence(),
    dependency: stage10DependencyEvidence(),
    productionPragmas: stage10ProductionPragmaEvidence(),
    compilerSources: stage10CompilerSourceEvidence(),
    receiverTests: stage10ReceiverInventory(candidate),
    compatibilityRunnerSha256: sha256(
      fs.readFileSync(path.join(ROOT, "scripts", "compatibility.js"))
    ),
  });
}

function validateStage11FrozenConstants() {
  if (
    Object.keys(STAGE_11_BOUND_FILES).length === 0 ||
    STAGE_11_CORE_CHANGED_PATHS.length === 0 ||
    STAGE_11_FINAL_CHANGED_PATHS.length === 0
  ) {
    throw new Error(
      "Stage 11 candidate provenance has not been frozen after the smoke and package implementation settled"
    );
  }
}

function validateStage11ChangedPaths(actual) {
  validateStage11FrozenConstants();
  const permittedStates = [
    STAGE_11_CORE_CHANGED_PATHS,
    [...STAGE_11_CORE_CHANGED_PATHS, "compatibility/reviewed-differences.json"],
    STAGE_11_FINAL_CHANGED_PATHS,
  ].map((paths) => [...new Set(paths)].sort());
  const normalized = [...new Set(actual)].sort();
  if (!permittedStates.some((expected) => valuesEqual(normalized, expected))) {
    const differences = collectDifferences(
      STAGE_11_FINAL_CHANGED_PATHS,
      normalized,
      "$.stage11ChangedPaths"
    );
    throw new Error(
      `Stage 11 repository changes differ from its exact core/review/evidence states:\n${differences
        .slice(0, 30)
        .map((difference) => `- ${formatDifference(difference)}`)
        .join("\n")}`
    );
  }
  return [...STAGE_11_FINAL_CHANGED_PATHS];
}

function stage11BoundFileEvidence() {
  validateStage11FrozenConstants();
  const files = fileDigestEvidence(STAGE_11_BOUND_FILES);
  validateExactFileDigests(files, STAGE_11_BOUND_FILES, "stage11Files");
  return files;
}

function stage11SmokeInventoryDefinition(inventoryOverride = null) {
  const inventoryPath = path.join(ROOT, STAGE_11_SMOKE_INVENTORY_PATH);
  const bytes = inventoryOverride
    ? Buffer.from(stableJson(inventoryOverride))
    : fs.readFileSync(inventoryPath);
  const inventory = inventoryOverride || JSON.parse(bytes);
  if (
    inventory.schemaVersion !== 1 ||
    inventory.candidate !== STAGE_11_CANDIDATE ||
    inventory.stage10Checkpoint !== STAGE_11_BASE_COMMIT ||
    inventory.historicalHardhat?.count !== STAGE_11_HISTORICAL_HARDHAT_COUNT ||
    inventory.historicalHardhat?.namesSha256 !==
      STAGE_11_HISTORICAL_HARDHAT_NAMES_SHA256 ||
    inventory.activeHardhat?.count !== 3 ||
    !Array.isArray(inventory.activeHardhat?.names) ||
    inventory.activeHardhat.names.length !== 3 ||
    inventory.activeHardhat.sourcePath !== "tests/Interoperability.smoke.ts" ||
    !/^[0-9a-f]{64}$/.test(inventory.activeHardhat.sourceSha256 || "") ||
    inventory.forge?.count !== STAGE_11_FORGE_COUNT ||
    inventory.forge?.namesSha256 !== STAGE_11_FORGE_NAMES_SHA256 ||
    inventory.parity?.mappedBehaviorCount !== 104 ||
    inventory.parity?.safetyCount !== 36 ||
    !valuesEqual(inventory.deletedLegacyFiles, STAGE_11_DELETED_LEGACY_TESTS)
  ) {
    throw new Error("Stage 11 Hardhat smoke inventory has an invalid schema");
  }
  const names = [...new Set(inventory.activeHardhat.names)].sort();
  if (
    names.length !== 3 ||
    !valuesEqual(names, inventory.activeHardhat.names)
  ) {
    throw new Error(
      "Stage 11 requires exactly three unique sorted smoke names"
    );
  }
  const sourceBytes = fs.readFileSync(
    path.join(ROOT, inventory.activeHardhat.sourcePath)
  );
  if (sha256(sourceBytes) !== inventory.activeHardhat.sourceSha256) {
    throw new Error("Stage 11 Hardhat smoke source digest changed");
  }
  for (const [relativePath, expectedSha256] of Object.entries(
    STAGE_11_DELETED_LEGACY_TESTS
  )) {
    if (fs.existsSync(path.join(ROOT, relativePath))) {
      throw new Error(
        `Stage 11 legacy behavior file still exists: ${relativePath}`
      );
    }
    const checkpointBytes = Buffer.from(
      run("git", ["show", `${STAGE_11_BASE_COMMIT}:${relativePath}`]).stdout
    );
    if (sha256(checkpointBytes) !== expectedSha256) {
      throw new Error(
        `Stage 11 historical source anchor changed: ${relativePath}`
      );
    }
  }
  const parityFiles = security01ParityEvidence();
  if (!valuesEqual(inventory.parity.files, parityFiles)) {
    throw new Error("Stage 11 parity/safety provenance digests changed");
  }
  return sorted({
    ...inventory,
    path: STAGE_11_SMOKE_INVENTORY_PATH,
    sha256: sha256(bytes),
  });
}

function stage11TestInventory(candidate) {
  const inventory = stage11SmokeInventoryDefinition();
  const parity = stage06ParityForgeTests();
  const safety = stage07SafetyForgeTests();
  if (
    parity.forgeNames.length !== 104 ||
    safety.length !== 36 ||
    new Set([...parity.forgeNames, ...safety]).size !== STAGE_11_FORGE_COUNT
  ) {
    throw new Error(
      "Stage 11 must preserve exactly 104 parity and 36 safety tests"
    );
  }
  if (
    candidate.tests.hardhat.count !== 3 ||
    !valuesEqual(
      candidate.tests.hardhat.names,
      inventory.activeHardhat.names
    ) ||
    candidate.tests.forge.count !== STAGE_11_FORGE_COUNT ||
    candidate.tests.forge.names.length !== STAGE_11_FORGE_COUNT ||
    sha256(stableJson(candidate.tests.forge.names)) !==
      STAGE_11_FORGE_NAMES_SHA256 ||
    candidate.tests.total !== 3 + STAGE_11_FORGE_COUNT
  ) {
    throw new Error(
      "Stage 11 active inventory must be exactly three Hardhat smokes plus all 140 Forge tests"
    );
  }
  const historical = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")).tests
    .hardhat;
  if (
    historical.count !== STAGE_11_HISTORICAL_HARDHAT_COUNT ||
    historical.names.length !== STAGE_11_HISTORICAL_HARDHAT_COUNT ||
    sha256(stableJson(historical.names)) !==
      STAGE_11_HISTORICAL_HARDHAT_NAMES_SHA256 ||
    !valuesEqual(parity.hardhatLegacyTitles, [...historical.names].sort())
  ) {
    throw new Error("Stage 11 historical 89-Hardhat provenance changed");
  }
  return sorted({
    activeHardhat: candidate.tests.hardhat,
    forge: {
      count: candidate.tests.forge.count,
      namesSha256: sha256(stableJson(candidate.tests.forge.names)),
      mappedBehaviorCount: parity.forgeNames.length,
      safetyCount: safety.length,
    },
    historicalHardhat: {
      count: historical.count,
      namesSha256: sha256(stableJson(historical.names)),
      parityMapped: true,
    },
    smokeInventory: inventory,
    total: candidate.tests.total,
  });
}

function stage11SmokeReviewEvidence() {
  const inventory = stage11SmokeInventoryDefinition();
  return sorted({
    path: inventory.path,
    sha256: inventory.sha256,
    sourcePath: inventory.activeHardhat.sourcePath,
    sourceSha256: inventory.activeHardhat.sourceSha256,
    names: inventory.activeHardhat.names,
    deletedLegacyFiles: inventory.deletedLegacyFiles,
    historicalNamesSha256: inventory.historicalHardhat.namesSha256,
  });
}

function stage11ProductionSourceEquality(checkpoint) {
  const expected = checkpoint.evidence.value.sourceAndPackage;
  const sources = {};
  for (const relativePath of STAGE_10_PRODUCTION_SOURCES) {
    const actualSha256 = sha256(fs.readFileSync(path.join(ROOT, relativePath)));
    const expectedSha256 =
      expected.productionPragmas.sources[relativePath]?.sha256;
    if (!expectedSha256 || actualSha256 !== expectedSha256) {
      throw new Error(
        `Stage 11 production source differs from Stage 10: ${relativePath}`
      );
    }
    sources[relativePath] = { sha256: actualSha256, equal: true };
  }
  return sorted(sources);
}

function stage11DependencyEquality(checkpoint) {
  const stage10 = checkpoint.evidence.value.sourceAndPackage.dependency;
  const candidate = stage10DependencyEvidence();
  for (const field of [
    "name",
    "candidateVersion",
    "registryIntegrity",
    "lockfileSha256",
    "installedPackageJsonSha256",
  ]) {
    if (candidate[field] !== stage10[field]) {
      throw new Error(`Stage 11 dependency evidence changed: ${field}`);
    }
  }
  return sorted({
    name: candidate.name,
    version: candidate.candidateVersion,
    registryIntegrity: candidate.registryIntegrity,
    lockfileSha256: candidate.lockfileSha256,
    installedPackageJsonSha256: candidate.installedPackageJsonSha256,
    packageManifest: {
      stage10Sha256: stage10.packageJsonSha256,
      candidateSha256: candidate.packageJsonSha256,
      dependencyEqual: true,
      scriptsMayChange: true,
    },
  });
}

function stage11CompilerSourceEquality(checkpoint) {
  const expected = checkpoint.evidence.value.sourceAndPackage.compilerSources;
  const sourceHashes = compilerSourceHashes();
  const names = Object.keys(sourceHashes).sort();
  const actual = {
    sourceCount: names.length,
    sourceNamesSha256: sha256(stableJson(names)),
    candidateClosureSha256: sha256(stableJson(sourceHashes)),
    completeSourceHashes: sourceHashes,
    productionImportClosure: stage10ProductionImportClosure(sourceHashes),
  };
  for (const field of [
    "sourceCount",
    "sourceNamesSha256",
    "candidateClosureSha256",
    "completeSourceHashes",
    "productionImportClosure",
  ]) {
    if (!valuesEqual(actual[field], expected[field])) {
      throw new Error(`Stage 11 compiler source closure changed: ${field}`);
    }
  }
  return sorted({ ...actual, equalToStage10: true });
}

function stage11SourceEvidence(candidate) {
  const checkpoint = stage11CheckpointAnchor();
  return sorted({
    checkpoint: STAGE_11_CHECKPOINT_BINDING,
    changedPaths: validateStage11ChangedPaths(
      repositoryChangedPaths(STAGE_11_BASE_COMMIT)
    ),
    boundFiles: stage11BoundFileEvidence(),
    productionSources: stage11ProductionSourceEquality(checkpoint),
    dependency: stage11DependencyEquality(checkpoint),
    compilerSources: stage11CompilerSourceEquality(checkpoint),
    tests: stage11TestInventory(candidate),
    compatibilityRunnerSha256: sha256(
      fs.readFileSync(path.join(ROOT, "scripts", "compatibility.js"))
    ),
    parityRunnerSha256: sha256(
      fs.readFileSync(path.join(ROOT, "scripts", "check-parity.js"))
    ),
  });
}

function validateStage12aFrozenConstants() {
  if (
    STAGE_12A_ETHERS_INTEGRITY === "TO_BE_FROZEN" ||
    STAGE_12A_HARDHAT_ETHERS_INTEGRITY === "TO_BE_FROZEN" ||
    STAGE_12A_LOCKFILE_SHA256 === "TO_BE_FROZEN" ||
    STAGE_12A_PACKAGE_SHA256 === "TO_BE_FROZEN" ||
    STAGE_12A_EXPECTED_PACKAGE_DIFFERENCE_PATHS.length === 0 ||
    Object.keys(STAGE_12A_BOUND_FILES).length === 0 ||
    STAGE_12A_CORE_CHANGED_PATHS.length === 0 ||
    STAGE_12A_FINAL_CHANGED_PATHS.length === 0
  ) {
    throw new Error(
      "Stage 12a candidate provenance has not been frozen after the ethers 6 migration settled"
    );
  }
}

function validateStage12aChangedPaths(actual) {
  validateStage12aFrozenConstants();
  const permittedStates = [
    STAGE_12A_CORE_CHANGED_PATHS,
    [
      ...STAGE_12A_CORE_CHANGED_PATHS,
      "compatibility/reviewed-differences.json",
    ],
    STAGE_12A_FINAL_CHANGED_PATHS,
  ].map((paths) => [...new Set(paths)].sort());
  const normalized = [...new Set(actual)].sort();
  if (!permittedStates.some((expected) => valuesEqual(normalized, expected))) {
    const differences = collectDifferences(
      STAGE_12A_FINAL_CHANGED_PATHS,
      normalized,
      "$.stage12aChangedPaths"
    );
    throw new Error(
      `Stage 12a repository changes differ from its exact core/review/evidence states:\n${differences
        .slice(0, 30)
        .map((difference) => `- ${formatDifference(difference)}`)
        .join("\n")}`
    );
  }
  return [...STAGE_12A_FINAL_CHANGED_PATHS];
}

function stage12aBoundFileEvidence() {
  validateStage12aFrozenConstants();
  const files = fileDigestEvidence(STAGE_12A_BOUND_FILES);
  validateExactFileDigests(files, STAGE_12A_BOUND_FILES, "stage12aFiles");
  return files;
}

function stage12aToolingInventory(checkpoint = stage12aCheckpointAnchor()) {
  const inventoryPath = path.join(ROOT, STAGE_12A_INVENTORY_PATH);
  const bytes = fs.readFileSync(inventoryPath);
  const inventory = JSON.parse(bytes);
  const expectedHardhat =
    checkpoint.evidence.value.sourceAndTestCutover.tests.activeHardhat;
  if (
    sha256(bytes) !== STAGE_12A_INVENTORY_SHA256 ||
    inventory.schemaVersion !== 1 ||
    inventory.candidate !== STAGE_12A_CANDIDATE ||
    inventory.stage11Checkpoint !== STAGE_12A_BASE_COMMIT ||
    inventory.inheritedStage11?.inventoryPath !==
      STAGE_11_SMOKE_INVENTORY_PATH ||
    inventory.inheritedStage11?.inventorySha256 !==
      "abea926d3e3cf7928a7693565aa01c2e59c22e442ce97c4a0271c7be46095cf4" ||
    inventory.inheritedStage11?.hardhatNamesSha256 !==
      sha256(stableJson(expectedHardhat.names)) ||
    inventory.inheritedStage11?.smokeSourceSha256 !==
      checkpoint.evidence.value.sourceAndTestCutover.tests.smokeInventory
        .activeHardhat.sourceSha256 ||
    !valuesEqual(inventory.activeHardhat.names, expectedHardhat.names) ||
    inventory.activeHardhat.count !== expectedHardhat.count ||
    inventory.activeHardhat.sourcePath !== "tests/Interoperability.smoke.ts" ||
    inventory.forge?.count !== STAGE_11_FORGE_COUNT ||
    inventory.forge?.namesSha256 !== STAGE_11_FORGE_NAMES_SHA256 ||
    inventory.tooling?.hardhat !== STAGE_12A_HARDHAT_VERSION ||
    inventory.tooling?.ethers !== STAGE_12A_ETHERS_VERSION ||
    inventory.tooling?.hardhatEthers !== STAGE_12A_HARDHAT_ETHERS_VERSION ||
    inventory.parity?.mappedBehaviorCount !== 104 ||
    inventory.parity?.safetyCount !== 36 ||
    !valuesEqual(inventory.parity?.files, security01ParityEvidence())
  ) {
    throw new Error("Stage 12a ethers 6 smoke/tooling inventory is invalid");
  }
  const sourceBytes = fs.readFileSync(
    path.join(ROOT, inventory.activeHardhat.sourcePath)
  );
  if (sha256(sourceBytes) !== inventory.activeHardhat.sourceSha256) {
    throw new Error("Stage 12a ethers 6 smoke source digest changed");
  }
  const expectedToolingPaths = [
    "hardhat.config.d.ts",
    "hardhat.config.ts",
    "package.json",
    "pnpm-lock.yaml",
    "tsconfig.json",
  ];
  if (
    !valuesEqual(
      Object.keys(inventory.tooling.files).sort(),
      expectedToolingPaths
    )
  ) {
    throw new Error("Stage 12a tooling inventory paths changed");
  }
  for (const relativePath of expectedToolingPaths) {
    if (
      sha256(fs.readFileSync(path.join(ROOT, relativePath))) !==
      inventory.tooling.files[relativePath]
    ) {
      throw new Error(`Stage 12a tooling digest changed: ${relativePath}`);
    }
  }
  return sorted({
    ...inventory,
    path: STAGE_12A_INVENTORY_PATH,
    sha256: sha256(bytes),
  });
}

function stage12aTestInventory(
  candidate,
  checkpoint = stage12aCheckpointAnchor()
) {
  const toolingInventory = stage12aToolingInventory(checkpoint);
  const expectedHardhat =
    checkpoint.evidence.value.sourceAndTestCutover.tests.activeHardhat;
  const parity = stage06ParityForgeTests();
  const safety = stage07SafetyForgeTests();
  const expectedForgeNames = [...parity.forgeNames, ...safety].sort();
  if (
    expectedHardhat.count !== 3 ||
    expectedHardhat.names.length !== 3 ||
    sha256(stableJson(expectedHardhat.names)) !==
      sha256(stableJson(candidate.tests.hardhat.names)) ||
    !valuesEqual(candidate.tests.hardhat, expectedHardhat) ||
    !valuesEqual(
      candidate.tests.hardhat.names,
      toolingInventory.activeHardhat.names
    ) ||
    expectedForgeNames.length !== STAGE_11_FORGE_COUNT ||
    sha256(stableJson(expectedForgeNames)) !== STAGE_11_FORGE_NAMES_SHA256 ||
    !valuesEqual(candidate.tests.forge.names, expectedForgeNames) ||
    candidate.tests.forge.count !== STAGE_11_FORGE_COUNT ||
    candidate.tests.total !== 3 + STAGE_11_FORGE_COUNT
  ) {
    throw new Error(
      "Stage 12a must preserve exactly the three Stage 11 Hardhat smokes and all 140 Forge identifiers"
    );
  }
  return sorted({
    hardhat: {
      count: candidate.tests.hardhat.count,
      names: candidate.tests.hardhat.names,
      namesSha256: sha256(stableJson(candidate.tests.hardhat.names)),
    },
    forge: {
      count: candidate.tests.forge.count,
      namesSha256: sha256(stableJson(candidate.tests.forge.names)),
      mappedBehaviorCount: parity.forgeNames.length,
      safetyCount: safety.length,
    },
    total: candidate.tests.total,
    toolingInventory,
  });
}

function stage12aProductionSourceEquality(checkpoint) {
  const expected =
    checkpoint.evidence.value.sourceAndTestCutover.productionSources;
  const sources = {};
  for (const relativePath of STAGE_10_PRODUCTION_SOURCES) {
    const actualSha256 = sha256(fs.readFileSync(path.join(ROOT, relativePath)));
    const expectedSha256 = expected[relativePath]?.sha256;
    if (!expectedSha256 || actualSha256 !== expectedSha256) {
      throw new Error(
        `Stage 12a production source differs from Stage 11: ${relativePath}`
      );
    }
    sources[relativePath] = { sha256: actualSha256, equal: true };
  }
  return sorted(sources);
}

function stage12aCompilerSourceEquality(checkpoint) {
  const expected =
    checkpoint.evidence.value.sourceAndTestCutover.compilerSources;
  const sourceHashes = compilerSourceHashes();
  const names = Object.keys(sourceHashes).sort();
  const actual = {
    sourceCount: names.length,
    sourceNamesSha256: sha256(stableJson(names)),
    candidateClosureSha256: sha256(stableJson(sourceHashes)),
    completeSourceHashes: sourceHashes,
    productionImportClosure: stage10ProductionImportClosure(sourceHashes),
  };
  for (const field of [
    "sourceCount",
    "sourceNamesSha256",
    "candidateClosureSha256",
    "completeSourceHashes",
    "productionImportClosure",
  ]) {
    if (!valuesEqual(actual[field], expected[field])) {
      throw new Error(`Stage 12a compiler source closure changed: ${field}`);
    }
  }
  return sorted({ ...actual, equalToStage11: true });
}

function stage12aBasePackageJson() {
  return JSON.parse(
    run("git", ["show", `${STAGE_12A_BASE_COMMIT}:package.json`]).stdout
  );
}

function validateStage12aPackageManifest(packageJson) {
  validateStage12aFrozenConstants();
  const base = stage12aBasePackageJson();
  if (
    base.devDependencies?.ethers !== "5.6.2" ||
    base.devDependencies?.["@nomiclabs/hardhat-ethers"] !== "2.0.5" ||
    base.devDependencies?.hardhat !== STAGE_12A_HARDHAT_VERSION
  ) {
    throw new Error(
      "Stage 12a inherited an invalid Stage 11 JS dependency set"
    );
  }
  if (
    packageJson.devDependencies?.ethers !== STAGE_12A_ETHERS_VERSION ||
    packageJson.devDependencies?.["@nomicfoundation/hardhat-ethers"] !==
      STAGE_12A_HARDHAT_ETHERS_VERSION ||
    packageJson.devDependencies?.hardhat !== STAGE_12A_HARDHAT_VERSION ||
    !valuesEqual(packageJson.dependencies, base.dependencies)
  ) {
    throw new Error(
      "Stage 12a requires exact ethers 6.17.0, Foundation hardhat-ethers 3.1.3, Hardhat 2.28.6, and unchanged runtime dependencies"
    );
  }
  for (const [name, version] of Object.entries(
    STAGE_12A_RETAINED_LEGACY_DEV_DEPENDENCIES
  )) {
    if (
      base.devDependencies?.[name] !== version ||
      packageJson.devDependencies?.[name] !== version
    ) {
      throw new Error(
        `Stage 12a must retain dormant legacy dependency ${name}@${version} unchanged for the isolated Stage 12b removal`
      );
    }
  }
  const differences = collectDifferences(base, packageJson, "$.packageJson");
  const actualPaths = differences.map(({ path: reviewPath }) => reviewPath);
  if (!valuesEqual(actualPaths, STAGE_12A_EXPECTED_PACKAGE_DIFFERENCE_PATHS)) {
    throw new Error(
      `Stage 12a package.json changed outside its exact migration:\n${collectDifferences(
        STAGE_12A_EXPECTED_PACKAGE_DIFFERENCE_PATHS,
        actualPaths,
        "$.packageDifferencePaths"
      )
        .map((difference) => `- ${formatDifference(difference)}`)
        .join("\n")}`
    );
  }
  return differences;
}

function lockfileKey(name) {
  return name.startsWith("@") ? `'${name}'` : name;
}

function escapedPattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateStage12aLockDependency(lock, name, version, integrity) {
  const key = escapedPattern(lockfileKey(name));
  const escapedVersion = escapedPattern(version);
  const escapedIntegrity = escapedPattern(integrity);
  const importer = new RegExp(
    `^      ${key}:\\n        specifier: ${escapedVersion}\\n        version: ${escapedVersion}(?:\\([^\\n]+\\))?$`,
    "m"
  );
  const resolution = new RegExp(
    `^  ${escapedPattern(
      lockfileKey(`${name}@${version}`)
    )}:\\n    resolution: \\{integrity: ${escapedIntegrity}\\}`,
    "m"
  );
  if (!importer.test(lock) || !resolution.test(lock)) {
    throw new Error(
      `Stage 12a pnpm lock is missing exact ${name} ${version} importer/integrity evidence`
    );
  }
}

function stage12aDependencyEvidence() {
  validateStage12aFrozenConstants();
  const packagePath = path.join(ROOT, "package.json");
  const lockPath = path.join(ROOT, "pnpm-lock.yaml");
  const packageBytes = fs.readFileSync(packagePath);
  const lockBytes = fs.readFileSync(lockPath);
  const packageJson = JSON.parse(packageBytes);
  const lock = lockBytes.toString("utf8");
  const differences = validateStage12aPackageManifest(packageJson);
  if (
    sha256(packageBytes) !== STAGE_12A_PACKAGE_SHA256 ||
    sha256(lockBytes) !== STAGE_12A_LOCKFILE_SHA256
  ) {
    throw new Error("Stage 12a package manifest or lockfile digest changed");
  }
  validateStage12aLockDependency(
    lock,
    "ethers",
    STAGE_12A_ETHERS_VERSION,
    STAGE_12A_ETHERS_INTEGRITY
  );
  validateStage12aLockDependency(
    lock,
    "@nomicfoundation/hardhat-ethers",
    STAGE_12A_HARDHAT_ETHERS_VERSION,
    STAGE_12A_HARDHAT_ETHERS_INTEGRITY
  );
  if (!/^      '@nomiclabs\/hardhat-ethers':$/m.test(lock)) {
    throw new Error(
      "Stage 12a must retain the dormant ethers-5 plugin as explicit Stage 12b debt"
    );
  }
  const installed = {};
  for (const [name, expectedVersion] of [
    ["ethers", STAGE_12A_ETHERS_VERSION],
    ["@nomicfoundation/hardhat-ethers", STAGE_12A_HARDHAT_ETHERS_VERSION],
    ["hardhat", STAGE_12A_HARDHAT_VERSION],
  ]) {
    const installedPath = path.join(ROOT, "node_modules", name, "package.json");
    const installedBytes = fs.readFileSync(installedPath);
    const installedPackage = JSON.parse(installedBytes);
    if (installedPackage.version !== expectedVersion) {
      throw new Error(
        `Stage 12a installed ${name} version changed: ${installedPackage.version}`
      );
    }
    installed[name] = {
      version: installedPackage.version,
      packageJsonSha256: sha256(installedBytes),
    };
  }
  const checkpoint = stage12aCheckpointAnchor();
  const stage11OpenZeppelin =
    checkpoint.evidence.value.sourceAndTestCutover.dependency;
  const openZeppelin = stage10DependencyEvidence();
  for (const field of [
    "name",
    "candidateVersion",
    "registryIntegrity",
    "installedPackageJsonSha256",
  ]) {
    const checkpointField = field === "candidateVersion" ? "version" : field;
    if (openZeppelin[field] !== stage11OpenZeppelin[checkpointField]) {
      throw new Error(`Stage 12a OpenZeppelin dependency changed: ${field}`);
    }
  }
  return sorted({
    transition: {
      ethers: { stage11: "5.6.2", candidate: STAGE_12A_ETHERS_VERSION },
      hardhatEthers: {
        stage11: { name: "@nomiclabs/hardhat-ethers", version: "2.0.5" },
        candidate: {
          name: "@nomicfoundation/hardhat-ethers",
          version: STAGE_12A_HARDHAT_ETHERS_VERSION,
        },
      },
      hardhat: {
        stage11: STAGE_12A_HARDHAT_VERSION,
        candidate: STAGE_12A_HARDHAT_VERSION,
      },
      dormantEthers5Tooling: STAGE_12A_DORMANT_ETHERS5_TOOLING,
      retainedLegacyHelpers: STAGE_12A_RETAINED_LEGACY_HELPERS,
      unchangedActiveLegacyPlugin: STAGE_12A_ACTIVE_LEGACY_PLUGIN,
      peerDebtDisposition:
        "retained but runtime-deactivated without suppression; remove together in Stage 12b",
      packageDifferences: differences,
    },
    registryIntegrity: {
      ethers: STAGE_12A_ETHERS_INTEGRITY,
      hardhatEthers: STAGE_12A_HARDHAT_ETHERS_INTEGRITY,
    },
    packageJsonSha256: sha256(packageBytes),
    lockfileSha256: sha256(lockBytes),
    installed,
    openZeppelin: {
      version: openZeppelin.candidateVersion,
      registryIntegrity: openZeppelin.registryIntegrity,
      installedPackageJsonSha256: openZeppelin.installedPackageJsonSha256,
      equalToStage11: true,
    },
  });
}

function stage12aSourceEvidence(candidate) {
  const checkpoint = stage12aCheckpointAnchor();
  return sorted({
    checkpoint: STAGE_12A_CHECKPOINT_BINDING,
    changedPaths: validateStage12aChangedPaths(
      repositoryChangedPaths(STAGE_12A_BASE_COMMIT)
    ),
    boundFiles: stage12aBoundFileEvidence(),
    toolingInventory: stage12aToolingInventory(checkpoint),
    dependencyMigration: stage12aDependencyEvidence(),
    runtimeBridge: stage12aRuntimeBridgeEvidence(),
    productionSources: stage12aProductionSourceEquality(checkpoint),
    compilerSources: stage12aCompilerSourceEquality(checkpoint),
    tests: stage12aTestInventory(candidate, checkpoint),
    compatibilityRunnerSha256: sha256(
      fs.readFileSync(path.join(ROOT, "scripts", "compatibility.js"))
    ),
  });
}

function validateSecurity01CompilerSourceEvidence(evidence) {
  if (
    evidence.sourceCount !== SECURITY_01_COMPILER_SOURCE_COUNT ||
    evidence.sourceNamesSha256 !== SECURITY_01_COMPILER_SOURCE_NAMES_SHA256 ||
    evidence.stage09ClosureSha256 !==
      SECURITY_01_COMPILER_BASE_CLOSURE_SHA256 ||
    evidence.candidateClosureSha256 !==
      SECURITY_01_COMPILER_CANDIDATE_CLOSURE_SHA256 ||
    evidence.changedSource !== SECURITY_01_ERC721_SOURCE ||
    evidence.stage09ChangedSourceSha256 !== SECURITY_01_ERC721_BASE_SHA256 ||
    evidence.candidateChangedSourceSha256 !==
      SECURITY_01_ERC721_CANDIDATE_SHA256
  ) {
    throw new Error(
      "Security 01 compiler source closure differs from the exact Stage 9 closure plus ERC721 recheck"
    );
  }
}

function security01CompilerSourceEvidence() {
  const buildInfo = findBuildInfo();
  const sourceHashes = sorted(
    Object.fromEntries(
      Object.entries(buildInfo.input.sources).map(([source, description]) => {
        if (typeof description.content !== "string") {
          throw new Error(`Compiler source is missing content: ${source}`);
        }
        return [source, sha256(description.content)];
      })
    )
  );
  const stage09Hashes = { ...sourceHashes };
  if (
    sourceHashes[SECURITY_01_ERC721_SOURCE] !==
    SECURITY_01_ERC721_CANDIDATE_SHA256
  ) {
    throw new Error(
      "Security 01 compiler input does not contain its ERC721 patch"
    );
  }
  stage09Hashes[SECURITY_01_ERC721_SOURCE] = SECURITY_01_ERC721_BASE_SHA256;
  const evidence = sorted({
    sourceCount: Object.keys(sourceHashes).length,
    sourceNamesSha256: sha256(stableJson(Object.keys(sourceHashes).sort())),
    stage09ClosureSha256: sha256(stableJson(stage09Hashes)),
    candidateClosureSha256: sha256(stableJson(sourceHashes)),
    changedSource: SECURITY_01_ERC721_SOURCE,
    stage09ChangedSourceSha256: SECURITY_01_ERC721_BASE_SHA256,
    candidateChangedSourceSha256: SECURITY_01_ERC721_CANDIDATE_SHA256,
  });
  validateSecurity01CompilerSourceEvidence(evidence);
  return evidence;
}

function security01SourceEvidence() {
  const baseSource = run("git", [
    "show",
    `${SECURITY_01_BASE_COMMIT}:${SECURITY_01_ERC721_SOURCE}`,
  ]).stdout;
  if (sha256(baseSource) !== SECURITY_01_ERC721_BASE_SHA256) {
    throw new Error("Security 01 ERC721 source anchor has changed");
  }
  const hook = "    _beforeTokenTransfer(from, to, tokenId);\n\n";
  const occurrences = baseSource.split(hook).length - 1;
  if (occurrences !== 1) {
    throw new Error("Security 01 requires one exact ERC721 transfer hook");
  }
  const recheck = [
    "    // The hook may have transferred the token. Revalidate ownership before",
    "    // applying this transfer's balance and ownership changes.",
    "    require(",
    "      ERC721.ownerOf(tokenId) == from,",
    `      "${SECURITY_01_REVERT_VALUE}"`,
    "    );",
    "",
    "",
  ].join("\n");
  const expectedCandidate = baseSource.replace(hook, `${hook}${recheck}`);
  const candidatePath = path.join(ROOT, SECURITY_01_ERC721_SOURCE);
  const candidateSource = fs.readFileSync(candidatePath, "utf8");
  if (
    candidateSource !== expectedCandidate ||
    sha256(candidateSource) !== SECURITY_01_ERC721_CANDIDATE_SHA256
  ) {
    throw new Error(
      "Security 01 permits only the exact post-hook ERC721 owner recheck"
    );
  }

  return sorted({
    baseCommit: SECURITY_01_BASE_COMMIT,
    sourcePath: SECURITY_01_ERC721_SOURCE,
    baseSha256: SECURITY_01_ERC721_BASE_SHA256,
    candidateSha256: SECURITY_01_ERC721_CANDIDATE_SHA256,
    exactChange:
      "Duplicate the existing incorrect-owner require immediately after _beforeTokenTransfer and before approval or ownership effects.",
    changedPaths: security01ChangedPaths(),
    configFiles: security01ConfigEvidence(),
    compilerSources: security01CompilerSourceEvidence(),
  });
}

function replaceExactlyOnce(source, before, after, label) {
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label} expected one exact source fragment`);
  }
  return source.replace(before, after);
}

function security02ProductionSourceEvidence() {
  run("git", ["merge-base", "--is-ancestor", SECURITY_02_BASE_COMMIT, "HEAD"]);

  const baseErc721 = run("git", [
    "show",
    `${SECURITY_02_BASE_COMMIT}:${SECURITY_02_ERC721_SOURCE}`,
  ]).stdout;
  if (sha256(baseErc721) !== SECURITY_02_ERC721_BASE_SHA256) {
    throw new Error("Security 02 ERC721 checkpoint source changed");
  }
  let expectedErc721 = replaceExactlyOnce(
    baseErc721,
    "  /// Private Methods\n",
    "  /// Internal Methods\n",
    "Security 02 ERC721 section visibility"
  );
  expectedErc721 = replaceExactlyOnce(
    expectedErc721,
    "  function _checkOnERC721Received(\n",
    "  /* solhint-disable ordering */\n  function _checkOnERC721Received(\n",
    "Security 02 ERC721 localized lint suppression"
  );
  expectedErc721 = replaceExactlyOnce(
    expectedErc721,
    "  ) private returns (bool) {\n",
    "  ) internal returns (bool) {\n",
    "Security 02 ERC721 receiver helper visibility"
  );
  const erc721Ending = ["      return true;", "    }", "  }", "}", ""].join(
    "\n"
  );
  if (!expectedErc721.endsWith(erc721Ending)) {
    throw new Error("Security 02 ERC721 receiver helper ending changed");
  }
  expectedErc721 = `${expectedErc721.slice(0, -erc721Ending.length)}${[
    "      return true;",
    "    }",
    "  }",
    "  /* solhint-enable ordering */",
    "}",
    "",
  ].join("\n")}`;
  const candidateErc721 = fs.readFileSync(
    path.join(ROOT, SECURITY_02_ERC721_SOURCE),
    "utf8"
  );
  if (
    candidateErc721 !== expectedErc721 ||
    sha256(candidateErc721) !== SECURITY_02_ERC721_CANDIDATE_SHA256
  ) {
    throw new Error(
      "Security 02 permits only the exact ERC721 receiver-helper visibility change"
    );
  }

  const basePco = run("git", [
    "show",
    `${SECURITY_02_BASE_COMMIT}:${SECURITY_02_PCO_SOURCE}`,
  ]).stdout;
  if (sha256(basePco) !== SECURITY_02_PCO_BASE_SHA256) {
    throw new Error("Security 02 PCO checkpoint source changed");
  }
  const beforeMint = [
    "    // slither-disable-next-line reentrancy-eth",
    "    _safeMint(leasee_, tokenId_);",
    "    _setDeposit(tokenId_, deposit_);",
    "    _setValuation(tokenId_, valuation_);",
    "    _setBeneficiary(tokenId_, beneficiary_);",
    "    _setTaxRate(tokenId_, taxRate_);",
    "    _setCollectionFrequency(tokenId_, collectionFrequency_);",
  ].join("\n");
  const afterMint = [
    "    ERC721._mint(leasee_, tokenId_);",
    "    _setDeposit(tokenId_, deposit_);",
    "    _setValuation(tokenId_, valuation_);",
    "    _setBeneficiary(tokenId_, beneficiary_);",
    "    _setTaxRate(tokenId_, taxRate_);",
    "    _setCollectionFrequency(tokenId_, collectionFrequency_);",
    "    require(",
    '      _checkOnERC721Received(address(0), leasee_, tokenId_, ""),',
    '      "ERC721: transfer to non ERC721Receiver implementer"',
    "    );",
  ].join("\n");
  const expectedPco = replaceExactlyOnce(
    basePco,
    beforeMint,
    afterMint,
    "Security 02 PCO mint ordering"
  );
  const candidatePco = fs.readFileSync(
    path.join(ROOT, SECURITY_02_PCO_SOURCE),
    "utf8"
  );
  if (
    candidatePco !== expectedPco ||
    sha256(candidatePco) !== SECURITY_02_PCO_CANDIDATE_SHA256
  ) {
    throw new Error(
      "Security 02 permits only mint, existing PCO initialization, then the exact receiver check"
    );
  }

  return sorted({
    baseCommit: SECURITY_02_BASE_COMMIT,
    files: {
      [SECURITY_02_ERC721_SOURCE]: {
        security01Sha256: SECURITY_02_ERC721_BASE_SHA256,
        candidateSha256: SECURITY_02_ERC721_CANDIDATE_SHA256,
        exactChange:
          "Change only the existing receiver helper and its section heading from private to internal, with localized ordering-lint disable/enable comments around that helper.",
      },
      [SECURITY_02_PCO_SOURCE]: {
        security01Sha256: SECURITY_02_PCO_BASE_SHA256,
        candidateSha256: SECURITY_02_PCO_CANDIDATE_SHA256,
        exactChange:
          "Replace _safeMint with ERC721._mint, execute the five existing PCO setters in their prior order, then invoke the same receiver check with the same Error(string).",
      },
    },
  });
}

function security03ProductionSourceEvidence() {
  run("git", ["merge-base", "--is-ancestor", SECURITY_03_BASE_COMMIT, "HEAD"]);

  const baseLease = run("git", [
    "show",
    `${SECURITY_03_BASE_COMMIT}:${SECURITY_03_LEASE_SOURCE}`,
  ]).stdout;
  if (sha256(baseLease) !== SECURITY_03_LEASE_BASE_SHA256) {
    throw new Error("Security 03 Lease checkpoint source changed");
  }
  const preCollectionPayment = [
    "    bool senderIsBeneficiary = msg.sender == beneficiaryOf(tokenId_);",
    "    // Current owner is a wallet address or the address of this contract",
    "    // if the token is foreclosed or has never been purchased.",
    "    address currentOwner = ownerOf(tokenId_);",
    "",
    "    if (senderIsBeneficiary) {",
    "      if (currentOwner == address(this)) {",
    "        // If token is owned by contract, beneficiary does not need to pay anything.",
    '        require(msg.value == 0, "Msg contains value");',
    "      } else {",
    "        // Beneficiary only needs to pay the current valuation,",
    "        // doesn't need to put down a deposit.",
    '        require(msg.value == currentValuation_, "Msg contains surplus value");',
    "      }",
    "    } else {",
    "      // Value sent must be greater the amount being remitted to the current owner;",
    "      // surplus is necessary for deposit.",
    "      require(",
    "        msg.value > valuationPriorToTaxCollection,",
    '        "Message does not contain surplus value for deposit"',
    "      );",
    "    }",
    "",
  ].join("\n");
  let expectedLease = replaceExactlyOnce(
    baseLease,
    preCollectionPayment,
    "    bool senderIsBeneficiary = msg.sender == beneficiaryOf(tokenId_);\n",
    "Security 03 removes pre-collection payment classification"
  );
  const postCollectionAnchor = [
    "    address ownerAfterCollection = ownerOf(tokenId_);",
    "    bool purchasedFromContract = ownerAfterCollection == address(this);",
    "",
  ].join("\n");
  const postCollectionPayment = [
    postCollectionAnchor.trimEnd(),
    "",
    "    if (senderIsBeneficiary) {",
    "      if (purchasedFromContract) {",
    "        // If token is owned by contract, beneficiary does not need to pay anything.",
    '        require(msg.value == 0, "Msg contains value");',
    "      } else {",
    "        // Beneficiary only needs to pay the current valuation,",
    "        // doesn't need to put down a deposit.",
    '        require(msg.value == currentValuation_, "Msg contains surplus value");',
    "      }",
    "    } else {",
    "      // Value sent must fund a deposit when purchasing from the contract, or",
    "      // exceed the amount remitted when purchasing from an external owner.",
    "      require(",
    "        msg.value > (purchasedFromContract ? 0 : valuationPriorToTaxCollection),",
    '        "Message does not contain surplus value for deposit"',
    "      );",
    "    }",
    "",
  ].join("\n");
  expectedLease = replaceExactlyOnce(
    expectedLease,
    postCollectionAnchor,
    postCollectionPayment,
    "Security 03 post-collection payment classification"
  );
  expectedLease = replaceExactlyOnce(
    expectedLease,
    [
      "    _onlyApprovedOrOwner(tokenId_)",
      "    _collectTax(tokenId_)",
      "  {",
    ].join("\n"),
    [
      "    _onlyApprovedOrOwner(tokenId_)",
      "    _collectTax(tokenId_)",
      "    _onlyApprovedOrOwner(tokenId_)",
      "  {",
    ].join("\n"),
    "Security 03 selfAssess post-collection authorization"
  );
  const candidateLease = fs.readFileSync(
    path.join(ROOT, SECURITY_03_LEASE_SOURCE),
    "utf8"
  );
  if (
    candidateLease !== expectedLease ||
    sha256(candidateLease) !== SECURITY_03_LEASE_CANDIDATE_SHA256
  ) {
    throw new Error(
      "Security 03 permits only post-collection takeover payment classification and the selfAssess authorization recheck in Lease"
    );
  }

  const baseTaxation = run("git", [
    "show",
    `${SECURITY_03_BASE_COMMIT}:${SECURITY_03_TAXATION_SOURCE}`,
  ]).stdout;
  if (sha256(baseTaxation) !== SECURITY_03_TAXATION_BASE_SHA256) {
    throw new Error("Security 03 Taxation checkpoint source changed");
  }
  let expectedTaxation = baseTaxation;
  for (const callable of [
    "function deposit(uint256 tokenId_)",
    "function withdrawDeposit(uint256 tokenId_, uint256 wei_)",
    "function exit(uint256 tokenId_)",
  ]) {
    const signatureStart = expectedTaxation.indexOf(`  ${callable}`);
    if (signatureStart < 0) {
      throw new Error(`Security 03 could not locate ${callable}`);
    }
    const bodyStart = expectedTaxation.indexOf("  {", signatureStart);
    if (bodyStart < 0) {
      throw new Error(`Security 03 could not locate ${callable} body`);
    }
    const prefix = expectedTaxation.slice(signatureStart, bodyStart + 3);
    if (!prefix.endsWith("    _collectTax(tokenId_)\n  {")) {
      throw new Error(`Security 03 ${callable} modifier ordering changed`);
    }
    const replacement = prefix.replace(
      "    _collectTax(tokenId_)\n  {",
      "    _collectTax(tokenId_)\n    _onlyApprovedOrOwner(tokenId_)\n  {"
    );
    expectedTaxation =
      expectedTaxation.slice(0, signatureStart) +
      replacement +
      expectedTaxation.slice(bodyStart + 3);
  }
  const candidateTaxation = fs.readFileSync(
    path.join(ROOT, SECURITY_03_TAXATION_SOURCE),
    "utf8"
  );
  if (
    candidateTaxation !== expectedTaxation ||
    sha256(candidateTaxation) !== SECURITY_03_TAXATION_CANDIDATE_SHA256
  ) {
    throw new Error(
      "Security 03 permits only one post-collection authorization recheck in deposit, withdrawDeposit, and exit"
    );
  }

  return sorted({
    baseCommit: SECURITY_03_BASE_COMMIT,
    files: {
      [SECURITY_03_LEASE_SOURCE]: {
        security02Sha256: SECURITY_03_LEASE_BASE_SHA256,
        candidateSha256: SECURITY_03_LEASE_CANDIDATE_SHA256,
        exactChange:
          "Move existing takeover payment classification after tax collection, classify from ownerAfterCollection, and add the existing authorization modifier after selfAssess tax collection.",
      },
      [SECURITY_03_TAXATION_SOURCE]: {
        security02Sha256: SECURITY_03_TAXATION_BASE_SHA256,
        candidateSha256: SECURITY_03_TAXATION_CANDIDATE_SHA256,
        exactChange:
          "Add the existing authorization modifier immediately after tax collection in deposit, withdrawDeposit, and exit.",
      },
    },
  });
}

function security04ProductionSourceEvidence() {
  run("git", ["merge-base", "--is-ancestor", SECURITY_04_BASE_COMMIT, "HEAD"]);
  const baseWrapper = run("git", [
    "show",
    `${SECURITY_04_BASE_COMMIT}:${SECURITY_04_WRAPPER_SOURCE}`,
  ]).stdout;
  if (sha256(baseWrapper) !== SECURITY_04_WRAPPER_BASE_SHA256) {
    throw new Error("Security 04 Wrapper checkpoint source changed");
  }
  const beforeGuard = [
    "    // Get current owner's address prior to burning.",
    "    address owner = ownerOf(tokenId_);",
    "",
    "    // Delete wrapper state",
  ].join("\n");
  const afterGuard = [
    "    // Get current owner's address prior to burning.",
    "    address owner = ownerOf(tokenId_);",
    "",
    "    if (owner == address(this)) revert DestinationContractAddress();",
    "",
    "    // Delete wrapper state",
  ].join("\n");
  const expectedWrapper = replaceExactlyOnce(
    baseWrapper,
    beforeGuard,
    afterGuard,
    "Security 04 unwrap self-destination guard placement"
  );
  const candidateWrapper = fs.readFileSync(
    path.join(ROOT, SECURITY_04_WRAPPER_SOURCE),
    "utf8"
  );
  if (
    candidateWrapper !== expectedWrapper ||
    sha256(candidateWrapper) !== SECURITY_04_WRAPPER_CANDIDATE_SHA256
  ) {
    throw new Error(
      "Security 04 permits only the exact DestinationContractAddress guard after originator authorization and owner capture but before destructive unwrap effects"
    );
  }
  const unwrap = candidateWrapper.slice(
    candidateWrapper.indexOf("  function unwrap(uint256 tokenId_)"),
    candidateWrapper.indexOf("  /// @notice Queries the wrapped token's URI.")
  );
  const orderedFragments = [
    "function unwrap(uint256 tokenId_) public _tokenMinted(tokenId_)",
    "WrappedToken memory token = _wrappedTokenMap[tokenId_];",
    'require(token.operatorAddress == msg.sender, "Wrap originator only");',
    "address owner = ownerOf(tokenId_);",
    "if (owner == address(this)) revert DestinationContractAddress();",
    "delete _wrappedTokenMap[tokenId_];",
    "_burn(tokenId_);",
    "tokenContract.safeTransferFrom(address(this), owner, token.tokenId);",
  ];
  let cursor = -1;
  for (const fragment of orderedFragments) {
    const next = unwrap.indexOf(fragment);
    if (next <= cursor) {
      throw new Error(
        `Security 04 unwrap guard precedence changed at: ${fragment}`
      );
    }
    cursor = next;
  }
  return sorted({
    baseCommit: SECURITY_04_BASE_COMMIT,
    sourcePath: SECURITY_04_WRAPPER_SOURCE,
    security03Sha256: SECURITY_04_WRAPPER_BASE_SHA256,
    candidateSha256: SECURITY_04_WRAPPER_CANDIDATE_SHA256,
    exactChange:
      "After the existing mapping read and originator require, capture ownerOf and reject Wrapper as its own destination with the inherited DestinationContractAddress custom error before metadata deletion, burn, or underlying transfer.",
    precedence: SECURITY_04_BEHAVIOR_EVIDENCE.guard.precedence,
    error: SECURITY_04_BEHAVIOR_EVIDENCE.guard.error,
  });
}

function validateSecurity04ProductionSourceBinding(evidence) {
  const expected = security04ProductionSourceEvidence();
  if (!valuesEqual(evidence, expected)) {
    throw new Error("Security 04 production source binding is stale");
  }
}

function security04BehaviorEvidence(candidate) {
  const files = [
    [
      SECURITY_04_REGRESSION_SOURCE,
      SECURITY_04_BEHAVIOR_EVIDENCE.guard.sourceSha256,
      [
        "_assertUnwrapGuardRevertsAndRollsBack",
        '_error("Wrap originator only")',
        "abi.encodeWithSelector(Remittance.DestinationContractAddress.selector)",
        "assertEq(logs.length, 0)",
        "_assertUnwrapGuardStateUnchanged",
        "wrapper.takeoverLease{value: 1 ether}(wrappedId, 1 ether, 0)",
        "assertEq(underlying.ownerOf(1), CAROL)",
        "wrapper.transferFrom(ALICE, address(wrapper), directlyTransferredId)",
      ],
    ],
    [
      SECURITY_04_INVARIANT_SOURCE,
      SECURITY_04_BEHAVIOR_EVIDENCE.invariantSources[
        SECURITY_04_INVARIANT_SOURCE
      ],
      [
        "handler.warpAndCollect(2, 0)",
        "handler.unwrap(2)",
        "ghostSelfDestinationUnwrapRejected",
        "self-destination rejection preserves wrapper record",
        "ghostSelfDestinationUnwrapRejections",
      ],
    ],
    [
      SECURITY_04_INVARIANT_HELPER,
      SECURITY_04_BEHAVIOR_EVIDENCE.invariantSources[
        SECURITY_04_INVARIANT_HELPER
      ],
      [
        "abi.encodeWithSelector(Remittance.DestinationContractAddress.selector)",
        "ghostSelfDestinationUnwrapRejected[tokenId] = true",
        "ghostSelfDestinationUnwrapRejections++",
        "ghostUnexpectedInvalidCallSuccess = true",
      ],
    ],
  ];
  for (const [relativePath, expectedSha256, fragments] of files) {
    const bytes = fs.readFileSync(path.join(ROOT, relativePath));
    if (sha256(bytes) !== expectedSha256) {
      throw new Error(`Security 04 behavior source changed: ${relativePath}`);
    }
    const source = bytes.toString("utf8");
    for (const fragment of fragments) {
      if (!source.includes(fragment)) {
        throw new Error(
          `Security 04 behavior source ${relativePath} is missing: ${fragment}`
        );
      }
    }
  }
  validateSecurity01Inventory(candidate);
  for (const test of SECURITY_04_RETAINED_FORGE_TESTS) {
    if (
      candidate.tests.forge.names.filter((name) => name === test).length !== 1
    ) {
      throw new Error(
        `Security 04 requires exactly one retained executed Forge identifier: ${test}`
      );
    }
  }
  const errors =
    candidate.contracts["contracts/Wrapper.sol:Wrapper"]?.errors || [];
  const matchingErrors = errors.filter(
    (entry) =>
      entry.signature === SECURITY_04_ERROR_SIGNATURE &&
      entry.selector === SECURITY_04_ERROR_SELECTOR
  );
  if (matchingErrors.length !== 1) {
    throw new Error(
      "Security 04 requires the one existing DestinationContractAddress custom-error selector"
    );
  }
  return sorted(SECURITY_04_BEHAVIOR_EVIDENCE);
}

function validateSecurity04BehaviorBinding(evidence) {
  if (!valuesEqual(evidence, SECURITY_04_BEHAVIOR_EVIDENCE)) {
    throw new Error("Security 04 behavior evidence binding is stale");
  }
}

function security03BehaviorEvidence(candidate) {
  const files = [
    [
      SECURITY_03_POST_TAX_TEST_SOURCE,
      SECURITY_03_BEHAVIOR_EVIDENCE.postTaxAuthorization.sourceSha256,
      [
        "for (uint256 authorizationMode = 0; authorizationMode < 3; authorizationMode++)",
        "for (uint256 mutationMode = 0; mutationMode < 4; mutationMode++)",
        'abi.encodeWithSignature("Error(string)", "ERC721: caller is not owner nor approved")',
        "assertEq(logs.length, 6)",
        "assertEq(logs.length, 10)",
        "assertEq(address(token_).balance, 1 wei + expectedOutstanding)",
      ],
    ],
    [
      SECURITY_03_TAKEOVER_TEST_SOURCE,
      SECURITY_03_BEHAVIOR_EVIDENCE.takeoverPayment.sourceSha256,
      [
        "_assertBeneficiaryCrossingForeclosureIsStabilized",
        "_assertNonBeneficiaryCrossingForeclosureIsStabilized",
        "_assertActiveOwnerMalformedPaymentRollsBackCollection",
        "_assertPendingForeclosureTakeoverLogs",
        "assertEq(logs_.length, 10)",
        "assertEq(address(wrapper).balance, wrapper.depositOf(wrappedId) + _knownLiabilities())",
        "_assertTakeoverStateUnchanged(wrappedId, before_)",
      ],
    ],
    [
      "test/solidity/invariant/PCOInvariant.t.sol",
      SECURITY_03_BEHAVIOR_EVIDENCE.invariantSources[
        "test/solidity/invariant/PCOInvariant.t.sol"
      ],
      [
        "ghostPostTaxAuthorizationRollback",
        "ghostPostTaxAuthorizationChecks",
        "_expectPostTaxAuthorizationRollback",
      ],
    ],
    [
      "test/solidity/invariant/WrapperInvariant.t.sol",
      SECURITY_03_BEHAVIOR_EVIDENCE.invariantSources[
        "test/solidity/invariant/WrapperInvariant.t.sol"
      ],
      ["handler.takeover(1, 2, 0, 0)", "ghostCrossingForeclosureTakeovers"],
    ],
    [
      "test/solidity/invariant/helpers/WrapperInvariantHarness.sol",
      SECURITY_03_BEHAVIOR_EVIDENCE.invariantSources[
        "test/solidity/invariant/helpers/WrapperInvariantHarness.sol"
      ],
      [
        "terms.crossesForeclosure",
        "purchasedFromContract ? 0 : terms.currentValuation",
        "purchasedFromContract ? buyerDeposit : terms.currentValuation + buyerDeposit",
      ],
    ],
    [
      "test/solidity/parity/PCOMutationParity.t.sol",
      SECURITY_03_BEHAVIOR_EVIDENCE.invariantSources[
        "test/solidity/parity/PCOMutationParity.t.sol"
      ],
      [
        "_expectTakeoverPaymentRevertAfterCollection",
        "_assertRolledBackCollectionLogs",
        "_assertStateUnchanged(tokenId, caller, beforeState)",
      ],
    ],
  ];
  for (const [relativePath, expectedSha256, fragments] of files) {
    const bytes = fs.readFileSync(path.join(ROOT, relativePath));
    if (sha256(bytes) !== expectedSha256) {
      throw new Error(`Security 03 behavior source changed: ${relativePath}`);
    }
    const source = bytes.toString("utf8");
    for (const fragment of fragments) {
      if (!source.includes(fragment)) {
        throw new Error(
          `Security 03 behavior source ${relativePath} is missing: ${fragment}`
        );
      }
    }
  }
  validateSecurity01Inventory(candidate);
  for (const test of [SECURITY_03_POST_TAX_TEST, SECURITY_03_TAKEOVER_TEST]) {
    if (
      candidate.tests.forge.names.filter((name) => name === test).length !== 1
    ) {
      throw new Error(
        `Security 03 requires exactly one executed legacy regression identifier: ${test}`
      );
    }
  }
  return sorted(SECURITY_03_BEHAVIOR_EVIDENCE);
}

function validateSecurity03BehaviorBinding(evidence) {
  if (!valuesEqual(evidence, SECURITY_03_BEHAVIOR_EVIDENCE)) {
    throw new Error("Security 03 behavior evidence binding is stale");
  }
}

function security01BehaviorEvidence(candidate) {
  const sourcePath = path.join(ROOT, SECURITY_01_REGRESSION_SOURCE);
  const sourceBytes = fs.readFileSync(sourcePath);
  if (sha256(sourceBytes) !== SECURITY_01_REGRESSION_SOURCE_SHA256) {
    throw new Error("Security 01 regression evidence source has changed");
  }
  const source = sourceBytes.toString("utf8");
  const requiredFragments = [
    "function test_regression_deferredDelinquentTransferContinuesAfterNestedForeclosure()",
    "for (uint256 callerMode = 0; callerMode < 3; callerMode++)",
    "for (uint256 transferMode = 0; transferMode < 3; transferMode++)",
    `"${SECURITY_01_REVERT_VALUE}"`,
    "assertEq(wrapper.ownerOf(firstWrappedId), ALICE);",
    "assertEq(wrapper.balanceOf(address(wrapper)), 0);",
    "assertEq(wrapper.outstandingRemittances(BOB), before_.beneficiaryRemittance);",
    "assertEq(address(wrapper).balance, before_.wrapperEth);",
  ];
  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) {
      throw new Error(
        `Security 01 regression evidence is missing: ${fragment}`
      );
    }
  }
  const occurrences = candidate.tests.forge.names.filter(
    (name) => name === SECURITY_01_REGRESSION_TEST
  ).length;
  if (occurrences !== 1) {
    throw new Error(
      "Security 01 must preserve exactly one executed legacy regression identifier"
    );
  }
  return sorted(SECURITY_01_BEHAVIOR_EVIDENCE);
}

function validateSecurity01BehaviorBinding(evidence) {
  if (!valuesEqual(evidence, SECURITY_01_BEHAVIOR_EVIDENCE)) {
    throw new Error("Security 01 behavior evidence binding is stale");
  }
}

function security02BehaviorEvidence(candidate) {
  const files = [
    [
      SECURITY_02_HARDHAT_TEST_SOURCE,
      SECURITY_02_HARDHAT_TEST_SOURCE_SHA256,
      [
        "expectRejectedWrapRolledBack",
        "actions.wrongSelector",
        "actions.approveThenRevert",
        "actions.transferAndAccept",
        "actions.unwrapAndAccept",
        "acceptedReceipt.logs.map",
        "await expectZeroStorage(unwrappedId)",
      ],
    ],
    [
      SECURITY_02_FORGE_TEST_SOURCE,
      SECURITY_02_FORGE_TEST_SOURCE_SHA256,
      [
        "function test_onERC721Received_directSafeTransferReverts() public",
        "_assertReceiverCallbackRollback",
        "PCOReceiverAction.WrongSelector",
        "PCOReceiverAction.ApproveThenRevert",
        "_assertReceiverAcceptsInitializedToken",
        "_assertReceiverTransfersInitializedToken",
        "_assertReceiverUnwrapsInitializedToken",
        "bytes memory caughtRevert = receiver_.attemptRejectedWrap",
        'assertEq(caughtRevert, abi.encodeWithSignature("Error(string)", string(expectedRevert_)))',
      ],
    ],
    [
      SECURITY_02_FIXTURE_SOURCE,
      SECURITY_02_FIXTURE_SHA256,
      [
        "enum PCOReceiverAction",
        "wrapper.depositOf(tokenId_) == _expectedDeposit",
        "wrapper.valuationOf(tokenId_) == _expectedValuation",
        "wrapper.beneficiaryOf(tokenId_) == _expectedBeneficiary",
        "wrapper.taxRateOf(tokenId_) == _expectedTaxRate",
        "wrapper.collectionFrequencyOf(tokenId_) ==",
        "underlying.ownerOf(_expectedUnderlyingTokenId) == address(wrapper)",
        "PCOReceiverAction.TransferAndAccept",
        "PCOReceiverAction.UnwrapAndAccept",
      ],
    ],
  ];
  for (const [relativePath, expectedSha256, requiredFragments] of files) {
    const bytes = fs.readFileSync(path.join(ROOT, relativePath));
    if (sha256(bytes) !== expectedSha256) {
      throw new Error(`Security 02 behavior source changed: ${relativePath}`);
    }
    const source = bytes.toString("utf8");
    for (const fragment of requiredFragments) {
      if (!source.includes(fragment)) {
        throw new Error(
          `Security 02 behavior source ${relativePath} is missing: ${fragment}`
        );
      }
    }
  }

  const hardhatOccurrences = candidate.tests.hardhat.names.filter(
    (name) => name === SECURITY_02_HARDHAT_TEST
  ).length;
  const forgeOccurrences = candidate.tests.forge.names.filter(
    (name) => name === SECURITY_02_FORGE_TEST
  ).length;
  if (hardhatOccurrences !== 1 || forgeOccurrences !== 1) {
    throw new Error(
      "Security 02 requires one exact executed Hardhat oracle and Forge parity identifier"
    );
  }
  return sorted(SECURITY_02_BEHAVIOR_EVIDENCE);
}

function validateSecurity02BehaviorBinding(evidence) {
  if (!valuesEqual(evidence, SECURITY_02_BEHAVIOR_EVIDENCE)) {
    throw new Error("Security 02 behavior evidence binding is stale");
  }
}

function findBuildInfo() {
  const directory = path.join(ROOT, "artifacts", "build-info");
  const candidates = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const filename = path.join(directory, name);
      return {
        filename,
        modified: fs.statSync(filename).mtimeMs,
      };
    })
    .sort((a, b) => b.modified - a.modified);

  for (const candidate of candidates) {
    const buildInfo = JSON.parse(fs.readFileSync(candidate.filename, "utf8"));
    const hasTargets = TARGETS.every(
      ([source, contract]) => buildInfo.output.contracts[source]?.[contract]
    );
    if (hasTargets) return buildInfo;
  }

  throw new Error(
    "No Hardhat build-info file contains every compatibility target"
  );
}

function normalizeCompilerInput(buildInfo) {
  const input = deepClone(buildInfo.input);
  const selection = input.settings.outputSelection || {};
  selection["*"] = selection["*"] || {};
  selection["*"]["*"] = Array.from(
    new Set([...(selection["*"]["*"] || []), ...REQUIRED_OUTPUTS])
  ).sort();
  selection["*"][""] = Array.from(
    new Set([...(selection["*"][""] || []), "ast"])
  ).sort();
  input.settings.outputSelection = selection;

  // hardhat-preprocessor uses this unused library to invalidate its cache. It
  // changes on every compile and affects only the CBOR compiler metadata.
  const emptySourceLibraries = input.settings.libraries?.[""];
  if (emptySourceLibraries) {
    delete emptySourceLibraries.__CACHE_BREAKER__;
    if (Object.keys(emptySourceLibraries).length === 0) {
      delete input.settings.libraries[""];
    }
    if (Object.keys(input.settings.libraries).length === 0) {
      delete input.settings.libraries;
    }
  }

  return input;
}

async function compileExtended(buildInfo, input) {
  const { getCompilersDir } = require("hardhat/internal/util/global-dir");
  const {
    CompilerDownloader,
    CompilerPlatform,
  } = require("hardhat/internal/solidity/compiler/downloader");
  const {
    Compiler,
    NativeCompiler,
  } = require("hardhat/internal/solidity/compiler");

  const compilersDir = await getCompilersDir();
  const platform = CompilerDownloader.getCompilerPlatform();
  const nativeDownloader = CompilerDownloader.getConcurrencySafeDownloader(
    platform,
    compilersDir
  );
  let compiler = await nativeDownloader.getCompiler(buildInfo.solcVersion);

  if (!compiler) {
    const wasmDownloader = CompilerDownloader.getConcurrencySafeDownloader(
      CompilerPlatform.WASM,
      compilersDir
    );
    compiler = await wasmDownloader.getCompiler(buildInfo.solcVersion);
  }

  if (!compiler) {
    throw new Error(
      `Solidity ${buildInfo.solcVersion} was not available after Hardhat compilation`
    );
  }

  const runner = compiler.isSolcJs
    ? new Compiler(compiler.compilerPath)
    : new NativeCompiler(compiler.compilerPath, buildInfo.solcVersion);
  const output = await runner.compile(input);
  const errors = (output.errors || []).filter(
    (diagnostic) => diagnostic.severity === "error"
  );
  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.formattedMessage).join("\n"));
  }

  return output;
}

function ethersKeccak(hexValue) {
  const imported = require("ethers");
  const ethers = imported.ethers || imported;
  const keccak256 = ethers.keccak256 || ethers.utils?.keccak256;
  if (!keccak256) throw new Error("Unable to locate ethers.keccak256");
  return keccak256(hexValue);
}

function ethersId(value) {
  const imported = require("ethers");
  const ethers = imported.ethers || imported;
  const id = ethers.id || ethers.utils?.id;
  if (!id) throw new Error("Unable to locate ethers.id");
  return id(value);
}

function canonicalAbiType(parameter) {
  if (!parameter.type.startsWith("tuple")) return parameter.type;
  const suffix = parameter.type.slice("tuple".length);
  return `(${(parameter.components || [])
    .map(canonicalAbiType)
    .join(",")})${suffix}`;
}

function abiSignature(entry) {
  const inputs = (entry.inputs || []).map(canonicalAbiType).join(",");
  return entry.name ? `${entry.name}(${inputs})` : entry.type;
}

function normalizeAbi(abi) {
  return abi
    .map((entry) => sorted(entry))
    .sort((a, b) => {
      const left = `${a.type}:${abiSignature(a)}`;
      const right = `${b.type}:${abiSignature(b)}`;
      return left.localeCompare(right);
    });
}

function normalizeTypeId(typeId) {
  return typeId.replace(/\)(\d+)(?=_(?:storage|memory|calldata)|\b)/g, ")");
}

function normalizeStorageMember(member) {
  return {
    label: member.label,
    offset: member.offset,
    slot: member.slot,
    type: normalizeTypeId(member.type),
  };
}

function normalizeStorageLayout(layout) {
  const types = {};
  for (const [typeId, description] of Object.entries(layout.types || {})) {
    const normalizedId = normalizeTypeId(typeId);
    const normalized = {};
    for (const [key, value] of Object.entries(description)) {
      if (key === "members") {
        normalized.members = value.map(normalizeStorageMember);
      } else if (["base", "key", "value"].includes(key)) {
        normalized[key] = normalizeTypeId(value);
      } else {
        normalized[key] = value;
      }
    }
    if (
      types[normalizedId] &&
      stableJson(types[normalizedId]) !== stableJson(normalized)
    ) {
      throw new Error(
        `Storage type normalization collision for ${normalizedId}`
      );
    }
    types[normalizedId] = normalized;
  }

  return sorted({
    storage: (layout.storage || []).map(normalizeStorageMember),
    types,
  });
}

function stripMetadata(hex) {
  if (!hex || hex.length < 4) return { code: hex || "", metadataBytes: 0 };
  const metadataLength = Number.parseInt(hex.slice(-4), 16);
  const metadataHexLength = (metadataLength + 2) * 2;
  if (!Number.isFinite(metadataLength) || metadataHexLength > hex.length) {
    return { code: hex, metadataBytes: 0 };
  }
  return {
    code: hex.slice(0, -metadataHexLength),
    metadataBytes: metadataLength + 2,
  };
}

function disassemble(hex) {
  const bytes = Buffer.from(hex, "hex");
  const instructions = [];
  for (let pc = 0; pc < bytes.length; pc += 1) {
    const opcode = bytes[pc];
    const name =
      OPCODES[opcode] || `UNKNOWN_0x${opcode.toString(16).padStart(2, "0")}`;
    if (opcode >= 0x60 && opcode <= 0x7f) {
      const width = opcode - 0x5f;
      const immediate = bytes.subarray(pc + 1, pc + 1 + width).toString("hex");
      instructions.push(`${name} 0x${immediate}`);
      pc += width;
    } else {
      instructions.push(name);
    }
  }
  return instructions.join(" ");
}

function normalizeReferences(references) {
  const normalized = [];
  for (const [source, libraries] of Object.entries(references || {})) {
    for (const [library, offsets] of Object.entries(libraries)) {
      normalized.push({ source, library, offsets });
    }
  }
  return normalized.sort((a, b) =>
    `${a.source}:${a.library}`.localeCompare(`${b.source}:${b.library}`)
  );
}

function bytecodeSummary(bytecode) {
  const raw = bytecode.object || "";
  if (raw.length === 0) return { available: false, sizeBytes: 0 };
  if (!/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error("Unlinked bytecode cannot be hashed deterministically");
  }

  const { code, metadataBytes } = stripMetadata(raw);
  return {
    available: true,
    sizeBytes: raw.length / 2,
    metadataBytes,
    keccak256: ethersKeccak(`0x${raw}`),
    metadataStrippedSizeBytes: code.length / 2,
    metadataStrippedKeccak256: ethersKeccak(`0x${code}`),
    metadataStrippedOpcodes: disassemble(code),
    linkReferences: normalizeReferences(bytecode.linkReferences),
    immutableReferences: sorted(bytecode.immutableReferences || {}),
  };
}

function selectorsFor(contractOutput) {
  return Object.entries(contractOutput.evm.methodIdentifiers || {})
    .map(([signature, selector]) => ({
      signature,
      selector: `0x${selector}`,
    }))
    .sort((a, b) => a.signature.localeCompare(b.signature));
}

function abiDetails(abi, contractOutput) {
  const selectors = new Map(
    selectorsFor(contractOutput).map((entry) => [
      entry.signature,
      entry.selector,
    ])
  );
  const functions = [];
  const events = [];
  const errors = [];

  for (const entry of abi) {
    const signature = abiSignature(entry);
    if (entry.type === "function") {
      functions.push({ signature, selector: selectors.get(signature) });
    } else if (entry.type === "event") {
      events.push({ signature, topic0: ethersId(signature) });
    } else if (entry.type === "error") {
      errors.push({ signature, selector: ethersId(signature).slice(0, 10) });
    }
  }

  const bySignature = (a, b) => a.signature.localeCompare(b.signature);
  return {
    functions: functions.sort(bySignature),
    events: events.sort(bySignature),
    errors: errors.sort(bySignature),
  };
}

function contractSummary(output, source, contractName) {
  const contractOutput = output.contracts[source]?.[contractName];
  if (!contractOutput)
    throw new Error(`Missing compiler output ${source}:${contractName}`);
  const abi = normalizeAbi(contractOutput.abi || []);

  const summary = {
    abi,
    ...abiDetails(abi, contractOutput),
    storageLayout: normalizeStorageLayout(contractOutput.storageLayout || {}),
    creationBytecode: bytecodeSummary(contractOutput.evm.bytecode),
    runtimeBytecode: bytecodeSummary(contractOutput.evm.deployedBytecode),
  };
  if (summary.runtimeBytecode.sizeBytes > 24_576) {
    throw new Error(`${contractName} exceeds the EIP-170 runtime size limit`);
  }
  return summary;
}

function walkAst(value, visitor) {
  if (Array.isArray(value)) {
    for (const item of value) walkAst(item, visitor);
  } else if (value && typeof value === "object") {
    visitor(value);
    for (const child of Object.values(value)) walkAst(child, visitor);
  }
}

function enumSummary(output) {
  const enums = [];
  for (const [source, sourceOutput] of Object.entries(output.sources || {})) {
    if (
      source !== "contracts/Wrapper.sol" &&
      !source.startsWith("contracts/token/")
    ) {
      continue;
    }
    walkAst(sourceOutput.ast, (node) => {
      if (node.nodeType !== "EnumDefinition") return;
      enums.push({
        source,
        name: node.canonicalName || node.name,
        members: node.members.map((member, ordinal) => ({
          name: member.name,
          ordinal,
        })),
      });
    });
  }
  return enums.sort((a, b) =>
    `${a.source}:${a.name}`.localeCompare(`${b.source}:${b.name}`)
  );
}

function callableSignature(node, prefix = "") {
  const name = node.kind === "constructor" ? "constructor" : node.name;
  const parameters = (node.parameters?.parameters || []).map((parameter) => {
    const type = parameter.typeDescriptions?.typeString;
    if (!type) {
      throw new Error(
        `Missing compiler type for ${prefix}${name || node.kind} parameter`
      );
    }
    return type;
  });
  return `${prefix}${name || node.kind}(${parameters.join(",")})`;
}

function projectRevertStringSummary(output) {
  const discovered = [];

  function visit(value, context) {
    if (Array.isArray(value)) {
      for (const child of value) visit(child, context);
      return;
    }
    if (!value || typeof value !== "object") return;

    let nextContext = context;
    if (value.nodeType === "ContractDefinition") {
      nextContext = { ...context, contract: value.name };
    } else if (value.nodeType === "FunctionDefinition") {
      nextContext = {
        ...context,
        callable: callableSignature(value),
      };
    } else if (value.nodeType === "ModifierDefinition") {
      nextContext = {
        ...context,
        callable: callableSignature(value, "modifier "),
      };
    }

    if (
      value.nodeType === "FunctionCall" &&
      value.expression?.nodeType === "Identifier" &&
      ["require", "revert"].includes(value.expression.name)
    ) {
      const callKind = value.expression.name;
      const message =
        callKind === "require" ? value.arguments?.[1] : value.arguments?.[0];
      if (message?.nodeType === "Literal" && message.kind === "string") {
        if (!nextContext.contract || !nextContext.callable) {
          throw new Error(
            `Project revert string is outside a contract callable in ${context.source}`
          );
        }
        const sourceOffset = Number.parseInt(
          String(value.src).split(":")[0],
          10
        );
        if (!Number.isInteger(sourceOffset)) {
          throw new Error(`Invalid AST source location in ${context.source}`);
        }
        discovered.push({
          source: context.source,
          contract: nextContext.contract,
          callable: nextContext.callable,
          callKind,
          sourceOffset,
          value: message.value,
        });
      }
    }

    for (const child of Object.values(value)) visit(child, nextContext);
  }

  for (const source of Object.keys(output.sources || {}).sort()) {
    if (
      source !== "contracts/Wrapper.sol" &&
      !source.startsWith("contracts/token/")
    ) {
      continue;
    }
    const ast = output.sources[source]?.ast;
    if (!ast) throw new Error(`Missing AST for project source ${source}`);
    visit(ast, { source, contract: null, callable: null });
  }

  discovered.sort((left, right) => {
    const sourceOrder = left.source.localeCompare(right.source);
    if (sourceOrder !== 0) return sourceOrder;
    return left.sourceOffset - right.sourceOffset;
  });

  const ordinals = new Map();
  return discovered.map(({ sourceOffset: _sourceOffset, ...entry }) => {
    const key = `${entry.source}:${entry.contract}:${entry.callable}:${entry.callKind}`;
    const ordinal = ordinals.get(key) || 0;
    ordinals.set(key, ordinal + 1);
    return { ...entry, ordinal };
  });
}

function xorInterfaceId(selectors) {
  let value = 0;
  for (const selector of selectors)
    value ^= Number.parseInt(selector.slice(2), 16);
  return `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
}

function interfaceSummary(output) {
  const interfaces = {};
  for (const [source, contractName] of PROJECT_INTERFACES) {
    const contractOutput = output.contracts[source][contractName];
    const functions = selectorsFor(contractOutput);
    interfaces[`${source}:${contractName}`] = {
      interfaceId: xorInterfaceId(functions.map((entry) => entry.selector)),
      functions,
    };
  }
  return sorted(interfaces);
}

function temporaryFile(name) {
  return path.join(
    os.tmpdir(),
    `partial-common-ownership-${process.pid}-${crypto
      .randomBytes(6)
      .toString("hex")}-${name}`
  );
}

function captureHardhatTests() {
  const outputPath = temporaryFile("hardhat-tests.json");
  try {
    run(
      hardhatBinary(),
      [
        "--config",
        HARDHAT_CONFIG,
        "test",
        "tests/Interoperability.smoke.ts",
        "--no-compile",
      ],
      {
        env: { COMPAT_HARDHAT_RESULTS: outputPath },
      }
    );
    const results = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (results.failed.length > 0 || results.pending.length > 0) {
      throw new Error(
        `Hardhat suite was not completely green: ${results.failed.length} failed, ${results.pending.length} pending`
      );
    }
    return {
      count: results.passed.length,
      names: results.passed,
    };
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
}

function parseJsonAfterCompilerOutput(stdout) {
  const lines = stdout.split(/\r?\n/);
  const firstJsonLine = lines.findIndex((line) =>
    line.trimStart().startsWith("{")
  );
  if (firstJsonLine < 0)
    throw new Error("Forge did not emit JSON test discovery output");
  return JSON.parse(lines.slice(firstJsonLine).join("\n"));
}

function captureForgeTests() {
  const discovery = run(FORGE_BIN, ["test", "--list", "--json"]);
  const listed = parseJsonAfterCompilerOutput(discovery.stdout);
  const names = [];
  for (const source of Object.keys(listed).sort()) {
    for (const contractName of Object.keys(listed[source]).sort()) {
      for (const testName of listed[source][contractName].slice().sort()) {
        names.push(`${source}:${contractName}:${testName}`);
      }
    }
  }

  const execution = parseJsonAfterCompilerOutput(
    run(FORGE_BIN, ["test", "--json"]).stdout
  );
  const executedNames = [];
  const unsuccessful = [];
  for (const [suiteName, suite] of Object.entries(execution)) {
    const separator = suiteName.lastIndexOf(":");
    if (separator < 0 || !suite.test_results) {
      throw new Error(`Forge emitted an invalid execution suite: ${suiteName}`);
    }
    const source = suiteName.slice(0, separator);
    const contractName = suiteName.slice(separator + 1);
    for (const [signature, result] of Object.entries(suite.test_results)) {
      const testName = signature.replace(/\(.*$/, "");
      const fullName = `${source}:${contractName}:${testName}`;
      executedNames.push(fullName);
      if (result.status !== "Success") {
        unsuccessful.push(`${fullName}: ${result.status}`);
      }
    }
  }
  executedNames.sort();
  if (!valuesEqual(executedNames, names)) {
    throw new Error("Forge executed inventory differs from test discovery");
  }
  if (unsuccessful.length > 0) {
    throw new Error(
      `Forge suite contains failed or skipped tests:\n${unsuccessful.join(
        "\n"
      )}`
    );
  }
  return { count: names.length, names };
}

function captureGasSnapshot() {
  const outputPath = temporaryFile("gas-snapshot.txt");
  try {
    run(FORGE_BIN, [
      "snapshot",
      "--fuzz-seed",
      "0x721",
      "--fuzz-runs",
      "256",
      "--match-contract",
      "^(BeneficiaryTest|RemittanceTest|ValuationTest)$",
      "--snap",
      outputPath,
    ]);
    return {
      fuzzSeed: "0x721",
      entries: fs
        .readFileSync(outputPath, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .sort(),
    };
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
}

function captureErc165(interfaces) {
  const probes = [
    { name: "IERC165", interfaceId: "0x01ffc9a7" },
    { name: "IERC721", interfaceId: "0x80ac58cd" },
    { name: "IERC721Metadata", interfaceId: "0x5b5e139f" },
    ...Object.entries(interfaces).map(([qualifiedName, description]) => ({
      name: qualifiedName,
      interfaceId: description.interfaceId,
    })),
    { name: "invalid", interfaceId: "0xffffffff" },
  ].sort((a, b) =>
    `${a.name}:${a.interfaceId}`.localeCompare(`${b.name}:${b.interfaceId}`)
  );

  const outputPath = temporaryFile("erc165.json");
  try {
    run(
      hardhatBinary(),
      ["run", "--no-compile", "compatibility/erc165.capture.ts"],
      {
        env: {
          COMPAT_ERC165_RESULTS: outputPath,
          COMPAT_ERC165_PROBES: JSON.stringify(probes),
        },
      }
    );
    return JSON.parse(fs.readFileSync(outputPath, "utf8"));
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
}

function compilerSettings(buildInfo, input) {
  return {
    version: buildInfo.solcVersion,
    longVersion: buildInfo.solcLongVersion,
    settings: sorted(input.settings),
  };
}

function forgeVersionSummary() {
  return run(FORGE_BIN, ["--version"])
    .stdout.trim()
    .split(/\r?\n/)
    .map((line) =>
      line.startsWith("Build Timestamp:")
        ? "Build Timestamp: <platform-specific>"
        : line
    );
}

async function generateManifest() {
  run(hardhatBinary(), ["compile", "--force"]);
  const buildInfo = findBuildInfo();
  const compilerInput = normalizeCompilerInput(buildInfo);
  const output = await compileExtended(buildInfo, compilerInput);
  const contracts = {};
  for (const [source, contractName] of TARGETS) {
    contracts[`${source}:${contractName}`] = contractSummary(
      output,
      source,
      contractName
    );
  }
  const interfaces = interfaceSummary(output);
  const hardhat = captureHardhatTests();
  const forge = captureForgeTests();

  return sorted({
    schemaVersion: 1,
    baselineSourceCommit: BASELINE_SOURCE_COMMIT,
    toolchain: {
      forge: forgeVersionSummary(),
    },
    compiler: compilerSettings(buildInfo, compilerInput),
    contracts,
    enums: enumSummary(output),
    projectRevertStrings: projectRevertStringSummary(output),
    interfaces,
    erc165: {
      contract: "contracts/Wrapper.sol:Wrapper",
      probes: captureErc165(interfaces),
    },
    tests: {
      hardhat,
      forge,
      total: hardhat.count + forge.count,
    },
    gasSnapshot: captureGasSnapshot(),
  });
}

function preview(value) {
  const rendered = JSON.stringify(value);
  if (rendered === undefined) return "undefined";
  return rendered.length <= 180 ? rendered : `${rendered.slice(0, 177)}...`;
}

function collectDifferences(
  expected,
  actual,
  location = "$",
  differences = []
) {
  if (Object.is(expected, actual)) return differences;

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      differences.push({
        path: `${location}.length`,
        baselineValue: expected.length,
        candidateValue: actual.length,
      });
    }
    const length = Math.min(expected.length, actual.length);
    for (let i = 0; i < length; i += 1) {
      collectDifferences(
        expected[i],
        actual[i],
        `${location}[${i}]`,
        differences
      );
    }
    return differences;
  }

  if (
    expected &&
    actual &&
    typeof expected === "object" &&
    typeof actual === "object" &&
    !Array.isArray(expected) &&
    !Array.isArray(actual)
  ) {
    const keys = Array.from(
      new Set([...Object.keys(expected), ...Object.keys(actual)])
    ).sort();
    for (const key of keys) {
      collectDifferences(
        expected[key],
        actual[key],
        `${location}.${key}`,
        differences
      );
    }
    return differences;
  }

  differences.push({
    path: location,
    baselineValue: expected,
    candidateValue: actual,
  });
  return differences;
}

function formatDifference(difference) {
  return `${difference.path}: ${preview(difference.baselineValue)} != ${preview(
    difference.candidateValue
  )}`;
}

function valuesEqual(left, right) {
  return stableJson(left) === stableJson(right);
}

function readReviewedDifferences() {
  if (!fs.existsSync(REVIEW_PATH)) return null;
  const review = JSON.parse(fs.readFileSync(REVIEW_PATH, "utf8"));
  if (review.schemaVersion !== 1) {
    throw new Error(
      `Unsupported compatibility review schema in ${REVIEW_PATH}`
    );
  }
  if (!Array.isArray(review.allowedDifferences)) {
    throw new Error("Compatibility review must contain allowedDifferences");
  }
  if (!review.candidate || typeof review.candidate !== "string") {
    throw new Error("Compatibility review must name its candidate");
  }
  if (!review.policy || typeof review.policy !== "string") {
    throw new Error("Compatibility review must name an enumerated policy");
  }
  return review;
}

function reviewPolicy(review) {
  const policy = REVIEW_POLICIES[review.policy];
  if (!policy) {
    throw new Error(
      `Unknown compatibility review policy: ${review.policy}. Add a named policy to scripts/compatibility.js before reviewing a new class of change.`
    );
  }
  if (policy.candidate !== review.candidate) {
    throw new Error(
      `Compatibility review policy ${review.policy} is restricted to ${policy.candidate}, not ${review.candidate}`
    );
  }
  if (policy.requiredOpcodeEvidence) {
    const required = policy.requiredOpcodeEvidence;
    const supplied = review.opcodeEvidence;
    if (!supplied || typeof supplied !== "object") {
      throw new Error(
        `Compatibility review policy ${review.policy} requires opcode evidence`
      );
    }
    if (supplied.mode !== required.mode) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires opcode evidence mode ${required.mode}`
      );
    }
    if (supplied.path !== required.path) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires checked-in opcode evidence at ${required.path}`
      );
    }
    if (!Array.isArray(supplied.contracts)) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires an exact opcode evidence contract set`
      );
    }
    const requiredContracts = [...required.contracts].sort();
    const suppliedContracts = [...new Set(supplied.contracts)].sort();
    if (
      suppliedContracts.length !== supplied.contracts.length ||
      !valuesEqual(suppliedContracts, requiredContracts)
    ) {
      throw new Error(
        `Compatibility review policy ${
          review.policy
        } requires opcode evidence for exactly: ${requiredContracts.join(", ")}`
      );
    }
  }
  if (policy.requiredSafetyEvidence) {
    const required = policy.requiredSafetyEvidence;
    const supplied = review.safetyEvidence;
    if (!supplied || typeof supplied !== "object") {
      throw new Error(
        `Compatibility review policy ${review.policy} requires safety-baseline evidence`
      );
    }
    if (
      supplied.path !== required.path ||
      supplied.sha256 !== required.sha256
    ) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires exact safety evidence ${required.path} at ${required.sha256}`
      );
    }
  }
  if (policy.requiredStage08Evidence) {
    const required = policy.requiredStage08Evidence;
    const supplied = review.stage08Evidence;
    if (!supplied || !valuesEqual(supplied, required)) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires exact inherited Stage 8 evidence ${required.path} at ${required.sha256}`
      );
    }
  }
  if (policy.requiredStage09Evidence) {
    const required = policy.requiredStage09Evidence;
    const supplied = review.stage09Evidence;
    if (!supplied || !valuesEqual(supplied, required)) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires exact inherited Stage 9 evidence ${required.path} at ${required.sha256}`
      );
    }
  }
  if (policy.requiredBehaviorEvidence) {
    const supplied = review.behaviorEvidence;
    if (!supplied || !valuesEqual(supplied, policy.requiredBehaviorEvidence)) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires exact behavior evidence`
      );
    }
  }
  if (policy.requiredSecurity01Checkpoint) {
    const supplied = review.security01Checkpoint;
    if (
      !supplied ||
      !valuesEqual(supplied, policy.requiredSecurity01Checkpoint)
    ) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires the exact Security 01 checkpoint`
      );
    }
  }
  if (policy.requiredSecurity02Checkpoint) {
    const supplied = review.security02Checkpoint;
    if (
      !supplied ||
      !valuesEqual(supplied, policy.requiredSecurity02Checkpoint)
    ) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires the exact Security 02 checkpoint`
      );
    }
  }
  if (policy.requiredSecurity03Checkpoint) {
    const supplied = review.security03Checkpoint;
    if (
      !supplied ||
      !valuesEqual(supplied, policy.requiredSecurity03Checkpoint)
    ) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires the exact Security 03 checkpoint`
      );
    }
  }
  if (policy.requiredSecurity04Checkpoint) {
    const supplied = review.security04Checkpoint;
    if (
      !supplied ||
      !valuesEqual(supplied, policy.requiredSecurity04Checkpoint)
    ) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires the exact Security 04 checkpoint`
      );
    }
  }
  if (policy.requiredStage10Checkpoint) {
    const supplied = review.stage10Checkpoint;
    if (!supplied || !valuesEqual(supplied, policy.requiredStage10Checkpoint)) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires the exact Stage 10 checkpoint`
      );
    }
  }
  if (policy.requiredStage11Checkpoint) {
    const supplied = review.stage11Checkpoint;
    if (!supplied || !valuesEqual(supplied, policy.requiredStage11Checkpoint)) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires the exact Stage 11 checkpoint`
      );
    }
  }
  if (policy.requiresStage10ReceiverEvidence) {
    const expected = stage10ReceiverReviewEvidence();
    if (!valuesEqual(review.receiverEvidence, expected)) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires the exact Stage 10 receiver inventory and source evidence`
      );
    }
  }
  if (policy.requiresStage11SmokeEvidence) {
    const expected = stage11SmokeReviewEvidence();
    if (!valuesEqual(review.smokeEvidence, expected)) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires the exact Stage 11 Hardhat smoke inventory and source evidence`
      );
    }
  }
  if (policy.requiresStage12aMigrationEvidence) {
    const expected = stage12aMigrationReviewEvidence();
    if (!valuesEqual(review.migrationEvidence, expected)) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires the exact Stage 12a dependency, config, and smoke migration evidence`
      );
    }
  }
  if (policy.requiredForgeStdEvidence) {
    const required = policy.requiredForgeStdEvidence;
    const supplied = review.forgeStdEvidence;
    if (!supplied || !valuesEqual(supplied, required)) {
      throw new Error(
        `Compatibility review policy ${review.policy} requires forge-std ${required.tag} at ${required.candidateCommit} from ${required.previousCommit}`
      );
    }
  }
  return policy;
}

function nonWaivableReviewDomain(reviewPath) {
  return NON_WAIVABLE_REVIEW_PATHS.find(({ pattern }) =>
    pattern.test(reviewPath)
  );
}

function validateReviewedDifferences(review, baselineBytes, differences) {
  if (!review) return;

  const policy = reviewPolicy(review);
  const baselineDigest = sha256(baselineBytes);
  if (review.baselineSha256 !== baselineDigest) {
    throw new Error(
      `Compatibility review targets baseline ${review.baselineSha256}, but the checked-in baseline is ${baselineDigest}`
    );
  }

  const allowedByPath = new Map();
  for (const allowance of review.allowedDifferences) {
    if (!allowance.path || typeof allowance.path !== "string") {
      throw new Error("Every reviewed difference must have an exact path");
    }
    if (allowedByPath.has(allowance.path)) {
      throw new Error(`Duplicate reviewed difference path: ${allowance.path}`);
    }
    const protectedDomain = nonWaivableReviewDomain(allowance.path);
    if (
      protectedDomain &&
      !(
        policy.permitsProtectedPath &&
        policy.permitsProtectedPath(allowance.path, protectedDomain.name)
      )
    ) {
      throw new Error(
        `Reviewed differences may never waive ${protectedDomain.name}: ${allowance.path}`
      );
    }
    if (!policy.permits(allowance.path)) {
      throw new Error(
        `Compatibility review policy ${review.policy} does not permit path: ${allowance.path}`
      );
    }
    if (!Object.prototype.hasOwnProperty.call(allowance, "baselineValue")) {
      throw new Error(
        `Reviewed difference ${allowance.path} is missing baselineValue`
      );
    }
    if (!Object.prototype.hasOwnProperty.call(allowance, "candidateValue")) {
      throw new Error(
        `Reviewed difference ${allowance.path} is missing candidateValue`
      );
    }
    if (!allowance.reason || typeof allowance.reason !== "string") {
      throw new Error(
        `Reviewed difference ${allowance.path} is missing its reason`
      );
    }
    allowedByPath.set(allowance.path, allowance);
  }

  const usedPaths = new Set();
  const rejected = [];
  for (const difference of differences) {
    const allowance = allowedByPath.get(difference.path);
    if (!allowance) {
      rejected.push(`unreviewed: ${formatDifference(difference)}`);
      continue;
    }
    usedPaths.add(difference.path);
    if (
      !valuesEqual(allowance.baselineValue, difference.baselineValue) ||
      !valuesEqual(allowance.candidateValue, difference.candidateValue)
    ) {
      rejected.push(
        `review does not match exact old/new values: ${formatDifference(
          difference
        )}`
      );
    }
  }

  for (const allowance of review.allowedDifferences) {
    if (!usedPaths.has(allowance.path)) {
      rejected.push(`unused reviewed difference: ${allowance.path}`);
    }
  }

  if (rejected.length > 0) {
    throw new Error(
      `Compatibility candidate ${
        review.candidate
      } did not match its review:\n${rejected
        .map((entry) => `- ${entry}`)
        .join("\n")}`
    );
  }
}

function stage08ReviewReason(reviewPath) {
  if (/^\$\.compiler\.(?:version|longVersion)$/.test(reviewPath)) {
    return "Tool configurations are pinned to exact Solidity 0.8.36; every compiler setting other than version remains unchanged.";
  }
  if (STAGE_08_BYTECODE_PATH.test(reviewPath)) {
    return "Solidity 0.8.36 changes compiler-generated bytecode; the checked-in evidence records complete metadata-stripped opcode changes, raw and normalized hashes and sizes, and EIP-170 validation.";
  }
  if (STAGE_08_GAS_SNAPSHOT_PATH.test(reviewPath)) {
    return "Solidity 0.8.36 changes compiler-generated gas; this exact snapshot delta is reviewed with the checked-in PCO and Wrapper key-flow gas evidence.";
  }
  if (reviewPath === "$.toolchain.forge[2]") {
    return "Official Foundry 1.7.1 binaries share the pinned version and commit but embed platform-specific build timestamps; the manifest compares the stable version, commit, and build profile.";
  }
  if (
    reviewPath === "$.tests.total" ||
    STAGE_06_FORGE_TEST_PATH.test(reviewPath)
  ) {
    return "Stage 8 preserves the Stage 7 inventory exactly: 89 Hardhat oracle tests, 104 mapped Forge behaviors, and 36 Forge safety tests.";
  }
  throw new Error(`Stage 8 has no review reason for ${reviewPath}`);
}

function stage08Review(baselineBytes, differences) {
  return {
    schemaVersion: 1,
    candidate: "stage-08-solidity-0-8-36",
    policy: "stage-08-solidity-0-8-36-compiler",
    baselineSha256: sha256(baselineBytes),
    allowedDifferences: differences.map((difference) => ({
      ...difference,
      reason: stage08ReviewReason(difference.path),
    })),
    opcodeEvidence: {
      mode: "metadata-stripped-full-diff",
      path: STAGE_08_OPCODE_EVIDENCE_PATH,
      contracts: [...STAGE_08_PRODUCTION_CONTRACTS],
    },
    safetyEvidence: {
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    },
  };
}

function stage09ExpectedReviewPaths() {
  const paths = ["$.compiler.longVersion", "$.compiler.version"];
  for (const qualifiedName of STAGE_08_PRODUCTION_CONTRACTS) {
    for (const bytecodeKind of ["creationBytecode", "runtimeBytecode"]) {
      for (const field of [
        "keccak256",
        "metadataStrippedKeccak256",
        "metadataStrippedOpcodes",
        "metadataStrippedSizeBytes",
        "sizeBytes",
      ]) {
        paths.push(`$.contracts.${qualifiedName}.${bytecodeKind}.${field}`);
      }
    }
  }
  for (const index of [...STAGE_09_RELATIVE_GAS_PATHS].sort((a, b) => a - b)) {
    paths.push(`$.gasSnapshot.entries[${index}]`);
  }
  paths.push(
    "$.tests.forge.count",
    "$.tests.forge.names.length",
    "$.tests.total",
    "$.toolchain.forge[2]"
  );
  return paths.sort();
}

function stage09ReviewReason(reviewPath) {
  if (
    /^\$\.compiler\.(?:version|longVersion)$/.test(reviewPath) ||
    STAGE_08_BYTECODE_PATH.test(reviewPath)
  ) {
    return "This is the unchanged Stage 8 Solidity 0.8.36 compiler output; Stage 9 digest-binds the prior evidence and requires exact compiler, bytecode, opcode, hash, and size equality against it.";
  }
  if (STAGE_08_GAS_SNAPSHOT_PATH.test(reviewPath)) {
    return "Relative to Stage 8, forge-std v1.16.2 changes only this legacy test-harness gas result; Stage 9 evidence records the exact prior and candidate values while production output remains unchanged and all 12 key flows remain within policy.";
  }
  if (reviewPath === "$.toolchain.forge[2]") {
    return "Official Foundry 1.7.1 binaries share the pinned version and commit but embed platform-specific build timestamps; the manifest compares the stable version, commit, and build profile.";
  }
  if (
    reviewPath === "$.tests.total" ||
    STAGE_06_FORGE_TEST_PATH.test(reviewPath)
  ) {
    return "Stage 9 preserves the exact Stage 8 inventory: 89 Hardhat oracle tests, 104 mapped Forge behaviors, and 36 Forge safety tests.";
  }
  throw new Error(`Stage 9 has no review reason for ${reviewPath}`);
}

function stage09Review(baselineBytes, differences) {
  const actualPaths = differences
    .map(({ path: reviewPath }) => reviewPath)
    .sort();
  const expectedPaths = stage09ExpectedReviewPaths();
  if (!valuesEqual(actualPaths, expectedPaths)) {
    const pathDifferences = collectDifferences(
      expectedPaths,
      actualPaths,
      "$.stage09ReviewPaths"
    );
    throw new Error(
      `Stage 9 requires exactly ${
        expectedPaths.length
      } baseline differences:\n${pathDifferences
        .slice(0, 20)
        .map((difference) => `- ${formatDifference(difference)}`)
        .join("\n")}`
    );
  }
  return {
    schemaVersion: 1,
    candidate: STAGE_09_CANDIDATE,
    policy: "stage-09-forge-std-1-16-2",
    baselineSha256: sha256(baselineBytes),
    allowedDifferences: differences.map((difference) => ({
      ...difference,
      reason: stage09ReviewReason(difference.path),
    })),
    opcodeEvidence: {
      mode: "stage-08-production-equality",
      path: STAGE_09_OPCODE_EVIDENCE_PATH,
      contracts: [...STAGE_08_PRODUCTION_CONTRACTS],
    },
    stage08Evidence: {
      path: STAGE_08_OPCODE_EVIDENCE_PATH,
      sha256: STAGE_08_EVIDENCE_SHA256,
    },
    forgeStdEvidence: {
      path: STAGE_09_FORGE_STD_PATH,
      previousCommit: STAGE_09_FORGE_STD_PREVIOUS_COMMIT,
      candidateCommit: STAGE_09_FORGE_STD_COMMIT,
      tag: STAGE_09_FORGE_STD_TAG,
      packageVersion: STAGE_09_FORGE_STD_VERSION,
    },
    safetyEvidence: {
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    },
  };
}

function security01ReviewReason(reviewPath) {
  if (/^\$\.compiler\.(?:version|longVersion)$/.test(reviewPath)) {
    return "Security 01 inherits the exact Solidity 0.8.36 compiler identity from the green Stage 9 checkpoint; compiler settings remain hard-equal to the immutable baseline.";
  }
  if (STAGE_08_BYTECODE_PATH.test(reviewPath)) {
    return "The authorized post-hook owner recheck changes compiler-generated production bytecode. Security 01 records complete Stage-9-relative opcode diffs, hashes, sizes, EIP-170 checks, and source-patch provenance.";
  }
  if (STAGE_08_GAS_SNAPSHOT_PATH.test(reviewPath)) {
    return "The authorized production recheck changes deployment and transfer-path gas. Security 01 records exact Stage-9-relative legacy gas entries and enforces the existing 12-flow max(3%, 2,000 gas) policy.";
  }
  if (reviewPath === "$.toolchain.forge[2]") {
    return "Official Foundry 1.7.1 binaries share the pinned version and commit but embed platform-specific build timestamps; the manifest compares the stable version, commit, and build profile.";
  }
  if (/^\$\.projectRevertStrings(?:\.|\[|$)/.test(reviewPath)) {
    return "Security 01 duplicates the existing incorrect-owner Error(string) callsite after _beforeTokenTransfer. The protected value, callable, call kind, and all other revert callsites remain exact.";
  }
  throw new Error(`Security 01 has no review reason for ${reviewPath}`);
}

function security01Review(baselineBytes, differences) {
  return {
    schemaVersion: 1,
    candidate: SECURITY_01_CANDIDATE,
    policy: SECURITY_01_POLICY,
    baselineSha256: sha256(baselineBytes),
    allowedDifferences: differences.map((difference) => ({
      ...difference,
      reason: security01ReviewReason(difference.path),
    })),
    opcodeEvidence: {
      mode: "security-01-stage-09-relative-full-diff",
      path: SECURITY_01_EVIDENCE_PATH,
      contracts: [...STAGE_08_PRODUCTION_CONTRACTS],
    },
    stage09Evidence: {
      path: STAGE_09_OPCODE_EVIDENCE_PATH,
      sha256: STAGE_09_EVIDENCE_SHA256,
    },
    behaviorEvidence: SECURITY_01_BEHAVIOR_EVIDENCE,
    safetyEvidence: {
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    },
  };
}

function security02ReviewReason(reviewPath) {
  if (STAGE_08_BYTECODE_PATH.test(reviewPath)) {
    return "The authorized PCO initialization-before-receiver-callback change alters compiler-generated production bytecode. Security 02 records complete Security-01-relative opcode diffs, hashes, sizes, EIP-170 checks, and exact source provenance.";
  }
  if (STAGE_08_GAS_SNAPSHOT_PATH.test(reviewPath)) {
    return "The authorized mint-order change affects this deterministic gas result. Security 02 records the exact Security-01-relative legacy entry and rechecks all 12 key flows against max(3%, 2,000 gas).";
  }
  if (/^\$\.projectRevertStrings(?:\.|\[|$)/.test(reviewPath)) {
    return "Security 02 moves the existing ERC721 receiver acceptance check after complete PCO initialization, adding one callsite with the unchanged receiver-error payload. Every checkpoint callsite and payload remains exact.";
  }
  throw new Error(`Security 02 has no review reason for ${reviewPath}`);
}

function security02Review(baselineBytes, differences) {
  return {
    schemaVersion: 1,
    candidate: SECURITY_02_CANDIDATE,
    policy: SECURITY_02_POLICY,
    baselineSha256: sha256(baselineBytes),
    allowedDifferences: differences.map((difference) => ({
      ...difference,
      reason: security02ReviewReason(difference.path),
    })),
    opcodeEvidence: {
      mode: "security-02-security-01-relative-full-diff",
      path: SECURITY_02_EVIDENCE_PATH,
      contracts: [...STAGE_08_PRODUCTION_CONTRACTS],
    },
    security01Checkpoint: SECURITY_02_CHECKPOINT_BINDING,
    behaviorEvidence: SECURITY_02_BEHAVIOR_EVIDENCE,
    safetyEvidence: {
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    },
  };
}

function security03ReviewReason(reviewPath) {
  if (STAGE_08_BYTECODE_PATH.test(reviewPath)) {
    return "The exact post-tax authorization and takeover-payment stabilization changes compiler-generated production bytecode. Security 03 records complete Security-02-relative opcode diffs, raw and normalized hashes and sizes, EIP-170 checks, source transforms, and behavior provenance.";
  }
  if (STAGE_08_GAS_SNAPSHOT_PATH.test(reviewPath)) {
    return "The authorized production stabilization affects this deterministic gas result. Security 03 records the exact Security-02-relative legacy entry and rechecks all 12 key flows against max(3%, 2,000 gas).";
  }
  if (/^\$\.projectRevertStrings(?:\.|\[|$)/.test(reviewPath)) {
    return "Takeover payment checks now execute after collection, so the existing already-owner callsite precedes the three unchanged payment callsites. Security 03 requires the exact reviewed ordering with no added, removed, or changed payload or callsite.";
  }
  throw new Error(`Security 03 has no review reason for ${reviewPath}`);
}

function security03Review(baselineBytes, differences) {
  return {
    schemaVersion: 1,
    candidate: SECURITY_03_CANDIDATE,
    policy: SECURITY_03_POLICY,
    baselineSha256: sha256(baselineBytes),
    allowedDifferences: differences.map((difference) => ({
      ...difference,
      reason: security03ReviewReason(difference.path),
    })),
    opcodeEvidence: {
      mode: "security-03-security-02-relative-full-diff",
      path: SECURITY_03_EVIDENCE_PATH,
      contracts: [...STAGE_08_PRODUCTION_CONTRACTS],
    },
    security02Checkpoint: SECURITY_03_CHECKPOINT_BINDING,
    behaviorEvidence: SECURITY_03_BEHAVIOR_EVIDENCE,
    safetyEvidence: {
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    },
  };
}

function security04ReviewReason(reviewPath) {
  if (SECURITY_04_WRAPPER_BYTECODE_PATH.test(reviewPath)) {
    return "The exact foreclosed-unwrap self-destination guard changes Wrapper compiler output. Security 04 records complete Security-03-relative Wrapper opcode diffs, raw and normalized hashes and sizes, EIP-170 checks, exact source placement, and behavior provenance; standalone PartialCommonOwnership remains exact.";
  }
  if (STAGE_08_GAS_SNAPSHOT_PATH.test(reviewPath)) {
    return "The authorized Wrapper guard affects this deterministic gas result. Security 04 records the exact Security-03-relative legacy entry and rechecks all 12 key flows against max(3%, 2,000 gas).";
  }
  throw new Error(`Security 04 has no review reason for ${reviewPath}`);
}

function security04Review(baselineBytes, differences) {
  return {
    schemaVersion: 1,
    candidate: SECURITY_04_CANDIDATE,
    policy: SECURITY_04_POLICY,
    baselineSha256: sha256(baselineBytes),
    allowedDifferences: differences.map((difference) => ({
      ...difference,
      reason: security04ReviewReason(difference.path),
    })),
    opcodeEvidence: {
      mode: "security-04-security-03-relative-wrapper-only",
      path: SECURITY_04_EVIDENCE_PATH,
      contracts: [...STAGE_08_PRODUCTION_CONTRACTS],
    },
    security03Checkpoint: SECURITY_04_CHECKPOINT_BINDING,
    behaviorEvidence: SECURITY_04_BEHAVIOR_EVIDENCE,
    safetyEvidence: {
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    },
  };
}

function stage10ReviewReason(reviewPath) {
  if (STAGE_10_BYTECODE_PATH.test(reviewPath)) {
    return "OpenZeppelin 5.6.1, the shipped ^0.8.20 pragmas, and the behavior-equivalent code.length receiver check change compiler-generated production bytecode. Stage 10 records complete Security-04-relative opcode diffs, raw and normalized hashes and sizes, exact source-closure provenance, and EIP-170 validation.";
  }
  if (STAGE_08_GAS_SNAPSHOT_PATH.test(reviewPath)) {
    return "The exact OpenZeppelin 5.6.1 dependency/source closure changes this deterministic gas result. Stage 10 records the exact Security-04-relative legacy entry and rechecks all 12 key flows against max(3%, 2,000 gas).";
  }
  throw new Error(`Stage 10 has no review reason for ${reviewPath}`);
}

function stage10Review(baselineBytes, differences, candidate) {
  stage10ReceiverInventory(candidate);
  return {
    schemaVersion: 1,
    candidate: STAGE_10_CANDIDATE,
    policy: STAGE_10_POLICY,
    baselineSha256: sha256(baselineBytes),
    allowedDifferences: differences.map((difference) => ({
      ...difference,
      reason: stage10ReviewReason(difference.path),
    })),
    opcodeEvidence: {
      mode: "stage-10-security-04-relative-full-diff",
      path: STAGE_10_EVIDENCE_PATH,
      contracts: [...STAGE_08_PRODUCTION_CONTRACTS],
    },
    security04Checkpoint: STAGE_10_CHECKPOINT_BINDING,
    receiverEvidence: stage10ReceiverReviewEvidence(),
    safetyEvidence: {
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    },
  };
}

function stage11ReviewReason(reviewPath) {
  if (
    /^\$\.tests\.hardhat(?:\.|\[|$)/.test(reviewPath) ||
    reviewPath === "$.tests.total"
  ) {
    return "Stage 11 retires only the two digest-bound legacy TypeScript behavior sources after exact 104/104 Forge parity and keeps exactly three digest-bound Hardhat interoperability smokes. The historical 89-name oracle and parity map remain immutable provenance, and all 140 Forge identifiers remain active and exact.";
  }
  throw new Error(`Stage 11 has no review reason for ${reviewPath}`);
}

function stage11Review(baselineBytes, differences, candidate) {
  stage11TestInventory(candidate);
  return {
    schemaVersion: 1,
    candidate: STAGE_11_CANDIDATE,
    policy: STAGE_11_POLICY,
    baselineSha256: sha256(baselineBytes),
    allowedDifferences: differences.map((difference) => ({
      ...difference,
      reason: stage11ReviewReason(difference.path),
    })),
    opcodeEvidence: {
      mode: "stage-11-stage-10-production-equality",
      path: STAGE_11_EVIDENCE_PATH,
      contracts: [...STAGE_08_PRODUCTION_CONTRACTS],
    },
    stage10Checkpoint: STAGE_11_CHECKPOINT_BINDING,
    smokeEvidence: stage11SmokeReviewEvidence(),
    safetyEvidence: {
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    },
  };
}

function stage12aRuntimeBridgeEvidence() {
  const configPath = path.join(ROOT, "hardhat.config.ts");
  const declarationsPath = path.join(ROOT, "hardhat.config.d.ts");
  const tsconfigPath = path.join(ROOT, "tsconfig.json");
  const smokePath = path.join(ROOT, "tests", "Interoperability.smoke.ts");
  const packagePath = path.join(ROOT, "package.json");
  const config = fs.readFileSync(configPath, "utf8");
  const declarations = fs.readFileSync(declarationsPath, "utf8");
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const smoke = fs.readFileSync(smokePath, "utf8");
  const forbiddenRuntimeLoads = [
    "@nomiclabs/hardhat-ethers",
    "@nomiclabs/hardhat-waffle",
    "@typechain/hardhat",
  ];
  if (
    !config.includes('import "@nomicfoundation/hardhat-ethers";') ||
    forbiddenRuntimeLoads.some((name) => config.includes(name)) ||
    /\btypechain\s*:/.test(config) ||
    !declarations.includes("@nomicfoundation/hardhat-ethers") ||
    forbiddenRuntimeLoads.some((name) => declarations.includes(name)) ||
    !valuesEqual(tsconfig.include, [
      "./scripts",
      "./tests/Interoperability.smoke.ts",
    ]) ||
    packageJson.scripts?.["test:hardhat:smoke"] !==
      "hardhat --network hardhat test tests/Interoperability.smoke.ts" ||
    Object.prototype.hasOwnProperty.call(
      packageJson.scripts || {},
      "typechain"
    ) ||
    !smoke.includes('import { ethers, network } from "hardhat";')
  ) {
    throw new Error(
      "Stage 12a Hardhat bridge must load only the Foundation ethers plugin, deactivate Waffle/NomicLabs/TypeChain runtime hooks, scope TypeScript to the smoke, and run the smoke without TypeChain"
    );
  }
  return sorted({
    active: {
      hardhat: STAGE_12A_HARDHAT_VERSION,
      ethers: STAGE_12A_ETHERS_VERSION,
      plugin: {
        name: "@nomicfoundation/hardhat-ethers",
        version: STAGE_12A_HARDHAT_ETHERS_VERSION,
      },
    },
    dormantEthers5Tooling: STAGE_12A_DORMANT_ETHERS5_TOOLING,
    retainedLegacyHelpers: STAGE_12A_RETAINED_LEGACY_HELPERS,
    deactivatedHardhatRuntimeHooks: forbiddenRuntimeLoads,
    unchangedActiveLegacyPlugin: STAGE_12A_ACTIVE_LEGACY_PLUGIN,
    files: fileDigestEvidence({
      "hardhat.config.d.ts": STAGE_12A_BOUND_FILES["hardhat.config.d.ts"],
      "hardhat.config.ts": STAGE_12A_BOUND_FILES["hardhat.config.ts"],
      "tests/Interoperability.smoke.ts":
        STAGE_12A_BOUND_FILES["tests/Interoperability.smoke.ts"],
      "tsconfig.json": STAGE_12A_BOUND_FILES["tsconfig.json"],
    }),
    smokeRunner: packageJson.scripts["test:hardhat:smoke"],
    typeScriptInclude: tsconfig.include,
  });
}

function stage12aMigrationReviewEvidence() {
  const checkpoint = stage12aCheckpointAnchor();
  return sorted({
    checkpoint: STAGE_12A_CHECKPOINT_BINDING,
    boundFiles: stage12aBoundFileEvidence(),
    toolingInventory: stage12aToolingInventory(checkpoint),
    dependencyMigration: stage12aDependencyEvidence(),
    runtimeBridge: stage12aRuntimeBridgeEvidence(),
    retainedTests: {
      hardhat:
        checkpoint.evidence.value.sourceAndTestCutover.tests.activeHardhat,
      forge: {
        count: STAGE_11_FORGE_COUNT,
        namesSha256: STAGE_11_FORGE_NAMES_SHA256,
      },
    },
  });
}

function stage12aReview(baselineBytes, differences, candidate) {
  const checkpoint = stage12aCheckpointAnchor();
  stage12aTestInventory(candidate, checkpoint);
  if (differences.length !== 0) {
    throw new Error(
      `Stage 12a may not review any compatibility-manifest difference:\n${differences
        .slice(0, 20)
        .map((difference) => `- ${formatDifference(difference)}`)
        .join("\n")}`
    );
  }
  return {
    schemaVersion: 1,
    candidate: STAGE_12A_CANDIDATE,
    policy: STAGE_12A_POLICY,
    baselineSha256: sha256(baselineBytes),
    allowedDifferences: [],
    opcodeEvidence: {
      mode: "stage-12a-stage-11-production-equality",
      path: STAGE_12A_EVIDENCE_PATH,
      contracts: [...STAGE_08_PRODUCTION_CONTRACTS],
    },
    stage11Checkpoint: STAGE_12A_CHECKPOINT_BINDING,
    migrationEvidence: stage12aMigrationReviewEvidence(),
    safetyEvidence: {
      path: "compatibility/evidence/stage-07-safety-artifacts.json",
      sha256:
        "0065814caec6e3044951f80c891c9948454e90138d016513ed07d0fcfb7c67d8",
    },
  };
}

function opcodeInstructions(opcodes) {
  if (!opcodes) return [];
  const words = opcodes.split(" ");
  const instructions = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (/^PUSH(?:[1-9]|[12]\d|3[0-2])$/.test(word)) {
      if (!/^0x[0-9a-f]*$/.test(words[index + 1] || "")) {
        throw new Error(`Malformed disassembly after ${word}`);
      }
      instructions.push(`${word} ${words[index + 1]}`);
      index += 1;
    } else {
      instructions.push(word);
    }
  }
  if (instructions.join(" ") !== opcodes) {
    throw new Error("Opcode disassembly could not be tokenized losslessly");
  }
  return instructions;
}

function unifiedOpcodeDiff(baselineOpcodes, candidateOpcodes) {
  const baseline = opcodeInstructions(baselineOpcodes);
  const candidate = opcodeInstructions(candidateOpcodes);
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "pco-opcode-diff-")
  );
  const baselinePath = path.join(temporaryDirectory, "baseline.opcodes");
  const candidatePath = path.join(temporaryDirectory, "candidate.opcodes");
  try {
    fs.writeFileSync(baselinePath, `${baseline.join("\n")}\n`);
    fs.writeFileSync(candidatePath, `${candidate.join("\n")}\n`);
    const result = spawnSync(
      "git",
      [
        "-c",
        "core.safecrlf=false",
        "diff",
        "--no-index",
        "--no-ext-diff",
        "--no-color",
        "--text",
        "--no-renames",
        "--diff-algorithm=histogram",
        "--unified=3",
        baselinePath,
        candidatePath,
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, LC_ALL: "C" },
        maxBuffer: 128 * 1024 * 1024,
      }
    );
    if (result.error) throw result.error;
    if (![0, 1].includes(result.status)) {
      throw new Error(
        `Unable to generate Stage 8 opcode diff: ${
          result.stderr || result.stdout
        }`
      );
    }
    const changed = !valuesEqual(baseline, candidate);
    if ((result.status === 1) !== changed) {
      throw new Error("Git opcode diff status disagrees with opcode equality");
    }
    const outputLines = (result.stdout || "").split(/\r?\n/);
    const firstHunk = outputLines.findIndex((line) => line.startsWith("@@ "));
    if (changed && firstHunk < 0) {
      throw new Error("Changed opcodes produced no unified diff hunks");
    }
    const hunks =
      firstHunk < 0
        ? ""
        : `${outputLines.slice(firstHunk).join("\n").trimEnd()}\n`;
    return {
      format: "git-histogram-unified-v1",
      contextInstructions: 3,
      baselineInstructionCount: baseline.length,
      candidateInstructionCount: candidate.length,
      hunkCount: (hunks.match(/^@@ /gm) || []).length,
      hunksSha256: sha256(hunks),
      hunks,
    };
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function parseDeterministicGasSnapshot(contents, source) {
  const entries = new Map();
  for (const line of contents.split(/\r?\n/)) {
    if (!line) continue;
    const match = line.match(/^(.*) \(gas: (\d+)\)$/);
    if (!match) {
      throw new Error(
        `Non-deterministic Stage 8 gas entry in ${source}: ${line}`
      );
    }
    if (entries.has(match[1])) {
      throw new Error(`Duplicate Stage 8 gas entry in ${source}: ${match[1]}`);
    }
    entries.set(match[1], Number(match[2]));
  }
  return entries;
}

function stage08GasEvidence() {
  if (!fs.existsSync(STAGE_08_KEY_FLOW_GAS_PATH)) {
    throw new Error(
      "Stage 8 requires the checked-in Stage 7 key-flow gas baseline"
    );
  }
  const baselineBytes = fs.readFileSync(STAGE_08_KEY_FLOW_GAS_PATH);
  const baseline = parseDeterministicGasSnapshot(
    baselineBytes.toString("utf8"),
    path.relative(ROOT, STAGE_08_KEY_FLOW_GAS_PATH)
  );
  const expectedGroups = {
    PartialCommonOwnership: [...baseline.keys()]
      .filter((name) =>
        /^(?:PCOMutationParityTest|PCOReadTaxParityTest):/.test(name)
      )
      .sort(),
    Wrapper: [...baseline.keys()]
      .filter((name) => /^WrapperParityTest:/.test(name))
      .sort(),
  };
  if (
    baseline.size !== 12 ||
    expectedGroups.PartialCommonOwnership.length !== 8 ||
    expectedGroups.Wrapper.length !== 4
  ) {
    throw new Error(
      "Stage 8 gas evidence requires exactly 8 PCO and 4 Wrapper key flows"
    );
  }

  const testNames = [...baseline.keys()].map((name) => {
    const separator = name.indexOf(":");
    return name.slice(separator + 1).replace(/\(.*$/, "");
  });
  if (new Set(testNames).size !== testNames.length) {
    throw new Error("Stage 8 key-flow test names must be unique");
  }
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matchTest = `^(${testNames.map(escapeRegex).join("|")})\\(.*\\)$`;
  const outputPath = temporaryFile("stage-08-gas-snapshot.txt");
  let candidate;
  try {
    run(FORGE_BIN, [
      "snapshot",
      "--fuzz-seed",
      "0x721",
      "--match-test",
      matchTest,
      "--snap",
      outputPath,
    ]);
    candidate = parseDeterministicGasSnapshot(
      fs.readFileSync(outputPath, "utf8"),
      "Stage 8 candidate"
    );
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
  if (!valuesEqual([...candidate.keys()].sort(), [...baseline.keys()].sort())) {
    throw new Error(
      "Stage 8 candidate gas inventory differs from its baseline"
    );
  }

  const groups = {};
  const regressions = [];
  for (const [group, names] of Object.entries(expectedGroups)) {
    groups[group] = names.map((name) => {
      const baselineGas = baseline.get(name);
      const candidateGas = candidate.get(name);
      const allowedIncreaseGas = Math.floor(
        Math.max(baselineGas * 0.03, 2_000)
      );
      const maximumGas = baselineGas + allowedIncreaseGas;
      const withinLimit = candidateGas <= maximumGas;
      if (!withinLimit) {
        regressions.push(`${name}: ${baselineGas} -> ${candidateGas}`);
      }
      return {
        name,
        baselineGas,
        candidateGas,
        deltaGas: candidateGas - baselineGas,
        allowedIncreaseGas,
        maximumGas,
        withinLimit,
      };
    });
  }
  if (regressions.length > 0) {
    throw new Error(
      `Stage 8 gas regressions exceed max(3%, 2,000 gas):\n${regressions.join(
        "\n"
      )}`
    );
  }

  return sorted({
    baselinePath: path.relative(ROOT, STAGE_08_KEY_FLOW_GAS_PATH),
    baselineSha256: sha256(baselineBytes),
    fuzzSeed: "0x721",
    policy: {
      percent: 3,
      absoluteFloorGas: 2_000,
    },
    groups,
  });
}

function stage08Evidence() {
  if (!fs.existsSync(STAGE_08_OPCODE_EVIDENCE_PATH)) {
    throw new Error(
      "Stage 9 requires the checked-in Stage 8 compiler evidence"
    );
  }
  const bytes = fs.readFileSync(STAGE_08_OPCODE_EVIDENCE_PATH);
  const digest = sha256(bytes);
  if (digest !== STAGE_08_EVIDENCE_SHA256) {
    throw new Error(
      `Stage 8 compiler evidence changed: expected ${STAGE_08_EVIDENCE_SHA256}, received ${digest}`
    );
  }
  const evidence = JSON.parse(bytes);
  if (
    evidence.schemaVersion !== 1 ||
    evidence.candidate !== "stage-08-solidity-0-8-36" ||
    evidence.mode !== "metadata-stripped-full-diff"
  ) {
    throw new Error("Stage 8 compiler evidence has an invalid identity");
  }
  return evidence;
}

function stage09EvidenceAnchor() {
  if (!fs.existsSync(STAGE_09_OPCODE_EVIDENCE_PATH)) {
    throw new Error(
      "Security 01 requires the checked-in Stage 9 forge-std evidence"
    );
  }
  const bytes = fs.readFileSync(STAGE_09_OPCODE_EVIDENCE_PATH);
  const digest = sha256(bytes);
  if (digest !== STAGE_09_EVIDENCE_SHA256) {
    throw new Error(
      `Stage 9 evidence changed: expected ${STAGE_09_EVIDENCE_SHA256}, received ${digest}`
    );
  }
  const evidence = JSON.parse(bytes);
  if (
    evidence.schemaVersion !== 1 ||
    evidence.candidate !== STAGE_09_CANDIDATE ||
    evidence.mode !== "stage-08-production-equality"
  ) {
    throw new Error("Stage 9 evidence has an invalid identity");
  }
  return evidence;
}

function security01CheckpointAnchor() {
  const evidenceBytes = fs.readFileSync(SECURITY_01_EVIDENCE_PATH);
  const evidenceSha256 = sha256(evidenceBytes);
  if (evidenceSha256 !== SECURITY_01_CHECKPOINT_EVIDENCE_SHA256) {
    throw new Error(
      `Security 01 checkpoint evidence changed: expected ${SECURITY_01_CHECKPOINT_EVIDENCE_SHA256}, received ${evidenceSha256}`
    );
  }
  const evidence = JSON.parse(evidenceBytes);
  if (
    evidence.schemaVersion !== 1 ||
    evidence.candidate !== SECURITY_01_CANDIDATE ||
    evidence.mode !== "security-01-stage-09-relative-full-diff"
  ) {
    throw new Error("Security 01 checkpoint evidence has an invalid identity");
  }

  const reviewBytes = Buffer.from(
    run("git", [
      "show",
      `${SECURITY_02_BASE_COMMIT}:compatibility/reviewed-differences.json`,
    ]).stdout
  );
  const reviewSha256 = sha256(reviewBytes);
  if (reviewSha256 !== SECURITY_01_CHECKPOINT_REVIEW_SHA256) {
    throw new Error(
      `Security 01 checkpoint review changed: expected ${SECURITY_01_CHECKPOINT_REVIEW_SHA256}, received ${reviewSha256}`
    );
  }
  const review = JSON.parse(reviewBytes);
  if (
    review.schemaVersion !== 1 ||
    review.candidate !== SECURITY_01_CANDIDATE ||
    review.policy !== SECURITY_01_POLICY ||
    review.opcodeEvidence?.path !== SECURITY_01_EVIDENCE_PATH
  ) {
    throw new Error("Security 01 checkpoint review has an invalid identity");
  }
  const checkpoint = {
    commit: SECURITY_02_BASE_COMMIT,
    evidence: {
      path: SECURITY_01_EVIDENCE_PATH,
      sha256: evidenceSha256,
      value: evidence,
    },
    review: {
      path: "compatibility/reviewed-differences.json",
      sha256: reviewSha256,
      value: review,
    },
  };
  validateSecurity01CheckpointBinding(checkpoint);
  return checkpoint;
}

function validateSecurity01CheckpointBinding(checkpoint) {
  const binding = {
    commit: checkpoint?.commit,
    evidence: {
      path: checkpoint?.evidence?.path,
      sha256: checkpoint?.evidence?.sha256,
    },
    review: {
      path: checkpoint?.review?.path,
      sha256: checkpoint?.review?.sha256,
    },
  };
  if (!valuesEqual(binding, SECURITY_02_CHECKPOINT_BINDING)) {
    throw new Error("Security 02 Security 01 checkpoint binding changed");
  }
  if (
    checkpoint.evidence.value?.candidate !== SECURITY_01_CANDIDATE ||
    checkpoint.evidence.value?.mode !==
      "security-01-stage-09-relative-full-diff" ||
    checkpoint.review.value?.candidate !== SECURITY_01_CANDIDATE ||
    checkpoint.review.value?.policy !== SECURITY_01_POLICY
  ) {
    throw new Error("Security 02 Security 01 checkpoint identity changed");
  }
}

function security02CheckpointAnchor() {
  const evidenceBytes = fs.readFileSync(SECURITY_02_EVIDENCE_PATH);
  const evidenceSha256 = sha256(evidenceBytes);
  if (evidenceSha256 !== SECURITY_02_CHECKPOINT_EVIDENCE_SHA256) {
    throw new Error(
      `Security 02 checkpoint evidence changed: expected ${SECURITY_02_CHECKPOINT_EVIDENCE_SHA256}, received ${evidenceSha256}`
    );
  }
  const evidence = JSON.parse(evidenceBytes);
  if (
    evidence.schemaVersion !== 1 ||
    evidence.candidate !== SECURITY_02_CANDIDATE ||
    evidence.mode !== "security-02-security-01-relative-full-diff"
  ) {
    throw new Error("Security 02 checkpoint evidence has an invalid identity");
  }
  const reviewBytes = Buffer.from(
    run("git", [
      "show",
      `${SECURITY_03_BASE_COMMIT}:compatibility/reviewed-differences.json`,
    ]).stdout
  );
  const reviewSha256 = sha256(reviewBytes);
  if (reviewSha256 !== SECURITY_02_CHECKPOINT_REVIEW_SHA256) {
    throw new Error(
      `Security 02 checkpoint review changed: expected ${SECURITY_02_CHECKPOINT_REVIEW_SHA256}, received ${reviewSha256}`
    );
  }
  const review = JSON.parse(reviewBytes);
  if (
    review.schemaVersion !== 1 ||
    review.candidate !== SECURITY_02_CANDIDATE ||
    review.policy !== SECURITY_02_POLICY ||
    review.opcodeEvidence?.path !== SECURITY_02_EVIDENCE_PATH
  ) {
    throw new Error("Security 02 checkpoint review has an invalid identity");
  }
  const checkpoint = {
    commit: SECURITY_03_BASE_COMMIT,
    evidence: {
      path: SECURITY_02_EVIDENCE_PATH,
      sha256: evidenceSha256,
      value: evidence,
    },
    review: {
      path: "compatibility/reviewed-differences.json",
      sha256: reviewSha256,
      value: review,
    },
  };
  validateSecurity02CheckpointBinding(checkpoint);
  return checkpoint;
}

function validateSecurity02CheckpointBinding(checkpoint) {
  const binding = {
    commit: checkpoint?.commit,
    evidence: {
      path: checkpoint?.evidence?.path,
      sha256: checkpoint?.evidence?.sha256,
    },
    review: {
      path: checkpoint?.review?.path,
      sha256: checkpoint?.review?.sha256,
    },
  };
  if (!valuesEqual(binding, SECURITY_03_CHECKPOINT_BINDING)) {
    throw new Error("Security 03 Security 02 checkpoint binding changed");
  }
  if (
    checkpoint.evidence.value?.candidate !== SECURITY_02_CANDIDATE ||
    checkpoint.evidence.value?.mode !==
      "security-02-security-01-relative-full-diff" ||
    checkpoint.review.value?.candidate !== SECURITY_02_CANDIDATE ||
    checkpoint.review.value?.policy !== SECURITY_02_POLICY
  ) {
    throw new Error("Security 03 Security 02 checkpoint identity changed");
  }
}

function security03CheckpointAnchor() {
  const evidenceBytes = fs.readFileSync(SECURITY_03_EVIDENCE_PATH);
  const evidenceSha256 = sha256(evidenceBytes);
  if (evidenceSha256 !== SECURITY_03_CHECKPOINT_EVIDENCE_SHA256) {
    throw new Error(
      `Security 03 checkpoint evidence changed: expected ${SECURITY_03_CHECKPOINT_EVIDENCE_SHA256}, received ${evidenceSha256}`
    );
  }
  const evidence = JSON.parse(evidenceBytes);
  if (
    evidence.schemaVersion !== 1 ||
    evidence.candidate !== SECURITY_03_CANDIDATE ||
    evidence.mode !== "security-03-security-02-relative-full-diff"
  ) {
    throw new Error("Security 03 checkpoint evidence has an invalid identity");
  }
  const reviewBytes = Buffer.from(
    run("git", [
      "show",
      `${SECURITY_04_BASE_COMMIT}:compatibility/reviewed-differences.json`,
    ]).stdout
  );
  const reviewSha256 = sha256(reviewBytes);
  if (reviewSha256 !== SECURITY_03_CHECKPOINT_REVIEW_SHA256) {
    throw new Error(
      `Security 03 checkpoint review changed: expected ${SECURITY_03_CHECKPOINT_REVIEW_SHA256}, received ${reviewSha256}`
    );
  }
  const review = JSON.parse(reviewBytes);
  if (
    review.schemaVersion !== 1 ||
    review.candidate !== SECURITY_03_CANDIDATE ||
    review.policy !== SECURITY_03_POLICY ||
    review.opcodeEvidence?.path !== SECURITY_03_EVIDENCE_PATH
  ) {
    throw new Error("Security 03 checkpoint review has an invalid identity");
  }
  const checkpoint = {
    commit: SECURITY_04_BASE_COMMIT,
    evidence: {
      path: SECURITY_03_EVIDENCE_PATH,
      sha256: evidenceSha256,
      value: evidence,
    },
    review: {
      path: "compatibility/reviewed-differences.json",
      sha256: reviewSha256,
      value: review,
    },
  };
  validateSecurity03CheckpointBinding(checkpoint);
  return checkpoint;
}

function validateSecurity03CheckpointBinding(checkpoint) {
  const binding = {
    commit: checkpoint?.commit,
    evidence: {
      path: checkpoint?.evidence?.path,
      sha256: checkpoint?.evidence?.sha256,
    },
    review: {
      path: checkpoint?.review?.path,
      sha256: checkpoint?.review?.sha256,
    },
  };
  if (!valuesEqual(binding, SECURITY_04_CHECKPOINT_BINDING)) {
    throw new Error("Security 04 Security 03 checkpoint binding changed");
  }
  if (
    checkpoint.evidence.value?.candidate !== SECURITY_03_CANDIDATE ||
    checkpoint.evidence.value?.mode !==
      "security-03-security-02-relative-full-diff" ||
    checkpoint.review.value?.candidate !== SECURITY_03_CANDIDATE ||
    checkpoint.review.value?.policy !== SECURITY_03_POLICY
  ) {
    throw new Error("Security 04 Security 03 checkpoint identity changed");
  }
}

function stage10CheckpointAnchor() {
  run("git", ["merge-base", "--is-ancestor", STAGE_10_BASE_COMMIT, "HEAD"]);
  const evidenceBytes = Buffer.from(
    run("git", ["show", `${STAGE_10_BASE_COMMIT}:${SECURITY_04_EVIDENCE_PATH}`])
      .stdout
  );
  const evidenceSha256 = sha256(evidenceBytes);
  if (evidenceSha256 !== STAGE_10_SECURITY_04_EVIDENCE_SHA256) {
    throw new Error(
      `Stage 10 Security 04 checkpoint evidence changed: expected ${STAGE_10_SECURITY_04_EVIDENCE_SHA256}, received ${evidenceSha256}`
    );
  }
  const evidence = JSON.parse(evidenceBytes);
  if (
    evidence.schemaVersion !== 1 ||
    evidence.candidate !== SECURITY_04_CANDIDATE ||
    evidence.mode !== "security-04-security-03-relative-wrapper-only"
  ) {
    throw new Error("Stage 10 Security 04 evidence has an invalid identity");
  }
  const reviewBytes = Buffer.from(
    run("git", [
      "show",
      `${STAGE_10_BASE_COMMIT}:compatibility/reviewed-differences.json`,
    ]).stdout
  );
  const reviewSha256 = sha256(reviewBytes);
  if (reviewSha256 !== STAGE_10_SECURITY_04_REVIEW_SHA256) {
    throw new Error(
      `Stage 10 Security 04 checkpoint review changed: expected ${STAGE_10_SECURITY_04_REVIEW_SHA256}, received ${reviewSha256}`
    );
  }
  const review = JSON.parse(reviewBytes);
  if (
    review.schemaVersion !== 1 ||
    review.candidate !== SECURITY_04_CANDIDATE ||
    review.policy !== SECURITY_04_POLICY ||
    review.opcodeEvidence?.path !== SECURITY_04_EVIDENCE_PATH
  ) {
    throw new Error("Stage 10 Security 04 review has an invalid identity");
  }
  return {
    commit: STAGE_10_BASE_COMMIT,
    evidence: {
      path: SECURITY_04_EVIDENCE_PATH,
      sha256: evidenceSha256,
      value: evidence,
    },
    review: {
      path: "compatibility/reviewed-differences.json",
      sha256: reviewSha256,
      value: review,
    },
  };
}

function stage11CheckpointAnchor() {
  run("git", ["merge-base", "--is-ancestor", STAGE_11_BASE_COMMIT, "HEAD"]);
  const evidenceBytes = Buffer.from(
    run("git", ["show", `${STAGE_11_BASE_COMMIT}:${STAGE_10_EVIDENCE_PATH}`])
      .stdout
  );
  const evidenceSha256 = sha256(evidenceBytes);
  if (evidenceSha256 !== STAGE_11_STAGE_10_EVIDENCE_SHA256) {
    throw new Error(
      `Stage 11 Stage 10 checkpoint evidence changed: expected ${STAGE_11_STAGE_10_EVIDENCE_SHA256}, received ${evidenceSha256}`
    );
  }
  const evidence = JSON.parse(evidenceBytes);
  if (
    evidence.schemaVersion !== 1 ||
    evidence.candidate !== STAGE_10_CANDIDATE ||
    evidence.mode !== "stage-10-security-04-relative-full-diff"
  ) {
    throw new Error("Stage 11 Stage 10 evidence has an invalid identity");
  }
  const reviewBytes = Buffer.from(
    run("git", [
      "show",
      `${STAGE_11_BASE_COMMIT}:compatibility/reviewed-differences.json`,
    ]).stdout
  );
  const reviewSha256 = sha256(reviewBytes);
  if (reviewSha256 !== STAGE_11_STAGE_10_REVIEW_SHA256) {
    throw new Error(
      `Stage 11 Stage 10 checkpoint review changed: expected ${STAGE_11_STAGE_10_REVIEW_SHA256}, received ${reviewSha256}`
    );
  }
  const review = JSON.parse(reviewBytes);
  if (
    review.schemaVersion !== 1 ||
    review.candidate !== STAGE_10_CANDIDATE ||
    review.policy !== STAGE_10_POLICY ||
    review.opcodeEvidence?.path !== STAGE_10_EVIDENCE_PATH
  ) {
    throw new Error("Stage 11 Stage 10 review has an invalid identity");
  }
  return {
    commit: STAGE_11_BASE_COMMIT,
    evidence: {
      path: STAGE_10_EVIDENCE_PATH,
      sha256: evidenceSha256,
      value: evidence,
    },
    review: {
      path: "compatibility/reviewed-differences.json",
      sha256: reviewSha256,
      value: review,
    },
  };
}

function stage12aCheckpointAnchor() {
  run("git", ["merge-base", "--is-ancestor", STAGE_12A_BASE_COMMIT, "HEAD"]);
  const evidenceBytes = Buffer.from(
    run("git", ["show", `${STAGE_12A_BASE_COMMIT}:${STAGE_11_EVIDENCE_PATH}`])
      .stdout
  );
  const evidenceSha256 = sha256(evidenceBytes);
  if (evidenceSha256 !== STAGE_12A_STAGE_11_EVIDENCE_SHA256) {
    throw new Error(
      `Stage 12a Stage 11 checkpoint evidence changed: expected ${STAGE_12A_STAGE_11_EVIDENCE_SHA256}, received ${evidenceSha256}`
    );
  }
  const evidence = JSON.parse(evidenceBytes);
  if (
    evidence.schemaVersion !== 1 ||
    evidence.candidate !== STAGE_11_CANDIDATE ||
    evidence.mode !== "stage-11-stage-10-production-equality"
  ) {
    throw new Error("Stage 12a Stage 11 evidence has an invalid identity");
  }
  const reviewBytes = Buffer.from(
    run("git", [
      "show",
      `${STAGE_12A_BASE_COMMIT}:compatibility/reviewed-differences.json`,
    ]).stdout
  );
  const reviewSha256 = sha256(reviewBytes);
  if (reviewSha256 !== STAGE_12A_STAGE_11_REVIEW_SHA256) {
    throw new Error(
      `Stage 12a Stage 11 checkpoint review changed: expected ${STAGE_12A_STAGE_11_REVIEW_SHA256}, received ${reviewSha256}`
    );
  }
  const review = JSON.parse(reviewBytes);
  if (
    review.schemaVersion !== 1 ||
    review.candidate !== STAGE_11_CANDIDATE ||
    review.policy !== STAGE_11_POLICY ||
    review.opcodeEvidence?.path !== STAGE_11_EVIDENCE_PATH
  ) {
    throw new Error("Stage 12a Stage 11 review has an invalid identity");
  }
  return {
    commit: STAGE_12A_BASE_COMMIT,
    evidence: {
      path: STAGE_11_EVIDENCE_PATH,
      sha256: evidenceSha256,
      value: evidence,
    },
    review: {
      path: "compatibility/reviewed-differences.json",
      sha256: reviewSha256,
      value: review,
    },
  };
}

function applyUnifiedOpcodeDiff(baselineOpcodes, diff) {
  if (!diff) return baselineOpcodes;
  const baseline = opcodeInstructions(baselineOpcodes);
  const result = [];
  const lines = diff.replace(/\n$/, "").split("\n");
  let cursor = 0;
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const header = lines[lineIndex].match(
      /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
    );
    if (!header) {
      throw new Error(
        `Invalid checked-in opcode diff header: ${lines[lineIndex]}`
      );
    }
    const oldStart = Number(header[1]) - 1;
    const oldCount = header[2] === undefined ? 1 : Number(header[2]);
    const newCount = header[4] === undefined ? 1 : Number(header[4]);
    if (oldStart < cursor) {
      throw new Error("Checked-in opcode diff hunks overlap");
    }
    result.push(...baseline.slice(cursor, oldStart));
    cursor = oldStart;
    lineIndex += 1;
    let consumedOld = 0;
    let producedNew = 0;

    while (lineIndex < lines.length && !lines[lineIndex].startsWith("@@ ")) {
      const line = lines[lineIndex];
      const marker = line[0];
      const instruction = line.slice(1);
      if (marker === " " || marker === "-") {
        if (baseline[cursor] !== instruction) {
          throw new Error(
            `Checked-in opcode diff context mismatch at instruction ${cursor}`
          );
        }
        cursor += 1;
        consumedOld += 1;
      }
      if (marker === " " || marker === "+") {
        result.push(instruction);
        producedNew += 1;
      }
      if (![" ", "-", "+"].includes(marker)) {
        throw new Error(`Invalid checked-in opcode diff line: ${line}`);
      }
      lineIndex += 1;
    }
    if (consumedOld !== oldCount || producedNew !== newCount) {
      throw new Error("Checked-in opcode diff hunk counts are inconsistent");
    }
  }

  result.push(...baseline.slice(cursor));
  return result.join(" ");
}

function security01CheckpointOpcodes(
  baseline,
  qualifiedName,
  bytecodeKind,
  checkpoint
) {
  const stage08 = stage08Evidence();
  const baselineBytecode = baseline.contracts[qualifiedName][bytecodeKind];
  const stage08Bytecode = stage08.contracts[qualifiedName][bytecodeKind];
  const stage09Opcodes = applyUnifiedOpcodeDiff(
    baselineBytecode.metadataStrippedOpcodes,
    stage08Bytecode.metadataStrippedOpcodes.fullDiff.hunks
  );
  const security01Bytecode =
    checkpoint.evidence.value.productionRelativeToStage09.contracts[
      qualifiedName
    ][bytecodeKind];
  if (
    sha256(stage09Opcodes) !==
    security01Bytecode.metadataStrippedOpcodes.stage09Sha256
  ) {
    throw new Error(
      `Security 02 could not reconstruct Stage 9 ${qualifiedName} ${bytecodeKind}`
    );
  }
  const security01Opcodes = applyUnifiedOpcodeDiff(
    stage09Opcodes,
    security01Bytecode.metadataStrippedOpcodes.fullDiff.hunks
  );
  if (
    sha256(security01Opcodes) !==
    security01Bytecode.metadataStrippedOpcodes.candidateSha256
  ) {
    throw new Error(
      `Security 02 could not reconstruct Security 01 ${qualifiedName} ${bytecodeKind}`
    );
  }
  return security01Opcodes;
}

function security01CheckpointLegacyGasEntries(checkpoint) {
  const stage09 = stage09EvidenceAnchor();
  const entries = stage09LegacyGasEntries(stage09);
  const evidence = checkpoint.evidence.value.legacyGasRelativeToStage09;
  if (
    evidence.fuzzSeed !== "0x721" ||
    evidence.inventoryCount !== entries.length
  ) {
    throw new Error(
      "Security 01 checkpoint has an invalid legacy gas inventory"
    );
  }
  for (const change of evidence.changes) {
    const match = change.path.match(/^\$\.gasSnapshot\.entries\[(\d+)\]$/);
    if (!match) throw new Error(`Invalid Security 01 gas path: ${change.path}`);
    const index = Number(match[1]);
    if (entries[index] !== change.stage09Value) {
      throw new Error(`Security 01 gas anchor mismatch at index ${index}`);
    }
    entries[index] = change.candidateValue;
  }
  if (sha256(stableJson(entries)) !== evidence.candidateEntriesSha256) {
    throw new Error("Security 01 legacy gas checkpoint digest changed");
  }
  return entries;
}

function security02CheckpointOpcodes(
  baseline,
  qualifiedName,
  bytecodeKind,
  checkpoint
) {
  const security01 = security01CheckpointAnchor();
  const security01Opcodes = security01CheckpointOpcodes(
    baseline,
    qualifiedName,
    bytecodeKind,
    security01
  );
  const security02Bytecode =
    checkpoint.evidence.value.productionRelativeToSecurity01.contracts[
      qualifiedName
    ][bytecodeKind];
  if (
    sha256(security01Opcodes) !==
    security02Bytecode.metadataStrippedOpcodes.security01Sha256
  ) {
    throw new Error(
      `Security 03 could not reconstruct Security 01 ${qualifiedName} ${bytecodeKind}`
    );
  }
  const security02Opcodes = applyUnifiedOpcodeDiff(
    security01Opcodes,
    security02Bytecode.metadataStrippedOpcodes.fullDiff.hunks
  );
  if (
    sha256(security02Opcodes) !==
    security02Bytecode.metadataStrippedOpcodes.candidateSha256
  ) {
    throw new Error(
      `Security 03 could not reconstruct Security 02 ${qualifiedName} ${bytecodeKind}`
    );
  }
  return security02Opcodes;
}

function security02CheckpointLegacyGasEntries(checkpoint) {
  const previousEntries = security01CheckpointLegacyGasEntries(
    security01CheckpointAnchor()
  );
  const evidence = checkpoint.evidence.value.legacyGasRelativeToSecurity01;
  if (
    evidence.fuzzSeed !== "0x721" ||
    evidence.inventoryCount !== previousEntries.length ||
    sha256(stableJson(previousEntries)) !== evidence.security01EntriesSha256
  ) {
    throw new Error(
      "Security 02 checkpoint has an invalid legacy gas inventory"
    );
  }
  for (const change of evidence.changes) {
    const match = change.path.match(/^\$\.gasSnapshot\.entries\[(\d+)\]$/);
    if (!match) throw new Error(`Invalid Security 02 gas path: ${change.path}`);
    const index = Number(match[1]);
    if (previousEntries[index] !== change.security01Value) {
      throw new Error(`Security 02 gas anchor mismatch at index ${index}`);
    }
    previousEntries[index] = change.candidateValue;
  }
  if (sha256(stableJson(previousEntries)) !== evidence.candidateEntriesSha256) {
    throw new Error("Security 02 legacy gas checkpoint digest changed");
  }
  return previousEntries;
}

function security03CheckpointOpcodes(
  baseline,
  qualifiedName,
  bytecodeKind,
  checkpoint
) {
  const security02 = security02CheckpointAnchor();
  const security02Opcodes = security02CheckpointOpcodes(
    baseline,
    qualifiedName,
    bytecodeKind,
    security02
  );
  const security03Bytecode =
    checkpoint.evidence.value.productionRelativeToSecurity02.contracts[
      qualifiedName
    ][bytecodeKind];
  if (
    sha256(security02Opcodes) !==
    security03Bytecode.metadataStrippedOpcodes.security02Sha256
  ) {
    throw new Error(
      `Security 04 could not reconstruct Security 02 ${qualifiedName} ${bytecodeKind}`
    );
  }
  const security03Opcodes = applyUnifiedOpcodeDiff(
    security02Opcodes,
    security03Bytecode.metadataStrippedOpcodes.fullDiff.hunks
  );
  if (
    sha256(security03Opcodes) !==
    security03Bytecode.metadataStrippedOpcodes.candidateSha256
  ) {
    throw new Error(
      `Security 04 could not reconstruct Security 03 ${qualifiedName} ${bytecodeKind}`
    );
  }
  return security03Opcodes;
}

function security03CheckpointLegacyGasEntries(checkpoint) {
  const previousEntries = security02CheckpointLegacyGasEntries(
    security02CheckpointAnchor()
  );
  const evidence = checkpoint.evidence.value.legacyGasRelativeToSecurity02;
  if (
    evidence.fuzzSeed !== "0x721" ||
    evidence.inventoryCount !== previousEntries.length ||
    sha256(stableJson(previousEntries)) !== evidence.security02EntriesSha256
  ) {
    throw new Error(
      "Security 03 checkpoint has an invalid legacy gas inventory"
    );
  }
  for (const change of evidence.changes) {
    const match = change.path.match(/^\$\.gasSnapshot\.entries\[(\d+)\]$/);
    if (!match) throw new Error(`Invalid Security 03 gas path: ${change.path}`);
    const index = Number(match[1]);
    if (previousEntries[index] !== change.security02Value) {
      throw new Error(`Security 03 gas anchor mismatch at index ${index}`);
    }
    previousEntries[index] = change.candidateValue;
  }
  if (sha256(stableJson(previousEntries)) !== evidence.candidateEntriesSha256) {
    throw new Error("Security 03 legacy gas checkpoint digest changed");
  }
  return previousEntries;
}

function security04CheckpointOpcodes(
  baseline,
  qualifiedName,
  bytecodeKind,
  checkpoint
) {
  const security03 = security03CheckpointAnchor();
  const security03Opcodes = security03CheckpointOpcodes(
    baseline,
    qualifiedName,
    bytecodeKind,
    security03
  );
  const checkpointContract =
    checkpoint.evidence.value.productionRelativeToSecurity03.contracts[
      qualifiedName
    ];
  if (!checkpointContract) {
    throw new Error(
      `Stage 10 Security 04 checkpoint is missing ${qualifiedName}`
    );
  }
  if (qualifiedName === "contracts/Wrapper.sol:Wrapper") {
    const bytecode = checkpointContract[bytecodeKind];
    if (
      sha256(security03Opcodes) !==
      bytecode.metadataStrippedOpcodes.security03Sha256
    ) {
      throw new Error(
        `Stage 10 could not reconstruct Security 03 ${qualifiedName} ${bytecodeKind}`
      );
    }
    const result = applyUnifiedOpcodeDiff(
      security03Opcodes,
      bytecode.metadataStrippedOpcodes.fullDiff.hunks
    );
    if (sha256(result) !== bytecode.metadataStrippedOpcodes.candidateSha256) {
      throw new Error(
        `Stage 10 could not reconstruct Security 04 ${qualifiedName} ${bytecodeKind}`
      );
    }
    return result;
  }
  const expected = checkpointContract[bytecodeKind].candidate;
  if (
    !checkpointContract[bytecodeKind].equal ||
    sha256(security03Opcodes) !== expected.metadataStrippedOpcodesSha256
  ) {
    throw new Error(
      `Stage 10 Security 04 PCO ${bytecodeKind} equality anchor changed`
    );
  }
  return security03Opcodes;
}

function security04CheckpointBytecode(checkpoint, qualifiedName, bytecodeKind) {
  const checkpointContract =
    checkpoint.evidence.value.productionRelativeToSecurity03.contracts[
      qualifiedName
    ];
  if (qualifiedName === "contracts/Wrapper.sol:Wrapper") {
    const bytecode = checkpointContract[bytecodeKind];
    return {
      rawKeccak256: bytecode.rawBytecode.candidateKeccak256,
      rawSizeBytes: bytecode.rawBytecode.candidateSizeBytes,
      metadataBytes: bytecode.rawBytecode.candidateMetadataBytes,
      metadataStrippedKeccak256:
        bytecode.metadataStrippedBytecode.candidateKeccak256,
      metadataStrippedSizeBytes:
        bytecode.metadataStrippedBytecode.candidateSizeBytes,
      metadataStrippedOpcodesSha256:
        bytecode.metadataStrippedOpcodes.candidateSha256,
    };
  }
  return checkpointContract[bytecodeKind].candidate;
}

function security04CheckpointLegacyGasEntries(checkpoint) {
  const previousEntries = security03CheckpointLegacyGasEntries(
    security03CheckpointAnchor()
  );
  const evidence = checkpoint.evidence.value.legacyGasRelativeToSecurity03;
  if (
    evidence.fuzzSeed !== "0x721" ||
    evidence.inventoryCount !== previousEntries.length ||
    sha256(stableJson(previousEntries)) !== evidence.security03EntriesSha256
  ) {
    throw new Error(
      "Stage 10 Security 04 checkpoint has an invalid legacy gas inventory"
    );
  }
  for (const change of evidence.changes) {
    const match = change.path.match(/^\$\.gasSnapshot\.entries\[(\d+)\]$/);
    if (!match) throw new Error(`Invalid Security 04 gas path: ${change.path}`);
    const index = Number(match[1]);
    if (previousEntries[index] !== change.security03Value) {
      throw new Error(`Security 04 gas anchor mismatch at index ${index}`);
    }
    previousEntries[index] = change.candidateValue;
  }
  if (sha256(stableJson(previousEntries)) !== evidence.candidateEntriesSha256) {
    throw new Error("Stage 10 Security 04 legacy gas digest changed");
  }
  return previousEntries;
}

function stage10CheckpointOpcodes(
  baseline,
  qualifiedName,
  bytecodeKind,
  checkpoint
) {
  const security04 = stage10CheckpointAnchor();
  const security04Opcodes = security04CheckpointOpcodes(
    baseline,
    qualifiedName,
    bytecodeKind,
    security04
  );
  const bytecode =
    checkpoint.evidence.value.productionRelativeToSecurity04.contracts[
      qualifiedName
    ][bytecodeKind];
  if (
    sha256(security04Opcodes) !==
    bytecode.metadataStrippedOpcodes.security04Sha256
  ) {
    throw new Error(
      `Stage 11 could not reconstruct Stage 10 base for ${qualifiedName} ${bytecodeKind}`
    );
  }
  const result = applyUnifiedOpcodeDiff(
    security04Opcodes,
    bytecode.metadataStrippedOpcodes.fullDiff.hunks
  );
  if (sha256(result) !== bytecode.metadataStrippedOpcodes.candidateSha256) {
    throw new Error(
      `Stage 11 could not reconstruct Stage 10 ${qualifiedName} ${bytecodeKind}`
    );
  }
  return result;
}

function stage10CheckpointBytecode(checkpoint, qualifiedName, bytecodeKind) {
  const bytecode =
    checkpoint.evidence.value.productionRelativeToSecurity04.contracts[
      qualifiedName
    ][bytecodeKind];
  return {
    rawKeccak256: bytecode.rawBytecode.candidateKeccak256,
    rawSizeBytes: bytecode.rawBytecode.candidateSizeBytes,
    metadataBytes: bytecode.rawBytecode.candidateMetadataBytes,
    metadataStrippedKeccak256:
      bytecode.metadataStrippedBytecode.candidateKeccak256,
    metadataStrippedSizeBytes:
      bytecode.metadataStrippedBytecode.candidateSizeBytes,
    metadataStrippedOpcodesSha256:
      bytecode.metadataStrippedOpcodes.candidateSha256,
  };
}

function stage10CheckpointLegacyGasEntries(checkpoint) {
  const previousEntries = security04CheckpointLegacyGasEntries(
    stage10CheckpointAnchor()
  );
  const evidence = checkpoint.evidence.value.legacyGasRelativeToSecurity04;
  if (
    evidence.fuzzSeed !== "0x721" ||
    evidence.inventoryCount !== previousEntries.length ||
    sha256(stableJson(previousEntries)) !== evidence.security04EntriesSha256
  ) {
    throw new Error(
      "Stage 11 Stage 10 checkpoint has an invalid legacy gas inventory"
    );
  }
  for (const change of evidence.changes) {
    const match = change.path.match(/^\$\.gasSnapshot\.entries\[(\d+)\]$/);
    if (!match) throw new Error(`Invalid Stage 10 gas path: ${change.path}`);
    const index = Number(match[1]);
    if (previousEntries[index] !== change.security04Value) {
      throw new Error(`Stage 10 gas anchor mismatch at index ${index}`);
    }
    previousEntries[index] = change.candidateValue;
  }
  if (sha256(stableJson(previousEntries)) !== evidence.candidateEntriesSha256) {
    throw new Error("Stage 11 Stage 10 legacy gas digest changed");
  }
  return previousEntries;
}

function stage12aCheckpointOpcodes(
  baseline,
  qualifiedName,
  bytecodeKind,
  checkpoint
) {
  const stage10 = stage11CheckpointAnchor();
  const opcodes = stage10CheckpointOpcodes(
    baseline,
    qualifiedName,
    bytecodeKind,
    stage10
  );
  const expected =
    checkpoint.evidence.value.productionEquality.contracts[qualifiedName][
      bytecodeKind
    ].candidate.metadataStrippedOpcodesSha256;
  if (sha256(opcodes) !== expected) {
    throw new Error(
      `Stage 12a could not reconstruct Stage 11 ${qualifiedName} ${bytecodeKind} opcodes`
    );
  }
  return opcodes;
}

function stage12aCheckpointBytecode(checkpoint, qualifiedName, bytecodeKind) {
  const bytecode =
    checkpoint.evidence.value.productionEquality.contracts[qualifiedName][
      bytecodeKind
    ];
  if (!bytecode.equal || !valuesEqual(bytecode.stage10, bytecode.candidate)) {
    throw new Error(
      `Stage 12a inherited invalid Stage 11 bytecode equality for ${qualifiedName} ${bytecodeKind}`
    );
  }
  return deepClone(bytecode.candidate);
}

function stage12aCheckpointLegacyGasEntries(checkpoint) {
  const entries = stage10CheckpointLegacyGasEntries(stage11CheckpointAnchor());
  const evidence = checkpoint.evidence.value.legacyGasEquality;
  if (
    !evidence.equal ||
    evidence.fuzzSeed !== "0x721" ||
    evidence.inventoryCount !== entries.length ||
    evidence.stage10EntriesSha256 !== sha256(stableJson(entries)) ||
    evidence.candidateEntriesSha256 !== sha256(stableJson(entries))
  ) {
    throw new Error("Stage 12a inherited invalid Stage 11 legacy gas equality");
  }
  return entries;
}

function stage09ProductionEvidence(baseline, candidate) {
  const inherited = stage08Evidence();
  const expectedCompiler = {
    version: STAGE_08_COMPILER_VERSION,
    longVersion: STAGE_08_COMPILER_LONG_VERSION,
    settingsSha256: sha256(stableJson(baseline.compiler.settings)),
  };
  const candidateCompiler = {
    version: candidate.compiler.version,
    longVersion: candidate.compiler.longVersion,
    settingsSha256: sha256(stableJson(candidate.compiler.settings)),
  };
  if (!valuesEqual(candidateCompiler, expectedCompiler)) {
    throw new Error(
      "Stage 9 compiler version or settings differ from the Stage 8 candidate"
    );
  }

  const contracts = {};
  for (const qualifiedName of STAGE_08_PRODUCTION_CONTRACTS) {
    const inheritedContract = inherited.contracts[qualifiedName];
    const candidateContract = candidate.contracts[qualifiedName];
    if (!inheritedContract || !candidateContract) {
      throw new Error(`Stage 9 production anchor is missing ${qualifiedName}`);
    }
    const bytecodes = {};
    for (const bytecodeKind of ["creationBytecode", "runtimeBytecode"]) {
      const inheritedBytecode = inheritedContract[bytecodeKind];
      const candidateBytecode = candidateContract[bytecodeKind];
      const expected = {
        rawKeccak256: inheritedBytecode.rawBytecode.candidateKeccak256,
        rawSizeBytes: inheritedBytecode.rawBytecode.candidateSizeBytes,
        metadataBytes: inheritedBytecode.rawBytecode.candidateMetadataBytes,
        metadataStrippedKeccak256:
          inheritedBytecode.metadataStrippedBytecode.candidateKeccak256,
        metadataStrippedSizeBytes:
          inheritedBytecode.metadataStrippedBytecode.candidateSizeBytes,
        metadataStrippedOpcodesSha256:
          inheritedBytecode.metadataStrippedOpcodes.candidateSha256,
      };
      const actual = {
        rawKeccak256: candidateBytecode.keccak256,
        rawSizeBytes: candidateBytecode.sizeBytes,
        metadataBytes: candidateBytecode.metadataBytes,
        metadataStrippedKeccak256: candidateBytecode.metadataStrippedKeccak256,
        metadataStrippedSizeBytes: candidateBytecode.metadataStrippedSizeBytes,
        metadataStrippedOpcodesSha256: sha256(
          candidateBytecode.metadataStrippedOpcodes
        ),
      };
      if (!valuesEqual(actual, expected)) {
        const differences = collectDifferences(
          expected,
          actual,
          `$.stage08Production.${qualifiedName}.${bytecodeKind}`
        );
        throw new Error(
          `Stage 9 production bytecode differs from Stage 8:\n${differences
            .map((difference) => `- ${formatDifference(difference)}`)
            .join("\n")}`
        );
      }
      bytecodes[bytecodeKind] = { expected, candidate: actual, equal: true };
    }

    const runtimeSizeBytes = candidateContract.runtimeBytecode.sizeBytes;
    if (runtimeSizeBytes > 24_576) {
      throw new Error(
        `${qualifiedName} exceeds the EIP-170 runtime size limit`
      );
    }
    contracts[qualifiedName] = {
      ...bytecodes,
      eip170: {
        limitBytes: 24_576,
        stage08RuntimeSizeBytes:
          inheritedContract.eip170.candidateRuntimeSizeBytes,
        candidateRuntimeSizeBytes: runtimeSizeBytes,
        equal:
          inheritedContract.eip170.candidateRuntimeSizeBytes ===
          runtimeSizeBytes,
        candidateWithinLimit: true,
      },
    };
    if (!contracts[qualifiedName].eip170.equal) {
      throw new Error(`${qualifiedName} runtime size changed after Stage 8`);
    }
  }

  return sorted({
    inheritedEvidence: {
      path: STAGE_08_OPCODE_EVIDENCE_PATH,
      sha256: STAGE_08_EVIDENCE_SHA256,
      candidate: inherited.candidate,
    },
    compiler: {
      expected: expectedCompiler,
      candidate: candidateCompiler,
      equal: true,
    },
    contracts,
  });
}

function validateStage09ForgeStdDetails(details) {
  if (
    details.candidateCommit !== STAGE_09_FORGE_STD_COMMIT ||
    details.candidateTag !== STAGE_09_FORGE_STD_TAG ||
    details.tagCommit !== STAGE_09_FORGE_STD_COMMIT ||
    details.packageVersion !== STAGE_09_FORGE_STD_VERSION ||
    !details.workingTreeClean ||
    !details.previousIsAncestor ||
    details.commitsAhead !== 421 ||
    details.url !== "https://github.com/foundry-rs/forge-std"
  ) {
    throw new Error(
      "forge-std does not match the clean, exact v1.16.2 Stage 9 dependency contract"
    );
  }
}

function stage09ForgeStdEvidence() {
  const submodulePath = path.join(ROOT, STAGE_09_FORGE_STD_PATH);
  if (!fs.existsSync(path.join(submodulePath, "package.json"))) {
    throw new Error("Stage 9 requires an initialized forge-std submodule");
  }
  const git = (...args) =>
    run("git", ["-C", STAGE_09_FORGE_STD_PATH, ...args]).stdout.trim();
  const candidateCommit = git("rev-parse", "HEAD");
  const candidateTag = git("describe", "--tags", "--exact-match", "HEAD");
  const tagCommit = git("rev-parse", `refs/tags/${STAGE_09_FORGE_STD_TAG}^{}`);
  const packageVersion = JSON.parse(
    fs.readFileSync(path.join(submodulePath, "package.json"), "utf8")
  ).version;
  const workingTree = git("status", "--porcelain");
  git("cat-file", "-e", `${STAGE_09_FORGE_STD_PREVIOUS_COMMIT}^{commit}`);
  const ancestor = spawnSync(
    "git",
    [
      "-C",
      STAGE_09_FORGE_STD_PATH,
      "merge-base",
      "--is-ancestor",
      STAGE_09_FORGE_STD_PREVIOUS_COMMIT,
      STAGE_09_FORGE_STD_COMMIT,
    ],
    { cwd: ROOT, encoding: "utf8", env: process.env }
  );
  if (ancestor.error) throw ancestor.error;
  const commitsAhead = Number(
    git(
      "rev-list",
      "--count",
      `${STAGE_09_FORGE_STD_PREVIOUS_COMMIT}..${STAGE_09_FORGE_STD_COMMIT}`
    )
  );
  const submoduleUrl = run("git", [
    "config",
    "-f",
    ".gitmodules",
    "--get",
    "submodule.lib/forge-std.url",
  ]).stdout.trim();
  const details = {
    path: STAGE_09_FORGE_STD_PATH,
    url: submoduleUrl,
    previousCommit: STAGE_09_FORGE_STD_PREVIOUS_COMMIT,
    candidateCommit,
    candidateTag,
    tagCommit,
    packageVersion,
    previousIsAncestor: ancestor.status === 0,
    commitsAhead,
    workingTreeClean: workingTree === "",
  };
  validateStage09ForgeStdDetails(details);
  return sorted({
    ...details,
  });
}

function stage09LegacyGasEvidence(candidate) {
  const candidateEntries = candidate.gasSnapshot.entries;
  if (
    candidate.gasSnapshot.fuzzSeed !== "0x721" ||
    candidateEntries.length !== STAGE_08_LEGACY_GAS_ENTRIES.length
  ) {
    throw new Error("Stage 9 legacy gas inventory differs from Stage 8");
  }
  const changedIndices = [];
  const changes = [];
  for (let index = 0; index < candidateEntries.length; index += 1) {
    const stage08Value = STAGE_08_LEGACY_GAS_ENTRIES[index];
    const candidateValue = candidateEntries[index];
    if (candidateValue !== stage08Value) {
      changedIndices.push(index);
      changes.push({
        path: `$.gasSnapshot.entries[${index}]`,
        stage08Value,
        candidateValue,
      });
    }
  }
  const expectedIndices = [...STAGE_09_RELATIVE_GAS_PATHS].sort(
    (left, right) => left - right
  );
  if (!valuesEqual(changedIndices, expectedIndices)) {
    throw new Error(
      `Stage 9 may change only legacy gas indices ${expectedIndices.join(
        ", "
      )}; received ${changedIndices.join(", ")}`
    );
  }
  return sorted({
    fuzzSeed: "0x721",
    stage08EntriesSha256: sha256(stableJson(STAGE_08_LEGACY_GAS_ENTRIES)),
    inventoryCount: candidateEntries.length,
    unchangedCount: candidateEntries.length - changedIndices.length,
    changedIndices,
    changes,
  });
}

function stage09KeyFlowGasEvidence(inherited, candidateGas) {
  const inheritedEntries = new Map();
  const candidateEntries = new Map();
  for (const [group, entries] of Object.entries(inherited.gas.groups)) {
    for (const entry of entries) {
      inheritedEntries.set(entry.name, { group, gas: entry.candidateGas });
    }
  }
  for (const [group, entries] of Object.entries(candidateGas.groups)) {
    for (const entry of entries) {
      candidateEntries.set(entry.name, {
        group,
        gas: entry.candidateGas,
        withinLimit: entry.withinLimit,
      });
    }
  }
  if (
    !valuesEqual(
      [...inheritedEntries.keys()].sort(),
      [...candidateEntries.keys()].sort()
    )
  ) {
    throw new Error("Stage 9 key-flow gas inventory differs from Stage 8");
  }
  const comparisons = [...candidateEntries.keys()].sort().map((name) => {
    const stage08 = inheritedEntries.get(name);
    const current = candidateEntries.get(name);
    if (stage08.group !== current.group || !current.withinLimit) {
      throw new Error(`Stage 9 key-flow gas evidence is invalid for ${name}`);
    }
    return {
      group: current.group,
      name,
      stage08Gas: stage08.gas,
      candidateGas: current.gas,
      deltaGas: current.gas - stage08.gas,
      withinBaselineLimit: true,
    };
  });
  return sorted({
    baselinePolicy: candidateGas.policy,
    baselinePath: candidateGas.baselinePath,
    baselineSha256: candidateGas.baselineSha256,
    fuzzSeed: candidateGas.fuzzSeed,
    comparisons,
  });
}

function stage09Evidence(review, baseline, candidate) {
  const inherited = stage08Evidence();
  const keyFlowGas = stage08GasEvidence();
  return sorted({
    schemaVersion: 1,
    candidate: review.candidate,
    baselineSha256: review.baselineSha256,
    mode: review.opcodeEvidence.mode,
    production: stage09ProductionEvidence(baseline, candidate),
    forgeStd: stage09ForgeStdEvidence(),
    legacyGasRelativeToStage08: stage09LegacyGasEvidence(candidate),
    keyFlowGasRelativeToStage08: stage09KeyFlowGasEvidence(
      inherited,
      keyFlowGas
    ),
  });
}

function stage09LegacyGasEntries(inherited) {
  const previousEntries = [...STAGE_08_LEGACY_GAS_ENTRIES];
  const inheritedGas = inherited.legacyGasRelativeToStage08;
  if (
    inheritedGas.fuzzSeed !== "0x721" ||
    inheritedGas.inventoryCount !== previousEntries.length
  ) {
    throw new Error("Security 01 inherited an invalid Stage 9 gas inventory");
  }
  for (const change of inheritedGas.changes) {
    const match = change.path.match(/^\$\.gasSnapshot\.entries\[(\d+)\]$/);
    if (!match) throw new Error(`Invalid Stage 9 gas path: ${change.path}`);
    const index = Number(match[1]);
    if (previousEntries[index] !== change.stage08Value) {
      throw new Error(`Stage 9 gas anchor mismatch at index ${index}`);
    }
    previousEntries[index] = change.candidateValue;
  }
  return previousEntries;
}

function security01LegacyGasEvidence(candidate, inherited) {
  const previousEntries = stage09LegacyGasEntries(inherited);

  const candidateEntries = candidate.gasSnapshot.entries;
  if (
    candidate.gasSnapshot.fuzzSeed !== "0x721" ||
    candidateEntries.length !== previousEntries.length
  ) {
    throw new Error("Security 01 must preserve the legacy gas inventory");
  }
  const changes = [];
  for (let index = 0; index < previousEntries.length; index += 1) {
    if (previousEntries[index] !== candidateEntries[index]) {
      changes.push({
        path: `$.gasSnapshot.entries[${index}]`,
        stage09Value: previousEntries[index],
        candidateValue: candidateEntries[index],
      });
    }
  }
  return sorted({
    fuzzSeed: "0x721",
    inventoryCount: previousEntries.length,
    stage09EntriesSha256: sha256(stableJson(previousEntries)),
    candidateEntriesSha256: sha256(stableJson(candidateEntries)),
    changedIndices: changes.map(({ path: reviewPath }) =>
      Number(reviewPath.match(/\[(\d+)\]/)[1])
    ),
    changes,
  });
}

function security01KeyFlowGasEvidence(inherited, candidateGas) {
  const previous = new Map(
    inherited.keyFlowGasRelativeToStage08.comparisons.map((entry) => [
      entry.name,
      entry,
    ])
  );
  const current = new Map();
  for (const [group, entries] of Object.entries(candidateGas.groups)) {
    for (const entry of entries) current.set(entry.name, { group, ...entry });
  }
  if (!valuesEqual([...previous.keys()].sort(), [...current.keys()].sort())) {
    throw new Error("Security 01 must preserve the 12 key-flow gas inventory");
  }
  const comparisons = [...previous.keys()].sort().map((name) => {
    const stage09 = previous.get(name);
    const candidate = current.get(name);
    if (stage09.group !== candidate.group || !candidate.withinLimit) {
      throw new Error(`Security 01 gas evidence is invalid for ${name}`);
    }
    return {
      group: candidate.group,
      name,
      stage09Gas: stage09.candidateGas,
      candidateGas: candidate.candidateGas,
      deltaGas: candidate.candidateGas - stage09.candidateGas,
      baselineGas: candidate.baselineGas,
      maximumGas: candidate.maximumGas,
      withinBaselineLimit: true,
    };
  });
  return sorted({
    baselinePath: candidateGas.baselinePath,
    baselineSha256: candidateGas.baselineSha256,
    baselinePolicy: candidateGas.policy,
    fuzzSeed: candidateGas.fuzzSeed,
    comparisons,
  });
}

function security01RevertEvidence(baseline, candidate) {
  const expected = security01ProjectRevertStrings(
    baseline.projectRevertStrings
  );
  if (!valuesEqual(candidate.projectRevertStrings, expected)) {
    throw new Error("Security 01 revert-callsite evidence does not match");
  }
  const addedCallsite = expected.find(
    (entry) =>
      entry.source === SECURITY_01_ERC721_SOURCE &&
      entry.callable === "_transfer(address,address,uint256)" &&
      entry.ordinal === 2
  );
  const unchanged = expected.filter((entry) => entry !== addedCallsite);
  if (!valuesEqual(unchanged, baseline.projectRevertStrings)) {
    throw new Error(
      "Security 01 changed a protected revert besides its duplicate"
    );
  }
  return sorted({
    baselineCount: baseline.projectRevertStrings.length,
    candidateCount: candidate.projectRevertStrings.length,
    unchangedCallsitesSha256: sha256(stableJson(unchanged)),
    addedCallsite,
  });
}

function security01HardCompatibilityEvidence(baseline, candidate) {
  const inventory = validateSecurity01Inventory(candidate);
  const contracts = {};
  for (const qualifiedName of Object.keys(baseline.contracts).sort()) {
    const fields = {};
    for (const field of [
      "abi",
      "functions",
      "events",
      "errors",
      "storageLayout",
    ]) {
      const expected = baseline.contracts[qualifiedName][field];
      const actual = candidate.contracts[qualifiedName][field];
      if (!valuesEqual(actual, expected)) {
        throw new Error(
          `Security 01 hard field changed: ${qualifiedName} ${field}`
        );
      }
      fields[field] = {
        equal: true,
        sha256: sha256(stableJson(actual)),
      };
    }
    contracts[qualifiedName] = fields;
  }
  const globalFields = {};
  for (const field of ["interfaces", "enums", "erc165"]) {
    if (!valuesEqual(candidate[field], baseline[field])) {
      throw new Error(`Security 01 hard field changed: ${field}`);
    }
    globalFields[field] = {
      equal: true,
      sha256: sha256(stableJson(candidate[field])),
    };
  }
  if (!valuesEqual(candidate.compiler.settings, baseline.compiler.settings)) {
    throw new Error("Security 01 compiler settings changed");
  }
  return sorted({
    contracts,
    ...globalFields,
    compilerSettings: {
      equal: true,
      sha256: sha256(stableJson(candidate.compiler.settings)),
    },
    behaviorTestInventory: { ...inventory, unchangedFromStage09: true },
    parityFiles: security01ParityEvidence(),
  });
}

function security01ProductionEvidence(baseline, candidate, inherited) {
  const stage08 = stage08Evidence();
  const contracts = {};
  for (const qualifiedName of STAGE_08_PRODUCTION_CONTRACTS) {
    const stage08Contract = stage08.contracts[qualifiedName];
    const stage09Contract = inherited.production.contracts[qualifiedName];
    const candidateContract = candidate.contracts[qualifiedName];
    if (!stage08Contract || !stage09Contract || !candidateContract) {
      throw new Error(
        `Security 01 production anchor is missing ${qualifiedName}`
      );
    }
    const bytecodes = {};
    for (const bytecodeKind of ["creationBytecode", "runtimeBytecode"]) {
      const baselineBytecode = baseline.contracts[qualifiedName][bytecodeKind];
      const stage08Bytecode = stage08Contract[bytecodeKind];
      const stage09Bytecode = stage09Contract[bytecodeKind].candidate;
      const candidateBytecode = candidateContract[bytecodeKind];
      const stage09Opcodes = applyUnifiedOpcodeDiff(
        baselineBytecode.metadataStrippedOpcodes,
        stage08Bytecode.metadataStrippedOpcodes.fullDiff.hunks
      );
      if (
        sha256(stage09Opcodes) !==
          stage08Bytecode.metadataStrippedOpcodes.candidateSha256 ||
        sha256(stage09Opcodes) !== stage09Bytecode.metadataStrippedOpcodesSha256
      ) {
        throw new Error(
          `Security 01 could not reconstruct Stage 9 ${qualifiedName} ${bytecodeKind}`
        );
      }
      const expectedStage09 = {
        rawKeccak256: stage08Bytecode.rawBytecode.candidateKeccak256,
        rawSizeBytes: stage08Bytecode.rawBytecode.candidateSizeBytes,
        metadataBytes: stage08Bytecode.rawBytecode.candidateMetadataBytes,
        metadataStrippedKeccak256:
          stage08Bytecode.metadataStrippedBytecode.candidateKeccak256,
        metadataStrippedSizeBytes:
          stage08Bytecode.metadataStrippedBytecode.candidateSizeBytes,
        metadataStrippedOpcodesSha256:
          stage08Bytecode.metadataStrippedOpcodes.candidateSha256,
      };
      if (!valuesEqual(stage09Bytecode, expectedStage09)) {
        throw new Error(
          `Security 01 Stage 9 bytecode anchor is inconsistent for ${qualifiedName} ${bytecodeKind}`
        );
      }

      const candidateOpcodes = candidateBytecode.metadataStrippedOpcodes;
      const opcodesEqual = stage09Opcodes === candidateOpcodes;
      if (opcodesEqual) {
        throw new Error(
          `Security 01 expected an opcode change for ${qualifiedName} ${bytecodeKind}`
        );
      }
      bytecodes[bytecodeKind] = {
        rawBytecode: {
          stage09Keccak256: stage09Bytecode.rawKeccak256,
          candidateKeccak256: candidateBytecode.keccak256,
          stage09SizeBytes: stage09Bytecode.rawSizeBytes,
          candidateSizeBytes: candidateBytecode.sizeBytes,
          sizeDeltaBytes:
            candidateBytecode.sizeBytes - stage09Bytecode.rawSizeBytes,
          stage09MetadataBytes: stage09Bytecode.metadataBytes,
          candidateMetadataBytes: candidateBytecode.metadataBytes,
        },
        metadataStrippedBytecode: {
          stage09Keccak256: stage09Bytecode.metadataStrippedKeccak256,
          candidateKeccak256: candidateBytecode.metadataStrippedKeccak256,
          stage09SizeBytes: stage09Bytecode.metadataStrippedSizeBytes,
          candidateSizeBytes: candidateBytecode.metadataStrippedSizeBytes,
          sizeDeltaBytes:
            candidateBytecode.metadataStrippedSizeBytes -
            stage09Bytecode.metadataStrippedSizeBytes,
        },
        metadataStrippedOpcodes: {
          stage09Sha256: sha256(stage09Opcodes),
          candidateSha256: sha256(candidateOpcodes),
          equal: false,
          fullDiff: unifiedOpcodeDiff(stage09Opcodes, candidateOpcodes),
        },
      };
    }

    const stage09RuntimeSize =
      stage09Contract.runtimeBytecode.candidate.rawSizeBytes;
    const candidateRuntimeSize = candidateContract.runtimeBytecode.sizeBytes;
    if (candidateRuntimeSize > 24_576) {
      throw new Error(`${qualifiedName} exceeds the EIP-170 size limit`);
    }
    contracts[qualifiedName] = {
      ...bytecodes,
      eip170: {
        limitBytes: 24_576,
        stage09RuntimeSizeBytes: stage09RuntimeSize,
        candidateRuntimeSizeBytes: candidateRuntimeSize,
        sizeDeltaBytes: candidateRuntimeSize - stage09RuntimeSize,
        stage09WithinLimit: stage09RuntimeSize <= 24_576,
        candidateWithinLimit: true,
      },
    };
  }

  const expectedCompiler = inherited.production.compiler.candidate;
  const candidateCompiler = {
    version: candidate.compiler.version,
    longVersion: candidate.compiler.longVersion,
    settingsSha256: sha256(stableJson(candidate.compiler.settings)),
  };
  if (!valuesEqual(candidateCompiler, expectedCompiler)) {
    throw new Error("Security 01 compiler differs from Stage 9");
  }
  return sorted({ compiler: candidateCompiler, contracts });
}

function security01Evidence(review, baseline, candidate) {
  const inherited = stage09EvidenceAnchor();
  const keyFlowGas = stage08GasEvidence();
  return sorted({
    schemaVersion: 1,
    candidate: review.candidate,
    baselineSha256: review.baselineSha256,
    mode: review.opcodeEvidence.mode,
    inheritedStage09Evidence: {
      path: STAGE_09_OPCODE_EVIDENCE_PATH,
      sha256: STAGE_09_EVIDENCE_SHA256,
    },
    sourcePatch: security01SourceEvidence(),
    intentionalBehaviorChange: security01BehaviorEvidence(candidate),
    revertCallsite: security01RevertEvidence(baseline, candidate),
    hardCompatibility: security01HardCompatibilityEvidence(baseline, candidate),
    productionRelativeToStage09: security01ProductionEvidence(
      baseline,
      candidate,
      inherited
    ),
    legacyGasRelativeToStage09: security01LegacyGasEvidence(
      candidate,
      inherited
    ),
    keyFlowGasRelativeToStage09: security01KeyFlowGasEvidence(
      inherited,
      keyFlowGas
    ),
  });
}

function security02RevertEvidence(baseline, candidate) {
  const checkpointEntries = security01ProjectRevertStrings(
    baseline.projectRevertStrings
  );
  const expected = security02ProjectRevertStrings(
    baseline.projectRevertStrings
  );
  if (!valuesEqual(candidate.projectRevertStrings, expected)) {
    throw new Error("Security 02 revert-callsite evidence does not match");
  }
  const addedIndex = expected.findIndex(
    (entry) =>
      entry.source === SECURITY_02_PCO_SOURCE &&
      entry.contract === "PartialCommonOwnership" &&
      entry.callable ===
        "_mint(uint256,address,uint256,uint256,address payable,uint256,uint256)" &&
      entry.callKind === "require" &&
      entry.ordinal === 0 &&
      entry.value === "ERC721: transfer to non ERC721Receiver implementer"
  );
  if (addedIndex < 0) {
    throw new Error("Security 02 receiver-check revert callsite is missing");
  }
  const unchanged = expected.filter((_entry, index) => index !== addedIndex);
  if (!valuesEqual(unchanged, checkpointEntries)) {
    throw new Error(
      "Security 02 changed a protected revert besides its receiver-check callsite"
    );
  }
  return sorted({
    security01Count: checkpointEntries.length,
    candidateCount: expected.length,
    unchangedCallsitesSha256: sha256(stableJson(unchanged)),
    addedCallsite: expected[addedIndex],
  });
}

function security02HardCompatibilityEvidence(baseline, candidate) {
  const evidence = security01HardCompatibilityEvidence(baseline, candidate);
  delete evidence.behaviorTestInventory.unchangedFromStage09;
  evidence.behaviorTestInventory.unchangedFromSecurity01 = true;
  return sorted(evidence);
}

function security02ProductionEvidence(baseline, candidate, checkpoint) {
  const contracts = {};
  for (const qualifiedName of STAGE_08_PRODUCTION_CONTRACTS) {
    const checkpointContract =
      checkpoint.evidence.value.productionRelativeToStage09.contracts[
        qualifiedName
      ];
    const candidateContract = candidate.contracts[qualifiedName];
    if (!checkpointContract || !candidateContract) {
      throw new Error(
        `Security 02 production anchor is missing ${qualifiedName}`
      );
    }
    const bytecodes = {};
    for (const bytecodeKind of ["creationBytecode", "runtimeBytecode"]) {
      const checkpointBytecode = checkpointContract[bytecodeKind];
      const checkpointOpcodes = security01CheckpointOpcodes(
        baseline,
        qualifiedName,
        bytecodeKind,
        checkpoint
      );
      const candidateBytecode = candidateContract[bytecodeKind];
      const opcodesEqual =
        checkpointOpcodes === candidateBytecode.metadataStrippedOpcodes;
      const expectedOpcodeChange =
        qualifiedName === "contracts/Wrapper.sol:Wrapper";
      if (opcodesEqual !== !expectedOpcodeChange) {
        throw new Error(
          `Security 02 ${qualifiedName} ${bytecodeKind} opcode equality differs from the exact Wrapper-only consequence`
        );
      }
      bytecodes[bytecodeKind] = {
        rawBytecode: {
          security01Keccak256:
            checkpointBytecode.rawBytecode.candidateKeccak256,
          candidateKeccak256: candidateBytecode.keccak256,
          security01SizeBytes:
            checkpointBytecode.rawBytecode.candidateSizeBytes,
          candidateSizeBytes: candidateBytecode.sizeBytes,
          sizeDeltaBytes:
            candidateBytecode.sizeBytes -
            checkpointBytecode.rawBytecode.candidateSizeBytes,
          security01MetadataBytes:
            checkpointBytecode.rawBytecode.candidateMetadataBytes,
          candidateMetadataBytes: candidateBytecode.metadataBytes,
        },
        metadataStrippedBytecode: {
          security01Keccak256:
            checkpointBytecode.metadataStrippedBytecode.candidateKeccak256,
          candidateKeccak256: candidateBytecode.metadataStrippedKeccak256,
          security01SizeBytes:
            checkpointBytecode.metadataStrippedBytecode.candidateSizeBytes,
          candidateSizeBytes: candidateBytecode.metadataStrippedSizeBytes,
          sizeDeltaBytes:
            candidateBytecode.metadataStrippedSizeBytes -
            checkpointBytecode.metadataStrippedBytecode.candidateSizeBytes,
        },
        metadataStrippedOpcodes: {
          security01Sha256: sha256(checkpointOpcodes),
          candidateSha256: sha256(candidateBytecode.metadataStrippedOpcodes),
          equal: opcodesEqual,
          fullDiff: unifiedOpcodeDiff(
            checkpointOpcodes,
            candidateBytecode.metadataStrippedOpcodes
          ),
        },
      };
    }

    const security01RuntimeSize =
      checkpointContract.runtimeBytecode.rawBytecode.candidateSizeBytes;
    const candidateRuntimeSize = candidateContract.runtimeBytecode.sizeBytes;
    if (candidateRuntimeSize > 24_576) {
      throw new Error(`${qualifiedName} exceeds the EIP-170 size limit`);
    }
    contracts[qualifiedName] = {
      ...bytecodes,
      eip170: {
        limitBytes: 24_576,
        security01RuntimeSizeBytes: security01RuntimeSize,
        candidateRuntimeSizeBytes: candidateRuntimeSize,
        sizeDeltaBytes: candidateRuntimeSize - security01RuntimeSize,
        security01WithinLimit: security01RuntimeSize <= 24_576,
        candidateWithinLimit: true,
      },
    };
  }

  const expectedCompiler =
    checkpoint.evidence.value.productionRelativeToStage09.compiler;
  const candidateCompiler = {
    version: candidate.compiler.version,
    longVersion: candidate.compiler.longVersion,
    settingsSha256: sha256(stableJson(candidate.compiler.settings)),
  };
  if (!valuesEqual(candidateCompiler, expectedCompiler)) {
    throw new Error("Security 02 compiler differs from Security 01");
  }
  return sorted({ compiler: candidateCompiler, contracts });
}

function security02LegacyGasEvidence(candidate, checkpoint) {
  const previousEntries = security01CheckpointLegacyGasEntries(checkpoint);
  const candidateEntries = candidate.gasSnapshot.entries;
  if (
    candidate.gasSnapshot.fuzzSeed !== "0x721" ||
    candidateEntries.length !== previousEntries.length
  ) {
    throw new Error("Security 02 must preserve the legacy gas inventory");
  }
  const changes = [];
  for (let index = 0; index < previousEntries.length; index += 1) {
    if (previousEntries[index] !== candidateEntries[index]) {
      changes.push({
        path: `$.gasSnapshot.entries[${index}]`,
        security01Value: previousEntries[index],
        candidateValue: candidateEntries[index],
      });
    }
  }
  return sorted({
    fuzzSeed: "0x721",
    inventoryCount: previousEntries.length,
    security01EntriesSha256: sha256(stableJson(previousEntries)),
    candidateEntriesSha256: sha256(stableJson(candidateEntries)),
    changedIndices: changes.map(({ path: reviewPath }) =>
      Number(reviewPath.match(/\[(\d+)\]/)[1])
    ),
    changes,
  });
}

function security02KeyFlowGasEvidence(checkpoint, candidateGas) {
  const previous = new Map(
    checkpoint.evidence.value.keyFlowGasRelativeToStage09.comparisons.map(
      (entry) => [entry.name, entry]
    )
  );
  const current = new Map();
  for (const [group, entries] of Object.entries(candidateGas.groups)) {
    for (const entry of entries) current.set(entry.name, { group, ...entry });
  }
  if (!valuesEqual([...previous.keys()].sort(), [...current.keys()].sort())) {
    throw new Error("Security 02 must preserve the 12 key-flow gas inventory");
  }
  const comparisons = [...previous.keys()].sort().map((name) => {
    const security01 = previous.get(name);
    const candidate = current.get(name);
    if (
      security01.group !== candidate.group ||
      security01.baselineGas !== candidate.baselineGas ||
      security01.maximumGas !== candidate.maximumGas ||
      !candidate.withinLimit
    ) {
      throw new Error(`Security 02 gas evidence is invalid for ${name}`);
    }
    return {
      group: candidate.group,
      name,
      security01Gas: security01.candidateGas,
      candidateGas: candidate.candidateGas,
      deltaGas: candidate.candidateGas - security01.candidateGas,
      baselineGas: candidate.baselineGas,
      maximumGas: candidate.maximumGas,
      withinBaselineLimit: true,
    };
  });
  return sorted({
    baselinePath: candidateGas.baselinePath,
    baselineSha256: candidateGas.baselineSha256,
    baselinePolicy: candidateGas.policy,
    fuzzSeed: candidateGas.fuzzSeed,
    comparisons,
  });
}

function security02Evidence(review, baseline, candidate) {
  const checkpoint = security01CheckpointAnchor();
  const keyFlowGas = stage08GasEvidence();
  return sorted({
    schemaVersion: 1,
    candidate: review.candidate,
    baselineSha256: review.baselineSha256,
    mode: review.opcodeEvidence.mode,
    inheritedSecurity01Checkpoint: SECURITY_02_CHECKPOINT_BINDING,
    sourcePatch: security02SourceEvidence(),
    intentionalBehaviorChange: security02BehaviorEvidence(candidate),
    revertCallsite: security02RevertEvidence(baseline, candidate),
    hardCompatibility: security02HardCompatibilityEvidence(baseline, candidate),
    productionRelativeToSecurity01: security02ProductionEvidence(
      baseline,
      candidate,
      checkpoint
    ),
    legacyGasRelativeToSecurity01: security02LegacyGasEvidence(
      candidate,
      checkpoint
    ),
    keyFlowGasRelativeToSecurity01: security02KeyFlowGasEvidence(
      checkpoint,
      keyFlowGas
    ),
  });
}

function security03RevertEvidence(baseline, candidate) {
  const checkpointEntries = security02ProjectRevertStrings(
    baseline.projectRevertStrings
  );
  const expected = security03ProjectRevertStrings(
    baseline.projectRevertStrings
  );
  if (!valuesEqual(candidate.projectRevertStrings, expected)) {
    throw new Error("Security 03 revert-callsite evidence does not match");
  }
  const withoutOrdinal = (entries) =>
    entries
      .map(({ ordinal: _ordinal, ...entry }) => entry)
      .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
  if (
    !valuesEqual(withoutOrdinal(checkpointEntries), withoutOrdinal(expected))
  ) {
    throw new Error(
      "Security 03 added, removed, or changed a protected revert callsite"
    );
  }
  const checkpointTakeover = checkpointEntries.filter(
    (entry) =>
      entry.source === SECURITY_03_LEASE_SOURCE &&
      entry.callable === "takeoverLease(uint256,uint256,uint256)"
  );
  const candidateTakeover = expected.filter(
    (entry) =>
      entry.source === SECURITY_03_LEASE_SOURCE &&
      entry.callable === "takeoverLease(uint256,uint256,uint256)"
  );
  return sorted({
    security02Count: checkpointEntries.length,
    candidateCount: expected.length,
    callsiteMultisetSha256: sha256(stableJson(withoutOrdinal(expected))),
    security02Order: checkpointTakeover,
    candidateOrder: candidateTakeover,
    exactReorderOnly: true,
  });
}

function security03HardCompatibilityEvidence(baseline, candidate) {
  const evidence = security01HardCompatibilityEvidence(baseline, candidate);
  delete evidence.behaviorTestInventory.unchangedFromStage09;
  evidence.behaviorTestInventory.unchangedFromSecurity02 = true;
  return sorted(evidence);
}

function security03ProductionEvidence(baseline, candidate, checkpoint) {
  const contracts = {};
  for (const qualifiedName of STAGE_08_PRODUCTION_CONTRACTS) {
    const checkpointContract =
      checkpoint.evidence.value.productionRelativeToSecurity01.contracts[
        qualifiedName
      ];
    const candidateContract = candidate.contracts[qualifiedName];
    if (!checkpointContract || !candidateContract) {
      throw new Error(
        `Security 03 production anchor is missing ${qualifiedName}`
      );
    }
    const bytecodes = {};
    for (const bytecodeKind of ["creationBytecode", "runtimeBytecode"]) {
      const checkpointBytecode = checkpointContract[bytecodeKind];
      const checkpointOpcodes = security02CheckpointOpcodes(
        baseline,
        qualifiedName,
        bytecodeKind,
        checkpoint
      );
      const candidateBytecode = candidateContract[bytecodeKind];
      if (checkpointOpcodes === candidateBytecode.metadataStrippedOpcodes) {
        throw new Error(
          `Security 03 expected an opcode consequence for ${qualifiedName} ${bytecodeKind}`
        );
      }
      bytecodes[bytecodeKind] = {
        rawBytecode: {
          security02Keccak256:
            checkpointBytecode.rawBytecode.candidateKeccak256,
          candidateKeccak256: candidateBytecode.keccak256,
          security02SizeBytes:
            checkpointBytecode.rawBytecode.candidateSizeBytes,
          candidateSizeBytes: candidateBytecode.sizeBytes,
          sizeDeltaBytes:
            candidateBytecode.sizeBytes -
            checkpointBytecode.rawBytecode.candidateSizeBytes,
          security02MetadataBytes:
            checkpointBytecode.rawBytecode.candidateMetadataBytes,
          candidateMetadataBytes: candidateBytecode.metadataBytes,
        },
        metadataStrippedBytecode: {
          security02Keccak256:
            checkpointBytecode.metadataStrippedBytecode.candidateKeccak256,
          candidateKeccak256: candidateBytecode.metadataStrippedKeccak256,
          security02SizeBytes:
            checkpointBytecode.metadataStrippedBytecode.candidateSizeBytes,
          candidateSizeBytes: candidateBytecode.metadataStrippedSizeBytes,
          sizeDeltaBytes:
            candidateBytecode.metadataStrippedSizeBytes -
            checkpointBytecode.metadataStrippedBytecode.candidateSizeBytes,
        },
        metadataStrippedOpcodes: {
          security02Sha256: sha256(checkpointOpcodes),
          candidateSha256: sha256(candidateBytecode.metadataStrippedOpcodes),
          equal: false,
          fullDiff: unifiedOpcodeDiff(
            checkpointOpcodes,
            candidateBytecode.metadataStrippedOpcodes
          ),
        },
      };
    }
    const security02RuntimeSize =
      checkpointContract.runtimeBytecode.rawBytecode.candidateSizeBytes;
    const candidateRuntimeSize = candidateContract.runtimeBytecode.sizeBytes;
    if (candidateRuntimeSize > 24_576) {
      throw new Error(`${qualifiedName} exceeds the EIP-170 size limit`);
    }
    contracts[qualifiedName] = {
      ...bytecodes,
      eip170: {
        limitBytes: 24_576,
        security02RuntimeSizeBytes: security02RuntimeSize,
        candidateRuntimeSizeBytes: candidateRuntimeSize,
        sizeDeltaBytes: candidateRuntimeSize - security02RuntimeSize,
        security02WithinLimit: security02RuntimeSize <= 24_576,
        candidateWithinLimit: true,
      },
    };
  }
  const expectedCompiler =
    checkpoint.evidence.value.productionRelativeToSecurity01.compiler;
  const candidateCompiler = {
    version: candidate.compiler.version,
    longVersion: candidate.compiler.longVersion,
    settingsSha256: sha256(stableJson(candidate.compiler.settings)),
  };
  if (!valuesEqual(candidateCompiler, expectedCompiler)) {
    throw new Error("Security 03 compiler differs from Security 02");
  }
  return sorted({ compiler: candidateCompiler, contracts });
}

function security03LegacyGasEvidence(candidate, checkpoint) {
  const previousEntries = security02CheckpointLegacyGasEntries(checkpoint);
  const candidateEntries = candidate.gasSnapshot.entries;
  if (
    candidate.gasSnapshot.fuzzSeed !== "0x721" ||
    candidateEntries.length !== previousEntries.length
  ) {
    throw new Error("Security 03 must preserve the legacy gas inventory");
  }
  const changes = [];
  for (let index = 0; index < previousEntries.length; index += 1) {
    if (previousEntries[index] !== candidateEntries[index]) {
      changes.push({
        path: `$.gasSnapshot.entries[${index}]`,
        security02Value: previousEntries[index],
        candidateValue: candidateEntries[index],
      });
    }
  }
  return sorted({
    fuzzSeed: "0x721",
    inventoryCount: previousEntries.length,
    security02EntriesSha256: sha256(stableJson(previousEntries)),
    candidateEntriesSha256: sha256(stableJson(candidateEntries)),
    changedIndices: changes.map(({ path: reviewPath }) =>
      Number(reviewPath.match(/\[(\d+)\]/)[1])
    ),
    changes,
  });
}

function security03KeyFlowGasEvidence(checkpoint, candidateGas) {
  const previous = new Map(
    checkpoint.evidence.value.keyFlowGasRelativeToSecurity01.comparisons.map(
      (entry) => [entry.name, entry]
    )
  );
  const current = new Map();
  for (const [group, entries] of Object.entries(candidateGas.groups)) {
    for (const entry of entries) current.set(entry.name, { group, ...entry });
  }
  if (!valuesEqual([...previous.keys()].sort(), [...current.keys()].sort())) {
    throw new Error("Security 03 must preserve the 12 key-flow gas inventory");
  }
  const comparisons = [...previous.keys()].sort().map((name) => {
    const security02 = previous.get(name);
    const candidateEntry = current.get(name);
    if (
      security02.group !== candidateEntry.group ||
      security02.baselineGas !== candidateEntry.baselineGas ||
      security02.maximumGas !== candidateEntry.maximumGas ||
      !candidateEntry.withinLimit
    ) {
      throw new Error(`Security 03 gas evidence is invalid for ${name}`);
    }
    return {
      group: candidateEntry.group,
      name,
      security02Gas: security02.candidateGas,
      candidateGas: candidateEntry.candidateGas,
      deltaGas: candidateEntry.candidateGas - security02.candidateGas,
      baselineGas: candidateEntry.baselineGas,
      maximumGas: candidateEntry.maximumGas,
      withinBaselineLimit: true,
    };
  });
  return sorted({
    baselinePath: candidateGas.baselinePath,
    baselineSha256: candidateGas.baselineSha256,
    baselinePolicy: candidateGas.policy,
    fuzzSeed: candidateGas.fuzzSeed,
    comparisons,
  });
}

function security03Evidence(review, baseline, candidate) {
  const checkpoint = security02CheckpointAnchor();
  const keyFlowGas = stage08GasEvidence();
  return sorted({
    schemaVersion: 1,
    candidate: review.candidate,
    baselineSha256: review.baselineSha256,
    mode: review.opcodeEvidence.mode,
    inheritedSecurity02Checkpoint: SECURITY_03_CHECKPOINT_BINDING,
    sourcePatch: security03SourceEvidence(),
    intentionalBehaviorChange: security03BehaviorEvidence(candidate),
    revertCallsite: security03RevertEvidence(baseline, candidate),
    hardCompatibility: security03HardCompatibilityEvidence(baseline, candidate),
    productionRelativeToSecurity02: security03ProductionEvidence(
      baseline,
      candidate,
      checkpoint
    ),
    legacyGasRelativeToSecurity02: security03LegacyGasEvidence(
      candidate,
      checkpoint
    ),
    keyFlowGasRelativeToSecurity02: security03KeyFlowGasEvidence(
      checkpoint,
      keyFlowGas
    ),
  });
}

function security04RevertEvidence(baseline, candidate) {
  const checkpointEntries = security03ProjectRevertStrings(
    baseline.projectRevertStrings
  );
  if (!valuesEqual(candidate.projectRevertStrings, checkpointEntries)) {
    throw new Error("Security 04 revert-callsite evidence does not match");
  }
  return sorted({
    security03Count: checkpointEntries.length,
    candidateCount: candidate.projectRevertStrings.length,
    security03Sha256: sha256(stableJson(checkpointEntries)),
    candidateSha256: sha256(stableJson(candidate.projectRevertStrings)),
    equal: true,
  });
}

function security04HardCompatibilityEvidence(baseline, candidate) {
  const evidence = security01HardCompatibilityEvidence(baseline, candidate);
  delete evidence.behaviorTestInventory.unchangedFromStage09;
  evidence.behaviorTestInventory.unchangedFromSecurity03 = true;
  return sorted(evidence);
}

function security04PCOEqualityEvidence(baseline, candidate, checkpoint) {
  const qualifiedName =
    "contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership";
  const checkpointContract =
    checkpoint.evidence.value.productionRelativeToSecurity02.contracts[
      qualifiedName
    ];
  const candidateContract = candidate.contracts[qualifiedName];
  if (!checkpointContract || !candidateContract) {
    throw new Error("Security 04 PCO equality anchor is missing");
  }
  const bytecodes = {};
  for (const bytecodeKind of ["creationBytecode", "runtimeBytecode"]) {
    const checkpointBytecode = checkpointContract[bytecodeKind];
    const checkpointOpcodes = security03CheckpointOpcodes(
      baseline,
      qualifiedName,
      bytecodeKind,
      checkpoint
    );
    const expected = {
      rawKeccak256: checkpointBytecode.rawBytecode.candidateKeccak256,
      rawSizeBytes: checkpointBytecode.rawBytecode.candidateSizeBytes,
      metadataBytes: checkpointBytecode.rawBytecode.candidateMetadataBytes,
      metadataStrippedKeccak256:
        checkpointBytecode.metadataStrippedBytecode.candidateKeccak256,
      metadataStrippedSizeBytes:
        checkpointBytecode.metadataStrippedBytecode.candidateSizeBytes,
      metadataStrippedOpcodesSha256: sha256(checkpointOpcodes),
    };
    const actual = {
      rawKeccak256: candidateContract[bytecodeKind].keccak256,
      rawSizeBytes: candidateContract[bytecodeKind].sizeBytes,
      metadataBytes: candidateContract[bytecodeKind].metadataBytes,
      metadataStrippedKeccak256:
        candidateContract[bytecodeKind].metadataStrippedKeccak256,
      metadataStrippedSizeBytes:
        candidateContract[bytecodeKind].metadataStrippedSizeBytes,
      metadataStrippedOpcodesSha256: sha256(
        candidateContract[bytecodeKind].metadataStrippedOpcodes
      ),
    };
    if (
      !valuesEqual(actual, expected) ||
      candidateContract[bytecodeKind].metadataStrippedOpcodes !==
        checkpointOpcodes
    ) {
      const differences = collectDifferences(
        expected,
        actual,
        `$.security03PCO.${bytecodeKind}`
      );
      throw new Error(
        `Security 04 must preserve standalone PCO ${bytecodeKind} exactly:\n${differences
          .map((difference) => `- ${formatDifference(difference)}`)
          .join("\n")}`
      );
    }
    bytecodes[bytecodeKind] = { expected, candidate: actual, equal: true };
  }
  const security03RuntimeSize =
    checkpointContract.runtimeBytecode.rawBytecode.candidateSizeBytes;
  const candidateRuntimeSize = candidateContract.runtimeBytecode.sizeBytes;
  if (
    security03RuntimeSize !== candidateRuntimeSize ||
    candidateRuntimeSize > 24_576
  ) {
    throw new Error("Security 04 PCO runtime size changed or exceeds EIP-170");
  }
  return sorted({
    ...bytecodes,
    eip170: {
      limitBytes: 24_576,
      security03RuntimeSizeBytes: security03RuntimeSize,
      candidateRuntimeSizeBytes: candidateRuntimeSize,
      equal: true,
      candidateWithinLimit: true,
    },
  });
}

function validateSecurity04PCOEquality(baseline, candidate, checkpoint) {
  security04PCOEqualityEvidence(baseline, candidate, checkpoint);
}

function security04ProductionEvidence(baseline, candidate, checkpoint) {
  const qualifiedName = "contracts/Wrapper.sol:Wrapper";
  const checkpointContract =
    checkpoint.evidence.value.productionRelativeToSecurity02.contracts[
      qualifiedName
    ];
  const candidateContract = candidate.contracts[qualifiedName];
  if (!checkpointContract || !candidateContract) {
    throw new Error("Security 04 Wrapper production anchor is missing");
  }
  const bytecodes = {};
  for (const bytecodeKind of ["creationBytecode", "runtimeBytecode"]) {
    const checkpointBytecode = checkpointContract[bytecodeKind];
    const checkpointOpcodes = security03CheckpointOpcodes(
      baseline,
      qualifiedName,
      bytecodeKind,
      checkpoint
    );
    const candidateBytecode = candidateContract[bytecodeKind];
    if (checkpointOpcodes === candidateBytecode.metadataStrippedOpcodes) {
      throw new Error(
        `Security 04 expected a Wrapper ${bytecodeKind} opcode consequence`
      );
    }
    bytecodes[bytecodeKind] = {
      rawBytecode: {
        security03Keccak256: checkpointBytecode.rawBytecode.candidateKeccak256,
        candidateKeccak256: candidateBytecode.keccak256,
        security03SizeBytes: checkpointBytecode.rawBytecode.candidateSizeBytes,
        candidateSizeBytes: candidateBytecode.sizeBytes,
        sizeDeltaBytes:
          candidateBytecode.sizeBytes -
          checkpointBytecode.rawBytecode.candidateSizeBytes,
        security03MetadataBytes:
          checkpointBytecode.rawBytecode.candidateMetadataBytes,
        candidateMetadataBytes: candidateBytecode.metadataBytes,
      },
      metadataStrippedBytecode: {
        security03Keccak256:
          checkpointBytecode.metadataStrippedBytecode.candidateKeccak256,
        candidateKeccak256: candidateBytecode.metadataStrippedKeccak256,
        security03SizeBytes:
          checkpointBytecode.metadataStrippedBytecode.candidateSizeBytes,
        candidateSizeBytes: candidateBytecode.metadataStrippedSizeBytes,
        sizeDeltaBytes:
          candidateBytecode.metadataStrippedSizeBytes -
          checkpointBytecode.metadataStrippedBytecode.candidateSizeBytes,
      },
      metadataStrippedOpcodes: {
        security03Sha256: sha256(checkpointOpcodes),
        candidateSha256: sha256(candidateBytecode.metadataStrippedOpcodes),
        equal: false,
        fullDiff: unifiedOpcodeDiff(
          checkpointOpcodes,
          candidateBytecode.metadataStrippedOpcodes
        ),
      },
    };
  }
  const security03RuntimeSize =
    checkpointContract.runtimeBytecode.rawBytecode.candidateSizeBytes;
  const candidateRuntimeSize = candidateContract.runtimeBytecode.sizeBytes;
  if (candidateRuntimeSize > 24_576) {
    throw new Error("Security 04 Wrapper exceeds the EIP-170 size limit");
  }
  const expectedCompiler =
    checkpoint.evidence.value.productionRelativeToSecurity02.compiler;
  const candidateCompiler = {
    version: candidate.compiler.version,
    longVersion: candidate.compiler.longVersion,
    settingsSha256: sha256(stableJson(candidate.compiler.settings)),
  };
  if (!valuesEqual(candidateCompiler, expectedCompiler)) {
    throw new Error("Security 04 compiler differs from Security 03");
  }
  return sorted({
    compiler: candidateCompiler,
    contracts: {
      [qualifiedName]: {
        ...bytecodes,
        eip170: {
          limitBytes: 24_576,
          security03RuntimeSizeBytes: security03RuntimeSize,
          candidateRuntimeSizeBytes: candidateRuntimeSize,
          sizeDeltaBytes: candidateRuntimeSize - security03RuntimeSize,
          security03WithinLimit: security03RuntimeSize <= 24_576,
          candidateWithinLimit: true,
        },
      },
      "contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership":
        security04PCOEqualityEvidence(baseline, candidate, checkpoint),
    },
  });
}

function security04LegacyGasEvidence(candidate, checkpoint) {
  const previousEntries = security03CheckpointLegacyGasEntries(checkpoint);
  const candidateEntries = candidate.gasSnapshot.entries;
  if (
    candidate.gasSnapshot.fuzzSeed !== "0x721" ||
    candidateEntries.length !== previousEntries.length
  ) {
    throw new Error("Security 04 must preserve the legacy gas inventory");
  }
  const changes = [];
  for (let index = 0; index < previousEntries.length; index += 1) {
    if (previousEntries[index] !== candidateEntries[index]) {
      changes.push({
        path: `$.gasSnapshot.entries[${index}]`,
        security03Value: previousEntries[index],
        candidateValue: candidateEntries[index],
      });
    }
  }
  return sorted({
    fuzzSeed: "0x721",
    inventoryCount: previousEntries.length,
    security03EntriesSha256: sha256(stableJson(previousEntries)),
    candidateEntriesSha256: sha256(stableJson(candidateEntries)),
    changedIndices: changes.map(({ path: reviewPath }) =>
      Number(reviewPath.match(/\[(\d+)\]/)[1])
    ),
    changes,
  });
}

function security04KeyFlowGasEvidence(checkpoint, candidateGas) {
  const previous = new Map(
    checkpoint.evidence.value.keyFlowGasRelativeToSecurity02.comparisons.map(
      (entry) => [entry.name, entry]
    )
  );
  const current = new Map();
  for (const [group, entries] of Object.entries(candidateGas.groups)) {
    for (const entry of entries) current.set(entry.name, { group, ...entry });
  }
  if (!valuesEqual([...previous.keys()].sort(), [...current.keys()].sort())) {
    throw new Error("Security 04 must preserve the 12 key-flow gas inventory");
  }
  const comparisons = [...previous.keys()].sort().map((name) => {
    const security03 = previous.get(name);
    const candidateEntry = current.get(name);
    if (
      security03.group !== candidateEntry.group ||
      security03.baselineGas !== candidateEntry.baselineGas ||
      security03.maximumGas !== candidateEntry.maximumGas ||
      !candidateEntry.withinLimit
    ) {
      throw new Error(`Security 04 gas evidence is invalid for ${name}`);
    }
    return {
      group: candidateEntry.group,
      name,
      security03Gas: security03.candidateGas,
      candidateGas: candidateEntry.candidateGas,
      deltaGas: candidateEntry.candidateGas - security03.candidateGas,
      baselineGas: candidateEntry.baselineGas,
      maximumGas: candidateEntry.maximumGas,
      withinBaselineLimit: true,
    };
  });
  return sorted({
    baselinePath: candidateGas.baselinePath,
    baselineSha256: candidateGas.baselineSha256,
    baselinePolicy: candidateGas.policy,
    fuzzSeed: candidateGas.fuzzSeed,
    comparisons,
  });
}

function security04CustomErrorEvidence(candidate) {
  const matching = candidate.contracts[
    "contracts/Wrapper.sol:Wrapper"
  ].errors.filter(
    (entry) =>
      entry.signature === SECURITY_04_ERROR_SIGNATURE &&
      entry.selector === SECURITY_04_ERROR_SELECTOR
  );
  if (matching.length !== 1) {
    throw new Error("Security 04 custom-error evidence changed");
  }
  return sorted({
    ...matching[0],
    declarationChange: false,
    inheritedFrom: "contracts/token/modules/Remittance.sol:Remittance",
    usedByGuard: true,
  });
}

function security04Evidence(review, baseline, candidate) {
  const checkpoint = security03CheckpointAnchor();
  const keyFlowGas = stage08GasEvidence();
  return sorted({
    schemaVersion: 1,
    candidate: review.candidate,
    baselineSha256: review.baselineSha256,
    mode: review.opcodeEvidence.mode,
    inheritedSecurity03Checkpoint: SECURITY_04_CHECKPOINT_BINDING,
    sourcePatch: security04SourceEvidence(),
    intentionalBehaviorChange: security04BehaviorEvidence(candidate),
    customError: security04CustomErrorEvidence(candidate),
    revertCallsite: security04RevertEvidence(baseline, candidate),
    hardCompatibility: security04HardCompatibilityEvidence(baseline, candidate),
    productionRelativeToSecurity03: security04ProductionEvidence(
      baseline,
      candidate,
      checkpoint
    ),
    legacyGasRelativeToSecurity03: security04LegacyGasEvidence(
      candidate,
      checkpoint
    ),
    keyFlowGasRelativeToSecurity03: security04KeyFlowGasEvidence(
      checkpoint,
      keyFlowGas
    ),
  });
}

function stage10HardCompatibilityEvidence(baseline, candidate) {
  const receiver = stage10ReceiverInventory(candidate);
  const contracts = {};
  for (const qualifiedName of Object.keys(baseline.contracts).sort()) {
    const fields = {};
    for (const field of [
      "abi",
      "functions",
      "events",
      "errors",
      "storageLayout",
    ]) {
      const expected = baseline.contracts[qualifiedName][field];
      const actual = candidate.contracts[qualifiedName]?.[field];
      if (!valuesEqual(actual, expected)) {
        throw new Error(
          `Stage 10 hard compatibility changed: ${qualifiedName} ${field}`
        );
      }
      fields[field] = { equal: true, sha256: sha256(stableJson(actual)) };
    }
    contracts[qualifiedName] = fields;
  }
  const globals = {};
  for (const field of ["interfaces", "enums", "erc165"]) {
    if (!valuesEqual(candidate[field], baseline[field])) {
      throw new Error(`Stage 10 hard compatibility changed: ${field}`);
    }
    globals[field] = {
      equal: true,
      sha256: sha256(stableJson(candidate[field])),
    };
  }
  if (!valuesEqual(candidate.compiler.settings, baseline.compiler.settings)) {
    throw new Error("Stage 10 compiler settings changed");
  }
  return sorted({
    contracts,
    ...globals,
    compiler: {
      version: candidate.compiler.version,
      longVersion: candidate.compiler.longVersion,
      settingsEqual: true,
      settingsSha256: sha256(stableJson(candidate.compiler.settings)),
    },
    behaviorTestInventory: {
      hardhat: receiver.retainedHardhat,
      retainedForge: receiver.retainedForge,
      strengthenedReceiverTests: receiver.names,
      receiverCases: receiver.cases,
      inventoryChange: "none",
      candidateForgeCount: receiver.candidateForgeCount,
      total: candidate.tests.total,
    },
    parityFiles: security01ParityEvidence(),
  });
}

function stage10RevertEvidence(baseline, candidate) {
  const expected = security04ProjectRevertStrings(
    baseline.projectRevertStrings
  );
  if (!valuesEqual(candidate.projectRevertStrings, expected)) {
    throw new Error("Stage 10 project-owned revert evidence changed");
  }
  return sorted({
    security04Count: expected.length,
    candidateCount: candidate.projectRevertStrings.length,
    equal: true,
    sha256: sha256(stableJson(candidate.projectRevertStrings)),
  });
}

function stage10ProductionEvidence(baseline, candidate, checkpoint) {
  const contracts = {};
  for (const qualifiedName of STAGE_08_PRODUCTION_CONTRACTS) {
    const candidateContract = candidate.contracts[qualifiedName];
    if (!candidateContract) {
      throw new Error(`Stage 10 production output is missing ${qualifiedName}`);
    }
    const bytecodes = {};
    for (const bytecodeKind of ["creationBytecode", "runtimeBytecode"]) {
      const security04Bytecode = security04CheckpointBytecode(
        checkpoint,
        qualifiedName,
        bytecodeKind
      );
      const security04Opcodes = security04CheckpointOpcodes(
        baseline,
        qualifiedName,
        bytecodeKind,
        checkpoint
      );
      if (
        sha256(security04Opcodes) !==
        security04Bytecode.metadataStrippedOpcodesSha256
      ) {
        throw new Error(
          `Stage 10 Security 04 bytecode anchor changed for ${qualifiedName} ${bytecodeKind}`
        );
      }
      const candidateBytecode = candidateContract[bytecodeKind];
      const opcodesEqual =
        security04Opcodes === candidateBytecode.metadataStrippedOpcodes;
      if (opcodesEqual) {
        throw new Error(
          `Stage 10 expected an OpenZeppelin 5.6.1 opcode consequence for ${qualifiedName} ${bytecodeKind}`
        );
      }
      bytecodes[bytecodeKind] = {
        rawBytecode: {
          security04Keccak256: security04Bytecode.rawKeccak256,
          candidateKeccak256: candidateBytecode.keccak256,
          security04SizeBytes: security04Bytecode.rawSizeBytes,
          candidateSizeBytes: candidateBytecode.sizeBytes,
          sizeDeltaBytes:
            candidateBytecode.sizeBytes - security04Bytecode.rawSizeBytes,
          security04MetadataBytes: security04Bytecode.metadataBytes,
          candidateMetadataBytes: candidateBytecode.metadataBytes,
        },
        metadataStrippedBytecode: {
          security04Keccak256: security04Bytecode.metadataStrippedKeccak256,
          candidateKeccak256: candidateBytecode.metadataStrippedKeccak256,
          security04SizeBytes: security04Bytecode.metadataStrippedSizeBytes,
          candidateSizeBytes: candidateBytecode.metadataStrippedSizeBytes,
          sizeDeltaBytes:
            candidateBytecode.metadataStrippedSizeBytes -
            security04Bytecode.metadataStrippedSizeBytes,
        },
        metadataStrippedOpcodes: {
          security04Sha256: sha256(security04Opcodes),
          candidateSha256: sha256(candidateBytecode.metadataStrippedOpcodes),
          equal: false,
          fullDiff: unifiedOpcodeDiff(
            security04Opcodes,
            candidateBytecode.metadataStrippedOpcodes
          ),
        },
      };
    }
    const security04Runtime = security04CheckpointBytecode(
      checkpoint,
      qualifiedName,
      "runtimeBytecode"
    );
    const candidateRuntimeSize = candidateContract.runtimeBytecode.sizeBytes;
    if (candidateRuntimeSize > 24_576) {
      throw new Error(`${qualifiedName} exceeds the EIP-170 size limit`);
    }
    contracts[qualifiedName] = {
      ...bytecodes,
      eip170: {
        limitBytes: 24_576,
        security04RuntimeSizeBytes: security04Runtime.rawSizeBytes,
        candidateRuntimeSizeBytes: candidateRuntimeSize,
        sizeDeltaBytes: candidateRuntimeSize - security04Runtime.rawSizeBytes,
        security04WithinLimit: security04Runtime.rawSizeBytes <= 24_576,
        candidateWithinLimit: true,
      },
    };
  }
  return sorted({
    compiler: {
      version: candidate.compiler.version,
      longVersion: candidate.compiler.longVersion,
      settingsSha256: sha256(stableJson(candidate.compiler.settings)),
    },
    contracts,
  });
}

function stage10LegacyGasEvidence(candidate, checkpoint) {
  const previousEntries = security04CheckpointLegacyGasEntries(checkpoint);
  const candidateEntries = candidate.gasSnapshot.entries;
  if (
    candidate.gasSnapshot.fuzzSeed !== "0x721" ||
    candidateEntries.length !== previousEntries.length
  ) {
    throw new Error("Stage 10 must preserve the legacy gas inventory");
  }
  const changes = [];
  for (let index = 0; index < previousEntries.length; index += 1) {
    if (previousEntries[index] !== candidateEntries[index]) {
      changes.push({
        path: `$.gasSnapshot.entries[${index}]`,
        security04Value: previousEntries[index],
        candidateValue: candidateEntries[index],
      });
    }
  }
  return sorted({
    fuzzSeed: "0x721",
    inventoryCount: previousEntries.length,
    security04EntriesSha256: sha256(stableJson(previousEntries)),
    candidateEntriesSha256: sha256(stableJson(candidateEntries)),
    changedIndices: changes.map(({ path: reviewPath }) =>
      Number(reviewPath.match(/\[(\d+)\]/)[1])
    ),
    changes,
  });
}

function stage10KeyFlowGasEvidence(checkpoint, candidateGas) {
  const previous = new Map(
    checkpoint.evidence.value.keyFlowGasRelativeToSecurity03.comparisons.map(
      (entry) => [entry.name, entry]
    )
  );
  const current = new Map();
  for (const [group, entries] of Object.entries(candidateGas.groups)) {
    for (const entry of entries) current.set(entry.name, { group, ...entry });
  }
  if (!valuesEqual([...previous.keys()].sort(), [...current.keys()].sort())) {
    throw new Error("Stage 10 must preserve the 12 key-flow gas inventory");
  }
  const comparisons = [...previous.keys()].sort().map((name) => {
    const security04 = previous.get(name);
    const candidateEntry = current.get(name);
    if (
      security04.group !== candidateEntry.group ||
      security04.baselineGas !== candidateEntry.baselineGas ||
      security04.maximumGas !== candidateEntry.maximumGas ||
      !candidateEntry.withinLimit
    ) {
      throw new Error(`Stage 10 gas evidence is invalid for ${name}`);
    }
    return {
      group: candidateEntry.group,
      name,
      security04Gas: security04.candidateGas,
      candidateGas: candidateEntry.candidateGas,
      deltaGas: candidateEntry.candidateGas - security04.candidateGas,
      baselineGas: candidateEntry.baselineGas,
      maximumGas: candidateEntry.maximumGas,
      withinBaselineLimit: true,
    };
  });
  return sorted({
    baselinePath: candidateGas.baselinePath,
    baselineSha256: candidateGas.baselineSha256,
    baselinePolicy: candidateGas.policy,
    fuzzSeed: candidateGas.fuzzSeed,
    comparisons,
  });
}

function stage10Evidence(review, baseline, candidate) {
  const checkpoint = stage10CheckpointAnchor();
  return sorted({
    schemaVersion: 1,
    candidate: review.candidate,
    baselineSha256: review.baselineSha256,
    mode: review.opcodeEvidence.mode,
    inheritedSecurity04Checkpoint: STAGE_10_CHECKPOINT_BINDING,
    sourceAndPackage: stage10SourceEvidence(candidate),
    receiverCompatibility: stage10ReceiverInventory(candidate),
    revertCallsites: stage10RevertEvidence(baseline, candidate),
    hardCompatibility: stage10HardCompatibilityEvidence(baseline, candidate),
    productionRelativeToSecurity04: stage10ProductionEvidence(
      baseline,
      candidate,
      checkpoint
    ),
    legacyGasRelativeToSecurity04: stage10LegacyGasEvidence(
      candidate,
      checkpoint
    ),
    keyFlowGasRelativeToSecurity04: stage10KeyFlowGasEvidence(
      checkpoint,
      stage08GasEvidence()
    ),
  });
}

function stage11HardCompatibilityEvidence(baseline, candidate) {
  const inventory = stage11TestInventory(candidate);
  const contracts = {};
  for (const qualifiedName of Object.keys(baseline.contracts).sort()) {
    const fields = {};
    for (const field of [
      "abi",
      "functions",
      "events",
      "errors",
      "storageLayout",
    ]) {
      const expected = baseline.contracts[qualifiedName][field];
      const actual = candidate.contracts[qualifiedName]?.[field];
      if (!valuesEqual(actual, expected)) {
        throw new Error(
          `Stage 11 hard compatibility changed: ${qualifiedName} ${field}`
        );
      }
      fields[field] = { equal: true, sha256: sha256(stableJson(actual)) };
    }
    contracts[qualifiedName] = fields;
  }
  const globals = {};
  for (const field of ["interfaces", "enums", "erc165"]) {
    if (!valuesEqual(candidate[field], baseline[field])) {
      throw new Error(`Stage 11 hard compatibility changed: ${field}`);
    }
    globals[field] = {
      equal: true,
      sha256: sha256(stableJson(candidate[field])),
    };
  }
  const expectedReverts = security04ProjectRevertStrings(
    baseline.projectRevertStrings
  );
  if (!valuesEqual(candidate.projectRevertStrings, expectedReverts)) {
    throw new Error("Stage 11 project-owned revert evidence changed");
  }
  return sorted({
    contracts,
    ...globals,
    compilerSettings: {
      equal: valuesEqual(
        candidate.compiler.settings,
        baseline.compiler.settings
      ),
      sha256: sha256(stableJson(candidate.compiler.settings)),
    },
    projectRevertStrings: {
      equal: true,
      count: candidate.projectRevertStrings.length,
      sha256: sha256(stableJson(candidate.projectRevertStrings)),
    },
    tests: inventory,
    parityFiles: security01ParityEvidence(),
  });
}

function stage11ProductionEqualityEvidence(baseline, candidate, checkpoint) {
  const contracts = {};
  for (const qualifiedName of STAGE_08_PRODUCTION_CONTRACTS) {
    const candidateContract = candidate.contracts[qualifiedName];
    const bytecodes = {};
    for (const bytecodeKind of ["creationBytecode", "runtimeBytecode"]) {
      const expected = stage10CheckpointBytecode(
        checkpoint,
        qualifiedName,
        bytecodeKind
      );
      const expectedOpcodes = stage10CheckpointOpcodes(
        baseline,
        qualifiedName,
        bytecodeKind,
        checkpoint
      );
      const actualBytecode = candidateContract[bytecodeKind];
      const actual = {
        rawKeccak256: actualBytecode.keccak256,
        rawSizeBytes: actualBytecode.sizeBytes,
        metadataBytes: actualBytecode.metadataBytes,
        metadataStrippedKeccak256: actualBytecode.metadataStrippedKeccak256,
        metadataStrippedSizeBytes: actualBytecode.metadataStrippedSizeBytes,
        metadataStrippedOpcodesSha256: sha256(
          actualBytecode.metadataStrippedOpcodes
        ),
      };
      if (
        !valuesEqual(actual, expected) ||
        actualBytecode.metadataStrippedOpcodes !== expectedOpcodes
      ) {
        throw new Error(
          `Stage 11 must preserve Stage 10 ${qualifiedName} ${bytecodeKind} exactly`
        );
      }
      bytecodes[bytecodeKind] = {
        stage10: expected,
        candidate: actual,
        equal: true,
        opcodeInstructionCount: opcodeInstructions(expectedOpcodes).length,
      };
    }
    const runtimeSize = candidateContract.runtimeBytecode.sizeBytes;
    if (runtimeSize > 24_576) {
      throw new Error(`${qualifiedName} exceeds the EIP-170 size limit`);
    }
    contracts[qualifiedName] = {
      ...bytecodes,
      eip170: {
        limitBytes: 24_576,
        stage10RuntimeSizeBytes: runtimeSize,
        candidateRuntimeSizeBytes: runtimeSize,
        equal: true,
        candidateWithinLimit: true,
      },
    };
  }
  const expectedCompiler =
    checkpoint.evidence.value.productionRelativeToSecurity04.compiler;
  const candidateCompiler = {
    version: candidate.compiler.version,
    longVersion: candidate.compiler.longVersion,
    settingsSha256: sha256(stableJson(candidate.compiler.settings)),
  };
  if (!valuesEqual(candidateCompiler, expectedCompiler)) {
    throw new Error("Stage 11 compiler differs from Stage 10");
  }
  return sorted({ compiler: candidateCompiler, contracts });
}

function stage11LegacyGasEqualityEvidence(candidate, checkpoint) {
  const expected = stage10CheckpointLegacyGasEntries(checkpoint);
  const actual = candidate.gasSnapshot.entries;
  if (
    candidate.gasSnapshot.fuzzSeed !== "0x721" ||
    !valuesEqual(actual, expected)
  ) {
    throw new Error(
      "Stage 11 must preserve all 15 Stage 10 legacy gas entries"
    );
  }
  return sorted({
    fuzzSeed: "0x721",
    inventoryCount: actual.length,
    stage10EntriesSha256: sha256(stableJson(expected)),
    candidateEntriesSha256: sha256(stableJson(actual)),
    equal: true,
  });
}

function stage11KeyFlowGasEqualityEvidence(checkpoint, candidateGas) {
  const previous = new Map(
    checkpoint.evidence.value.keyFlowGasRelativeToSecurity04.comparisons.map(
      (entry) => [entry.name, entry]
    )
  );
  const current = new Map();
  for (const [group, entries] of Object.entries(candidateGas.groups)) {
    for (const entry of entries) current.set(entry.name, { group, ...entry });
  }
  if (!valuesEqual([...previous.keys()].sort(), [...current.keys()].sort())) {
    throw new Error("Stage 11 must preserve the 12 key-flow gas inventory");
  }
  const comparisons = [...previous.keys()].sort().map((name) => {
    const stage10 = previous.get(name);
    const candidateEntry = current.get(name);
    if (
      stage10.group !== candidateEntry.group ||
      stage10.candidateGas !== candidateEntry.candidateGas ||
      stage10.baselineGas !== candidateEntry.baselineGas ||
      stage10.maximumGas !== candidateEntry.maximumGas ||
      !candidateEntry.withinLimit
    ) {
      throw new Error(`Stage 11 key-flow gas changed: ${name}`);
    }
    return {
      group: candidateEntry.group,
      name,
      stage10Gas: stage10.candidateGas,
      candidateGas: candidateEntry.candidateGas,
      equal: true,
      baselineGas: candidateEntry.baselineGas,
      maximumGas: candidateEntry.maximumGas,
      withinBaselineLimit: true,
    };
  });
  return sorted({
    baselinePath: candidateGas.baselinePath,
    baselineSha256: candidateGas.baselineSha256,
    baselinePolicy: candidateGas.policy,
    fuzzSeed: candidateGas.fuzzSeed,
    comparisons,
  });
}

function stage11Evidence(review, baseline, candidate) {
  const checkpoint = stage11CheckpointAnchor();
  return sorted({
    schemaVersion: 1,
    candidate: review.candidate,
    baselineSha256: review.baselineSha256,
    mode: review.opcodeEvidence.mode,
    inheritedStage10Checkpoint: STAGE_11_CHECKPOINT_BINDING,
    sourceAndTestCutover: stage11SourceEvidence(candidate),
    hardCompatibility: stage11HardCompatibilityEvidence(baseline, candidate),
    productionEquality: stage11ProductionEqualityEvidence(
      baseline,
      candidate,
      checkpoint
    ),
    legacyGasEquality: stage11LegacyGasEqualityEvidence(candidate, checkpoint),
    keyFlowGasEquality: stage11KeyFlowGasEqualityEvidence(
      checkpoint,
      stage08GasEvidence()
    ),
  });
}

function stage12aHardCompatibilityEvidence(baseline, candidate, checkpoint) {
  const contracts = {};
  for (const qualifiedName of Object.keys(baseline.contracts).sort()) {
    const fields = {};
    for (const field of [
      "abi",
      "functions",
      "events",
      "errors",
      "storageLayout",
    ]) {
      const expected = baseline.contracts[qualifiedName][field];
      const actual = candidate.contracts[qualifiedName]?.[field];
      if (!valuesEqual(actual, expected)) {
        throw new Error(
          `Stage 12a hard compatibility changed: ${qualifiedName} ${field}`
        );
      }
      fields[field] = { equal: true, sha256: sha256(stableJson(actual)) };
    }
    contracts[qualifiedName] = fields;
  }
  const globals = {};
  for (const field of ["interfaces", "enums", "erc165"]) {
    if (!valuesEqual(candidate[field], baseline[field])) {
      throw new Error(`Stage 12a hard compatibility changed: ${field}`);
    }
    globals[field] = {
      equal: true,
      sha256: sha256(stableJson(candidate[field])),
    };
  }
  const expectedReverts = security04ProjectRevertStrings(
    baseline.projectRevertStrings
  );
  if (!valuesEqual(candidate.projectRevertStrings, expectedReverts)) {
    throw new Error("Stage 12a project-owned revert evidence changed");
  }
  return sorted({
    contracts,
    ...globals,
    compilerSettings: {
      equal: valuesEqual(
        candidate.compiler.settings,
        baseline.compiler.settings
      ),
      sha256: sha256(stableJson(candidate.compiler.settings)),
    },
    projectRevertStrings: {
      equal: true,
      count: candidate.projectRevertStrings.length,
      sha256: sha256(stableJson(candidate.projectRevertStrings)),
    },
    tests: stage12aTestInventory(candidate, checkpoint),
    parityFiles: security01ParityEvidence(),
  });
}

function stage12aProductionEqualityEvidence(baseline, candidate, checkpoint) {
  const contracts = {};
  for (const qualifiedName of STAGE_08_PRODUCTION_CONTRACTS) {
    const candidateContract = candidate.contracts[qualifiedName];
    const bytecodes = {};
    for (const bytecodeKind of ["creationBytecode", "runtimeBytecode"]) {
      const expected = stage12aCheckpointBytecode(
        checkpoint,
        qualifiedName,
        bytecodeKind
      );
      const expectedOpcodes = stage12aCheckpointOpcodes(
        baseline,
        qualifiedName,
        bytecodeKind,
        checkpoint
      );
      const actualBytecode = candidateContract[bytecodeKind];
      const actual = {
        rawKeccak256: actualBytecode.keccak256,
        rawSizeBytes: actualBytecode.sizeBytes,
        metadataBytes: actualBytecode.metadataBytes,
        metadataStrippedKeccak256: actualBytecode.metadataStrippedKeccak256,
        metadataStrippedSizeBytes: actualBytecode.metadataStrippedSizeBytes,
        metadataStrippedOpcodesSha256: sha256(
          actualBytecode.metadataStrippedOpcodes
        ),
      };
      if (
        !valuesEqual(actual, expected) ||
        actualBytecode.metadataStrippedOpcodes !== expectedOpcodes
      ) {
        throw new Error(
          `Stage 12a must preserve Stage 11 ${qualifiedName} ${bytecodeKind} exactly`
        );
      }
      bytecodes[bytecodeKind] = {
        stage11: expected,
        candidate: actual,
        equal: true,
        opcodeInstructionCount: opcodeInstructions(expectedOpcodes).length,
      };
    }
    const runtimeSize = candidateContract.runtimeBytecode.sizeBytes;
    if (runtimeSize > 24_576) {
      throw new Error(`${qualifiedName} exceeds the EIP-170 size limit`);
    }
    contracts[qualifiedName] = {
      ...bytecodes,
      eip170: {
        limitBytes: 24_576,
        stage11RuntimeSizeBytes: runtimeSize,
        candidateRuntimeSizeBytes: runtimeSize,
        equal: true,
        candidateWithinLimit: true,
      },
    };
  }
  const expectedCompiler =
    checkpoint.evidence.value.productionEquality.compiler;
  const candidateCompiler = {
    version: candidate.compiler.version,
    longVersion: candidate.compiler.longVersion,
    settingsSha256: sha256(stableJson(candidate.compiler.settings)),
  };
  if (!valuesEqual(candidateCompiler, expectedCompiler)) {
    throw new Error("Stage 12a compiler differs from Stage 11");
  }
  return sorted({ compiler: candidateCompiler, contracts });
}

function stage12aLegacyGasEqualityEvidence(candidate, checkpoint) {
  const expected = stage12aCheckpointLegacyGasEntries(checkpoint);
  const actual = candidate.gasSnapshot.entries;
  if (
    candidate.gasSnapshot.fuzzSeed !== "0x721" ||
    !valuesEqual(actual, expected)
  ) {
    throw new Error(
      "Stage 12a must preserve all 15 Stage 11 legacy gas entries"
    );
  }
  return sorted({
    fuzzSeed: "0x721",
    inventoryCount: actual.length,
    stage11EntriesSha256: sha256(stableJson(expected)),
    candidateEntriesSha256: sha256(stableJson(actual)),
    equal: true,
  });
}

function stage12aKeyFlowGasEqualityEvidence(checkpoint, candidateGas) {
  const previous = new Map(
    checkpoint.evidence.value.keyFlowGasEquality.comparisons.map((entry) => [
      entry.name,
      entry,
    ])
  );
  const current = new Map();
  for (const [group, entries] of Object.entries(candidateGas.groups)) {
    for (const entry of entries) current.set(entry.name, { group, ...entry });
  }
  if (!valuesEqual([...previous.keys()].sort(), [...current.keys()].sort())) {
    throw new Error("Stage 12a must preserve the 12 key-flow gas inventory");
  }
  const comparisons = [...previous.keys()].sort().map((name) => {
    const stage11 = previous.get(name);
    const candidateEntry = current.get(name);
    if (
      !stage11.equal ||
      stage11.group !== candidateEntry.group ||
      stage11.candidateGas !== candidateEntry.candidateGas ||
      stage11.baselineGas !== candidateEntry.baselineGas ||
      stage11.maximumGas !== candidateEntry.maximumGas ||
      !candidateEntry.withinLimit
    ) {
      throw new Error(`Stage 12a key-flow gas changed: ${name}`);
    }
    return {
      group: candidateEntry.group,
      name,
      stage11Gas: stage11.candidateGas,
      candidateGas: candidateEntry.candidateGas,
      equal: true,
      baselineGas: candidateEntry.baselineGas,
      maximumGas: candidateEntry.maximumGas,
      withinBaselineLimit: true,
    };
  });
  return sorted({
    baselinePath: candidateGas.baselinePath,
    baselineSha256: candidateGas.baselineSha256,
    baselinePolicy: candidateGas.policy,
    fuzzSeed: candidateGas.fuzzSeed,
    comparisons,
  });
}

function stage12aEvidence(review, baseline, candidate) {
  const checkpoint = stage12aCheckpointAnchor();
  return sorted({
    schemaVersion: 1,
    candidate: review.candidate,
    baselineSha256: review.baselineSha256,
    mode: review.opcodeEvidence.mode,
    inheritedStage11Checkpoint: STAGE_12A_CHECKPOINT_BINDING,
    toolingAndTestMigration: stage12aSourceEvidence(candidate),
    hardCompatibility: stage12aHardCompatibilityEvidence(
      baseline,
      candidate,
      checkpoint
    ),
    productionEquality: stage12aProductionEqualityEvidence(
      baseline,
      candidate,
      checkpoint
    ),
    legacyGasEquality: stage12aLegacyGasEqualityEvidence(candidate, checkpoint),
    keyFlowGasEquality: stage12aKeyFlowGasEqualityEvidence(
      checkpoint,
      stage08GasEvidence()
    ),
  });
}

function security01ComparisonBaseline(baseline, candidate) {
  validateSecurity01Inventory(candidate);
  security01SourceEvidence();
  validateStage08Candidate(baseline, candidate);
  const comparison = deepClone(baseline);
  const stage08 = stage08Evidence();
  const inherited = stage09EvidenceAnchor();

  const stage09Compiler = inherited.production.compiler.candidate;
  if (
    stage09Compiler.version !== STAGE_08_COMPILER_VERSION ||
    stage09Compiler.longVersion !== STAGE_08_COMPILER_LONG_VERSION ||
    stage09Compiler.settingsSha256 !==
      sha256(stableJson(baseline.compiler.settings))
  ) {
    throw new Error("Security 01 inherited an invalid Stage 9 compiler anchor");
  }
  comparison.compiler.version = stage09Compiler.version;
  comparison.compiler.longVersion = stage09Compiler.longVersion;

  for (const qualifiedName of STAGE_08_PRODUCTION_CONTRACTS) {
    for (const bytecodeKind of ["creationBytecode", "runtimeBytecode"]) {
      const stage08Bytecode = stage08.contracts[qualifiedName][bytecodeKind];
      const stage09Bytecode =
        inherited.production.contracts[qualifiedName][bytecodeKind].candidate;
      const baselineBytecode = baseline.contracts[qualifiedName][bytecodeKind];
      const reconstructedOpcodes = applyUnifiedOpcodeDiff(
        baselineBytecode.metadataStrippedOpcodes,
        stage08Bytecode.metadataStrippedOpcodes.fullDiff.hunks
      );
      if (
        sha256(reconstructedOpcodes) !==
        stage09Bytecode.metadataStrippedOpcodesSha256
      ) {
        throw new Error(
          `Security 01 Stage 9 opcode reconstruction failed for ${qualifiedName} ${bytecodeKind}`
        );
      }
      Object.assign(comparison.contracts[qualifiedName][bytecodeKind], {
        keccak256: stage09Bytecode.rawKeccak256,
        sizeBytes: stage09Bytecode.rawSizeBytes,
        metadataBytes: stage09Bytecode.metadataBytes,
        metadataStrippedKeccak256: stage09Bytecode.metadataStrippedKeccak256,
        metadataStrippedSizeBytes: stage09Bytecode.metadataStrippedSizeBytes,
        metadataStrippedOpcodes: reconstructedOpcodes,
      });
    }
  }

  comparison.gasSnapshot.entries = stage09LegacyGasEntries(inherited);
  comparison.tests = deepClone(candidate.tests);
  const expectedToolchain = deepClone(baseline.toolchain);
  if (
    !Array.isArray(expectedToolchain.forge) ||
    !Array.isArray(candidate.toolchain.forge) ||
    expectedToolchain.forge.length !== candidate.toolchain.forge.length
  ) {
    throw new Error("Security 01 inherited an invalid Forge identity");
  }
  expectedToolchain.forge[2] = candidate.toolchain.forge[2];
  if (!valuesEqual(candidate.toolchain, expectedToolchain)) {
    throw new Error("Security 01 must preserve the pinned Forge identity");
  }
  comparison.toolchain = expectedToolchain;
  return comparison;
}

function security02ComparisonBaseline(baseline, candidate) {
  validateSecurity01Inventory(candidate);
  security02SourceEvidence();
  validateStage08Candidate(baseline, candidate);
  const checkpoint = security01CheckpointAnchor();
  const comparison = deepClone(baseline);
  comparison.compiler.version = STAGE_08_COMPILER_VERSION;
  comparison.compiler.longVersion = STAGE_08_COMPILER_LONG_VERSION;

  for (const qualifiedName of STAGE_08_PRODUCTION_CONTRACTS) {
    const checkpointContract =
      checkpoint.evidence.value.productionRelativeToStage09.contracts[
        qualifiedName
      ];
    for (const bytecodeKind of ["creationBytecode", "runtimeBytecode"]) {
      const checkpointBytecode = checkpointContract[bytecodeKind];
      Object.assign(comparison.contracts[qualifiedName][bytecodeKind], {
        keccak256: checkpointBytecode.rawBytecode.candidateKeccak256,
        sizeBytes: checkpointBytecode.rawBytecode.candidateSizeBytes,
        metadataBytes: checkpointBytecode.rawBytecode.candidateMetadataBytes,
        metadataStrippedKeccak256:
          checkpointBytecode.metadataStrippedBytecode.candidateKeccak256,
        metadataStrippedSizeBytes:
          checkpointBytecode.metadataStrippedBytecode.candidateSizeBytes,
        metadataStrippedOpcodes: security01CheckpointOpcodes(
          baseline,
          qualifiedName,
          bytecodeKind,
          checkpoint
        ),
      });
    }
  }

  comparison.gasSnapshot.entries =
    security01CheckpointLegacyGasEntries(checkpoint);
  comparison.tests = deepClone(candidate.tests);
  comparison.projectRevertStrings = security01ProjectRevertStrings(
    baseline.projectRevertStrings
  );
  const expectedToolchain = deepClone(baseline.toolchain);
  expectedToolchain.forge[2] = candidate.toolchain.forge[2];
  if (!valuesEqual(candidate.toolchain, expectedToolchain)) {
    throw new Error("Security 02 must preserve the pinned Forge identity");
  }
  comparison.toolchain = expectedToolchain;
  return comparison;
}

function security03ComparisonBaseline(baseline, candidate) {
  validateSecurity01Inventory(candidate);
  security03SourceEvidence();
  validateStage08Candidate(baseline, candidate);
  const checkpoint = security02CheckpointAnchor();
  const comparison = deepClone(baseline);
  comparison.compiler.version = STAGE_08_COMPILER_VERSION;
  comparison.compiler.longVersion = STAGE_08_COMPILER_LONG_VERSION;

  for (const qualifiedName of STAGE_08_PRODUCTION_CONTRACTS) {
    const checkpointContract =
      checkpoint.evidence.value.productionRelativeToSecurity01.contracts[
        qualifiedName
      ];
    for (const bytecodeKind of ["creationBytecode", "runtimeBytecode"]) {
      const checkpointBytecode = checkpointContract[bytecodeKind];
      Object.assign(comparison.contracts[qualifiedName][bytecodeKind], {
        keccak256: checkpointBytecode.rawBytecode.candidateKeccak256,
        sizeBytes: checkpointBytecode.rawBytecode.candidateSizeBytes,
        metadataBytes: checkpointBytecode.rawBytecode.candidateMetadataBytes,
        metadataStrippedKeccak256:
          checkpointBytecode.metadataStrippedBytecode.candidateKeccak256,
        metadataStrippedSizeBytes:
          checkpointBytecode.metadataStrippedBytecode.candidateSizeBytes,
        metadataStrippedOpcodes: security02CheckpointOpcodes(
          baseline,
          qualifiedName,
          bytecodeKind,
          checkpoint
        ),
      });
    }
  }
  comparison.gasSnapshot.entries =
    security02CheckpointLegacyGasEntries(checkpoint);
  comparison.tests = deepClone(candidate.tests);
  comparison.projectRevertStrings = security02ProjectRevertStrings(
    baseline.projectRevertStrings
  );
  const expectedToolchain = deepClone(baseline.toolchain);
  expectedToolchain.forge[2] = candidate.toolchain.forge[2];
  if (!valuesEqual(candidate.toolchain, expectedToolchain)) {
    throw new Error("Security 03 must preserve the pinned Forge identity");
  }
  comparison.toolchain = expectedToolchain;
  return comparison;
}

function security04ComparisonBaseline(baseline, candidate) {
  validateSecurity01Inventory(candidate);
  security04SourceEvidence();
  validateStage08Candidate(baseline, candidate);
  const checkpoint = security03CheckpointAnchor();
  const comparison = deepClone(baseline);
  comparison.compiler.version = STAGE_08_COMPILER_VERSION;
  comparison.compiler.longVersion = STAGE_08_COMPILER_LONG_VERSION;

  for (const qualifiedName of STAGE_08_PRODUCTION_CONTRACTS) {
    const checkpointContract =
      checkpoint.evidence.value.productionRelativeToSecurity02.contracts[
        qualifiedName
      ];
    for (const bytecodeKind of ["creationBytecode", "runtimeBytecode"]) {
      const checkpointBytecode = checkpointContract[bytecodeKind];
      Object.assign(comparison.contracts[qualifiedName][bytecodeKind], {
        keccak256: checkpointBytecode.rawBytecode.candidateKeccak256,
        sizeBytes: checkpointBytecode.rawBytecode.candidateSizeBytes,
        metadataBytes: checkpointBytecode.rawBytecode.candidateMetadataBytes,
        metadataStrippedKeccak256:
          checkpointBytecode.metadataStrippedBytecode.candidateKeccak256,
        metadataStrippedSizeBytes:
          checkpointBytecode.metadataStrippedBytecode.candidateSizeBytes,
        metadataStrippedOpcodes: security03CheckpointOpcodes(
          baseline,
          qualifiedName,
          bytecodeKind,
          checkpoint
        ),
      });
    }
  }
  comparison.gasSnapshot.entries =
    security03CheckpointLegacyGasEntries(checkpoint);
  comparison.tests = deepClone(candidate.tests);
  comparison.projectRevertStrings = security04ProjectRevertStrings(
    baseline.projectRevertStrings
  );
  const expectedToolchain = deepClone(baseline.toolchain);
  expectedToolchain.forge[2] = candidate.toolchain.forge[2];
  if (!valuesEqual(candidate.toolchain, expectedToolchain)) {
    throw new Error("Security 04 must preserve the pinned Forge identity");
  }
  comparison.toolchain = expectedToolchain;
  return comparison;
}

function stage10ComparisonBaseline(baseline, candidate) {
  stage10ReceiverInventory(candidate);
  stage10SourceEvidence(candidate);
  const checkpoint = stage10CheckpointAnchor();
  const comparison = deepClone(baseline);
  comparison.compiler.version = STAGE_08_COMPILER_VERSION;
  comparison.compiler.longVersion = STAGE_08_COMPILER_LONG_VERSION;
  for (const qualifiedName of STAGE_08_PRODUCTION_CONTRACTS) {
    for (const bytecodeKind of ["creationBytecode", "runtimeBytecode"]) {
      const bytecode = security04CheckpointBytecode(
        checkpoint,
        qualifiedName,
        bytecodeKind
      );
      Object.assign(comparison.contracts[qualifiedName][bytecodeKind], {
        keccak256: bytecode.rawKeccak256,
        sizeBytes: bytecode.rawSizeBytes,
        metadataBytes: bytecode.metadataBytes,
        metadataStrippedKeccak256: bytecode.metadataStrippedKeccak256,
        metadataStrippedSizeBytes: bytecode.metadataStrippedSizeBytes,
        metadataStrippedOpcodes: security04CheckpointOpcodes(
          baseline,
          qualifiedName,
          bytecodeKind,
          checkpoint
        ),
      });
    }
  }
  comparison.gasSnapshot.entries =
    security04CheckpointLegacyGasEntries(checkpoint);
  comparison.projectRevertStrings = security04ProjectRevertStrings(
    baseline.projectRevertStrings
  );
  comparison.tests = deepClone(candidate.tests);
  const expectedToolchain = deepClone(baseline.toolchain);
  expectedToolchain.forge[2] = candidate.toolchain.forge[2];
  if (!valuesEqual(candidate.toolchain, expectedToolchain)) {
    throw new Error("Stage 10 must preserve the pinned Forge identity");
  }
  comparison.toolchain = expectedToolchain;
  return comparison;
}

function stage11ComparisonBaseline(baseline, candidate) {
  stage11TestInventory(candidate);
  stage11SourceEvidence(candidate);
  const checkpoint = stage11CheckpointAnchor();
  const comparison = deepClone(baseline);
  const checkpointCompiler =
    checkpoint.evidence.value.productionRelativeToSecurity04.compiler;
  if (
    checkpointCompiler.version !== STAGE_08_COMPILER_VERSION ||
    checkpointCompiler.longVersion !== STAGE_08_COMPILER_LONG_VERSION ||
    checkpointCompiler.settingsSha256 !==
      sha256(stableJson(baseline.compiler.settings))
  ) {
    throw new Error("Stage 11 inherited an invalid Stage 10 compiler anchor");
  }
  comparison.compiler.version = checkpointCompiler.version;
  comparison.compiler.longVersion = checkpointCompiler.longVersion;

  for (const qualifiedName of STAGE_08_PRODUCTION_CONTRACTS) {
    for (const bytecodeKind of ["creationBytecode", "runtimeBytecode"]) {
      const bytecode = stage10CheckpointBytecode(
        checkpoint,
        qualifiedName,
        bytecodeKind
      );
      Object.assign(comparison.contracts[qualifiedName][bytecodeKind], {
        keccak256: bytecode.rawKeccak256,
        sizeBytes: bytecode.rawSizeBytes,
        metadataBytes: bytecode.metadataBytes,
        metadataStrippedKeccak256: bytecode.metadataStrippedKeccak256,
        metadataStrippedSizeBytes: bytecode.metadataStrippedSizeBytes,
        metadataStrippedOpcodes: stage10CheckpointOpcodes(
          baseline,
          qualifiedName,
          bytecodeKind,
          checkpoint
        ),
      });
    }
  }
  comparison.gasSnapshot.entries =
    stage10CheckpointLegacyGasEntries(checkpoint);
  comparison.projectRevertStrings = security04ProjectRevertStrings(
    baseline.projectRevertStrings
  );

  if (
    baseline.tests.hardhat.count !== STAGE_11_HISTORICAL_HARDHAT_COUNT ||
    sha256(stableJson(baseline.tests.hardhat.names)) !==
      STAGE_11_HISTORICAL_HARDHAT_NAMES_SHA256
  ) {
    throw new Error("Stage 11 historical Hardhat comparison anchor changed");
  }
  comparison.tests.hardhat = deepClone(baseline.tests.hardhat);
  comparison.tests.forge = deepClone(candidate.tests.forge);
  comparison.tests.total =
    STAGE_11_HISTORICAL_HARDHAT_COUNT + STAGE_11_FORGE_COUNT;

  const expectedToolchain = deepClone(baseline.toolchain);
  expectedToolchain.forge[2] = candidate.toolchain.forge[2];
  if (!valuesEqual(candidate.toolchain, expectedToolchain)) {
    throw new Error("Stage 11 must preserve the pinned toolchain identity");
  }
  comparison.toolchain = expectedToolchain;
  return comparison;
}

function stage12aComparisonBaseline(baseline, candidate) {
  const checkpoint = stage12aCheckpointAnchor();
  stage12aTestInventory(candidate, checkpoint);
  stage12aSourceEvidence(candidate);
  const comparison = deepClone(baseline);
  const checkpointCompiler =
    checkpoint.evidence.value.productionEquality.compiler;
  if (
    checkpointCompiler.version !== STAGE_08_COMPILER_VERSION ||
    checkpointCompiler.longVersion !== STAGE_08_COMPILER_LONG_VERSION ||
    checkpointCompiler.settingsSha256 !==
      sha256(stableJson(baseline.compiler.settings))
  ) {
    throw new Error("Stage 12a inherited an invalid Stage 11 compiler anchor");
  }
  comparison.compiler.version = checkpointCompiler.version;
  comparison.compiler.longVersion = checkpointCompiler.longVersion;

  for (const qualifiedName of STAGE_08_PRODUCTION_CONTRACTS) {
    for (const bytecodeKind of ["creationBytecode", "runtimeBytecode"]) {
      const bytecode = stage12aCheckpointBytecode(
        checkpoint,
        qualifiedName,
        bytecodeKind
      );
      Object.assign(comparison.contracts[qualifiedName][bytecodeKind], {
        keccak256: bytecode.rawKeccak256,
        sizeBytes: bytecode.rawSizeBytes,
        metadataBytes: bytecode.metadataBytes,
        metadataStrippedKeccak256: bytecode.metadataStrippedKeccak256,
        metadataStrippedSizeBytes: bytecode.metadataStrippedSizeBytes,
        metadataStrippedOpcodes: stage12aCheckpointOpcodes(
          baseline,
          qualifiedName,
          bytecodeKind,
          checkpoint
        ),
      });
    }
  }
  comparison.gasSnapshot.entries =
    stage12aCheckpointLegacyGasEntries(checkpoint);
  comparison.projectRevertStrings = security04ProjectRevertStrings(
    baseline.projectRevertStrings
  );
  comparison.tests.hardhat = deepClone(
    checkpoint.evidence.value.sourceAndTestCutover.tests.activeHardhat
  );
  const parity = stage06ParityForgeTests();
  comparison.tests.forge = {
    count: STAGE_11_FORGE_COUNT,
    names: [...parity.forgeNames, ...stage07SafetyForgeTests()].sort(),
  };
  comparison.tests.total = 3 + STAGE_11_FORGE_COUNT;

  const expectedToolchain = deepClone(baseline.toolchain);
  expectedToolchain.forge[2] = candidate.toolchain.forge[2];
  if (!valuesEqual(candidate.toolchain, expectedToolchain)) {
    throw new Error("Stage 12a must preserve the pinned toolchain identity");
  }
  comparison.toolchain = expectedToolchain;
  return comparison;
}

function expectStage09Rejection(name, operation) {
  try {
    operation();
  } catch (_error) {
    return name;
  }
  throw new Error(`Stage 9 negative probe unexpectedly passed: ${name}`);
}

function stage09NegativeProbes(baseline, candidate) {
  const forgeStd = stage09ForgeStdEvidence();
  const wrongCommit = deepClone(forgeStd);
  wrongCommit.candidateCommit = `0x${"00".repeat(32)}`;
  const driftedCandidate = deepClone(candidate);
  driftedCandidate.contracts[
    "contracts/Wrapper.sol:Wrapper"
  ].runtimeBytecode.keccak256 = `0x${"00".repeat(32)}`;
  return [
    expectStage09Rejection("wrong forge-std commit", () =>
      validateStage09ForgeStdDetails(wrongCommit)
    ),
    expectStage09Rejection("Stage 8 production hash drift", () =>
      stage09ProductionEvidence(baseline, driftedCandidate)
    ),
  ];
}

function expectSecurity01Rejection(name, operation) {
  try {
    operation();
  } catch (_error) {
    return name;
  }
  throw new Error(`Security 01 negative probe unexpectedly passed: ${name}`);
}

function security01NegativeProbes(baseline, candidate, review) {
  const probes = [];

  const countDrift = deepClone(candidate);
  countDrift.tests.forge.count += 1;
  probes.push(
    expectSecurity01Rejection("Forge inventory count drift", () =>
      validateSecurity01Inventory(countDrift)
    )
  );

  const nameDrift = deepClone(candidate);
  nameDrift.tests.forge.names[0] = `${nameDrift.tests.forge.names[0]}_drift`;
  probes.push(
    expectSecurity01Rejection("Forge inventory name hash drift", () =>
      validateSecurity01Inventory(nameDrift)
    )
  );

  const hardhatNameDrift = deepClone(candidate);
  hardhatNameDrift.tests.hardhat.names[0] = `${hardhatNameDrift.tests.hardhat.names[0]} drift`;
  probes.push(
    expectSecurity01Rejection("Hardhat inventory name hash drift", () =>
      validateSecurity01Inventory(hardhatNameDrift)
    )
  );

  const parityDrift = deepClone(SECURITY_01_PARITY_FILES);
  parityDrift["compatibility/parity-map.json"] = "0".repeat(64);
  probes.push(
    expectSecurity01Rejection("parity map digest drift", () =>
      validateExactFileDigests(
        parityDrift,
        SECURITY_01_PARITY_FILES,
        "parityFiles"
      )
    )
  );

  probes.push(
    expectSecurity01Rejection("extra production source drift", () =>
      validateSecurity01ChangedPaths([
        SECURITY_01_ERC721_SOURCE,
        "contracts/token/modules/Lease.sol",
      ])
    )
  );
  probes.push(
    expectSecurity01Rejection("dependency manifest drift", () =>
      validateSecurity01ChangedPaths([
        SECURITY_01_ERC721_SOURCE,
        "package.json",
      ])
    )
  );
  probes.push(
    expectSecurity01Rejection("compiler config drift", () =>
      validateSecurity01ChangedPaths([
        SECURITY_01_ERC721_SOURCE,
        "foundry.toml",
      ])
    )
  );

  const configDrift = security01ConfigEvidence();
  configDrift["pnpm-lock.yaml"] = "0".repeat(64);
  probes.push(
    expectSecurity01Rejection("dependency lock digest drift", () =>
      validateSecurity01ConfigEvidence(configDrift)
    )
  );

  const compilerSourceDrift = security01CompilerSourceEvidence();
  compilerSourceDrift.candidateClosureSha256 = "0".repeat(64);
  probes.push(
    expectSecurity01Rejection("compiler source closure drift", () =>
      validateSecurity01CompilerSourceEvidence(compilerSourceDrift)
    )
  );

  const revertDrift = deepClone(candidate.projectRevertStrings);
  revertDrift.find((entry) => entry.ordinal === 2).value =
    "ERC721: drifted owner error";
  probes.push(
    expectSecurity01Rejection("revert callsite drift", () =>
      validateSecurity01RevertBinding(
        baseline.projectRevertStrings,
        revertDrift
      )
    )
  );

  const behaviorDrift = deepClone(SECURITY_01_BEHAVIOR_EVIDENCE);
  behaviorDrift.sourceSha256 = "0".repeat(64);
  probes.push(
    expectSecurity01Rejection("stale behavior source hash", () =>
      validateSecurity01BehaviorBinding(behaviorDrift)
    )
  );

  const hardFieldDrift = deepClone(candidate);
  hardFieldDrift.contracts["contracts/Wrapper.sol:Wrapper"].abi.push({
    type: "function",
    name: "drift",
    inputs: [],
    outputs: [],
    stateMutability: "view",
  });
  probes.push(
    expectSecurity01Rejection("hard ABI field drift", () =>
      validateSecurity01HardFields(baseline, hardFieldDrift)
    )
  );

  const evidencePath = opcodeEvidencePath(review);
  const opcodeEvidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const staleOpcodeEvidence = deepClone(opcodeEvidence);
  staleOpcodeEvidence.sourcePatch.candidateSha256 = "0".repeat(64);
  probes.push(
    expectSecurity01Rejection("stale opcode evidence", () =>
      validateExactOpcodeEvidence(staleOpcodeEvidence, opcodeEvidence)
    )
  );

  return probes;
}

function expectSecurity02Rejection(name, operation) {
  try {
    operation();
  } catch (_error) {
    return name;
  }
  throw new Error(`Security 02 negative probe unexpectedly passed: ${name}`);
}

function security02NegativeProbes(baseline, candidate, review) {
  const probes = [];

  const forgeCountDrift = deepClone(candidate);
  forgeCountDrift.tests.forge.count += 1;
  probes.push(
    expectSecurity02Rejection("Forge inventory count drift", () =>
      validateSecurity01Inventory(forgeCountDrift)
    )
  );

  const forgeNameDrift = deepClone(candidate);
  forgeNameDrift.tests.forge.names[0] += "_drift";
  probes.push(
    expectSecurity02Rejection("Forge inventory name drift", () =>
      validateSecurity01Inventory(forgeNameDrift)
    )
  );

  const hardhatNameDrift = deepClone(candidate);
  hardhatNameDrift.tests.hardhat.names[0] += " drift";
  probes.push(
    expectSecurity02Rejection("Hardhat inventory name drift", () =>
      validateSecurity01Inventory(hardhatNameDrift)
    )
  );

  const parityDrift = deepClone(SECURITY_01_PARITY_FILES);
  parityDrift["compatibility/parity-map.json"] = "0".repeat(64);
  probes.push(
    expectSecurity02Rejection("parity-map digest drift", () =>
      validateExactFileDigests(
        parityDrift,
        SECURITY_01_PARITY_FILES,
        "parityFiles"
      )
    )
  );

  const checkpointEvidenceDrift = security01CheckpointAnchor();
  checkpointEvidenceDrift.evidence.sha256 = "0".repeat(64);
  probes.push(
    expectSecurity02Rejection("Security 01 evidence checkpoint drift", () =>
      validateSecurity01CheckpointBinding(checkpointEvidenceDrift)
    )
  );

  const checkpointReviewDrift = security01CheckpointAnchor();
  checkpointReviewDrift.review.sha256 = "0".repeat(64);
  probes.push(
    expectSecurity02Rejection("Security 01 review checkpoint drift", () =>
      validateSecurity01CheckpointBinding(checkpointReviewDrift)
    )
  );

  const extraPath = [
    ...SECURITY_02_CORE_CHANGED_PATHS,
    "contracts/token/modules/Lease.sol",
  ];
  probes.push(
    expectSecurity02Rejection("unauthorized repository path", () =>
      validateSecurity02ChangedPaths(extraPath)
    )
  );

  const missingPath = SECURITY_02_CORE_CHANGED_PATHS.filter(
    (relativePath) => relativePath !== "scripts/run-slither.js"
  );
  probes.push(
    expectSecurity02Rejection("missing authorized repository path", () =>
      validateSecurity02ChangedPaths(missingPath)
    )
  );

  const boundFileDrift = deepClone(SECURITY_02_BOUND_FILES);
  boundFileDrift[SECURITY_02_FIXTURE_SOURCE] = "0".repeat(64);
  probes.push(
    expectSecurity02Rejection("receiver fixture digest drift", () =>
      validateExactFileDigests(
        boundFileDrift,
        SECURITY_02_BOUND_FILES,
        "security02Files"
      )
    )
  );

  const configDrift = deepClone(SECURITY_02_CONFIG_FILES);
  configDrift["compatibility/compiler-warning-allowlist.json"] = "0".repeat(64);
  probes.push(
    expectSecurity02Rejection("warning allowlist digest drift", () =>
      validateExactFileDigests(
        configDrift,
        SECURITY_02_CONFIG_FILES,
        "configFiles"
      )
    )
  );

  const compilerClosureDrift = security02CompilerSourceEvidence();
  compilerClosureDrift.candidateClosureSha256 = "0".repeat(64);
  probes.push(
    expectSecurity02Rejection("compiler source closure drift", () =>
      validateSecurity02CompilerSourceEvidence(compilerClosureDrift)
    )
  );

  const compilerSourceAddition = security02CompilerSourceEvidence();
  compilerSourceAddition.sourceCount += 1;
  compilerSourceAddition.addedSources.push("contracts/test/Unexpected.sol");
  probes.push(
    expectSecurity02Rejection("compiler source addition", () =>
      validateSecurity02CompilerSourceEvidence(compilerSourceAddition)
    )
  );

  const revertDrift = deepClone(candidate.projectRevertStrings);
  const pcoReceiverRevert = revertDrift.find(
    (entry) => entry.source === SECURITY_02_PCO_SOURCE
  );
  if (!pcoReceiverRevert) {
    throw new Error("Security 02 negative probes could not find PCO revert");
  }
  pcoReceiverRevert.value = "ERC721: drifted receiver payload";
  probes.push(
    expectSecurity02Rejection("receiver revert callsite drift", () =>
      validateSecurity02RevertBinding(
        baseline.projectRevertStrings,
        revertDrift
      )
    )
  );

  const behaviorDrift = deepClone(SECURITY_02_BEHAVIOR_EVIDENCE);
  behaviorDrift.forge.sourceSha256 = "0".repeat(64);
  probes.push(
    expectSecurity02Rejection("stale behavior source hash", () =>
      validateSecurity02BehaviorBinding(behaviorDrift)
    )
  );

  const abiDrift = deepClone(candidate);
  abiDrift.contracts["contracts/Wrapper.sol:Wrapper"].abi.push({
    type: "function",
    name: "drift",
    inputs: [],
    outputs: [],
    stateMutability: "view",
  });
  probes.push(
    expectSecurity02Rejection("hard ABI drift", () =>
      validateSecurity01HardFields(baseline, abiDrift)
    )
  );

  const storageDrift = deepClone(candidate);
  storageDrift.contracts[
    "contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership"
  ].storageLayout.storage[0].slot = "999";
  probes.push(
    expectSecurity02Rejection("hard storage drift", () =>
      validateSecurity01HardFields(baseline, storageDrift)
    )
  );

  const interfaceDrift = deepClone(candidate);
  interfaceDrift.interfaces[
    "contracts/token/modules/interfaces/ILease.sol:ILease"
  ].interfaceId = "0x00000000";
  probes.push(
    expectSecurity02Rejection("hard interface drift", () =>
      validateSecurity01HardFields(baseline, interfaceDrift)
    )
  );

  const erc165Drift = deepClone(candidate);
  erc165Drift.erc165.probes.Wrapper[0].supported =
    !erc165Drift.erc165.probes.Wrapper[0].supported;
  probes.push(
    expectSecurity02Rejection("hard ERC165 drift", () =>
      validateSecurity01HardFields(baseline, erc165Drift)
    )
  );

  const compilerSettingsDrift = deepClone(candidate);
  compilerSettingsDrift.compiler.settings.optimizer.enabled = true;
  probes.push(
    expectSecurity02Rejection("compiler settings drift", () =>
      validateSecurity01HardFields(baseline, compilerSettingsDrift)
    )
  );

  const reviewCheckpointDrift = deepClone(review);
  reviewCheckpointDrift.security01Checkpoint.evidence.sha256 = "0".repeat(64);
  probes.push(
    expectSecurity02Rejection("review checkpoint binding drift", () =>
      reviewPolicy(reviewCheckpointDrift)
    )
  );

  const checkpointOpcodeDrift = security01CheckpointAnchor();
  checkpointOpcodeDrift.evidence.value.productionRelativeToStage09.contracts[
    "contracts/Wrapper.sol:Wrapper"
  ].runtimeBytecode.metadataStrippedOpcodes.candidateSha256 = "0".repeat(64);
  probes.push(
    expectSecurity02Rejection("checkpoint opcode diff drift", () =>
      security01CheckpointOpcodes(
        baseline,
        "contracts/Wrapper.sol:Wrapper",
        "runtimeBytecode",
        checkpointOpcodeDrift
      )
    )
  );

  const evidencePath = opcodeEvidencePath(review);
  const checkedInEvidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const staleOpcodeEvidence = deepClone(checkedInEvidence);
  staleOpcodeEvidence.sourcePatch.production.files[
    SECURITY_02_PCO_SOURCE
  ].candidateSha256 = "0".repeat(64);
  probes.push(
    expectSecurity02Rejection("stale Security 02 opcode evidence", () =>
      validateExactOpcodeEvidence(staleOpcodeEvidence, checkedInEvidence)
    )
  );

  return probes;
}

function expectSecurity03Rejection(name, operation) {
  try {
    operation();
  } catch (_error) {
    return name;
  }
  throw new Error(`Security 03 negative probe unexpectedly passed: ${name}`);
}

function security03NegativeProbes(baseline, candidate, review) {
  const probes = [];
  const reject = (name, operation) =>
    probes.push(expectSecurity03Rejection(name, operation));

  const forgeCountDrift = deepClone(candidate);
  forgeCountDrift.tests.forge.count += 1;
  reject("Forge inventory count drift", () =>
    validateSecurity01Inventory(forgeCountDrift)
  );
  const forgeNameDrift = deepClone(candidate);
  forgeNameDrift.tests.forge.names[0] += "_drift";
  reject("Forge inventory name drift", () =>
    validateSecurity01Inventory(forgeNameDrift)
  );
  const hardhatNameDrift = deepClone(candidate);
  hardhatNameDrift.tests.hardhat.names[0] += " drift";
  reject("Hardhat inventory name drift", () =>
    validateSecurity01Inventory(hardhatNameDrift)
  );
  const parityDrift = deepClone(SECURITY_01_PARITY_FILES);
  parityDrift["compatibility/parity-map.json"] = "0".repeat(64);
  reject("parity-map digest drift", () =>
    validateExactFileDigests(
      parityDrift,
      SECURITY_01_PARITY_FILES,
      "parityFiles"
    )
  );

  const checkpointEvidenceDrift = security02CheckpointAnchor();
  checkpointEvidenceDrift.evidence.sha256 = "0".repeat(64);
  reject("Security 02 evidence checkpoint drift", () =>
    validateSecurity02CheckpointBinding(checkpointEvidenceDrift)
  );
  const checkpointReviewDrift = security02CheckpointAnchor();
  checkpointReviewDrift.review.sha256 = "0".repeat(64);
  reject("Security 02 review checkpoint drift", () =>
    validateSecurity02CheckpointBinding(checkpointReviewDrift)
  );

  reject("unauthorized repository path", () =>
    validateSecurity03ChangedPaths([
      ...SECURITY_03_CORE_CHANGED_PATHS,
      "contracts/token/modules/Valuation.sol",
    ])
  );
  reject("missing authorized repository path", () =>
    validateSecurity03ChangedPaths(
      SECURITY_03_CORE_CHANGED_PATHS.filter(
        (relativePath) => relativePath !== "scripts/run-slither.js"
      )
    )
  );

  const boundFileDrift = deepClone(SECURITY_03_BOUND_FILES);
  boundFileDrift[SECURITY_03_POST_TAX_TEST_SOURCE] = "0".repeat(64);
  reject("behavior file digest drift", () =>
    validateExactFileDigests(
      boundFileDrift,
      SECURITY_03_BOUND_FILES,
      "security03Files"
    )
  );
  const configDrift = deepClone(SECURITY_03_CONFIG_FILES);
  configDrift["compatibility/compiler-warning-allowlist.json"] = "0".repeat(64);
  reject("warning allowlist digest drift", () =>
    validateExactFileDigests(
      configDrift,
      SECURITY_03_CONFIG_FILES,
      "configFiles"
    )
  );

  const compilerClosureDrift = security03CompilerSourceEvidence();
  compilerClosureDrift.candidateClosureSha256 = "0".repeat(64);
  reject("compiler source closure drift", () =>
    validateSecurity03CompilerSourceEvidence(compilerClosureDrift)
  );
  const compilerSourceAddition = security03CompilerSourceEvidence();
  compilerSourceAddition.sourceCount += 1;
  compilerSourceAddition.addedSources.push("contracts/test/Unexpected.sol");
  reject("compiler source addition", () =>
    validateSecurity03CompilerSourceEvidence(compilerSourceAddition)
  );
  const compilerSourceSubstitution = security03CompilerSourceEvidence();
  compilerSourceSubstitution.changedSources[0].candidateSha256 = "0".repeat(64);
  reject("compiler source digest substitution", () =>
    validateSecurity03CompilerSourceEvidence(compilerSourceSubstitution)
  );

  const revertOrderDrift = deepClone(candidate.projectRevertStrings);
  const takeover = revertOrderDrift.filter(
    (entry) =>
      entry.source === SECURITY_03_LEASE_SOURCE &&
      entry.callable === "takeoverLease(uint256,uint256,uint256)"
  );
  [takeover[4].value, takeover[5].value] = [
    takeover[5].value,
    takeover[4].value,
  ];
  reject("takeover revert order drift", () =>
    validateSecurity03RevertBinding(
      baseline.projectRevertStrings,
      revertOrderDrift
    )
  );
  const behaviorDrift = deepClone(SECURITY_03_BEHAVIOR_EVIDENCE);
  behaviorDrift.takeoverPayment.sourceSha256 = "0".repeat(64);
  reject("stale behavior source hash", () =>
    validateSecurity03BehaviorBinding(behaviorDrift)
  );

  const hardFieldProbe = (name, mutate) => {
    const drift = deepClone(candidate);
    mutate(drift);
    reject(name, () => validateSecurity01HardFields(baseline, drift));
  };
  hardFieldProbe("hard ABI drift", (drift) =>
    drift.contracts["contracts/Wrapper.sol:Wrapper"].abi.push({
      type: "function",
      name: "drift",
      inputs: [],
      outputs: [],
      stateMutability: "view",
    })
  );
  hardFieldProbe("hard function selector drift", (drift) => {
    drift.contracts["contracts/Wrapper.sol:Wrapper"].functions[0].selector =
      "0x00000000";
  });
  hardFieldProbe("hard event drift", (drift) => {
    drift.contracts[
      "contracts/Wrapper.sol:Wrapper"
    ].events[0].topic0 = `0x${"00".repeat(32)}`;
  });
  hardFieldProbe("hard error drift", (drift) => {
    drift.contracts["contracts/Wrapper.sol:Wrapper"].errors[0].selector =
      "0x00000000";
  });
  hardFieldProbe("hard storage drift", (drift) => {
    drift.contracts[
      "contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership"
    ].storageLayout.storage[0].slot = "999";
  });
  hardFieldProbe("hard interface drift", (drift) => {
    drift.interfaces[
      "contracts/token/modules/interfaces/ILease.sol:ILease"
    ].interfaceId = "0x00000000";
  });
  hardFieldProbe("hard enum drift", (drift) => {
    drift.enums[0].members[0].ordinal = 99;
  });
  hardFieldProbe("hard ERC165 drift", (drift) => {
    drift.erc165.probes.Wrapper[0].supported =
      !drift.erc165.probes.Wrapper[0].supported;
  });
  hardFieldProbe("compiler settings drift", (drift) => {
    drift.compiler.settings.optimizer.enabled = true;
  });

  const reviewCheckpointDrift = deepClone(review);
  reviewCheckpointDrift.security02Checkpoint.evidence.sha256 = "0".repeat(64);
  reject("review checkpoint binding drift", () =>
    reviewPolicy(reviewCheckpointDrift)
  );
  const checkpointOpcodeDrift = security02CheckpointAnchor();
  checkpointOpcodeDrift.evidence.value.productionRelativeToSecurity01.contracts[
    "contracts/Wrapper.sol:Wrapper"
  ].runtimeBytecode.metadataStrippedOpcodes.candidateSha256 = "0".repeat(64);
  reject("checkpoint opcode diff drift", () =>
    security02CheckpointOpcodes(
      baseline,
      "contracts/Wrapper.sol:Wrapper",
      "runtimeBytecode",
      checkpointOpcodeDrift
    )
  );
  const checkpointGasDrift = security02CheckpointAnchor();
  checkpointGasDrift.evidence.value.legacyGasRelativeToSecurity01.candidateEntriesSha256 =
    "0".repeat(64);
  reject("checkpoint legacy gas drift", () =>
    security02CheckpointLegacyGasEntries(checkpointGasDrift)
  );

  const evidencePath = opcodeEvidencePath(review);
  const checkedInEvidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const staleEvidence = deepClone(checkedInEvidence);
  staleEvidence.sourcePatch.production.files[
    SECURITY_03_LEASE_SOURCE
  ].candidateSha256 = "0".repeat(64);
  reject("stale Security 03 opcode evidence", () =>
    validateExactOpcodeEvidence(staleEvidence, checkedInEvidence)
  );

  return probes;
}

function expectSecurity04Rejection(name, operation) {
  try {
    operation();
  } catch (_error) {
    return name;
  }
  throw new Error(`Security 04 negative probe unexpectedly passed: ${name}`);
}

function security04NegativeProbes(baseline, candidate, review) {
  const probes = [];
  const reject = (name, operation) =>
    probes.push(expectSecurity04Rejection(name, operation));
  const wrapperName = "contracts/Wrapper.sol:Wrapper";
  const pcoName =
    "contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership";

  const forgeCountDrift = deepClone(candidate);
  forgeCountDrift.tests.forge.count += 1;
  reject("Forge inventory count drift", () =>
    validateSecurity01Inventory(forgeCountDrift)
  );
  const forgeNameDrift = deepClone(candidate);
  forgeNameDrift.tests.forge.names[0] += "_drift";
  reject("Forge inventory name drift", () =>
    validateSecurity01Inventory(forgeNameDrift)
  );
  const hardhatCountDrift = deepClone(candidate);
  hardhatCountDrift.tests.hardhat.count += 1;
  reject("Hardhat inventory count drift", () =>
    validateSecurity01Inventory(hardhatCountDrift)
  );
  const hardhatNameDrift = deepClone(candidate);
  hardhatNameDrift.tests.hardhat.names[0] += " drift";
  reject("Hardhat inventory name drift", () =>
    validateSecurity01Inventory(hardhatNameDrift)
  );
  const parityDrift = deepClone(SECURITY_01_PARITY_FILES);
  parityDrift["compatibility/parity-map.json"] = "0".repeat(64);
  reject("parity-map digest drift", () =>
    validateExactFileDigests(
      parityDrift,
      SECURITY_01_PARITY_FILES,
      "parityFiles"
    )
  );
  const retainedTestDrift = deepClone(candidate);
  const retainedIndex = retainedTestDrift.tests.forge.names.indexOf(
    SECURITY_04_REGRESSION_TEST
  );
  if (retainedIndex < 0) {
    throw new Error(
      "Security 04 negative probes could not find regression test"
    );
  }
  retainedTestDrift.tests.forge.names[retainedIndex] += "_drift";
  reject("retained guard regression identifier drift", () =>
    security04BehaviorEvidence(retainedTestDrift)
  );

  const checkpointEvidenceDrift = security03CheckpointAnchor();
  checkpointEvidenceDrift.evidence.sha256 = "0".repeat(64);
  reject("Security 03 evidence checkpoint drift", () =>
    validateSecurity03CheckpointBinding(checkpointEvidenceDrift)
  );
  const checkpointReviewDrift = security03CheckpointAnchor();
  checkpointReviewDrift.review.sha256 = "0".repeat(64);
  reject("Security 03 review checkpoint drift", () =>
    validateSecurity03CheckpointBinding(checkpointReviewDrift)
  );

  reject("unauthorized repository path", () =>
    validateSecurity04ChangedPaths([
      ...SECURITY_04_CORE_CHANGED_PATHS,
      "contracts/token/modules/Valuation.sol",
    ])
  );
  reject("missing authorized repository path", () =>
    validateSecurity04ChangedPaths(
      SECURITY_04_CORE_CHANGED_PATHS.filter(
        (relativePath) => relativePath !== SECURITY_04_REGRESSION_SOURCE
      )
    )
  );

  const boundFileDrift = deepClone(SECURITY_04_BOUND_FILES);
  boundFileDrift[SECURITY_04_REGRESSION_SOURCE] = "0".repeat(64);
  reject("guard regression file digest drift", () =>
    validateExactFileDigests(
      boundFileDrift,
      SECURITY_04_BOUND_FILES,
      "security04Files"
    )
  );
  const configDrift = deepClone(SECURITY_04_CONFIG_FILES);
  configDrift["compatibility/compiler-warning-allowlist.json"] = "0".repeat(64);
  reject("warning allowlist digest drift", () =>
    validateExactFileDigests(
      configDrift,
      SECURITY_04_CONFIG_FILES,
      "configFiles"
    )
  );

  const compilerClosureDrift = security04CompilerSourceEvidence();
  compilerClosureDrift.candidateClosureSha256 = "0".repeat(64);
  reject("compiler source closure drift", () =>
    validateSecurity04CompilerSourceEvidence(compilerClosureDrift)
  );
  const compilerSourceAddition = security04CompilerSourceEvidence();
  compilerSourceAddition.sourceCount += 1;
  compilerSourceAddition.addedSources.push("contracts/test/Unexpected.sol");
  reject("compiler source addition", () =>
    validateSecurity04CompilerSourceEvidence(compilerSourceAddition)
  );
  const compilerSourceSubstitution = security04CompilerSourceEvidence();
  compilerSourceSubstitution.changedSources[0].candidateSha256 = "0".repeat(64);
  reject("compiler source digest substitution", () =>
    validateSecurity04CompilerSourceEvidence(compilerSourceSubstitution)
  );

  const productionSourceDrift = security04ProductionSourceEvidence();
  productionSourceDrift.precedence = [
    productionSourceDrift.precedence[0],
    productionSourceDrift.precedence[4],
    ...productionSourceDrift.precedence.slice(1, 4),
    ...productionSourceDrift.precedence.slice(5),
  ];
  reject("unwrap source precedence drift", () =>
    validateSecurity04ProductionSourceBinding(productionSourceDrift)
  );
  const behaviorDrift = deepClone(SECURITY_04_BEHAVIOR_EVIDENCE);
  behaviorDrift.guard.precedence[2] = "DestinationContractAddress guard";
  reject("guard behavior precedence drift", () =>
    validateSecurity04BehaviorBinding(behaviorDrift)
  );

  const customErrorDrift = deepClone(candidate);
  const destinationError = customErrorDrift.contracts[wrapperName].errors.find(
    (entry) => entry.signature === SECURITY_04_ERROR_SIGNATURE
  );
  if (!destinationError) {
    throw new Error("Security 04 negative probes could not find custom error");
  }
  destinationError.selector = "0x00000000";
  reject("DestinationContractAddress selector drift", () =>
    security04CustomErrorEvidence(customErrorDrift)
  );

  const revertDrift = deepClone(candidate.projectRevertStrings);
  revertDrift[revertDrift.length - 1].value += " drift";
  reject("project revert callsite drift", () =>
    validateSecurity04RevertBinding(baseline.projectRevertStrings, revertDrift)
  );

  const hardFieldProbe = (name, mutate) => {
    const drift = deepClone(candidate);
    mutate(drift);
    reject(name, () => validateSecurity01HardFields(baseline, drift));
  };
  hardFieldProbe("hard ABI drift", (drift) =>
    drift.contracts[wrapperName].abi.push({
      type: "function",
      name: "drift",
      inputs: [],
      outputs: [],
      stateMutability: "view",
    })
  );
  hardFieldProbe("hard function selector drift", (drift) => {
    drift.contracts[wrapperName].functions[0].selector = "0x00000000";
  });
  hardFieldProbe("hard event drift", (drift) => {
    drift.contracts[wrapperName].events[0].topic0 = `0x${"00".repeat(32)}`;
  });
  hardFieldProbe("hard error drift", (drift) => {
    drift.contracts[wrapperName].errors[0].selector = "0x00000000";
  });
  hardFieldProbe("hard storage drift", (drift) => {
    drift.contracts[pcoName].storageLayout.storage[0].slot = "999";
  });
  hardFieldProbe("hard interface drift", (drift) => {
    drift.interfaces[
      "contracts/token/modules/interfaces/ILease.sol:ILease"
    ].interfaceId = "0x00000000";
  });
  hardFieldProbe("hard enum drift", (drift) => {
    drift.enums[0].members[0].ordinal = 99;
  });
  hardFieldProbe("hard ERC165 drift", (drift) => {
    drift.erc165.probes.Wrapper[0].supported =
      !drift.erc165.probes.Wrapper[0].supported;
  });
  hardFieldProbe("compiler settings drift", (drift) => {
    drift.compiler.settings.optimizer.enabled = true;
  });

  const checkpoint = security03CheckpointAnchor();
  const pcoRawHashDrift = deepClone(candidate);
  pcoRawHashDrift.contracts[
    pcoName
  ].creationBytecode.keccak256 = `0x${"00".repeat(32)}`;
  reject("standalone PCO raw bytecode drift", () =>
    validateSecurity04PCOEquality(baseline, pcoRawHashDrift, checkpoint)
  );
  const pcoOpcodeDrift = deepClone(candidate);
  pcoOpcodeDrift.contracts[pcoName].runtimeBytecode.metadataStrippedOpcodes +=
    " STOP";
  reject("standalone PCO opcode drift", () =>
    validateSecurity04PCOEquality(baseline, pcoOpcodeDrift, checkpoint)
  );
  const pcoSizeDrift = deepClone(candidate);
  pcoSizeDrift.contracts[pcoName].runtimeBytecode.sizeBytes += 1;
  reject("standalone PCO runtime size drift", () =>
    validateSecurity04PCOEquality(baseline, pcoSizeDrift, checkpoint)
  );

  const unauthorizedPcoPath = `$.contracts.${pcoName}.runtimeBytecode.keccak256`;
  const unauthorizedPcoDifference = {
    path: unauthorizedPcoPath,
    baselineValue: "checkpoint",
    candidateValue: "drift",
    reason: "must be rejected",
  };
  const unauthorizedPcoReview = deepClone(review);
  unauthorizedPcoReview.allowedDifferences.push(unauthorizedPcoDifference);
  reject("unauthorized standalone PCO reviewed difference", () =>
    validateReviewedDifferences(
      unauthorizedPcoReview,
      fs.readFileSync(BASELINE_PATH),
      [
        ...collectDifferences(
          security04ComparisonBaseline(baseline, candidate),
          candidate
        ),
        unauthorizedPcoDifference,
      ]
    )
  );

  const reviewCheckpointDrift = deepClone(review);
  reviewCheckpointDrift.security03Checkpoint.evidence.sha256 = "0".repeat(64);
  reject("review checkpoint binding drift", () =>
    reviewPolicy(reviewCheckpointDrift)
  );
  const checkpointOpcodeDrift = security03CheckpointAnchor();
  checkpointOpcodeDrift.evidence.value.productionRelativeToSecurity02.contracts[
    wrapperName
  ].runtimeBytecode.metadataStrippedOpcodes.candidateSha256 = "0".repeat(64);
  reject("checkpoint opcode diff drift", () =>
    security03CheckpointOpcodes(
      baseline,
      wrapperName,
      "runtimeBytecode",
      checkpointOpcodeDrift
    )
  );
  const checkpointGasDrift = security03CheckpointAnchor();
  checkpointGasDrift.evidence.value.legacyGasRelativeToSecurity02.candidateEntriesSha256 =
    "0".repeat(64);
  reject("checkpoint legacy gas drift", () =>
    security03CheckpointLegacyGasEntries(checkpointGasDrift)
  );

  const evidencePath = opcodeEvidencePath(review);
  const checkedInEvidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const staleEvidence = deepClone(checkedInEvidence);
  staleEvidence.sourcePatch.production.candidateSha256 = "0".repeat(64);
  reject("stale Security 04 opcode evidence", () =>
    validateExactOpcodeEvidence(staleEvidence, checkedInEvidence)
  );

  return probes;
}

function expectStage10Rejection(name, operation) {
  try {
    operation();
  } catch (_error) {
    return name;
  }
  throw new Error(`Stage 10 negative probe unexpectedly passed: ${name}`);
}

function stage10NegativeProbes(baseline, candidate, review) {
  const probes = [];
  const reject = (name, operation) => {
    probes.push(expectStage10Rejection(name, operation));
  };
  const rejectCandidate = (name, mutate) => {
    const drift = deepClone(candidate);
    mutate(drift);
    reject(name, () => validateStage10Candidate(baseline, drift));
  };

  const checkpointReview = deepClone(review);
  checkpointReview.security04Checkpoint.commit = "0".repeat(40);
  reject("Security 04 checkpoint commit drift", () =>
    reviewPolicy(checkpointReview)
  );
  const checkpointEvidence = deepClone(review);
  checkpointEvidence.security04Checkpoint.evidence.sha256 = "0".repeat(64);
  reject("Security 04 checkpoint evidence drift", () =>
    reviewPolicy(checkpointEvidence)
  );
  const checkpointReviewHash = deepClone(review);
  checkpointReviewHash.security04Checkpoint.review.sha256 = "0".repeat(64);
  reject("Security 04 checkpoint review drift", () =>
    reviewPolicy(checkpointReviewHash)
  );
  const receiverReview = deepClone(review);
  receiverReview.receiverEvidence.sourceSha256 = "0".repeat(64);
  reject("receiver review evidence drift", () => reviewPolicy(receiverReview));

  rejectCandidate("Hardhat count drift", (drift) => {
    drift.tests.hardhat.count -= 1;
  });
  rejectCandidate("Hardhat identifier drift", (drift) => {
    drift.tests.hardhat.names[0] += " drift";
  });
  rejectCandidate("retained Forge identifier removal", (drift) => {
    const receiverNames = new Set(stage10ReceiverReviewEvidence().names);
    const index = drift.tests.forge.names.findIndex(
      (name) => !receiverNames.has(name)
    );
    drift.tests.forge.names.splice(index, 1);
    drift.tests.forge.count -= 1;
    drift.tests.total -= 1;
  });
  rejectCandidate("unreviewed Forge identifier addition", (drift) => {
    drift.tests.forge.names.push(
      "test/solidity/fuzz/Unexpected.t.sol:X:test_x"
    );
    drift.tests.forge.names.sort();
    drift.tests.forge.count += 1;
    drift.tests.total += 1;
  });
  rejectCandidate("compiler version drift", (drift) => {
    drift.compiler.version = "0.8.35";
  });
  rejectCandidate("compiler settings drift", (drift) => {
    drift.compiler.settings.optimizer.enabled = true;
  });
  rejectCandidate("ABI drift", (drift) => {
    drift.contracts["contracts/Wrapper.sol:Wrapper"].abi.pop();
  });
  rejectCandidate("function selector drift", (drift) => {
    drift.contracts["contracts/Wrapper.sol:Wrapper"].functions[0].selector =
      "0x00000000";
  });
  rejectCandidate("event drift", (drift) => {
    drift.contracts["contracts/Wrapper.sol:Wrapper"].events.pop();
  });
  rejectCandidate("custom error drift", (drift) => {
    drift.contracts["contracts/Wrapper.sol:Wrapper"].errors.pop();
  });
  rejectCandidate("storage layout drift", (drift) => {
    drift.contracts[
      "contracts/Wrapper.sol:Wrapper"
    ].storageLayout.storage[0].slot = "999";
  });
  rejectCandidate("interface drift", (drift) => {
    drift.interfaces[Object.keys(drift.interfaces)[0]].interfaceId =
      "0x00000000";
  });
  rejectCandidate("enum ordinal drift", (drift) => {
    drift.enums[0].members[0].ordinal = 999;
  });
  rejectCandidate("ERC165 drift", (drift) => {
    drift.erc165.probes.Wrapper[0].supported =
      !drift.erc165.probes.Wrapper[0].supported;
  });
  rejectCandidate("project revert drift", (drift) => {
    drift.projectRevertStrings[0].value += " drift";
  });

  const bytecodeDrift = deepClone(candidate);
  bytecodeDrift.contracts[
    "contracts/Wrapper.sol:Wrapper"
  ].runtimeBytecode.keccak256 = `0x${"00".repeat(32)}`;
  reject("unreviewed bytecode value drift", () => {
    const differences = collectDifferences(
      stage10ComparisonBaseline(baseline, bytecodeDrift),
      bytecodeDrift
    );
    validateReviewedDifferences(
      review,
      fs.readFileSync(BASELINE_PATH),
      differences
    );
  });
  const gasDrift = deepClone(candidate);
  gasDrift.gasSnapshot.entries[0] += " drift";
  reject("unreviewed gas value drift", () => {
    const differences = collectDifferences(
      stage10ComparisonBaseline(baseline, gasDrift),
      gasDrift
    );
    validateReviewedDifferences(
      review,
      fs.readFileSync(BASELINE_PATH),
      differences
    );
  });
  const protectedAllowance = deepClone(review);
  protectedAllowance.allowedDifferences.push({
    path: "$.contracts.contracts/Wrapper.sol:Wrapper.abi[0]",
    baselineValue: null,
    candidateValue: null,
    reason: "probe",
  });
  reject("protected ABI waiver", () =>
    validateReviewedDifferences(
      protectedAllowance,
      fs.readFileSync(BASELINE_PATH),
      collectDifferences(
        stage10ComparisonBaseline(baseline, candidate),
        candidate
      )
    )
  );

  const boundFiles = stage10BoundFileEvidence();
  const boundFileDrift = deepClone(boundFiles);
  boundFileDrift[Object.keys(boundFileDrift)[0]] = "0".repeat(64);
  reject("bound file digest drift", () =>
    validateExactFileDigests(
      boundFileDrift,
      STAGE_10_BOUND_FILES,
      "stage10Files"
    )
  );
  const compilerClosure = stage10CompilerSourceEvidence();
  const compilerClosureDrift = deepClone(compilerClosure);
  compilerClosureDrift.candidateClosureSha256 = "0".repeat(64);
  reject("compiler source closure drift", () => {
    if (!valuesEqual(compilerClosureDrift, compilerClosure)) {
      throw new Error("compiler closure mismatch");
    }
  });
  const dependency = stage10DependencyEvidence();
  const dependencyDrift = deepClone(dependency);
  dependencyDrift.candidateVersion = "5.6.0";
  reject("dependency version drift", () => {
    if (!valuesEqual(dependencyDrift, dependency)) {
      throw new Error("dependency mismatch");
    }
  });
  const importClosure = deepClone(
    compilerClosure.productionImportClosure.openzeppelin
  );
  importClosure.push("@openzeppelin/contracts/token/ERC721/ERC721.sol");
  reject("OpenZeppelin ERC721 import", () => {
    if (
      !valuesEqual(
        importClosure,
        [...STAGE_10_EXPECTED_PRODUCTION_OPENZEPPELIN_IMPORTS].sort()
      )
    ) {
      throw new Error("production import closure mismatch");
    }
  });

  const evidencePath = opcodeEvidencePath(review);
  const checkedInEvidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const staleEvidence = deepClone(checkedInEvidence);
  staleEvidence.sourceAndPackage.dependency.candidateVersion = "5.6.0";
  reject("stale Stage 10 evidence", () =>
    validateExactOpcodeEvidence(staleEvidence, checkedInEvidence)
  );
  return probes;
}

function expectStage11Rejection(name, operation) {
  try {
    operation();
  } catch (_error) {
    return name;
  }
  throw new Error(`Stage 11 negative probe unexpectedly passed: ${name}`);
}

function stage11NegativeProbes(baseline, candidate, review) {
  const probes = [];
  const reject = (name, operation) => {
    probes.push(expectStage11Rejection(name, operation));
  };
  const rejectCandidate = (name, mutate) => {
    const drift = deepClone(candidate);
    mutate(drift);
    reject(name, () => validateStage11Candidate(baseline, drift));
  };
  const wrapperName = "contracts/Wrapper.sol:Wrapper";
  const pcoName =
    "contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership";

  const checkpointCommit = deepClone(review);
  checkpointCommit.stage10Checkpoint.commit = "0".repeat(40);
  reject("Stage 10 checkpoint commit drift", () =>
    reviewPolicy(checkpointCommit)
  );
  const checkpointEvidence = deepClone(review);
  checkpointEvidence.stage10Checkpoint.evidence.sha256 = "0".repeat(64);
  reject("Stage 10 checkpoint evidence drift", () =>
    reviewPolicy(checkpointEvidence)
  );
  const checkpointReview = deepClone(review);
  checkpointReview.stage10Checkpoint.review.sha256 = "0".repeat(64);
  reject("Stage 10 checkpoint review drift", () =>
    reviewPolicy(checkpointReview)
  );
  const smokeReview = deepClone(review);
  smokeReview.smokeEvidence.sourceSha256 = "0".repeat(64);
  reject("Hardhat smoke review evidence drift", () =>
    reviewPolicy(smokeReview)
  );

  rejectCandidate("active Hardhat count drift", (drift) => {
    drift.tests.hardhat.count += 1;
  });
  rejectCandidate("active Hardhat identifier drift", (drift) => {
    drift.tests.hardhat.names[0] += " drift";
  });
  rejectCandidate("active Hardhat identifier addition", (drift) => {
    drift.tests.hardhat.names.push("unexpected smoke");
    drift.tests.hardhat.count += 1;
    drift.tests.total += 1;
  });
  rejectCandidate("retained Forge identifier removal", (drift) => {
    drift.tests.forge.names.pop();
    drift.tests.forge.count -= 1;
    drift.tests.total -= 1;
  });
  rejectCandidate("unreviewed Forge identifier addition", (drift) => {
    drift.tests.forge.names.push(
      "test/solidity/fuzz/Unexpected.t.sol:UnexpectedTest:test_unexpected"
    );
    drift.tests.forge.names.sort();
    drift.tests.forge.count += 1;
    drift.tests.total += 1;
  });
  rejectCandidate("combined test total drift", (drift) => {
    drift.tests.total += 1;
  });
  rejectCandidate("compiler version drift", (drift) => {
    drift.compiler.version = "0.8.35";
  });
  rejectCandidate("compiler settings drift", (drift) => {
    drift.compiler.settings.optimizer.enabled = true;
  });
  rejectCandidate("ABI drift", (drift) => {
    drift.contracts[wrapperName].abi.pop();
  });
  rejectCandidate("function selector drift", (drift) => {
    drift.contracts[wrapperName].functions[0].selector = "0x00000000";
  });
  rejectCandidate("event drift", (drift) => {
    drift.contracts[wrapperName].events.pop();
  });
  rejectCandidate("custom error drift", (drift) => {
    drift.contracts[wrapperName].errors.pop();
  });
  rejectCandidate("storage layout drift", (drift) => {
    drift.contracts[pcoName].storageLayout.storage[0].slot = "999";
  });
  rejectCandidate("interface drift", (drift) => {
    drift.interfaces[Object.keys(drift.interfaces)[0]].interfaceId =
      "0x00000000";
  });
  rejectCandidate("enum ordinal drift", (drift) => {
    drift.enums[0].members[0].ordinal = 999;
  });
  rejectCandidate("ERC165 drift", (drift) => {
    drift.erc165.probes.Wrapper[0].supported =
      !drift.erc165.probes.Wrapper[0].supported;
  });
  rejectCandidate("project revert drift", (drift) => {
    drift.projectRevertStrings[0].value += " drift";
  });
  rejectCandidate("raw production bytecode drift", (drift) => {
    drift.contracts[wrapperName].runtimeBytecode.keccak256 = `0x${"00".repeat(
      32
    )}`;
  });
  rejectCandidate("metadata-stripped opcode drift", (drift) => {
    drift.contracts[wrapperName].runtimeBytecode.metadataStrippedOpcodes +=
      " STOP";
  });
  rejectCandidate("production bytecode size drift", (drift) => {
    drift.contracts[pcoName].runtimeBytecode.sizeBytes += 1;
  });
  rejectCandidate("legacy gas drift", (drift) => {
    drift.gasSnapshot.entries[0] += " drift";
  });

  const rawInventory = JSON.parse(
    fs.readFileSync(path.join(ROOT, STAGE_11_SMOKE_INVENTORY_PATH), "utf8")
  );
  const inventoryHistorical = deepClone(rawInventory);
  inventoryHistorical.historicalHardhat.namesSha256 = "0".repeat(64);
  reject("historical Hardhat provenance drift", () =>
    stage11SmokeInventoryDefinition(inventoryHistorical)
  );
  const inventorySmoke = deepClone(rawInventory);
  inventorySmoke.activeHardhat.sourceSha256 = "0".repeat(64);
  reject("Hardhat smoke source drift", () =>
    stage11SmokeInventoryDefinition(inventorySmoke)
  );
  const inventoryParity = deepClone(rawInventory);
  inventoryParity.parity.files[Object.keys(inventoryParity.parity.files)[0]] =
    "0".repeat(64);
  reject("parity-map provenance drift", () =>
    stage11SmokeInventoryDefinition(inventoryParity)
  );
  const inventoryDeletion = deepClone(rawInventory);
  inventoryDeletion.deletedLegacyFiles[
    Object.keys(inventoryDeletion.deletedLegacyFiles)[0]
  ] = "0".repeat(64);
  reject("legacy source deletion anchor drift", () =>
    stage11SmokeInventoryDefinition(inventoryDeletion)
  );

  const checkpoint = stage11CheckpointAnchor();
  const productionCheckpointDrift = deepClone(checkpoint);
  const sourcePath = STAGE_10_PRODUCTION_SOURCES[0];
  productionCheckpointDrift.evidence.value.sourceAndPackage.productionPragmas.sources[
    sourcePath
  ].sha256 = "0".repeat(64);
  reject("production source equality drift", () =>
    stage11ProductionSourceEquality(productionCheckpointDrift)
  );
  const dependencyCheckpointDrift = deepClone(checkpoint);
  dependencyCheckpointDrift.evidence.value.sourceAndPackage.dependency.candidateVersion =
    "5.6.0";
  reject("dependency equality drift", () =>
    stage11DependencyEquality(dependencyCheckpointDrift)
  );
  const compilerCheckpointDrift = deepClone(checkpoint);
  compilerCheckpointDrift.evidence.value.sourceAndPackage.compilerSources.candidateClosureSha256 =
    "0".repeat(64);
  reject("compiler source closure drift", () =>
    stage11CompilerSourceEquality(compilerCheckpointDrift)
  );
  const keyFlowDrift = deepClone(stage08GasEvidence());
  const gasGroup = Object.keys(keyFlowDrift.groups)[0];
  keyFlowDrift.groups[gasGroup][0].candidateGas += 1;
  reject("key-flow gas drift", () =>
    stage11KeyFlowGasEqualityEvidence(checkpoint, keyFlowDrift)
  );

  const boundFiles = stage11BoundFileEvidence();
  const boundFileDrift = deepClone(boundFiles);
  boundFileDrift[Object.keys(boundFileDrift)[0]] = "0".repeat(64);
  reject("bound file digest drift", () =>
    validateExactFileDigests(
      boundFileDrift,
      STAGE_11_BOUND_FILES,
      "stage11Files"
    )
  );
  reject("unexpected repository path", () =>
    validateStage11ChangedPaths([
      ...STAGE_11_FINAL_CHANGED_PATHS,
      "unexpected-stage-11-file",
    ])
  );

  const protectedAllowance = deepClone(review);
  const protectedDifference = {
    path: `$.contracts.${wrapperName}.abi[0]`,
    baselineValue: null,
    candidateValue: null,
    reason: "probe",
  };
  protectedAllowance.allowedDifferences.push(protectedDifference);
  reject("protected ABI waiver", () =>
    validateReviewedDifferences(
      protectedAllowance,
      fs.readFileSync(BASELINE_PATH),
      [
        ...collectDifferences(
          stage11ComparisonBaseline(baseline, candidate),
          candidate
        ),
        protectedDifference,
      ]
    )
  );

  const evidencePath = opcodeEvidencePath(review);
  const checkedInEvidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const staleEvidence = deepClone(checkedInEvidence);
  staleEvidence.sourceAndTestCutover.tests.activeHardhat.count += 1;
  reject("stale Stage 11 evidence", () =>
    validateExactOpcodeEvidence(staleEvidence, checkedInEvidence)
  );

  return probes;
}

function expectStage12aRejection(name, operation) {
  try {
    operation();
  } catch (_error) {
    return name;
  }
  throw new Error(`Stage 12a negative probe unexpectedly passed: ${name}`);
}

function stage12aNegativeProbes(baseline, candidate, review) {
  const probes = [];
  const reject = (name, operation) => {
    probes.push(expectStage12aRejection(name, operation));
  };
  const rejectCandidate = (name, mutate) => {
    const drift = deepClone(candidate);
    mutate(drift);
    reject(name, () => validateStage12aCandidate(baseline, drift));
  };
  const wrapperName = "contracts/Wrapper.sol:Wrapper";
  const pcoName =
    "contracts/token/PartialCommonOwnership.sol:PartialCommonOwnership";

  const checkpointCommit = deepClone(review);
  checkpointCommit.stage11Checkpoint.commit = "0".repeat(40);
  reject("Stage 11 checkpoint commit drift", () =>
    reviewPolicy(checkpointCommit)
  );
  const checkpointEvidence = deepClone(review);
  checkpointEvidence.stage11Checkpoint.evidence.sha256 = "0".repeat(64);
  reject("Stage 11 checkpoint evidence drift", () =>
    reviewPolicy(checkpointEvidence)
  );
  const checkpointReview = deepClone(review);
  checkpointReview.stage11Checkpoint.review.sha256 = "0".repeat(64);
  reject("Stage 11 checkpoint review drift", () =>
    reviewPolicy(checkpointReview)
  );
  const migrationReview = deepClone(review);
  migrationReview.migrationEvidence.dependencyMigration.lockfileSha256 =
    "0".repeat(64);
  reject("migration review evidence drift", () =>
    reviewPolicy(migrationReview)
  );

  rejectCandidate("Hardhat smoke count drift", (drift) => {
    drift.tests.hardhat.count += 1;
  });
  rejectCandidate("Hardhat smoke identifier drift", (drift) => {
    drift.tests.hardhat.names[0] += " drift";
  });
  rejectCandidate("Forge identifier removal", (drift) => {
    drift.tests.forge.names.pop();
    drift.tests.forge.count -= 1;
    drift.tests.total -= 1;
  });
  rejectCandidate("Forge identifier addition", (drift) => {
    drift.tests.forge.names.push(
      "test/solidity/fuzz/Unexpected.t.sol:UnexpectedTest:test_unexpected"
    );
    drift.tests.forge.names.sort();
    drift.tests.forge.count += 1;
    drift.tests.total += 1;
  });
  rejectCandidate("combined test total drift", (drift) => {
    drift.tests.total += 1;
  });
  rejectCandidate("compiler version drift", (drift) => {
    drift.compiler.version = "0.8.35";
  });
  rejectCandidate("compiler settings drift", (drift) => {
    drift.compiler.settings.optimizer.enabled = true;
  });
  rejectCandidate("ABI drift", (drift) => {
    drift.contracts[wrapperName].abi.pop();
  });
  rejectCandidate("function selector drift", (drift) => {
    drift.contracts[wrapperName].functions[0].selector = "0x00000000";
  });
  rejectCandidate("event drift", (drift) => {
    drift.contracts[wrapperName].events.pop();
  });
  rejectCandidate("custom error drift", (drift) => {
    drift.contracts[wrapperName].errors.pop();
  });
  rejectCandidate("storage layout drift", (drift) => {
    drift.contracts[pcoName].storageLayout.storage[0].slot = "999";
  });
  rejectCandidate("interface drift", (drift) => {
    drift.interfaces[Object.keys(drift.interfaces)[0]].interfaceId =
      "0x00000000";
  });
  rejectCandidate("enum ordinal drift", (drift) => {
    drift.enums[0].members[0].ordinal = 999;
  });
  rejectCandidate("ERC165 drift", (drift) => {
    drift.erc165.probes.Wrapper[0].supported =
      !drift.erc165.probes.Wrapper[0].supported;
  });
  rejectCandidate("project revert drift", (drift) => {
    drift.projectRevertStrings[0].value += " drift";
  });
  rejectCandidate("raw bytecode drift", (drift) => {
    drift.contracts[wrapperName].runtimeBytecode.keccak256 = `0x${"00".repeat(
      32
    )}`;
  });
  rejectCandidate("metadata-stripped opcode drift", (drift) => {
    drift.contracts[wrapperName].runtimeBytecode.metadataStrippedOpcodes +=
      " STOP";
  });
  rejectCandidate("runtime size drift", (drift) => {
    drift.contracts[pcoName].runtimeBytecode.sizeBytes += 1;
  });
  rejectCandidate("legacy gas drift", (drift) => {
    drift.gasSnapshot.entries[0] += " drift";
  });

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8")
  );
  const packageProbe = (name, mutate) => {
    const drift = deepClone(packageJson);
    mutate(drift);
    reject(name, () => validateStage12aPackageManifest(drift));
  };
  packageProbe("ethers version drift", (drift) => {
    drift.devDependencies.ethers = "6.16.0";
  });
  packageProbe("Foundation plugin version drift", (drift) => {
    drift.devDependencies["@nomicfoundation/hardhat-ethers"] = "3.1.2";
  });
  packageProbe("Hardhat version drift", (drift) => {
    drift.devDependencies.hardhat = "2.28.5";
  });
  packageProbe("dormant legacy dependency removal", (drift) => {
    delete drift.devDependencies["@nomiclabs/hardhat-waffle"];
  });
  packageProbe("runtime dependency drift", (drift) => {
    drift.dependencies["@openzeppelin/contracts"] = "5.6.0";
  });
  packageProbe("TypeChain runtime invocation", (drift) => {
    drift.scripts.typechain = "hardhat typechain";
  });
  const lock = fs.readFileSync(path.join(ROOT, "pnpm-lock.yaml"), "utf8");
  reject("ethers lock integrity drift", () =>
    validateStage12aLockDependency(
      lock.replace(STAGE_12A_ETHERS_INTEGRITY, "sha512-drift"),
      "ethers",
      STAGE_12A_ETHERS_VERSION,
      STAGE_12A_ETHERS_INTEGRITY
    )
  );
  reject("Foundation plugin lock integrity drift", () =>
    validateStage12aLockDependency(
      lock.replace(STAGE_12A_HARDHAT_ETHERS_INTEGRITY, "sha512-drift"),
      "@nomicfoundation/hardhat-ethers",
      STAGE_12A_HARDHAT_ETHERS_VERSION,
      STAGE_12A_HARDHAT_ETHERS_INTEGRITY
    )
  );

  const checkpoint = stage12aCheckpointAnchor();
  const productionCheckpointDrift = deepClone(checkpoint);
  productionCheckpointDrift.evidence.value.sourceAndTestCutover.productionSources[
    STAGE_10_PRODUCTION_SOURCES[0]
  ].sha256 = "0".repeat(64);
  reject("production source equality drift", () =>
    stage12aProductionSourceEquality(productionCheckpointDrift)
  );
  const compilerCheckpointDrift = deepClone(checkpoint);
  compilerCheckpointDrift.evidence.value.sourceAndTestCutover.compilerSources.candidateClosureSha256 =
    "0".repeat(64);
  reject("compiler source closure drift", () =>
    stage12aCompilerSourceEquality(compilerCheckpointDrift)
  );
  const keyFlowDrift = deepClone(stage08GasEvidence());
  const gasGroup = Object.keys(keyFlowDrift.groups)[0];
  keyFlowDrift.groups[gasGroup][0].candidateGas += 1;
  reject("key-flow gas drift", () =>
    stage12aKeyFlowGasEqualityEvidence(checkpoint, keyFlowDrift)
  );
  const boundFiles = stage12aBoundFileEvidence();
  const boundFileDrift = deepClone(boundFiles);
  boundFileDrift[Object.keys(boundFileDrift)[0]] = "0".repeat(64);
  reject("bound file digest drift", () =>
    validateExactFileDigests(
      boundFileDrift,
      STAGE_12A_BOUND_FILES,
      "stage12aFiles"
    )
  );
  reject("unexpected repository path", () =>
    validateStage12aChangedPaths([
      ...STAGE_12A_FINAL_CHANGED_PATHS,
      "unexpected-stage-12a-file",
    ])
  );

  const unauthorizedReview = deepClone(review);
  const unauthorizedDifference = {
    path: "$.tests.hardhat.count",
    baselineValue: 3,
    candidateValue: 4,
    reason: "probe",
  };
  unauthorizedReview.allowedDifferences.push(unauthorizedDifference);
  reject("compatibility difference waiver", () =>
    validateReviewedDifferences(
      unauthorizedReview,
      fs.readFileSync(BASELINE_PATH),
      [unauthorizedDifference]
    )
  );

  const evidencePath = opcodeEvidencePath(review);
  const checkedInEvidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const staleEvidence = deepClone(checkedInEvidence);
  staleEvidence.toolingAndTestMigration.dependencyMigration.transition.ethers.candidate =
    "6.16.0";
  reject("stale Stage 12a evidence", () =>
    validateExactOpcodeEvidence(staleEvidence, checkedInEvidence)
  );

  return probes;
}

function reviewedOpcodeEvidence(review, baseline, candidate) {
  const configuration = review.opcodeEvidence;
  if (!configuration) return null;
  if (
    ![
      "metadata-stripped-equality",
      "metadata-stripped-full-diff",
      "stage-08-production-equality",
      "security-01-stage-09-relative-full-diff",
      "security-02-security-01-relative-full-diff",
      "security-03-security-02-relative-full-diff",
      "security-04-security-03-relative-wrapper-only",
      "stage-10-security-04-relative-full-diff",
      "stage-11-stage-10-production-equality",
      "stage-12a-stage-11-production-equality",
    ].includes(configuration.mode)
  ) {
    throw new Error(`Unsupported opcode evidence mode: ${configuration.mode}`);
  }
  if (
    !Array.isArray(configuration.contracts) ||
    configuration.contracts.length === 0
  ) {
    throw new Error("Opcode evidence must list at least one contract");
  }
  if (configuration.mode === "stage-08-production-equality") {
    return stage09Evidence(review, baseline, candidate);
  }
  if (configuration.mode === "security-01-stage-09-relative-full-diff") {
    return security01Evidence(review, baseline, candidate);
  }
  if (configuration.mode === "security-02-security-01-relative-full-diff") {
    return security02Evidence(review, baseline, candidate);
  }
  if (configuration.mode === "security-03-security-02-relative-full-diff") {
    return security03Evidence(review, baseline, candidate);
  }
  if (configuration.mode === "security-04-security-03-relative-wrapper-only") {
    return security04Evidence(review, baseline, candidate);
  }
  if (configuration.mode === "stage-10-security-04-relative-full-diff") {
    return stage10Evidence(review, baseline, candidate);
  }
  if (configuration.mode === "stage-11-stage-10-production-equality") {
    return stage11Evidence(review, baseline, candidate);
  }
  if (configuration.mode === "stage-12a-stage-11-production-equality") {
    return stage12aEvidence(review, baseline, candidate);
  }

  const contracts = {};
  for (const qualifiedName of configuration.contracts) {
    const baselineContract = baseline.contracts[qualifiedName];
    const candidateContract = candidate.contracts[qualifiedName];
    if (!baselineContract || !candidateContract) {
      throw new Error(`Opcode evidence contract is missing: ${qualifiedName}`);
    }

    const contractEvidence = {};
    for (const bytecodeKind of ["creationBytecode", "runtimeBytecode"]) {
      const baselineBytecode = baselineContract[bytecodeKind];
      const candidateBytecode = candidateContract[bytecodeKind];
      const opcodesEqual =
        baselineBytecode.metadataStrippedOpcodes ===
        candidateBytecode.metadataStrippedOpcodes;
      if (
        configuration.mode === "metadata-stripped-equality" &&
        !opcodesEqual
      ) {
        throw new Error(
          `${qualifiedName} ${bytecodeKind} has a metadata-stripped opcode change; the equality evidence cannot approve it`
        );
      }
      if (configuration.mode === "metadata-stripped-equality") {
        contractEvidence[bytecodeKind] = {
          rawKeccak256: {
            baseline: baselineBytecode.keccak256,
            candidate: candidateBytecode.keccak256,
            changed: baselineBytecode.keccak256 !== candidateBytecode.keccak256,
          },
          metadataStrippedKeccak256: {
            baseline: baselineBytecode.metadataStrippedKeccak256,
            candidate: candidateBytecode.metadataStrippedKeccak256,
            equal:
              baselineBytecode.metadataStrippedKeccak256 ===
              candidateBytecode.metadataStrippedKeccak256,
          },
          metadataStrippedSizeBytes: {
            baseline: baselineBytecode.metadataStrippedSizeBytes,
            candidate: candidateBytecode.metadataStrippedSizeBytes,
            equal:
              baselineBytecode.metadataStrippedSizeBytes ===
              candidateBytecode.metadataStrippedSizeBytes,
          },
          metadataStrippedOpcodes: {
            baselineSha256: sha256(baselineBytecode.metadataStrippedOpcodes),
            candidateSha256: sha256(candidateBytecode.metadataStrippedOpcodes),
            equal: opcodesEqual,
            diff: [],
          },
        };
      } else {
        contractEvidence[bytecodeKind] = {
          rawBytecode: {
            baselineKeccak256: baselineBytecode.keccak256,
            candidateKeccak256: candidateBytecode.keccak256,
            baselineSizeBytes: baselineBytecode.sizeBytes,
            candidateSizeBytes: candidateBytecode.sizeBytes,
            sizeDeltaBytes:
              candidateBytecode.sizeBytes - baselineBytecode.sizeBytes,
            baselineMetadataBytes: baselineBytecode.metadataBytes,
            candidateMetadataBytes: candidateBytecode.metadataBytes,
          },
          metadataStrippedBytecode: {
            baselineKeccak256: baselineBytecode.metadataStrippedKeccak256,
            candidateKeccak256: candidateBytecode.metadataStrippedKeccak256,
            baselineSizeBytes: baselineBytecode.metadataStrippedSizeBytes,
            candidateSizeBytes: candidateBytecode.metadataStrippedSizeBytes,
            sizeDeltaBytes:
              candidateBytecode.metadataStrippedSizeBytes -
              baselineBytecode.metadataStrippedSizeBytes,
          },
          metadataStrippedOpcodes: {
            baselineSha256: sha256(baselineBytecode.metadataStrippedOpcodes),
            candidateSha256: sha256(candidateBytecode.metadataStrippedOpcodes),
            equal: opcodesEqual,
            fullDiff: unifiedOpcodeDiff(
              baselineBytecode.metadataStrippedOpcodes,
              candidateBytecode.metadataStrippedOpcodes
            ),
          },
        };
      }
    }

    const baselineRuntimeSize = baselineContract.runtimeBytecode.sizeBytes;
    const candidateRuntimeSize = candidateContract.runtimeBytecode.sizeBytes;
    contractEvidence.eip170 = {
      limitBytes: 24_576,
      baselineRuntimeSizeBytes: baselineRuntimeSize,
      candidateRuntimeSizeBytes: candidateRuntimeSize,
      baselineWithinLimit: baselineRuntimeSize <= 24_576,
      candidateWithinLimit: candidateRuntimeSize <= 24_576,
    };
    contracts[qualifiedName] = contractEvidence;
  }

  const evidence = {
    schemaVersion: 1,
    candidate: review.candidate,
    baselineSha256: review.baselineSha256,
    mode: configuration.mode,
    contracts,
  };
  if (configuration.mode === "metadata-stripped-full-diff") {
    evidence.gas = stage08GasEvidence();
  }
  return sorted(evidence);
}

function opcodeEvidencePath(review) {
  if (
    !review.opcodeEvidence.path ||
    typeof review.opcodeEvidence.path !== "string"
  ) {
    throw new Error(
      "Opcode evidence configuration must name its checked-in path"
    );
  }
  const evidencePath = path.resolve(ROOT, review.opcodeEvidence.path);
  const compatibilityRoot = `${path.join(ROOT, "compatibility")}${path.sep}`;
  if (!evidencePath.startsWith(compatibilityRoot)) {
    throw new Error("Opcode evidence must be stored under compatibility/");
  }
  return evidencePath;
}

function writeOpcodeEvidence(review, baseline, candidate) {
  const evidence = reviewedOpcodeEvidence(review, baseline, candidate);
  if (!evidence) {
    throw new Error("Compatibility review does not request opcode evidence");
  }
  const evidencePath = opcodeEvidencePath(review);
  fs.writeFileSync(evidencePath, stableJson(evidence));
  return evidencePath;
}

function validateExactOpcodeEvidence(checkedInEvidence, evidence) {
  if (!valuesEqual(checkedInEvidence, evidence)) {
    const evidenceDifferences = collectDifferences(checkedInEvidence, evidence);
    throw new Error(
      `Checked-in opcode evidence is stale:\n${evidenceDifferences
        .slice(0, 20)
        .map((difference) => `- ${formatDifference(difference)}`)
        .join("\n")}`
    );
  }
}

function validateOpcodeEvidence(review, baseline, candidate) {
  const evidence = reviewedOpcodeEvidence(review, baseline, candidate);
  if (!evidence) return;
  const evidencePath = opcodeEvidencePath(review);
  if (!fs.existsSync(evidencePath)) {
    throw new Error(`Checked-in opcode evidence is missing: ${evidencePath}`);
  }
  const checkedInEvidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  validateExactOpcodeEvidence(checkedInEvidence, evidence);
}

function validateSafetyEvidence(review) {
  const configuration = review.safetyEvidence;
  if (!configuration) return;

  const evidencePath = path.resolve(ROOT, configuration.path);
  const compatibilityRoot = `${path.join(ROOT, "compatibility")}${path.sep}`;
  if (!evidencePath.startsWith(compatibilityRoot)) {
    throw new Error("Safety evidence must be stored under compatibility/");
  }
  if (!fs.existsSync(evidencePath)) {
    throw new Error(`Checked-in safety evidence is missing: ${evidencePath}`);
  }

  const evidenceBytes = fs.readFileSync(evidencePath);
  const actualDigest = sha256(evidenceBytes);
  if (actualDigest !== configuration.sha256) {
    throw new Error(
      `Safety evidence digest changed: expected ${configuration.sha256}, received ${actualDigest}`
    );
  }
  const checkedInEvidence = JSON.parse(evidenceBytes);
  const expectedEvidence = stage07SafetyArtifacts();
  if (!valuesEqual(checkedInEvidence, expectedEvidence)) {
    const evidenceDifferences = collectDifferences(
      checkedInEvidence,
      expectedEvidence
    );
    throw new Error(
      `Checked-in safety evidence is stale:\n${evidenceDifferences
        .slice(0, 20)
        .map((difference) => `- ${formatDifference(difference)}`)
        .join("\n")}`
    );
  }
}

function expectedProjectRevertStrings(command, protectedRevertStrings) {
  const security01Candidate = security01ProjectRevertStrings(
    protectedRevertStrings
  );
  const security02Candidate = security02ProjectRevertStrings(
    protectedRevertStrings
  );
  const security03Candidate = security03ProjectRevertStrings(
    protectedRevertStrings
  );
  const security04Candidate = security04ProjectRevertStrings(
    protectedRevertStrings
  );
  if (command === "write-security-01-review") return security01Candidate;
  if (command === "write-security-02-review") return security02Candidate;
  if (command === "write-security-03-review") return security03Candidate;
  if (command === "write-security-04-review") return security04Candidate;
  if (command === "write-stage-10-review") return security04Candidate;
  if (command === "write-stage-11-review") return security04Candidate;
  if (command === "write-stage-12a-review") return security04Candidate;
  if (command === "diff") {
    return {
      baseline: protectedRevertStrings,
      security01Candidate,
      security02Candidate,
      security03Candidate,
      security04Candidate,
    };
  }
  if (
    [
      "check",
      "write-evidence",
      "security-01-negative-probes",
      "security-02-negative-probes",
      "security-03-negative-probes",
      "security-04-negative-probes",
      "stage-10-negative-probes",
      "stage-11-negative-probes",
      "stage-12a-negative-probes",
    ].includes(command) &&
    fs.existsSync(REVIEW_PATH)
  ) {
    const review = readReviewedDifferences();
    if (review.policy === SECURITY_01_POLICY) return security01Candidate;
    if (review.policy === SECURITY_02_POLICY) return security02Candidate;
    if (review.policy === SECURITY_03_POLICY) return security03Candidate;
    if (review.policy === SECURITY_04_POLICY) return security04Candidate;
    if (review.policy === STAGE_10_POLICY) return security04Candidate;
    if (review.policy === STAGE_11_POLICY) return security04Candidate;
    if (review.policy === STAGE_12A_POLICY) return security04Candidate;
  }
  return protectedRevertStrings;
}

async function main() {
  const command = process.argv[2];
  if (
    ![
      "capture",
      "check",
      "diff",
      "revert-strings",
      "stage-09-negative-probes",
      "security-01-negative-probes",
      "security-02-negative-probes",
      "security-03-negative-probes",
      "security-04-negative-probes",
      "stage-10-negative-probes",
      "stage-11-negative-probes",
      "stage-12a-negative-probes",
      "write-stage-08-review",
      "write-stage-09-review",
      "write-security-01-review",
      "write-security-02-review",
      "write-security-03-review",
      "write-security-04-review",
      "write-stage-10-review",
      "write-stage-11-review",
      "write-stage-12a-review",
      "write-evidence",
    ].includes(command)
  ) {
    console.error(
      "Usage: node scripts/compatibility.js <capture|check|diff|revert-strings|stage-09-negative-probes|security-01-negative-probes|security-02-negative-probes|security-03-negative-probes|security-04-negative-probes|stage-10-negative-probes|stage-11-negative-probes|stage-12a-negative-probes|write-stage-08-review|write-stage-09-review|write-security-01-review|write-security-02-review|write-security-03-review|write-security-04-review|write-stage-10-review|write-stage-11-review|write-stage-12a-review|write-evidence>"
    );
    process.exitCode = 2;
    return;
  }

  if (command === "capture" && fs.existsSync(BASELINE_PATH)) {
    throw new Error(
      `Refusing to overwrite the compatibility baseline at ${BASELINE_PATH}`
    );
  }

  const manifest = await generateManifest();
  if (command === "revert-strings") {
    console.log(
      stableJson({
        schemaVersion: 1,
        baselineSourceCommit: BASELINE_SOURCE_COMMIT,
        entries: manifest.projectRevertStrings,
      })
    );
    return;
  }
  const protectedRevertStrings = protectedProjectRevertStrings();
  const expectedReverts = expectedProjectRevertStrings(
    command,
    protectedRevertStrings
  );
  const revertStringsMatch =
    command === "diff"
      ? Object.values(expectedReverts).some((entries) =>
          valuesEqual(manifest.projectRevertStrings, entries)
        )
      : valuesEqual(manifest.projectRevertStrings, expectedReverts);
  if (!revertStringsMatch) {
    const revertDifferences = collectDifferences(
      command === "diff" ? expectedReverts.baseline : expectedReverts,
      manifest.projectRevertStrings,
      "$.projectRevertStrings"
    );
    throw new Error(
      `Project-owned revert strings changed:\n${revertDifferences
        .slice(0, 20)
        .map((difference) => `- ${formatDifference(difference)}`)
        .join("\n")}`
    );
  }
  if (command === "capture") {
    fs.writeFileSync(BASELINE_PATH, stableJson(manifest));
    console.log(
      `Captured ${manifest.tests.hardhat.count} Hardhat and ${
        manifest.tests.forge.count
      } Forge tests in ${path.relative(ROOT, BASELINE_PATH)}`
    );
    return;
  }

  if (!fs.existsSync(BASELINE_PATH)) {
    throw new Error(
      "Compatibility baseline is missing; run the capture command once"
    );
  }
  const baselineBytes = fs.readFileSync(BASELINE_PATH);
  const baseline = JSON.parse(baselineBytes);
  if (
    baseline.projectRevertStrings &&
    !valuesEqual(baseline.projectRevertStrings, protectedRevertStrings)
  ) {
    throw new Error(
      "Compatibility baseline conflicts with the protected revert-string supplement"
    );
  }
  baseline.projectRevertStrings = protectedRevertStrings;
  const existingReview = fs.existsSync(REVIEW_PATH)
    ? readReviewedDifferences()
    : null;
  const inheritedReviewCommand = [
    "check",
    "write-evidence",
    "security-01-negative-probes",
    "security-02-negative-probes",
    "security-03-negative-probes",
    "security-04-negative-probes",
    "stage-10-negative-probes",
    "stage-11-negative-probes",
    "stage-12a-negative-probes",
  ].includes(command);
  const security01ReviewActive =
    command === "write-security-01-review" ||
    (inheritedReviewCommand && existingReview?.policy === SECURITY_01_POLICY);
  const security02ReviewActive =
    command === "write-security-02-review" ||
    (inheritedReviewCommand && existingReview?.policy === SECURITY_02_POLICY);
  const security03ReviewActive =
    command === "write-security-03-review" ||
    (inheritedReviewCommand && existingReview?.policy === SECURITY_03_POLICY);
  const security04ReviewActive =
    command === "write-security-04-review" ||
    (inheritedReviewCommand && existingReview?.policy === SECURITY_04_POLICY);
  const stage10ReviewActive =
    command === "write-stage-10-review" ||
    (inheritedReviewCommand && existingReview?.policy === STAGE_10_POLICY);
  const stage11ReviewActive =
    command === "write-stage-11-review" ||
    (inheritedReviewCommand && existingReview?.policy === STAGE_11_POLICY);
  const stage12aReviewActive =
    command === "write-stage-12a-review" ||
    (inheritedReviewCommand && existingReview?.policy === STAGE_12A_POLICY);
  const comparisonBaseline = stage12aReviewActive
    ? stage12aComparisonBaseline(baseline, manifest)
    : stage11ReviewActive
    ? stage11ComparisonBaseline(baseline, manifest)
    : stage10ReviewActive
    ? stage10ComparisonBaseline(baseline, manifest)
    : security04ReviewActive
    ? security04ComparisonBaseline(baseline, manifest)
    : security03ReviewActive
    ? security03ComparisonBaseline(baseline, manifest)
    : security02ReviewActive
    ? security02ComparisonBaseline(baseline, manifest)
    : security01ReviewActive
    ? security01ComparisonBaseline(baseline, manifest)
    : baseline;
  const differences = collectDifferences(comparisonBaseline, manifest);
  if (command === "diff") {
    console.log(
      stableJson({
        schemaVersion: 1,
        baselineSha256: sha256(baselineBytes),
        differences,
      })
    );
    return;
  }
  if (command === "write-stage-08-review") {
    const review = stage08Review(baselineBytes, differences);
    validateReviewedDifferences(review, baselineBytes, differences);
    const policy = reviewPolicy(review);
    policy.validateCandidate(baseline, manifest);
    validateSafetyEvidence(review);
    fs.writeFileSync(REVIEW_PATH, stableJson(review));
    console.log(
      `Wrote ${
        differences.length
      } exact Stage 8 reviewed differences to ${path.relative(
        ROOT,
        REVIEW_PATH
      )}`
    );
    return;
  }
  if (command === "write-stage-09-review") {
    const review = stage09Review(baselineBytes, differences);
    validateReviewedDifferences(review, baselineBytes, differences);
    const policy = reviewPolicy(review);
    policy.validateCandidate(baseline, manifest);
    validateSafetyEvidence(review);
    fs.writeFileSync(REVIEW_PATH, stableJson(review));
    console.log(
      `Wrote ${
        differences.length
      } exact Stage 9 reviewed differences to ${path.relative(
        ROOT,
        REVIEW_PATH
      )}`
    );
    return;
  }
  if (command === "write-security-01-review") {
    const review = security01Review(baselineBytes, differences);
    validateReviewedDifferences(review, baselineBytes, differences);
    const policy = reviewPolicy(review);
    policy.validateCandidate(baseline, manifest);
    validateSafetyEvidence(review);
    fs.writeFileSync(REVIEW_PATH, stableJson(review));
    console.log(
      `Wrote ${
        differences.length
      } exact Security 01 reviewed differences to ${path.relative(
        ROOT,
        REVIEW_PATH
      )}`
    );
    return;
  }
  if (command === "write-security-02-review") {
    const review = security02Review(baselineBytes, differences);
    validateReviewedDifferences(review, baselineBytes, differences);
    const policy = reviewPolicy(review);
    policy.validateCandidate(baseline, manifest);
    validateSafetyEvidence(review);
    fs.writeFileSync(REVIEW_PATH, stableJson(review));
    console.log(
      `Wrote ${
        differences.length
      } exact Security 02 reviewed differences to ${path.relative(
        ROOT,
        REVIEW_PATH
      )}`
    );
    return;
  }
  if (command === "write-security-03-review") {
    const review = security03Review(baselineBytes, differences);
    validateReviewedDifferences(review, baselineBytes, differences);
    const policy = reviewPolicy(review);
    policy.validateCandidate(baseline, manifest);
    validateSafetyEvidence(review);
    fs.writeFileSync(REVIEW_PATH, stableJson(review));
    console.log(
      `Wrote ${
        differences.length
      } exact Security 03 reviewed differences to ${path.relative(
        ROOT,
        REVIEW_PATH
      )}`
    );
    return;
  }
  if (command === "write-security-04-review") {
    const review = security04Review(baselineBytes, differences);
    validateReviewedDifferences(review, baselineBytes, differences);
    const policy = reviewPolicy(review);
    policy.validateCandidate(baseline, manifest);
    validateSafetyEvidence(review);
    fs.writeFileSync(REVIEW_PATH, stableJson(review));
    console.log(
      `Wrote ${
        differences.length
      } exact Security 04 reviewed differences to ${path.relative(
        ROOT,
        REVIEW_PATH
      )}`
    );
    return;
  }
  if (command === "write-stage-10-review") {
    const review = stage10Review(baselineBytes, differences, manifest);
    validateReviewedDifferences(review, baselineBytes, differences);
    const policy = reviewPolicy(review);
    policy.validateCandidate(baseline, manifest);
    validateSafetyEvidence(review);
    fs.writeFileSync(REVIEW_PATH, stableJson(review));
    console.log(
      `Wrote ${
        differences.length
      } exact Stage 10 reviewed differences to ${path.relative(
        ROOT,
        REVIEW_PATH
      )}`
    );
    return;
  }
  if (command === "write-stage-11-review") {
    const review = stage11Review(baselineBytes, differences, manifest);
    validateReviewedDifferences(review, baselineBytes, differences);
    const policy = reviewPolicy(review);
    policy.validateCandidate(baseline, manifest);
    validateSafetyEvidence(review);
    fs.writeFileSync(REVIEW_PATH, stableJson(review));
    console.log(
      `Wrote ${
        differences.length
      } exact Stage 11 reviewed differences to ${path.relative(
        ROOT,
        REVIEW_PATH
      )}`
    );
    return;
  }
  if (command === "write-stage-12a-review") {
    const review = stage12aReview(baselineBytes, differences, manifest);
    validateReviewedDifferences(review, baselineBytes, differences);
    const policy = reviewPolicy(review);
    policy.validateCandidate(baseline, manifest);
    validateSafetyEvidence(review);
    fs.writeFileSync(REVIEW_PATH, stableJson(review));
    console.log(
      `Wrote ${
        differences.length
      } exact Stage 12a reviewed differences to ${path.relative(
        ROOT,
        REVIEW_PATH
      )}`
    );
    return;
  }
  if (command === "stage-09-negative-probes") {
    const probes = stage09NegativeProbes(baseline, manifest);
    console.log(`Stage 9 negative probes passed: ${probes.join("; ")}`);
    return;
  }
  if (command === "security-01-negative-probes") {
    const review = readReviewedDifferences();
    if (!review || review.policy !== SECURITY_01_POLICY) {
      throw new Error(
        "Security 01 negative probes require the exact Security 01 review"
      );
    }
    validateReviewedDifferences(review, baselineBytes, differences);
    const policy = reviewPolicy(review);
    policy.validateCandidate(baseline, manifest);
    validateSafetyEvidence(review);
    const probes = security01NegativeProbes(baseline, manifest, review);
    console.log(`Security 01 negative probes passed: ${probes.join("; ")}`);
    return;
  }
  if (command === "security-02-negative-probes") {
    const review = readReviewedDifferences();
    if (!review || review.policy !== SECURITY_02_POLICY) {
      throw new Error(
        "Security 02 negative probes require the exact Security 02 review"
      );
    }
    validateReviewedDifferences(review, baselineBytes, differences);
    const policy = reviewPolicy(review);
    policy.validateCandidate(baseline, manifest);
    validateSafetyEvidence(review);
    const probes = security02NegativeProbes(baseline, manifest, review);
    console.log(`Security 02 negative probes passed: ${probes.join("; ")}`);
    return;
  }
  if (command === "security-03-negative-probes") {
    const review = readReviewedDifferences();
    if (!review || review.policy !== SECURITY_03_POLICY) {
      throw new Error(
        "Security 03 negative probes require the exact Security 03 review"
      );
    }
    validateReviewedDifferences(review, baselineBytes, differences);
    const policy = reviewPolicy(review);
    policy.validateCandidate(baseline, manifest);
    validateSafetyEvidence(review);
    const probes = security03NegativeProbes(baseline, manifest, review);
    console.log(`Security 03 negative probes passed: ${probes.join("; ")}`);
    return;
  }
  if (command === "security-04-negative-probes") {
    const review = readReviewedDifferences();
    if (!review || review.policy !== SECURITY_04_POLICY) {
      throw new Error(
        "Security 04 negative probes require the exact Security 04 review"
      );
    }
    validateReviewedDifferences(review, baselineBytes, differences);
    const policy = reviewPolicy(review);
    policy.validateCandidate(baseline, manifest);
    validateSafetyEvidence(review);
    const probes = security04NegativeProbes(baseline, manifest, review);
    console.log(`Security 04 negative probes passed: ${probes.join("; ")}`);
    return;
  }
  if (command === "stage-10-negative-probes") {
    const review = readReviewedDifferences();
    if (!review || review.policy !== STAGE_10_POLICY) {
      throw new Error(
        "Stage 10 negative probes require the exact Stage 10 review"
      );
    }
    validateReviewedDifferences(review, baselineBytes, differences);
    const policy = reviewPolicy(review);
    policy.validateCandidate(baseline, manifest);
    validateSafetyEvidence(review);
    validateOpcodeEvidence(review, baseline, manifest);
    const probes = stage10NegativeProbes(baseline, manifest, review);
    console.log(`Stage 10 negative probes passed: ${probes.join("; ")}`);
    return;
  }
  if (command === "stage-11-negative-probes") {
    const review = readReviewedDifferences();
    if (!review || review.policy !== STAGE_11_POLICY) {
      throw new Error(
        "Stage 11 negative probes require the exact Stage 11 review"
      );
    }
    validateReviewedDifferences(review, baselineBytes, differences);
    const policy = reviewPolicy(review);
    policy.validateCandidate(baseline, manifest);
    validateSafetyEvidence(review);
    validateOpcodeEvidence(review, baseline, manifest);
    const probes = stage11NegativeProbes(baseline, manifest, review);
    console.log(`Stage 11 negative probes passed: ${probes.join("; ")}`);
    return;
  }
  if (command === "stage-12a-negative-probes") {
    const review = readReviewedDifferences();
    if (!review || review.policy !== STAGE_12A_POLICY) {
      throw new Error(
        "Stage 12a negative probes require the exact Stage 12a review"
      );
    }
    validateReviewedDifferences(review, baselineBytes, differences);
    const policy = reviewPolicy(review);
    policy.validateCandidate(baseline, manifest);
    validateSafetyEvidence(review);
    validateOpcodeEvidence(review, baseline, manifest);
    const probes = stage12aNegativeProbes(baseline, manifest, review);
    console.log(`Stage 12a negative probes passed: ${probes.join("; ")}`);
    return;
  }
  const review = existingReview;
  if (command === "write-evidence" && !review) {
    throw new Error(
      "Cannot write evidence without an exact compatibility review"
    );
  }
  if (differences.length > 0 && !review) {
    console.error("Compatibility check failed. First differences:");
    for (const difference of differences.slice(0, 50)) {
      console.error(`- ${formatDifference(difference)}`);
    }
    process.exitCode = 1;
    return;
  }

  validateReviewedDifferences(review, baselineBytes, differences);
  if (review) {
    const policy = reviewPolicy(review);
    if (policy.validateCandidate) policy.validateCandidate(baseline, manifest);
    validateSafetyEvidence(review);
    if (command === "write-evidence") {
      const evidencePath = writeOpcodeEvidence(review, baseline, manifest);
      console.log(
        `Wrote deterministic opcode, bytecode-size, EIP-170, and gas evidence to ${path.relative(
          ROOT,
          evidencePath
        )}`
      );
      return;
    }
    validateOpcodeEvidence(review, baseline, manifest);
  }

  console.log(
    `Compatibility check passed: ${manifest.tests.hardhat.count} Hardhat + ${
      manifest.tests.forge.count
    } Forge tests${
      review
        ? `; ${differences.length} exact reviewed differences for ${review.candidate}`
        : ""
    }`
  );
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
