---
title: Generate your first blueprint
description: Build the Kuberina solver and run it end to end against the bundled homelab dataset.
sidebar:
  order: 1
---

By the end of this tutorial you will have compiled the solver, run it against a
small bundled cluster, and read the blueprint it produces. It takes about ten
minutes, most of which is Rust compiling.

You do not need a Kubernetes cluster. Nothing here touches one.

## Before you start

You need:

- **Rust** (stable) with `cargo`
- **`make`**
- A clone of the repository

```bash
git clone https://github.com/AlexanderSlokov/kuberina.git
cd kuberina
```

:::note[What actually runs]
The optimiser is the Rust crate under `solver/`. The `kuberina` Go binary at
the repository root is currently a stub — the Go frontend described in the
roadmap as `kuberina-forge` is planned, not shipped. Everything in this
tutorial drives the Rust solver.
:::

## Step 1: Build the solver

```bash
make solver-build
```

The first build downloads and compiles dependencies, so expect a few minutes.
Subsequent builds are fast.

## Step 2: Run it against the homelab dataset

The repository ships two datasets. Start with the small one — it solves almost
instantly, which makes it a much better first read than the hyperscale
benchmark.

```bash
make solver-homelab
```

That target expands to a direct invocation of the solver:

```bash
cd solver && cargo run --release -- plan \
  --infra testdata/homelab_infra.yaml \
  --workloads testdata/homelab_workloads.yaml
```

Two inputs go in:

1. **`--infra`** — the cluster topology: node capacity, taints, labels.
2. **`--workloads`** — the pods to place, with their resource requirements.

The solver prints a stowage plan to the console and writes
`solver/kuberina_solution.yaml`.

## Step 3: Read the blueprint

Open `solver/kuberina_solution.yaml`. This is the artifact the whole tool
exists to produce — a concrete placement for every pod, with the constraints
needed to pin it there.

This is the file you would review with your team, argue about, regenerate, and
eventually apply. It is the point of the exercise. Do not skim past it.

## Step 4: Try the hyperscale benchmark

Now run the dataset the paper reports on — 186 nodes and 2,714 pods, named
`irina` after the container ship.

```bash
make solver-irina
```

This is where the genetic algorithm earns its keep. The solver auto-scales its
parameters by problem size: above 500 pods it switches to a population of
1,024 running up to 1,000 generations, and prints a line telling you so.

```text
Datacenter-scale detected (2714 pods) — cranking GA to maximum
```

Expect this to take meaningfully longer than the homelab run.

### Applying the Pareto rule

Real clusters should not be packed to 100% of nominal capacity. The `--pareto`
flag scales node capacity by a percentage, leaving headroom:

```bash
make solver-irina-pareto-80
```

This solves against 80% of each node's capacity while still reporting the plan
against true capacities.

## Step 5: Inspect the result visually

The Python tooling under `research/` validates the solution independently and
renders a cluster heatmap.

```bash
make research-inspect
```

This writes `kuberina_dashboard.html`. Open it in a browser to explore
utilisation node by node.

:::caution[Watch the target name]
The project README refers to this step as `make solver-inspect`. That target
does not exist — the real one is `research-inspect`, which is what this page
uses. The same discrepancy applies to `make solver-irina`, which does exist.
:::

## Step 6: Run the whole pipeline

Once the individual pieces make sense, one target chains them together:
generate test data, solve, inspect, and run the formal mathematical proof.

```bash
make research-full-pipeline
```

This target uses `uv` to manage the Python environment, so you need
[`uv`](https://docs.astral.sh/uv/) installed for the research steps.

## What you have now

You have compiled the optimiser, produced a blueprint for a small cluster and a
hyperscale one, applied a capacity safety margin, and independently validated
the result.

## Where to go next

- [Running the solver](/kuberina/how-to/build-and-run/) — the same operations
  as a task-oriented reference rather than a walkthrough.
- [CLI reference](/kuberina/reference/cli/) — every flag the solver accepts.
- [Why offline scheduling](/kuberina/explanation/offline-scheduling/) — the
  reasoning behind planning placement in advance.
