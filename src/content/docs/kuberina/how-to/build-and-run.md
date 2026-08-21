---
title: Build and run the solver
description: Compile Kuberina, run it against your own cluster data, and validate the result.
sidebar:
  order: 1
---

Task-oriented recipes for driving the solver. If you have never run Kuberina
before, start with [the tutorial](/kuberina/tutorials/first-blueprint/)
instead — this page assumes you know what a blueprint is.

## Compile the solver

```bash
make solver-build
```

For an optimised binary, the run targets already pass `--release`. If you want
to build one directly:

```bash
cd solver && cargo build --release
```

## Run against your own cluster

Point the solver at your own topology and workload files:

```bash
cd solver
cargo run --release -- plan \
  --infra /path/to/your_infra.yaml \
  --workloads /path/to/your_workloads.yaml
```

The blueprint is written to `solver/kuberina_solution.yaml` relative to the
working directory.

Use the bundled `solver/testdata/homelab_infra.yaml` and
`solver/testdata/homelab_workloads.yaml` as the schema reference for your own
files.

## Leave capacity headroom

Packing to nominal capacity leaves nothing for spikes, kernel overhead or the
daemonsets you forgot about. Scale every node's capacity down before solving:

```bash
cargo run --release -- plan \
  --infra testdata/irina_infra.yaml \
  --workloads testdata/irina_workloads.yaml \
  --pareto 80
```

The plan is still reported against true capacities — the cap applies only
during solving.

## Validate a blueprint independently

The Python inspector re-checks the solution against the inputs and renders a
heatmap, without trusting the solver's own reporting:

```bash
make research-inspect
```

To validate a solution other than the default paths, call the script directly:

```bash
uv run --with pyyaml python research/inspector.py \
  --infra solver/testdata/irina_infra.yaml \
  --workloads solver/testdata/irina_workloads.yaml \
  --solution solver/kuberina_solution.yaml \
  --output kuberina_dashboard.html
```

Open the resulting `kuberina_dashboard.html` in a browser.

## Regenerate the benchmark data

The hyperscale dataset is generated, not committed as fixed input:

```bash
make research-generate-testdata
```

## Run the full validation pipeline

Generate data, solve, inspect, and run the formal mathematical proof in one
command:

```bash
make research-full-pipeline
```

This is the target to run when you have changed the solver and want to confirm
you have not broken the result the paper reports.

## Run the test suite

```bash
make solver-test
```

## Lint before opening a pull request

```bash
make solver-lint
```

This runs `cargo clippy -- -D warnings` and `cargo fmt --check` together, so it
fails on anything CI would reject. To fix formatting rather than just check it:

```bash
make solver-fmt
```

:::note[Contributions require a CLA]
Because of the [planned licence
transitions](/kuberina/reference/licensing/), pull requests require agreeing to
a Contributor License Agreement. It grants the project the right to re-license
your contribution under the roadmap.
:::

## Related

- [Make target reference](/kuberina/reference/make-targets/) — every target,
  with what it expands to.
- [CLI reference](/kuberina/reference/cli/) — the `plan` subcommand in detail.
