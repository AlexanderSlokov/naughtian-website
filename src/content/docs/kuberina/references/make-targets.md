---
title: Make targets
description: Every Make target in the Kuberina repository and what it expands to.
sidebar:
  order: 2
---

The repository splits its targets into two families: `solver-*` drives the Rust
optimiser, `research-*` drives the Python validation and analysis tooling.

## Solver targets (Rust)

| Target | Expands to |
|---|---|
| `solver-build` | `cargo build` |
| `solver-test` | `cargo test` |
| `solver-clippy` | `cargo clippy` |
| `solver-lint` | `cargo clippy -- -D warnings && cargo fmt --check` |
| `solver-fmt` | `cargo fmt` |
| `solver-homelab` | `plan` against the bundled homelab dataset |
| `solver-irina` | `plan` against the hyperscale `irina` dataset |
| `solver-irina-pareto-80` | as `solver-irina`, with `--pareto 80` |

All of them run from the `solver/` directory.

### `solver-homelab`

```bash
cd solver && cargo run --release -- plan \
  --infra testdata/homelab_infra.yaml \
  --workloads testdata/homelab_workloads.yaml
```

Small dataset, near-instant. The right target for a first run or a quick
sanity check after a change.

### `solver-irina`

```bash
cd solver && cargo run --release -- plan \
  --infra testdata/irina_infra.yaml \
  --workloads testdata/irina_workloads.yaml
```

The datacenter-scale benchmark — 186 nodes, 2,714 pods. Triggers the
large-tier GA configuration.

### `solver-irina-pareto-80`

The same as above with `--pareto 80`, solving against 80% of node capacity to
leave operational headroom.

## Research targets (Python)

These use [`uv`](https://docs.astral.sh/uv/) to manage dependencies, so `uv`
must be installed.

| Target | Purpose |
|---|---|
| `research-generate-testdata` | Generate the `irina` 8-dimensional test dataset |
| `research-homelab` | Delegate to `research/Makefile`'s `immediate_run` |
| `research-irina` | Delegate to `research/Makefile`'s `irina_stress` |
| `research-inspect` | Validate a solution and render the heatmap dashboard |
| `research-full-pipeline` | Generate → solve → inspect → prove, end to end |

### `research-inspect`

```bash
uv run --with pyyaml python research/inspector.py \
  --infra solver/testdata/irina_infra.yaml \
  --workloads solver/testdata/irina_workloads.yaml \
  --solution solver/kuberina_solution.yaml \
  --output kuberina_dashboard.html
```

Produces `kuberina_dashboard.html`, an interactive cluster heatmap.

:::caution[README discrepancy]
The project README calls this step `make solver-inspect`. No such target
exists — the correct name is `research-inspect`.
:::

### `research-full-pipeline`

The complete validation chain, in four announced stages:

1. Generate 8D test data — `research/gen_irina_testdata.py`
2. Solve against it — `plan` with `--pareto 80`
3. Inspect and validate — `research/inspector.py`
4. Formal mathematical proof — `research/mathematical_proof.py`

This is the target that reproduces the claims in
[the paper](/research/kuberina-stowage-scheduling/). Run it after any change to
the solver's optimisation logic.

Note that this target reads its test data from `research/testdata/` rather than
`solver/testdata/`, because it generates the data itself as step one.
