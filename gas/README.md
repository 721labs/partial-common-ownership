# Key-flow gas baseline

`key-flows.snap` is the deterministic Forge snapshot for the twelve production
flows selected in `scripts/check-gas.cjs`. The gate uses seed `0x721` and blocks
an increase larger than the greater of 3% or 2,000 gas for any entry.

Run the gate with pinned Foundry 1.7.1:

```console
$ pnpm gas:check
```

The snapshot is byte-bound by `compatibility/safety-baselines.json` and by the
named compatibility-review policy. Do not regenerate it to conceal a
regression. A compiler or dependency stage may update it only with an explicit
old/new review and successful behavior, size, and compatibility gates.
