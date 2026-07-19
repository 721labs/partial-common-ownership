# Deferred semantic findings

The stateful safety work exposed the following pre-existing contract behaviors.
They were not introduced by the dependency modernization. The subsequent
security-remediation sequence corrected them in independently reviewable
changes while retaining the original findings and regression identifiers.

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

Status: the stale-authorization and bricked-state subfinding is remediated by
Security 03. `selfAssess`, `deposit`, `withdrawDeposit`, and `exit` retain their
original authorization check, collect tax, and then repeat the same
authorization check against the actual post-collection owner and approvals. If
collection forecloses, the mutation reverts with the existing ERC721
authorization payload and rolls back custody, approvals, tax, remittance or
outstanding-remittance accounting, Ether, and function-specific effects. The
retained regression identifier covers owner, token-approved, and
approved-for-all callers across all four mutations, including a zero-value
withdrawal, followed by a successful third-party foreclosure purchase.
Security 03 does not change the beneficiary tax exemption or its inherited
collection-timestamp semantics; immediate pending foreclosure after a long
beneficiary-owned period remains a documented mechanism behavior, but it can
no longer be converted into the nonzero-valuation contract-custody bricked
state through these mutations.

## Beneficiary takeover crossing foreclosure

A beneficiary takeover validates the current-valuation payment while the token
still reports its prior owner. Tax collection can then foreclose before
settlement, causing the purchase to be treated as coming from Wrapper. The
beneficiary's payment is neither remitted nor retained as a deposit and remains
as untracked contract surplus.

Evidence:
`test/solidity/fuzz/WrapperFuzz.t.sol:test_regression_deferredBeneficiaryTakeoverAcrossForeclosureLeavesUntrackedValuationSurplus`.

Status: remediated by Security 03. Payment validation now runs after tax
collection and uses the actual owner after collection. A beneficiary pays zero
when buying from contract custody and exactly the prior valuation when buying
from an external seller. A non-beneficiary supplies any positive deposit when
buying from contract custody and more than the prior valuation when buying
from an external seller. The three existing revert strings and their source
callsite count are unchanged. The retained regression identifier proves exact
rollback and lock release for the formerly accepted beneficiary payment, a
zero-value beneficiary retry without surplus, and a non-beneficiary purchase
with a positive deposit below the pre-foreclosure valuation. Stateful Wrapper
coverage now exercises the previously excluded crossing-foreclosure path.

## Unwrap after materialized Wrapper foreclosure

After tax collection materializes foreclosure, Wrapper itself owns the wrapped
token. If the original operator then calls `unwrap`, the method captures
Wrapper as the final owner, burns the wrapper record, and transfers the
underlying token from Wrapper back to Wrapper. The underlying token remains in
custody with no live wrapper metadata or remaining unwrap path.

Evidence:
`test/solidity/fuzz/WrapperFuzz.t.sol:test_regression_deferredForeclosedUnwrapLeavesUnderlyingWithoutWrapperRecord`.

Status: remediated by Security 04. `unwrap` preserves the existing nonexistent-
token and originator checks, captures the wrapped token's current owner, and
then rejects Wrapper as its own underlying-token destination with the existing
`DestinationContractAddress` custom error. The rejection occurs before wrapper
metadata deletion or burn, commits no events or state changes, and leaves both
the live wrapper record and underlying custody intact. A buyer can acquire the
foreclosed wrapped token from contract custody, after which the original
operator can unwrap it and deliver the underlying token to that buyer. A
pending foreclosure that has not yet transferred wrapped-token ownership to
Wrapper retains its prior successful collection-and-unwrap behavior.

The same destination guard prevents metadata loss after a non-safe transfer of
a live wrapped token directly to Wrapper. Security 04 does not change or
reclassify the tax, deposit, or ownership-accounting semantics of that raw
wrapped-token transfer, nor does it change the handling of raw underlying-token
transfers; those adjacent direct-transfer concerns remain outside this fix.

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

The
[custom-ERC721-versus-OpenZeppelin 5.6.1 comparison](custom-erc721-vs-openzeppelin-5.6.1.md)
records these historical findings and their remediation status. Security 01
fixes the nested-foreclosure transfer corruption, Security 02 fixes the
callback-before-initialization finding, and Security 03 fixes post-collection
authorization plus takeover payment classification. Security 04 fixes
self-destination unwrap custody and metadata loss. The beneficiary exemption
and inherited collection timestamp remain unchanged, deferred mechanism
semantics. Adjacent direct-transfer accounting concerns are not reclassified by
this fix and require separately authorized security, migration, and
deployment review.
