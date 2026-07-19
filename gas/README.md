# Key-flow gas baseline

`key-flows.snap` is the deterministic Forge snapshot for the twelve production
flows selected in `scripts/check-gas.cjs`. The gate uses seed `0x721` and blocks
an increase larger than the greater of 3% or 2,000 gas for any entry.

Run the gate with pinned Foundry 1.7.1:

```console
$ pnpm gas:check
```

Do not regenerate the snapshot merely to conceal a regression. Review any
intentional update together with its contract changes and confirm the behavior,
gas, and size checks before committing the new values.
