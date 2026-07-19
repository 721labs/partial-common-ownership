# Slither 0.11.5 triage

The repository runs exact Slither 0.11.5 with solc 0.8.36 against
`contracts/Wrapper.sol`. That root transitively includes every shipped
production contract and interface while excluding test fixtures and dependency
findings. CI fails on every unsuppressed high- or medium-impact result.

The initial scan reported 36 results: one high, four medium, eight low, and 23
informational. Security 02 resolves the high-impact initialization-order
finding and removes its suppression. Four reviewed medium results retain
localized `slither-disable-next-line` annotations. The gate audits those
annotations against an exact inventory before running Slither; a new
suppression or a moved suppression fails the job. The current scan reports 31
results: zero high/medium, seven low, and 24 informational.

## Resolved high and deferred medium findings

| Detector                 | Impact | Count | Assessment and disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ------ | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reentrancy-eth`         | High   |     1 | Confirmed legacy risk, remediated by Security 02. `PartialCommonOwnership._mint` now performs the explicitly qualified base ERC721 mint, initializes deposit, valuation, beneficiary, tax rate, and collection frequency, and only then invokes the receiver check with the original operator/from/token/data tuple. Qualifying the call intentionally prevents a downstream two-argument `_mint` override from reintroducing a pre-initialization callback. EOA behavior and event order are unchanged. Contract receivers observe complete state and may still accept, transfer, or unwrap during the callback. A wrong selector or revert restores underlying custody and approval, wrapped ownership, PCO and Wrapper mappings, balances, ETH, and receipt logs. |
| `divide-before-multiply` | Medium |     1 | Confirmed legacy rounding behavior in `taxOwedSince`. Reordering the operations changes tax rounding and overflow behavior. Tax arithmetic changes are outside this upgrade, so the current expression remains covered by boundary fuzzing and its correction is deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `incorrect-equality`     | Medium |     3 | Reviewed zero-value guards: no outstanding balance, no remittance amount, and no tax owed. These compare unsigned values with zero rather than using a manipulable price or balance threshold, so the detector's dangerous-equality exploit model does not apply. They are retained because changing the guards would alter control flow or revert behavior; any broader remittance or tax redesign is deferred.                                                                                                                                                                                                                                                                                                                                                     |

The four remaining suppressions acknowledge the reviewed medium-impact
decisions; they do not suppress any high-impact finding.

## Low and informational findings

| Detector                   | Impact        | Count | Assessment and disposition                                                                                                                                                                                                                                                                                 |
| -------------------------- | ------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing-zero-check`       | Low           |     1 | `recipient` is assigned from `msg.sender` in `withdrawOutstandingRemittance`; an EVM message sender cannot be the zero address. No change required.                                                                                                                                                        |
| `reentrancy-benign`        | Low           |     2 | One report follows the underlying NFT callback before Wrapper state is created; the other follows the now fully initialized wrapped-token receiver callback. Security 02 tests accepted, rejected, transfer, and unwrap callback outcomes. Broader callback exclusion would be a separate semantic change. |
| `reentrancy-events`        | Low           |     1 | `LogTokenWrapped` intentionally remains the final outer-wrap event, including when an initialized receiver transfers or unwraps during its callback. Security 02 freezes those orders explicitly; changing them would alter observable behavior.                                                           |
| `timestamp`                | Low           |     3 | Tax accrual and foreclosure intentionally use `block.timestamp`. Boundary behavior is covered by fuzz and invariant tests; changing the time model would change contract economics.                                                                                                                        |
| `reentrancy-unlimited-gas` | Informational |    16 | The existing remittance paths use `send`/`transfer`, but Slither conservatively traces state and events after those calls. Replacing those operations or redesigning remittance reentrancy remains a separately reviewed semantic change.                                                                  |
| `assembly`                 | Informational |     1 | The custom ERC721 uses assembly only to bubble an ERC721 receiver revert payload. This is preserved public revert behavior.                                                                                                                                                                                |
| `dead-code`                | Informational |     2 | The two `_safeMint` overloads are no longer used by `PartialCommonOwnership`, but remain part of the custom ERC721's internal extension surface for source consumers. Removing them is unnecessary for this fix and would make the source-level contract less compatible.                                  |
| `naming-convention`        | Informational |     4 | Existing modifier and parameter names are intentionally retained. Renaming them is unrelated to dependency safety.                                                                                                                                                                                         |
| `unindexed-event-address`  | Informational |     1 | `LogTokenWrapped` indexing is part of the protected event interface and cannot change in this upgrade.                                                                                                                                                                                                     |

The OpenZeppelin upgrade does not replace the custom ERC721. Its concrete
implementation differences, the OpenZeppelin 5.6 zero-owner approval
hardening, receiver semantics, and the London/`mcopy` boundary are reviewed in
[Custom ERC721 versus OpenZeppelin 5.6.1](custom-erc721-vs-openzeppelin-5.6.1.md).

## Reproducing the gate

Install `slither-analyzer==0.11.5`, select solc 0.8.36 with `solc-select`, and
run `pnpm slither`. The runner rejects any other Slither or compiler version,
any suppression-inventory drift, and every untriaged high/medium result.
