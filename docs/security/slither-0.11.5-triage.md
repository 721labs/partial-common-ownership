# Slither 0.11.5 triage

Stage 8 runs exactly Slither 0.11.5 with solc 0.8.36 against
`contracts/Wrapper.sol`. That root transitively includes every shipped
production contract and interface while excluding test fixtures and dependency
findings. CI fails on every unsuppressed high- or medium-impact result.

The initial scan reported 36 results: one high, four medium, eight low, and 23
informational. Five reviewed high/medium results have localized
`slither-disable-next-line` annotations. The gate audits those annotations
against an exact inventory before running Slither; a new suppression or a moved
suppression fails the job. After triage, Slither reports zero high/medium, eight
low, and 23 informational results.

## Deferred high and medium findings

| Detector                 | Impact | Count | Assessment and disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------ | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reentrancy-eth`         | High   |     1 | Confirmed legacy risk, not a false positive. `PartialCommonOwnership._mint` calls `_safeMint` before initializing deposit, valuation, beneficiary, tax rate, and collection frequency. A contract receiver can call back while it owns a partially initialized token and reach public transfer, tax, or unwrap paths. Reordering initialization, changing safe-mint behavior, or adding a lock would change observable event/revert/reentrancy semantics. The upgrade policy expressly defers that redesign; Stage 10 must carry this into the custom-ERC721 security comparison and a separately authorized security project must resolve it. |
| `divide-before-multiply` | Medium |     1 | Confirmed legacy rounding behavior in `taxOwedSince`. Reordering the operations changes tax rounding and overflow behavior. Tax arithmetic changes are outside this upgrade, so the current expression remains covered by boundary fuzzing and its correction is deferred.                                                                                                                                                                                                                                                                                                                                                                     |
| `incorrect-equality`     | Medium |     3 | Reviewed zero-value guards: no outstanding balance, no remittance amount, and no tax owed. These compare unsigned values with zero rather than using a manipulable price or balance threshold, so the detector's dangerous-equality exploit model does not apply. They are retained because changing the guards would alter control flow or revert behavior; any broader remittance or tax redesign is deferred.                                                                                                                                                                                                                               |

Suppressions acknowledge the review decision; they do not assert that the
callback-before-initialization path is safe.

## Low and informational findings

| Detector                   | Impact        | Count | Assessment and disposition                                                                                                                                                                                                                                                                                             |
| -------------------------- | ------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing-zero-check`       | Low           |     1 | `recipient` is assigned from `msg.sender` in `withdrawOutstandingRemittance`; an EVM message sender cannot be the zero address. No change required.                                                                                                                                                                    |
| `reentrancy-benign`        | Low           |     2 | Both reports follow ERC721 receiver callbacks in `Wrapper.wrap`. They overlap the confirmed initialization-order risk above and remain deferred with it.                                                                                                                                                               |
| `reentrancy-events`        | Low           |     2 | Event-order observations arise from the same ERC721 callback and the legacy push-remittance flow. Event order is a protected public behavior, so changes are deferred.                                                                                                                                                 |
| `timestamp`                | Low           |     3 | Tax accrual and foreclosure intentionally use `block.timestamp`. Boundary behavior is covered by fuzz and invariant tests; changing the time model would change contract economics.                                                                                                                                    |
| `reentrancy-unlimited-gas` | Informational |    16 | The existing remittance paths use `send`/`transfer`, but Slither conservatively traces state and events after those calls. The plan explicitly forbids replacing those operations or redesigning reentrancy in this compiler-only stage. These reports do not negate the separate confirmed `_safeMint` callback risk. |
| `assembly`                 | Informational |     1 | The custom ERC721 uses assembly only to bubble an ERC721 receiver revert payload. This is preserved public revert behavior.                                                                                                                                                                                            |
| `solc-version`             | Informational |     1 | Production ranges still permit older compilers in Stage 8, while repository tooling and CI compile exactly with 0.8.36. The shipped minimum rises in the separately gated OpenZeppelin 5 stage.                                                                                                                        |
| `naming-convention`        | Informational |     4 | Existing modifier and parameter names are compatibility-protected. Renaming them is unrelated to dependency safety.                                                                                                                                                                                                    |
| `unindexed-event-address`  | Informational |     1 | `LogTokenWrapped` indexing is part of the protected event interface and cannot change in this upgrade.                                                                                                                                                                                                                 |

## Reproducing the gate

Install `slither-analyzer==0.11.5`, select solc 0.8.36 with `solc-select`, and
run `pnpm slither`. The runner rejects any other Slither or compiler version,
any suppression-inventory drift, and every untriaged high/medium result.
