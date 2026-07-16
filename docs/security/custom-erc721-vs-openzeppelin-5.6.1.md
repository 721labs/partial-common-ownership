# Custom ERC721 versus OpenZeppelin 5.6.1

## Scope and conclusion

Stage 10 upgrades the declared runtime dependency to exact
`@openzeppelin/contracts@5.6.1`, but it does not replace the project's custom
ERC721 implementation. Production uses OpenZeppelin's `IERC721`,
`IERC721Receiver`, `IERC721Metadata`, `Context`, and `ERC165` sources. Ownership,
approval, transfer, mint, burn, receiver, taxation-hook, storage, event, and
revert behavior continues to come from
`contracts/token/modules/ERC721.sol` and the PCO modules built on it.

The comparison found no critical or high-impact OpenZeppelin 5.6 hardening that
can be applied to this implementation without either being structurally
irrelevant or changing a compatibility-protected behavior. In particular, the
OpenZeppelin 5.6 zero-owner approval hardening addresses a hidden-mint path
that this implementation cannot reach. The four project-specific findings
identified by the Foundry safety work were corrected independently by Security
01 through Security 04 and remain covered after the dependency upgrade.

This is a source-level security comparison backed by the repository's behavior,
fuzz, invariant, static-analysis, and compatibility gates. It is not an
independent third-party audit.

## Dependency boundary

OpenZeppelin 5.6.0 changed its concrete ERC721 implementation to reject both a
zero owner and a zero operator in `_setApprovalForAll`. Its release notes say
that the former condition could create an obfuscated mint permission. The
[upstream discussion](https://github.com/OpenZeppelin/openzeppelin-contracts/pull/6171)
shows the concrete failure mode: an operator approved for `address(0)` could
use OpenZeppelin's unified `_update` path to turn a transfer of a nonexistent
token into a mint. OpenZeppelin 5.6.1 retains that hardening; its additional
release change concerns `InteroperableAddress`, which this project does not
import. See the official [5.6.0 release](https://github.com/OpenZeppelin/openzeppelin-contracts/releases/tag/v5.6.0)
and [5.6.1 release](https://github.com/OpenZeppelin/openzeppelin-contracts/releases/tag/v5.6.1).

Because the project does not inherit OpenZeppelin's concrete `ERC721`, new
concrete-implementation semantics do not silently enter the contracts. The
dependency supplies reviewed interfaces and utility bases while the complete
custom state machine remains visible and compatibility-tested in this
repository.

## Behavior retained intentionally

| Area                     | Project implementation                                                                                                                                                         | OpenZeppelin 5.6.1                                                                                | Stage 10 disposition                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| ERC165                   | Reports `IERC165` and core `IERC721`. Wrapper's metadata function does not change the base answer.                                                                             | Concrete ERC721 also reports `IERC721Metadata`.                                                   | Preserve the existing answers exactly.                    |
| Metadata                 | The base has no name, symbol, or URI storage. Wrapper delegates `tokenURI` to the underlying NFT.                                                                              | Concrete ERC721 stores name and symbol and builds token URIs.                                     | Do not add storage or interfaces.                         |
| Storage                  | Four mappings retain the frozen owner, balance, token-approval, and operator-approval order.                                                                                   | Concrete ERC721 has a different layout that includes name and symbol.                             | A rebase would violate storage compatibility.             |
| Transfer extension point | `_beforeTokenTransfer` collects tax; `_afterTokenTransfer` resets per-transfer tax.                                                                                            | Version 5 uses `_update` rather than the legacy before/after hook model.                          | Keep the hooks and their reviewed reentrancy protections. |
| Authorization failures   | Legacy project-owned revert strings are part of the public behavior.                                                                                                           | Version 5 generally uses IERC-6093 custom errors.                                                 | Preserve every existing payload and call ordering.        |
| Token approvals          | Approving the current owner reverts. Approval is cleared with an `Approval` event before each transfer or burn.                                                                | Approving the current owner is permitted; transfer-time clearing suppresses the `Approval` event. | Preserve approval behavior and event order.               |
| Operator approvals       | Self-approval reverts. A nonzero owner may set the zero operator, producing inert state and an event.                                                                          | Self-approval is permitted, but zero owners and zero operators revert.                            | Preserve the existing externally observable semantics.    |
| Mint and burn            | Dedicated `_mint` and `_burn` paths enforce existence and zero-address rules and invoke both hooks.                                                                            | Mint, transfer, and burn share `_update`.                                                         | Do not adopt `_update` or change hook/event ordering.     |
| Safe receivers           | Calls receivers only when `to.code.length > 0`; accepts only the selector, converts an empty failure or wrong selector to the legacy string, and bubbles nonempty revert data. | Uses the same code-length boundary, but reports invalid receivers with a custom error.            | Preserve the legacy payloads and callback tuple.          |

These differences are not evidence that either design is generally preferable.
They explain why replacing the custom implementation would be a semantic and
storage migration, not a dependency-only upgrade.

## OpenZeppelin 5.6 zero-owner hardening

The upstream hidden-mint condition is structurally absent here even though the
custom internal `_setApprovalForAll` does not add a new zero-owner guard:

1. Public `setApprovalForAll` supplies `_msgSender()` as the owner. An EVM
   message sender cannot be `address(0)`.
2. A derived contract could call `_setApprovalForAll(address(0), operator, true)`, but the resulting mapping entry cannot authorize a transfer of a
   nonexistent token.
3. Both public transfer entry points first execute `_onlyApprovedOrOwner`, whose
   `_tokenMinted` check requires `_owners[tokenId] != address(0)` before any
   operator approval is consulted.
4. The internal `_transfer` path independently calls `ownerOf(tokenId)` and
   reverts for a nonexistent token. It never interprets a zero owner as a mint.
5. `_mint` is the only path that creates ownership, and it does not consult
   operator approvals.

OpenZeppelin's affected shape relied on one `_update` operation representing
mint, transfer, and burn. This implementation has no equivalent path. Adding a
new internal zero-owner revert would therefore not close a reachable mint
primitive, but could change inherited-extension behavior and revert data. Such
a change is outside Stage 10.

The adjacent zero-operator difference is also retained. An approval for
`address(0)` cannot be exercised by an EVM caller, while its state and
`ApprovalForAll` event are observable and compatibility-protected. Changing it
requires a separately authorized semantic proposal.

## Receiver behavior and construction-time addresses

OpenZeppelin 4's removed `Address.isContract` helper returned
`account.code.length > 0`. Stage 10 spells out that same expression directly,
so the receiver boundary is unchanged:

- EOAs skip `onERC721Received`.
- A deployed receiver must return the exact selector.
- An incorrect selector or an empty revert produces the existing project
  receiver string.
- Nonempty receiver revert data is bubbled unchanged.
- A contract under construction has zero code length and is treated like an
  EOA. OpenZeppelin 5's `ERC721Utils` has the same construction-time behavior.

The construction-time case is a property of the ERC721 receiver convention,
not a new Stage 10 bypass. Dedicated regression coverage freezes it alongside
EOA, valid receiver, incorrect-return, and reverting-receiver outcomes.

PCO minting has an additional project-specific rule established by Security
02: the base ERC721 ownership write and all PCO deposit, valuation,
beneficiary, tax-rate, and frequency initialization complete before a contract
receiver is called. The receiver still observes the original operator, zero
`from`, token ID, and data, and a rejected callback rolls back the entire wrap.

## Project-specific security remediations

| Change      | Risk addressed                                                                                                                                  | Preserved result                                                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security 01 | Tax collection could perform a nested foreclosure transfer while an outer ERC721 transfer continued with stale ownership.                       | `_transfer` rechecks ownership after the hook and before approval, balance, or ownership writes. A stale outer transfer rolls back with the existing incorrect-owner payload. |
| Security 02 | A receiver callback could observe and act on a partially initialized PCO token.                                                                 | PCO state is complete before the callback; callback arguments and EOA event order remain unchanged, and rejection fully rolls back.                                           |
| Security 03 | Tax collection could invalidate an earlier authorization or change the seller classification used for takeover payment.                         | Mutations recheck authorization after collection, and takeover payment uses post-collection ownership. Existing payloads and remittance behavior remain intact.               |
| Security 04 | An originator could unwrap after materialized Wrapper foreclosure, burn the wrapper record, and transfer the underlying from Wrapper to itself. | Unwrap rejects Wrapper as its own destination before deletion or burn, using the existing `DestinationContractAddress` error.                                                 |

These fixes are described with their retained regression identifiers in
[Deferred semantic findings](deferred-semantic-findings.md). Stage 10 neither
reverts them nor broadens them into a general ERC721 rewrite.

## Deferred and intentionally unchanged concerns

The following remain outside this dependency upgrade:

- The beneficiary tax exemption preserves the prior collection timestamp. A
  subsequent taxable owner can therefore have immediately pending foreclosure,
  although Security 03 prevents the previously documented bricked mutation.
- Tax calculation retains its divide-before-multiply order and legacy rounding
  and overflow behavior.
- Remittance retains `send`/`transfer` and the outstanding-remittance fallback.
- Receiver callbacks remain reentrant after complete state initialization;
  their accepted, transfer, unwrap, rejection, and event-order outcomes are
  explicitly tested.
- Raw transfers of wrapped or underlying tokens can have accounting or custody
  consequences outside the reviewed wrap/unwrap flow. Security 04 addresses
  only the proven self-destination metadata-loss path.
- Approval-to-current-owner, self-operator, zero-operator, legacy revert, and
  approval-event differences are not normalized to OpenZeppelin 5.

Any change to those items needs an independently authorized compatibility,
migration, and deployment review.

## London and `mcopy` compatibility boundary

The repository continues to compile production for the London EVM. The
concrete OpenZeppelin 5.6.1
[`ERC721.sol`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.6.1/contracts/token/ERC721/ERC721.sol)
uses Solidity `^0.8.24` and imports `Strings`, whose `Bytes` dependency uses the
Cancun [`MCOPY`](https://eips.ethereum.org/EIPS/eip-5656) instruction. A global
London compilation that includes that concrete contract therefore fails even
under solc 0.8.36.

The shipped project closure does not import the concrete OpenZeppelin ERC721,
`Strings`, or `Bytes`. It imports only the interfaces, `Context`, and `ERC165`
needed by the custom implementation, so all 13 production sources can advertise
`^0.8.20` while repository builds remain pinned to solc 0.8.36 and London.
Test fixtures likewise avoid inheriting the concrete OpenZeppelin ERC721.

The packed-consumer gate proves direct Wrapper import and a concrete PCO
subclass in clean Hardhat and Forge consumers using London. A downstream
project that separately imports OpenZeppelin 5.6.1's concrete ERC721 must use a
compatible Cancun compiler profile for that source or avoid that import; this
package does not silently change the downstream EVM target.

## Required verification

Stage 10 remains blocked unless all of the following hold:

- Production ABI, selectors, events, errors, storage, enums, ERC165 answers,
  project revert strings, and deterministic behavior are hard-equal to the
  Security 04 checkpoint.
- Compiler-generated opcode, bytecode-size, and gas differences are captured
  and reviewed, with both production contracts below EIP-170.
- The complete Hardhat oracle, mapped Forge suite, receiver matrix, fuzzing,
  invariants, coverage, package consumers, and warning inventories pass.
- Slither 0.11.5 reports no untriaged high- or medium-impact finding.

A mismatch stops the upgrade; it is not grounds to regenerate or weaken a
baseline.
