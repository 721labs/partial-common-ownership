## Scope

<!-- What changed, why is it needed, and what is the user or developer impact? -->

## Related issue

<!-- Use a closing keyword when appropriate, for example: Closes #123 -->

## Validation

<!-- List every command or manual check and its result. Explain skipped gates. -->

| Command or check | Result |
| --- | --- |
| `pnpm test` | |

## Compatibility and economic semantics

<!-- Check one and explain any intended change below. -->

- [ ] No public-compatibility or economic-semantic change
- [ ] Changes are intended and authorized by the linked issue

<!--
Review ABI/selectors, events/errors/reverts, storage, ERC165 responses, compiler
settings, bytecode, gas/coverage/warning baselines, and test inventory. Also
review acquisition/takeover pricing, self-assessment, tax/foreclosure,
beneficiary behavior, remittances, and Wrapper custody/unwrap semantics.
Describe evidence and named compatibility policy updates, if applicable.
-->

## Security

<!--
Describe the security impact or why there is none. Consider authorization after
state transitions, external calls and receiver callbacks, reentrancy, ETH and
remittance accounting, foreclosure, and custody. Identify added regression,
fuzz, invariant, Slither, and dependency-audit coverage as applicable.
-->

## Documentation

- [ ] Contributor or user documentation is updated where behavior or workflow
      changed
- [ ] No documentation change is needed; explanation provided below

<!-- Link changed documentation or explain why it is not needed. -->

## Checklist

- [ ] The pull request is narrowly scoped and contains no unrelated changes
- [ ] Tests cover changed behavior and important failure paths
- [ ] Reviewed compatibility, gas, coverage, or warning baselines were not
      refreshed only to make checks pass
- [ ] Validation evidence above matches the submitted commit
