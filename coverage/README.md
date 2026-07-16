# Forge coverage baseline

`lcov.info` is the checked-in Forge LCOV baseline for production contracts.
The gate rejects overall or per-file line, function, or branch regression. A
new production file must reach at least 90% line and function coverage and 80%
branch coverage.

Run the gate with pinned Foundry 1.7.1:

```console
$ pnpm coverage:forge
```

The LCOV report is byte-bound by `compatibility/safety-baselines.json` and by
the named compatibility-review policy. Do not regenerate it to conceal a
regression. Any deliberate baseline change requires explicit reviewed evidence
in the dependency or compiler stage that caused it.
