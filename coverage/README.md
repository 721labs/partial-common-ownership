# Forge coverage baseline

`lcov.info` is the checked-in Forge LCOV baseline for production contracts.
The gate rejects overall or per-file line, function, or branch regression. A
new production file must reach at least 90% line and function coverage and 80%
branch coverage.

Run the gate with pinned Foundry 1.7.1:

```console
$ pnpm coverage:forge
```

Do not regenerate the report to conceal a regression. Review any deliberate
baseline change together with the contract or test change that caused it.
