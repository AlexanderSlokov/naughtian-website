---
title: Why offline scheduling
description: The case for computing pod placement before deployment instead of during it.
sidebar:
  order: 1
---

This page explains the reasoning behind Kuberina's central design choice. It
does not tell you how to run anything — see
[the tutorial](/kuberina/tutorials/first-blueprint/) for that.

## What the default scheduler optimises for

`kube-scheduler` is very good at the job it was designed to do. It makes
placement decisions at millisecond latency, on a first-come, first-served
basis, whenever a resource gap appears. For homogeneous, stateless
microservices this is exactly right — the cost of a slightly suboptimal
placement is low, and the value of deciding quickly is high.

The design assumption is that pods are interchangeable and nodes are
interchangeable. When both hold, greedy first-fit is close enough to optimal
that nothing better is worth the latency.

## Where the assumption breaks

Clusters stopped being homogeneous. GPUs, TPUs, memory-optimised instances and
varied network topologies mean nodes now differ along many dimensions at once,
and so do the workloads competing for them.

Under those conditions greedy first-fit has a predictable failure mode. Because
the scheduler evaluates each pod individually as it arrives in the queue, it
cannot see what is coming next. Placements that are locally reasonable
accumulate into **spatial fragmentation**: aggregate capacity remains, but it is
shattered across partially filled nodes.

A high-density workload submitted later finds no single node that fits it,
despite the cluster having ample total capacity. It goes unschedulable.

The usual response is to let the autoscaler provision more infrastructure —
inflating cost without a proportional gain in work done. Industry analyses
consistently report cloud environments running at only 30–40% average CPU
utilisation. That gap is what fragmentation costs.

:::note[This is not a bug in kube-scheduler]
Nothing here is a criticism of the default scheduler's implementation. It is a
statement about the limits of *any* online greedy algorithm facing a problem
whose optimal solution requires knowing the whole workload set in advance.
:::

## The offline reformulation

If the problem is that decisions are made without knowledge of the full
workload, the fix is to make them when that knowledge exists — before anything
is deployed.

Kuberina treats placement as a **Multi-Dimensional Bin Packing Problem**: given
the complete set of pods and the complete set of nodes, find an assignment that
minimises fragmentation subject to hard constraints. MDBP is NP-hard, which is
precisely why it cannot be solved in the milliseconds a runtime scheduler has.

Offline, the budget changes. Seconds are acceptable. That is enough time for a
genetic algorithm to explore millions of scenarios, and for a constraint solver
to prove the result feasible.

The output is **declarative placement**: a blueprint of the intended cluster
state, computed entirely separately from the running cluster.

## The second, larger argument

Utilisation is the easy sell. The more interesting claim is about
*auditability*.

Today `kube-scheduler` decides inside a black box. Nobody reviews the decision,
nobody debates it, and when Node 7 sits at 98% CPU while Node 12 sits at 15%,
nobody can explain why — because the reasoning was never written down anywhere.

A blueprint changes what kind of object a scheduling decision is. It becomes a
concrete YAML artifact your team can open, inspect, challenge and iterate on:

```text
kuberina plan → blueprint.yaml

"Move Loki to Node 4, it's stressing frontend disk I/O."
"Rejected — Node 4 has Redis, kernel tuning conflict. Add a rule instead."

kuberina plan → blueprint-v2.yaml
```

This is the same transformation Git performed on code — reviewable diffs
instead of FTP uploads — and Terraform performed on infrastructure —
`terraform plan` instead of clicking in a console. In both cases the technical
mechanism mattered less than the cultural shift it enabled: decisions became
reviewable, so they started being reviewed.

A placement backed by 2,000 generations of evolutionary optimisation across
millions of scenarios is a far more defensible artifact than a whiteboard
diagram justified with "ten years of experience" and "trust me".

## What this deliberately does not replace

Offline planning does not eliminate the need for runtime scheduling, and
Kuberina does not try to.

- **The cluster still needs a scheduler.** Kuberina emits constraints —
  `nodeSelector`, affinity, tolerations — that the existing scheduler then
  honours. It is a planner, not a replacement.
- **It never touches a running cluster.** No interference with
  `kube-apiserver`, no added latency, nothing to fail at runtime.
- **It does not handle autoscaling** or react to live conditions. Anything
  genuinely dynamic remains the runtime scheduler's job.

Tools like Volcano, Kueue and YuniKorn improve decisions *within* the dynamic
paradigm. Kuberina occupies a complementary position: it computes the plan
offline, and those schedulers execute it.

## Further reading

- [The maritime isomorphism](/kuberina/explanation/maritime-isomorphism/) —
  where the mathematics comes from.
- [The paper](/research/kuberina-stowage-scheduling/) — formal problem
  definition, method, and experimental results.
