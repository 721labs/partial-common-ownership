# Deferred semantic findings

The Stage 7 stateful safety work exposed the following pre-existing contract
behaviors. They were not introduced by the dependency modernization and were
initially frozen because the compatibility policy forbade an unreviewed ERC721
semantic rewrite. The separately authorized security-remediation sequence now
corrects them in independently reviewable changes while retaining the original
finding, regression identifier, and versioned compatibility evidence.

## Nested foreclosure during an ERC721 transfer

`Taxation.collectTax` can foreclose through a nested `_transfer` while the
outer ERC721 transfer hook is running. The outer transfer then continues with
its original `from` address. With multiple tokens owned by that address, this
can leave `ownerOf` and `balanceOf` accounting inconsistent even though the
transferred token's valuation and deposit have been cleared.
The same stale outer-transfer family is reachable when a rounded-zero tax
calculation leaves the epoch collection timestamp in place and a later
valuation increase makes the transfer hook immediately foreclose.

Evidence:
`test/solidity/fuzz/WrapperFuzz.t.sol:test_regression_deferredDelinquentTransferContinuesAfterNestedForeclosure`.

Status: remediated by Security 01. `_transfer` now revalidates ownership after
the hook and before changing approvals, balances, or ownership. If tax
collection performs a nested foreclosure, the stale outer transfer reverts
with the existing incorrect-owner payload and the entire transaction rolls
back. The historical regression identifier is retained, but its assertions now
cover complete rollback across all three authorization modes and all three
ERC721 transfer entry points.

## Taxable ownership after a long beneficiary-owned period

Beneficiary ownership accrues no tax and preserves the prior collection
timestamp. A later taxable owner can therefore be immediately foreclosed.
When that owner calls `selfAssess`, its authorization modifier runs before tax
collection: collection moves custody to the contract, then the function body
can write a nonzero valuation onto contract custody. A later takeover can
revert with `AmountZero` while collecting the zero deposit.

Evidence:
`test/solidity/invariant/PCODeferredRegression.t.sol:test_deferredStage10_pendingForeclosureSelfAssessPreservesLegacyBrickedState`.

## Beneficiary takeover crossing foreclosure

A beneficiary takeover validates the current-valuation payment while the token
still reports its prior owner. Tax collection can then foreclose before
settlement, causing the purchase to be treated as coming from Wrapper. The
beneficiary's payment is neither remitted nor retained as a deposit and remains
as untracked contract surplus.

Evidence:
`test/solidity/fuzz/WrapperFuzz.t.sol:test_regression_deferredBeneficiaryTakeoverAcrossForeclosureLeavesUntrackedValuationSurplus`.

## Unwrap after materialized Wrapper foreclosure

After tax collection materializes foreclosure, Wrapper itself owns the wrapped
token. If the original operator then calls `unwrap`, the method captures
Wrapper as the final owner, burns the wrapper record, and transfers the
underlying token from Wrapper back to Wrapper. The underlying token remains in
custody with no live wrapper metadata or remaining unwrap path.

Evidence:
`test/solidity/fuzz/WrapperFuzz.t.sol:test_regression_deferredForeclosedUnwrapLeavesUnderlyingWithoutWrapperRecord`.

## ERC721 receiver callback before PCO initialization

`PartialCommonOwnership._mint` previously invoked `_safeMint` before setting
the deposit, valuation, beneficiary, tax rate, and collection frequency. A
contract leasee therefore received its ERC721 callback while it owned a
partially initialized token and could reach transfer, taxation, or unwrap
paths from that transient state.

Evidence:
`tests/Wrapper.ts:Wrapper.sol #onERC721Received fails cannot be called directly`
and
`test/solidity/parity/WrapperParity.t.sol:WrapperParityTest:test_onERC721Received_directSafeTransferReverts`.

Status: remediated by Security 02. The base ERC721 mint and all PCO setters now
complete before the same receiver check is invoked. The callback's operator,
zero `from`, wrapped token ID, and empty data are unchanged. EOA event order is
unchanged; a contract callback now occurs after the mint, valuation, and
beneficiary events and before the final `LogTokenWrapped` event. Regression
coverage proves complete initialized state, successful callback-time transfer
and unwrap, exact event order, and full rollback for a wrong selector or
receiver revert. The test-only receiver fixture is excluded from the package.
The base mint is explicitly qualified so a downstream override of the
two-argument `_mint` extension point cannot reintroduce a callback before PCO
initialization; this reviewed internal extensibility restriction is part of the
security correction, while public ABI and storage remain unchanged.

## Disposition

Stage 10 must include the historical findings and their remediation status in
its custom-ERC721-versus-OpenZeppelin 5 security comparison. Security 01 fixes
the nested-foreclosure transfer corruption, and Security 02 fixes the
callback-before-initialization finding. The three remaining semantic findings
stay open until their corresponding authorized security PRs pass the same
compatibility, migration, and deployment review.
