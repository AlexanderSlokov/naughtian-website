---
title: The maritime isomorphism
description: Why a Kubernetes scheduler borrows its mathematics from container ship stowage planning.
sidebar:
  order: 2
---

Kuberina's central claim is not a metaphor. The argument is that Kubernetes pod
scheduling and maritime container stowage are **structurally isomorphic** —
that every constraint in one domain has an exact counterpart in the other, and
therefore that decades of operations research on stowage planning transfers
directly.

## Why the analogy holds

Both domains describe a physically bounded infrastructure into which
multi-dimensional cargo must be packed tightly, subject to a strict set of hard
constraints that cannot be violated and soft constraints that are merely
preferred.

The scale of the maritime problem is what makes its solutions worth borrowing.
A mega-vessel of the MSC Irina class carries over 24,300 TEU. Placed end to
end, that cargo would stretch 147.5 km — the volume of 322 Olympic swimming
pools, the weight of 52 Eiffel Towers. Nobody solves that by intuition. The
industry was forced into rigorous mathematics decades ago, and Kubernetes
scheduling is only now arriving at the same place.

The Container Stowage Planning Problem is a well-established NP-hard
combinatorial optimisation problem, with a substantial literature: mixed-integer
programming for master bay planning, constraint-based slot planning, genetic
algorithms, many-objective evolutionary approaches such as NSGA-III, and more
recently deep reinforcement learning.

## The 1:1 constraint mapping

This is the table that carries the argument. Every row is a maritime constraint,
its Kubernetes counterpart, and the mathematical technique that handles both.

| Maritime stowage | Kubernetes scheduling | Technique |
|:---|:---|:---|
| Container dimensions (20ft, 40ft, High-Cube) | Resource requests and limits (CPU, RAM, GPU, VRAM) | Multi-dimensional bin packing |
| Reefer containers needing powered slots | AI compute workloads needing A100 or T4 GPUs | CSP hard constraints — `nodeSelector`, node affinity |
| Hazmat segregation | Pod anti-affinity, taints and tolerations | Conflict graph and graph colouring |
| Destination port grouping (LIFO rotation) | Pod affinity, network topology co-location | Fitness function over soft constraints |
| Vessel trim and stability (GM height, weight balance) | Even node loading | Variance minimisation |
| Block booking and slot charter | Gang scheduling for distributed AI training | Coupled variables in CSP, forward checking |
| Lashing and securing for storm safety | QoS classes — Guaranteed vs Burstable | Knapsack with strict capacity bounds |
| Hatch covers (under-deck vs on-deck) | Topology spread constraints, availability zones | Distribution constraints, min/max per zone |
| Ballast water | DaemonSets — CNI, CSI, `kube-proxy` | Fixed variables in ILP |
| Costly restows | Pod preemption and eviction | Heavy penalty in fitness evaluation |
| BAPLIE / final stowage plan | Pre-deployment blueprint (Kuberina's output YAML) | Final state matrix from the GA |

The completeness of this mapping is the point. It is not that stowage planning
offers a useful intuition — it is that the constraint taxonomy is *the same
taxonomy*, so the solution methods port without adaptation.

## Two structural ideas worth dwelling on

### Ballast water and DaemonSets

Before any cargo is loaded, a vessel pumps water into ballast tanks distributed
along the hull to establish a baseline weight distribution and correct the
longitudinal centre of gravity.

DaemonSets do exactly this to a cluster. CNI, CSI and `kube-proxy` pods consume
capacity on every node before any workload arrives. Treating them as
schedulable cargo is a modelling error; they are baseline displacement.

Kuberina therefore runs a **phase 0 daemonset pre-deduction**, subtracting that
overhead from node capacity before packing begins. Every subsequent calculation
operates on net capacity.

### Block booking and gang scheduling

Distributed AI training has a deadlock dynamic: a job needs all N of its pods
running simultaneously, and partial placement wastes resources while waiting
for the rest — sometimes forever.

Maritime logistics solved this structurally. When a partner books a 500-TEU lot
on a vessel, the stowage algorithm never fragments those containers across the
hull. They are locked into a macroscopic geometric structure that cannot be
split.

Kuberina applies the same treatment through **gang-aware repair** in the
genetic algorithm: a gang is a coupled set of variables in the CSP, and forward
checking enforces the coupling rather than discovering the violation later.

## Hierarchical decomposition

CSPP is conventionally decomposed into two sub-problems: the **master bay
plan**, assigning cargo to bays, and the **slot plan**, packing it into
specific slots.

Kuberina inherits the decomposition directly. Workloads are first assigned to
node pools — the bays — and then packed into specific nodes — the slots. This
is what keeps a 2,714-pod problem tractable: it is solved as a hierarchy of
smaller problems rather than one flat search over an enormous space.

## The honest limitation

An isomorphism is a claim about structure, not about every property.

Vessels are static during a voyage; clusters are not. A stowage plan holds
until the next port; a cluster's workload set changes continuously. That is
exactly why Kuberina is positioned as a *pre-deployment* planner rather than a
`kube-scheduler` replacement — the isomorphism holds precisely for the offline,
whole-problem-known formulation, and stops holding the moment you need to react
to something arriving unannounced.

## Further reading

- [The paper](/research/kuberina-stowage-scheduling/), section 3.1, for the
  full formulation and the citations behind each mapping.
- [Why offline scheduling](/kuberina/explanation/offline-scheduling/) for the
  argument this mathematics serves.
