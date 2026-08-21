---
title: CLI reference
description: The Kuberina solver command line interface as currently implemented.
sidebar:
  order: 1
---

:::caution[Two binaries, one name]
This page documents the **Rust solver** under `solver/`, which is the component
that actually performs optimisation today.

The `kuberina` Go binary at the repository root is a stub that prints a banner.
The full Go frontend — `kuberina-forge`, which will ingest Helm charts,
Kustomize output and cloud API state — is [planned for
v0.3.0](/ecosystem/roadmap/), not shipped.
:::

## Synopsis

```text
kuberina <COMMAND>
```

Declared name: `kuberina`.
Description: *Maritime stowage-inspired K8s scheduling optimizer*.

## Commands

### `plan`

Generate an optimised scheduling blueprint.

```text
kuberina plan --infra <PATH> --workloads <PATH> [--pareto <PERCENT>]
```

| Flag | Type | Required | Description |
|---|---|---|---|
| `--infra` | path | yes | Cluster topology YAML — node capacity, taints, labels |
| `--workloads` | path | yes | Workload manifests YAML — pods and their resource requirements |
| `--pareto` | float | no | Scale node capacity by this percentage while solving, e.g. `80` |

`plan` is currently the only subcommand.

#### Output

The blueprint is printed to the console and written to
`kuberina_solution.yaml` in the working directory.

When `--pareto` is supplied, solving happens against the scaled capacities, but
the printed blueprint reports against the true net capacities — so the numbers
you read are real, not the derated ones.

#### Invoking it through cargo

The Make targets wrap `cargo run`, which needs `--` to separate cargo's own
arguments from the program's:

```bash
cd solver
cargo run --release -- plan --infra testdata/homelab_infra.yaml \
                            --workloads testdata/homelab_workloads.yaml
```

## Solver behaviour

### Automatic GA sizing

The genetic algorithm's parameters are selected from the problem size rather
than configured by flag. The tiers are:

| Pods | Population | Max generations | Notes |
|---|---|---|---|
| Under 100 | 128 | — | Quick convergence |
| 100–500 | 256 | 500 | Standard GA, early stop after 100 |
| Over 500 | 1,024 | 1,000 | Datacenter-scale; early stop after 200 |

At datacenter scale the solver announces the switch on stderr:

```text
Datacenter-scale detected (2714 pods) — cranking GA to maximum
```

Large-tier tuning also sets tournament size 5, mutation rate 0.03, crossover
rate 0.85, and a fixed random seed of 42 — so runs are reproducible.

### Pipeline phases

A `plan` invocation runs the three-phase hybrid pipeline described in the
paper, preceded by a daemonset pre-deduction pass:

| Phase | Step | Purpose |
|---|---|---|
| 0 | Daemonset pre-deduction | Subtract per-node daemonset overhead from capacity before packing |
| 1 | Vector Packing FFD | First-Fit Decreasing warm start, giving the GA a sane initial population |
| 2 | Genetic Algorithm | Evolutionary optimisation with gang-aware repair |
| 3 | CSP forward checking | Constraint enforcement, guaranteeing a feasible result |

## See also

- [Make targets](/kuberina/reference/make-targets/) — the wrappers around these
  invocations.
- [The paper](/research/kuberina-stowage-scheduling/) — the mathematics behind
  each phase.
