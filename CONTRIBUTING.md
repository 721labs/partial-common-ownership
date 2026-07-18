# Contributing

Thank you for helping improve Partial Common Ownership. Before starting, search
the [issue tracker](https://github.com/721labs/partial-common-ownership/issues)
for related work. Open or link an issue before changing a public interface,
storage layout, compiler target, reviewed baseline, or economic behavior.

## Set up the repository

Development is pinned to Node 24.18.0, pnpm 11.13.1, and Foundry 1.7.1. Clone
recursively (or initialize the existing checkout's submodules), then run the
verified bootstrap:

```console
$ git submodule update --init --recursive
$ ./scripts/install.sh
```

The script cannot update its parent shell. Before running project commands in
that terminal, activate the pinned Node and Foundry installations:

```console
$ source "$HOME/.nvm/nvm.sh"
$ nvm use 24.18.0
$ export PATH="$HOME/.foundry/bin:$PATH"
```

See the [development guide](docs/development.md) for the bootstrap checks,
toolchain details, test architecture, and complete local release gate.

## Make and validate changes

Keep each change focused and include a regression test when behavior changes.
`pnpm test` is the normal behavior gate; run the additional change-relevant
commands from the development guide's
[full local release gate](docs/development.md#full-local-release-gate). Record
every command and result in the pull request, including a reason for any gate
that was not applicable.

The compatibility artifacts protect more than ABI shape. They also bind
selectors, events, errors, storage, ERC165 responses, compiler settings,
bytecode, gas, coverage, warnings, and the behavior-test inventory. Read the
[compatibility policy](compatibility/README.md) before changing any of those
surfaces. Never regenerate a compatibility, gas, coverage, or warning baseline
merely to make a candidate pass.

Review contract changes against the PCO economic state machine: acquisition and
takeover pricing, self-assessment, tax collection and foreclosure, beneficiary
behavior, remittance accounting, and Wrapper custody and unwrap paths. Preserve
existing semantics unless the linked issue explicitly authorizes a change, and
document any intended difference with focused tests and compatibility evidence.

For security-sensitive work, follow the repository's [security reporting
instructions](README.md#security), add a regression for the threat or invariant,
and run the relevant fuzz, invariant, static-analysis, and dependency gates.
Do not add unreviewed suppressions or weaken an existing security policy.

Dependency and GitHub Actions updates must follow the append-only maintenance
policy described in the [development guide](docs/development.md#dependency-security-and-maintenance)
and pass `pnpm ci:policy`.

## Open a pull request

Use the pull-request template. Explain the problem and impact, link the issue
with a closing keyword such as `Closes #123`, describe compatibility, economic,
security, and documentation effects, and include validation evidence. Keep the
pull request narrowly scoped and address all required CI jobs before merge.
