# Deferred semantic findings

The Stage 7 stateful safety work exposed the following pre-existing contract
behaviors. They were not introduced by the dependency modernization, and this
stage intentionally does not change them because the compatibility policy
forbids an ERC721 semantic rewrite. Each behavior has a deterministic
regression test so later dependency changes cannot hide or accidentally alter
it.

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

## Disposition

The [Slither 0.11.5 triage](./slither-0.11.5-triage.md) additionally records
the confirmed callback-before-initialization risk in `_safeMint`, which is not
dismissed as a false positive.

Stage 10 must include these behaviors in its custom-ERC721-versus-OpenZeppelin 5
security comparison. Any semantic correction requires a separately authorized
project with its own compatibility, migration, and deployment analysis; it is
not part of this dependency upgrade.
