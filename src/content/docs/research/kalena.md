---
title: "Naughtian Kalena: Online Resource Reclamation and Opportunistic Co-Scheduling"
description: "Proposal and system architecture of Kalena: a reclamation scheduler harvesting slack capacity in the Naughtian ecosystem."
tableOfContents:
  maxHeadingLevel: 3
sidebar:
  label: "Kalena (Proposal)"
  order: 4
  badge:
    text: Proposal
    variant: note
head:
  - tag: style
    content: |
      .sl-markdown-content p,
      .sl-markdown-content li { text-align: justify; }
---

:::caution[Proposal in progress]
This document is being drafted collaboratively. The sections reflect design decisions and algorithmic candidates currently under active research.
:::

> **Codename:** _Kalena_
>
> **Positioning:** _Online resource reclamation and opportunistic co-scheduling for self-managed clusters_
>
> **Author:** _Dinh Tan Dung (ORCID: https://orcid.org/0009-0003-1374-7525)_
>
> **Status:** _Draft Proposal (2026)_

---

## Abstract

Cluster capacity is wasted along two independent axes. **Spatial waste** is fragmentation: workloads scattered across partially filled nodes, leaving aggregate capacity that no single pod can use. **Temporal waste** is reservation slack: capacity that is correctly allocated to a workload and simply not consumed at this instant. Within the Naughtian ecosystem, Kuberina has solved the first problem. On its MSC Irina benchmark (186 nodes, 2,714 pods, 5,128 constraints), Kuberina consolidates onto 152 of 186 nodes and reaches 88.7% average CPU utilization against declared requests, with zero hard-constraint violations, in under 44 seconds. Its own stated limitation is equally explicit: *"Kuberina does not observe actual resource consumption. Its placement decisions are based solely on declared requests/limits, which may diverge from real-world usage patterns."*

We propose **Kalena**, a reclamation scheduler that closes exactly that gap for Kubernetes, standalone Docker, and Docker Swarm. Kalena ingests runtime telemetry from cAdvisor and the Linux Pressure Stall Information subsystem, continuously estimates a per-container *reservation* using an asymmetric decay model derived from Google Borg, and exposes the difference between the request Kuberina committed and the usage actually observed as schedulable slack. Containment is enforced through a three-tier control loop separating slow central estimation from fast node-local mitigation.

Kalena operates on the resource envelope Kuberina deliberately leaves behind. In Kuberina's Pareto mode, node capacities are capped at 80% during optimization while the blueprint is emitted against real capacity, producing a structural per-node reserve: maximum observed node utilization of 79%, average 74.6%, across 182 active nodes. That reserve is not an accident to be minimized. It is the burst headroom production requires, and it is idle whenever production is not bursting. Kalena's target is therefore stated as reclaimed capacity harvested from the request-versus-usage gap rather than as a raw utilization percentage, because the utilization figure is already Kuberina's result.

The design goal is explicit: reproduce the scheduling and reclamation behavior that Borg documents in [Verma et al., EuroSys 2015], at the scale and operational complexity budget of infrastructure operators outside hyperscale control planes. Borg reports that approximately 20% of the workload in a median cell runs entirely in reclaimed resources. That figure is the target Kalena is designed against.

---

## 1. Context & Problem

### 1.1. Two Kinds of Waste

The frequently cited figure that cloud environments run at 30-40% average CPU utilization conflates two distinct failures, and separating them is what defines the boundary between Kuberina and Kalena.

**Spatial waste (fragmentation).** `kube-scheduler` binds pods as they arrive, first-come first-served. Over time the cluster's free capacity shatters across partially filled nodes, and high-density workloads submitted later become unschedulable despite sufficient aggregate capacity. This is a combinatorial placement failure, and it is solved offline. Kuberina is the Naughtian answer.

**Temporal waste (reservation slack).** Engineers size resource requests around peak projected demand plus a safety margin. A workload correctly allocated 4 cores against a traffic peak consumes 0.6 cores at 03:00. The allocation is not wrong, and the capacity is idle regardless. This is an estimation failure, it cannot be solved offline because it depends on runtime observation, and it is what Kalena addresses.

The two are orthogonal. A perfectly defragmented cluster still wastes temporal capacity, and a cluster with perfect usage estimation still fragments. This document assumes the first problem is already solved and reasons only about the second.

This second gap is quantified in the Borg literature. In a representative Borg cell, production jobs are *allocated* about 70% of total CPU resources while *representing* about 60% of total CPU usage, and are allocated about 55% of total memory. The discrepancy between allocation and usage is the entire economic basis for reclamation.

### 1.2. What Kuberina Has Already Delivered

Kalena is not designed against a naive cluster. It is designed against the output of Kuberina v0.2.0, and the following facts about that output are load-bearing for every subsequent section.

| Delivered capability | Consequence for Kalena |
| --- | --- |
| 8-dimensional MDBP model: CPU, RAM, GPU, storage, disk read/write, net in/out | Kalena must reclaim across the same 8 dimensions, and each has a different reclaimability class (Section 2.4) |
| Placement computed against **requests**, not limits | The dual-ledger invariant is expressed in requests (Section 2.3) |
| Phase 0 DaemonSet pre-deduction: $C_j^r$ is net allocatable capacity | Kalena's node capacity must be the identical post-deduction quantity, and DaemonSets are never evictable |
| Pareto mode caps optimization at a percentage of capacity while emitting the blueprint against real capacity | A structural, per-node, deliberately unallocated reserve exists. This is Kalena's primary harvest ground |
| Topology spread constraints with `maxSkew`, `topologyKey`, zone and rack domains | Kalena's batch placement must not invalidate the spread the blueprint achieved |
| Output is an assignment map (`namespace/pod: node`), with manifest rendering planned as `kuberina-forge` in v0.3.0 | Kalena consumes the assignment map and Kuberina IR v0.2.0, not rendered YAML |
| No runtime feedback loop (stated limitation, PAPER.md §8.1) | Kalena's usage archive is the missing input, and supplying it is a primary contribution |

Reported results on the MSC Irina benchmark, which Kalena reuses as its own testbed (Section 6.5):

| Configuration | Active nodes | Avg CPU | Max node CPU | Util variance | Wall clock |
| --- | --- | --- | --- | --- | --- |
| Full packing (100%) | 152 / 186 | 88.7% | 100% | 0.0374 | 43.67 s |
| Pareto 80% (Resource Canal) | 182 / 186 | 74.6% | 79% | 0.0256 | 43.71 s |

Both configurations place 100% of pods with zero capacity, selector, or gang violations, at approximation ratio $\alpha = 1.34$ against the LP lower bound and $p < 10^{-4}$ against 10,000 Monte Carlo random-placement trials.

### 1.3. The Cost of Segregation

The conventional alternative to co-location is physical separation: one cluster for latency-sensitive services, another for batch compute. Borg measured this directly through cell compaction experiments and found that segregating production and non-production work into different cells would require **20-30% more machines** in the median cell. Splitting a single large cell into smaller ones, or granting large tenants private cells, is more expensive still: partitioning by tenant above a 10 TiB memory threshold would require 2-16 times as many cells and 20-150% additional machines.

Co-location is therefore an efficiency win even before accounting for the interference it introduces.

### 1.4. The Technical Gap

Hyperscale operators address headroom waste by co-scheduling high-priority latency-sensitive production jobs with low-priority batch workloads on shared hardware, as pioneered by Google Borg.

Self-managed infrastructure, edge clusters, and small-to-medium deployments lack a lightweight, standalone mechanism to perform similar opportunistic overcommitment without incurring the operational complexity of enterprise-grade Kubernetes add-ons or proprietary cloud control planes.

---

## 2. Architecture

Kalena functions as an online scheduling daemon and plugin focused on safe, dynamic slack capacity harvesting.

### 2.1. Target Environments

Kalena targets two operational tiers:

* **Kubernetes (K8s):** Implemented as a native Kubernetes Scheduling Framework plugin (extending `Filter`, `Score`, and `Reserve`). It injects overcommitment logic into the cluster scheduler and can also operate as a secondary scheduler dedicated to opportunistic workloads. Borg itself converged on this pattern, noting that it "recently added the ability for Borg to use different schedulers for different workload types."
* **Docker Standalone & Docker Swarm:** Deployed as a lightweight standalone scheduler daemon communicating directly with the Docker Engine and Swarm manager APIs, directly serving the 80% of self-hosted deployments without full Kubernetes clusters.

### 2.2. Telemetry via cAdvisor and PSI

Kalena consumes two telemetry channels with deliberately different roles:

* **cAdvisor (slow channel, seconds):** the source of truth for per-container resource consumption feeding the reservation estimator. On Kubernetes, cAdvisor is already embedded inside every Kubelet, delivering node-local container metrics with minimal latency. On Docker and Swarm nodes, cAdvisor runs as a single lightweight container. Kalena queries cAdvisor directly, eliminating external Prometheus pipelines or specialized exporters.
* **Pressure Stall Information (fast channel, sub-second):** the Linux kernel PSI interface, subscribed through `eventfd`, delivers push notifications of memory and CPU contention without polling. This channel drives enforcement, never estimation.

The separation matters. cAdvisor's default 10-15 second polling interval is adequate for estimating a reservation that decays over minutes, and inadequate for reacting to a memory spike that develops in milliseconds. Section 3.1 makes this split structural.

### 2.3. The Dual-Ledger Invariant

This is the central accounting rule of the system, and the property that makes overcommitment safe.

Every node maintains **two independent resource ledgers**, and the ledger consulted depends on the tier of the workload being placed:

$$\text{Free}^{\text{prod}}_n = C_n - \sum_{i \in \mathcal{P}(n)} \text{req}_i$$

$$\text{Slack}_n(t) = C_n - \sum_{i \in \mathcal{P}(n)} R_i(t) - \sum_{j \in \mathcal{B}(n)} R_j(t)$$

where $C_n$ is node capacity, $\mathcal{P}(n)$ and $\mathcal{B}(n)$ are the production and batch workloads resident on node $n$, $\text{req}_i$ is the declared request of workload $i$, and $R_i(t)$ is its current reservation. All quantities are 8-vectors (Section 2.4), and both ledgers must hold on every dimension independently.

* **Production placement reads the request ledger.** Production workloads are sized against declared requests and never see reclaimed capacity. They are structurally incapable of being scheduled into oversubscribed space. Batch workloads are excluded from this ledger entirely, because they are evictable and therefore do not constitute an obstruction.
* **Batch placement reads the reservation ledger.** Opportunistic workloads are sized against live reservations, which is precisely where the harvestable capacity appears.

Borg states the rule directly: the scheduler "uses limits to calculate feasibility for prod tasks, so they never rely on reclaimed resources and aren't exposed to resource oversubscription; for non-prod tasks, it uses the reservations of existing tasks so the new tasks can be scheduled into reclaimed resources."

**Requests, not limits.** Borg's *limit* serves two roles that Kubernetes splits apart: it is both the quantity the scheduler packs against and the ceiling the kernel enforces. Kuberina packs against `requests` ($\text{req}_i^r$ in its formal definition, and the `requests:` field in Kuberina IR v0.2.0). Transcribing Borg's rule literally with Kubernetes `limits` would produce two ledgers that disagree with each other, and the disjointness claim below would be false. The request is therefore the correct upper ledger, and the limit survives only as the enforcement ceiling in Section 3.

This resolves a question left open in Kuberina's own design document, which asks whether the solver should pack against requests, limits, or both. The dual-ledger rule answers it: requests define the reserved envelope that Kuberina freezes, limits define the burst ceiling that Kalena polices, and the gap between them is precisely the region where reclamation operates.

**The blueprint restoration invariant.** Kuberina's output is a feasibility proof: given the blueprint, every hard constraint holds. Kalena must not be able to invalidate that proof. The guarantee is stated as a restoration property:

> At any instant, evicting every batch workload on node $n$ returns the node exactly to the resource state the Kuberina blueprint specifies.

This holds because batch workloads appear only in the reservation ledger and never in the request ledger, and because Kalena never mutates a production workload's placement. It is the precise sense in which the two systems write to disjoint state, and it is what reduces the runtime scheduling overhead of production workloads to zero.

**Capacity is the post-Phase-0 quantity.** $C_n$ is the node's allocatable capacity *after* Kuberina's DaemonSet pre-deduction, $C_j^r = C_{j,\text{raw}}^r - \sum_d \mathbb{1}[\text{eligible}(d, n_j)] \cdot \text{res}_d^r$. Kalena reads the same value. Using raw capacity would credit Kalena with slack that the CNI, CSI, logging, and monitoring DaemonSets are already consuming, producing phantom capacity of exactly the kind Phase 0 exists to eliminate. It follows directly that **DaemonSet workloads are never evictable by Kalena at any priority**: in the maritime framing they are the vessel's ballast, and a ship does not jettison ballast to make room for cargo.

### 2.4. Reclaimability Across Eight Dimensions

Kuberina v0.2.0 models resources as an 8-vector: CPU, RAM, GPU, storage, disk read, disk write, network in, network out. The expansion beyond the original CPU/RAM/GPU triple was made explicitly to mitigate noisy-neighbor effects, which is the same problem co-location creates. Kalena inherits the vector, and each dimension falls into one of three reclaimability classes.

| Dimension | Class | Enforcement mechanism | Contributes slack |
| --- | --- | --- | --- |
| CPU | Compressible | CFS bandwidth control (`cpu.max`) | Yes |
| Disk read, disk write | Compressible | `io.max` throttling (blkio) | Yes |
| Network in, network out | Compressible | tc/eBPF egress shaping, ingress policing | Yes |
| RAM | Non-compressible | `memory.high` then eviction | Yes |
| Storage | Non-compressible | Quota enforcement then eviction | Yes |
| GPU | Non-reclaimable | None | **No** |

Borg's own taxonomy names "CPU cycles, disk I/O bandwidth" as compressible and "memory, disk space" as non-compressible, so five of Kuberina's eight dimensions map onto Borg's categories directly. The extension is that Kalena polices network bandwidth as a first-class compressible dimension, which Borg's paper does not discuss.

**GPU is excluded from reclamation entirely.** A GPU allocated to a workload through the device plugin is a binary assignment with no throttling primitive comparable to CFS, no safe preemption path, and no meaningful notion of partial consumption in the default Kubernetes device model. A batch workload cannot borrow an idle GPU and yield it in milliseconds when the owner resumes. Kalena therefore treats the GPU dimension as fully committed at all times: $R_i^{\text{GPU}}(t) = \text{req}_i^{\text{GPU}}$ permanently, contributing zero slack. This is the honest position, and it matters because Kuberina's benchmark places 152 GPU units across 240 available. Opportunistic GPU sharing through MPS, MIG partitioning, or time-slicing is a distinct research problem and is out of scope.

### 2.5. Resource Estimation: The Reservation

The reservation $R_i(t)$ is Kalena's running estimate of how much of its declared envelope a workload actually needs. Its dynamics are deliberately asymmetric: slow to release capacity, immediate to reclaim it.

Let $U_i(t)$ be the usage sampled from cAdvisor at interval $T$, and let $\lambda$ be the safety margin multiplier. Define the instantaneous target:

$$\text{Target}_i(t) = U_i(t) \times (1 + \lambda)$$

The reservation then evolves as:

$$
R_i(t) =
\begin{cases}
\text{req}_i, & t - t_i^{\text{start}} < T_{\text{grace}} \\[4pt]
\min\!\left(L_i,\ \text{Target}_i(t)\right), & \text{Target}_i(t) > R_i(t-1) \\[4pt]
\alpha R_i(t-1) + (1-\alpha)\,\text{Target}_i(t), & \text{otherwise}
\end{cases}
$$

Four properties deserve emphasis, and the first three were absent from earlier drafts of this proposal:

1. **The initial reservation equals the request.** A newly admitted workload is credited the full envelope Kuberina committed to it in the blueprint. It contributes zero slack until it has proven, through observed usage, that it does not need the reservation. The failure mode this prevents is severe: a freshly deployed production pod that has not yet received traffic would otherwise be estimated at near-zero usage, its request released as slack, and batch work packed on top of it immediately before its load arrives.

2. **A startup grace period $T_{\text{grace}}$ suppresses estimation entirely.** Borg holds the reservation at the limit for 300 seconds "to allow for startup transients." Container startup involves image extraction, JIT warmup, connection pool establishment, and cache population, none of which resemble steady-state behavior. Kalena adopts 300 seconds as the default and exposes it per-workload.

3. **The reservation may rise above the request, and is capped at the limit.** A Burstable workload consuming beyond its request is doing something legitimate, and the capacity it is consuming must stop being advertised as slack. The reservation therefore tracks usage upward through the request and stops at the limit, which is the point where the enforcement machinery in Section 3 takes over. Capping at $L_i$ also keeps the reservation ledger from ever exceeding what the kernel will actually permit the workload to consume.

4. **Decay is slow, rise is immediate.** With $\alpha$ close to 1, released capacity is surrendered over minutes. Any sample exceeding the current reservation raises it in a single step. The decayed-maximum formulation used in earlier drafts is the limiting case of this rule with the margin applied outside the maximum, and the exponential form is preferred here because it makes $\alpha$ and $\lambda$ independently tunable.

Neither $\alpha$ nor $\lambda$ is published in the Borg literature. Both are treated in this proposal as parameters requiring empirical calibration, and Section 6.4 specifies the protocol.

**Estimation escape hatch.** Borg grants privileged users a capability to disable resource estimation on their jobs entirely. Kalena provides the equivalent through a `kalena.naughtian.io/reclaim: disabled` annotation, which pins $R_i(t) = \text{req}_i$ permanently. Workloads with pathological or unmeasurable burst behavior are better excluded than mismodeled. The GPU dimension is pinned this way unconditionally for every workload (Section 2.4).

### 2.6. Workload Classification: Two Orthogonal Axes

Borg separates two concerns that are frequently conflated. Kalena adopts the same separation.

* **Tier (isolation class).** Determines *how* a workload is treated by the enforcement machinery: whether it may consume slack, whether it is subject to eviction, and which cgroup policy applies. Two values: `service` and `batch`. This corresponds to Borg's *appclass* distinction between latency-sensitive and batch tasks.
* **Priority (eviction order).** A small non-negative integer determining *which* workload is sacrificed first under contention. This corresponds to Borg's *priority bands*.

The two axes are independent. A high-priority batch job is still throttled and still evictable, and simply dies last among batch workloads. This matters as soon as an operator runs more than one kind of opportunistic work: a CI build that a developer is waiting on and a nightly reindex are both `batch`, and they should not be equally disposable.

Kalena inherits one further rule from Borg: **workloads in the service tier may not preempt one another.** Borg introduced this constraint to eliminate preemption cascades, where a high-priority task displaces a slightly lower-priority one, which displaces another, and so on. Production placement in the Naughtian ecosystem is Kuberina's blueprint, and a runtime cascade would invalidate it.

### 2.7. Slack Consumption Policy

Whether a workload may exceed its own limit to consume unclaimed slack is governed by two separate knobs with **deliberately asymmetric defaults**, following Borg's operational experience:

| Resource | Default | Rationale |
| --- | --- | --- |
| Slack CPU | **enabled** | CPU is compressible. The downside of over-consumption is throttling, which degrades throughput and preserves correctness. |
| Slack memory | **disabled** | Memory is non-compressible. Consuming slack memory materially increases the probability of being killed. |

Borg reports that under these defaults fewer than 1% of batch tasks disable slack CPU, while 79% of batch tasks explicitly opt *into* slack memory, largely because the MapReduce framework enables it by default. The lesson is that the conservative default is correct and the opt-in path must be a single field, since frameworks that understand their own restart semantics will use it universally.

```yaml
metadata:
  labels:
    kalena.naughtian.io/tier: batch
  annotations:
    kalena.naughtian.io/priority: "20"
    kalena.naughtian.io/slack-memory: "allow"   # default: deny
    kalena.naughtian.io/slack-cpu: "allow"      # default: allow
```

### 2.8. Zero-Friction Defaults

To preserve Operator Experience (OpX), Kalena minimizes manifest authoring overhead:

* **Safe defaults:** any workload lacking explicit classification is treated as `tier: service` with full isolation and zero risk of unexpected eviction.
* **Minimal syntax:** classifying a workload as an opportunistic harvester requires exactly one label. Every other field in the example above is optional.
* **Automatic inference:** when enabled, Kalena automatically classifies standard Kubernetes `Job` and `CronJob` objects as `tier: batch` without requiring manifest modifications.

---

## 3. Enforcement and Isolation

### 3.1. Control Loop Split: Slow Estimation, Fast Enforcement

The most consequential structural decision in Kalena is that **the estimation path and the enforcement path are separate control loops with separate latency budgets and separate data sources.**

Borg establishes the pattern. Reservations are computed centrally in the Borgmaster every few seconds from usage reported by the Borglet, with a Borglet polling interval whose 95th percentile is under 10 seconds. Yet when a machine exhausts non-compressible resources, "the Borglet immediately terminates tasks." The kill decision never traverses the estimation pipeline.

Kalena defines three tiers:

| Tier | Latency budget | Trigger | Actor | Action |
| --- | --- | --- | --- | --- |
| **Estimation** | seconds | cAdvisor sample | Node agent, published to control plane | Update $R_i(t)$, recompute node slack, publish |
| **Mitigation** | sub-second | PSI `eventfd`, cgroups v2 `memory.high` breach | Node agent, autonomously | Throttle via CFS bandwidth control; evict batch locally |
| **Escalation** | tens of seconds | Local mitigation failing to converge | Control plane | Drain batch workloads from the node; mark node slack-ineligible |

The escalation tier mirrors Borg's behavior when local throttling is insufficient: "If things do not improve, Borgmaster will remove one or more tasks from the machine." A node under sustained pressure that local mitigation cannot resolve is a node that should stop receiving opportunistic work at all, and that is a cluster-level decision.

This split is the direct answer to the sampling-latency objection. The accuracy of the estimator is bounded by cAdvisor's polling interval. The **safety** of the system is bounded by PSI notification latency, which is sub-second, because safety decisions are made on the fast channel.

### 3.2. Resource Classification and Response

Kalena responds according to the reclaimability class of the dimension under pressure, as tabulated in Section 2.4:

* **Compressible dimensions (CPU, disk read, disk write, network in, network out):** rate-based, and reclaimable from a workload by degrading its quality of service without killing it. Under contention, Kalena throttles opportunistic workloads, granting priority to service-tier workloads.
* **Non-compressible dimensions (memory, storage):** generally unreclaimable without terminating the workload. When pressure crosses threshold, Kalena evicts batch workloads.
* **Non-reclaimable dimensions (GPU):** never oversubscribed, therefore never a source of contention Kalena must resolve.

Contention is evaluated per dimension, and the response is whatever that dimension's class dictates. A node saturating network egress while CPU and memory sit comfortably below their reservations triggers egress shaping on batch workloads and nothing else. This granularity is the practical payoff of Kuberina's 8-dimensional expansion, which was itself motivated by noisy-neighbor mitigation: an I/O-bound batch job starving a production database of disk bandwidth is invisible to a CPU-and-memory-only reclamation model, and it is exactly the failure co-location is accused of causing.

On the CPU mechanism specifically, Borg records a finding worth preserving: **cgroup shares alone are insufficient.** Because the system supports multiple priority levels rather than a single binary distinction, Borg "selectively applies CFS bandwidth control when needed" in addition to shares. Kalena's two-axis classification (Section 2.6) creates exactly the same multi-level structure, and therefore inherits the same requirement. Shares express proportional entitlement; bandwidth control expresses a hard ceiling. Both are needed.

The equivalent primitives for the remaining compressible dimensions are less mature and are called out as an implementation risk. Block I/O throttling through cgroups v2 `io.max` requires per-device configuration and behaves inconsistently across filesystem and device-mapper stacks. Network shaping has no cgroups v2 controller at all: egress requires `tc` queueing disciplines or eBPF attached per network namespace, and ingress can only be policed rather than shaped. Kalena's initial implementation enforces CPU and memory with full fidelity and treats the disk and network dimensions as **accounted but advisory**, meaning they inform placement scoring and eviction ordering while enforcement lands on a later milestone.

Borg further reserves entire physical cores for latency-sensitive tasks and applies `cpuset` pinning sparingly for applications with particularly tight latency requirements. Kalena exposes the equivalent through Kubernetes' static CPU manager policy for service-tier workloads that declare it, while batch workloads remain permitted to run on any core with minimal shares.

### 3.3. Eviction Ordering and Stopping Condition

When a node exhausts non-compressible resources, Kalena evicts **from lowest to highest priority, until the remaining reservations can be met.**

The stopping condition is stated in terms of the reservation ledger rather than a free-bytes threshold. This is a deliberate inheritance from Borg, and it has a useful property: the eviction loop terminates against the same quantity the estimator maintains, so the enforcement path and the estimation path cannot disagree about when the node is healthy.

$$\text{evict until} \quad \sum_{i \in \mathcal{P}(n) \cup \mathcal{B}(n)} R_i(t) \le C_n \quad \text{on the pressured dimension}$$

Because $\mathcal{B}(n)$ is finite and every batch workload is evictable, this loop always terminates. Its worst case is the empty batch set, at which point the node has been restored exactly to its Kuberina blueprint state, and Section 2.3's restoration invariant guarantees that state is feasible. **Kalena can therefore never evict its way into an infeasible cluster**, which is the property that lets it run without a global view.

**DaemonSets are outside the eviction set.** They were pre-deducted from $C_n$ in Kuberina's Phase 0 and are not decision variables in either ledger. Evicting one would reduce the node's own operating capability, in the maritime framing pumping out ballast to make room for cargo, and Kalena's node agent excludes them unconditionally regardless of the priority integer they carry.

**The limit-breach override.** One rule takes precedence over priority ordering entirely: *a workload exceeding its own memory limit is evicted first, regardless of tier or priority.* Borg states it plainly, and the reasoning is that a workload consuming beyond its declared envelope has forfeited the guarantee that the envelope purchased. Without this rule, a leaking service-tier pod would be protected by its tier while the kernel OOM killer selected a victim by its own heuristics, which is precisely the uncontrolled outcome the system exists to prevent.

Borg's operational data supports the effectiveness of this rule: because a memory-limit exceeder is preempted first regardless of priority, "it is rare for tasks to exceed their memory limit." The rule is primarily a deterrent.

### 3.4. Anti-Starvation and Forward Progress

A preemption policy in which production always wins absolutely will produce batch workloads that never complete. Borg does not implement such a policy:

> "The Borglet dynamically adjusts the resource caps of greedy LS tasks in order to ensure that they do not starve batch tasks for multiple minutes."

Kalena adopts a bounded starvation guarantee. The node agent tracks cumulative throttled time per batch workload. When a batch workload has been throttled beyond $T_{\text{starve}}$ within a rolling window, the agent applies a bandwidth ceiling to the service-tier workloads on that node sufficient to release a minimum CPU allocation to the batch workload.

This ceiling is applied only to service-tier workloads whose consumption exceeds their own reservation, meaning they are themselves running on slack. A production workload operating within its reservation is never capped. The guarantee therefore reads: *opportunistic work may be starved by production demand, and may not be starved indefinitely by production greed.*

### 3.5. Graceful Preemption

Evicted workloads receive `SIGTERM` before `SIGKILL`, with a bounded delay, allowing them to checkpoint state, finish in-flight requests, and decline new ones. On Kubernetes this maps to `terminationGracePeriodSeconds`.

The proposal states the limitation honestly, as Borg does: the notice is best-effort. Borg reports that in practice the advance notice is delivered approximately 80% of the time, and that the actual notice period may be shortened when the preemptor sets a tighter delay bound. Under acute memory pressure Kalena will terminate without a usable grace period, because the alternative is a kernel OOM kill that offers none at all. Batch workloads must be written to tolerate abrupt termination.

---

## 4. The Kalena Scheduler

### 4.1. Placement Scoring

Kalena's `Score` plugin ranks feasible nodes for opportunistic workloads. The scoring model is derived from Borg's, which is neither best-fit nor worst-fit.

Borg documents the failure of both extremes. E-PVM scoring approximates worst-fit, spreading load across all machines and leaving headroom for spikes, at the cost of increased fragmentation for large tasks. Best-fit packs tightly and leaves whole machines empty, which simplifies placing large tasks, but "penalizes any mis-estimations in resource requirements" and "is particularly bad for batch jobs which specify low CPU needs so they can schedule easily and try to run opportunistically in unused resources." Borg notes that 20% of non-production tasks request less than 0.1 CPU cores, which is exactly the workload shape Kalena is built to place.

Borg's production model is a hybrid that minimizes **stranded resources**, meaning capacity that cannot be used because a different resource dimension on the same machine is fully allocated. It reports 3-5% better packing efficiency than best-fit.

Kalena's score is composed of four terms:

1. **Stranded-slack minimization.** Prefer nodes where placing this workload leaves the remaining slack vector balanced across the seven reclaimable dimensions. A node with 8 cores of slack and 200 MiB of free memory strands the cores. Kuberina's fitness function contains a structurally identical $f_{\text{frag}}$ term over the same vector, and the two solve the same geometric problem on different ledgers.
2. **Co-location preference.** Prefer nodes that already host a mix of service-tier and batch workloads. This is counterintuitive and is stated explicitly in Borg's scoring criteria: "putting a mix of high and low priority tasks onto a single machine to allow the high-priority ones to expand in a load spike." Concentrating batch onto nodes that also carry production is the mechanism by which production retains room to burst, since batch is the compressible ballast that yields.
3. **Image locality.** Weighted heavily, for reasons developed in Section 4.3.
4. **Volatility penalty.** Penalize nodes whose reservation series has shown high variance over the recent window. A node with stable production load is a better host for opportunistic work than a node with the same mean slack and a spiky profile.

**Blueprint-preserving filters.** Scoring ranks nodes that are already feasible, and feasibility for a batch workload carries two constraints beyond the reservation ledger, both inherited from what Kuberina encoded in the blueprint:

* **Production anti-affinity is binding on Kalena.** A production workload declaring `antiAffinity` against a workload class does so to avoid an interference or correctness conflict, and that intent does not weaken because the offending pod arrived through the reclamation path instead of the blueprint. Kalena's `Filter` evaluates the anti-affinity targets of every resident production workload against the candidate batch pod and rejects the node on a match.
* **Topology spread is not Kalena's to consume.** Kuberina achieves a `maxSkew` bound over `topologyKey` domains including zone and rack, and it treats spread as a soft penalty in its fitness function. Batch pods carrying their own spread constraints are evaluated against the same domains, and Kalena never counts a batch pod toward a production workload's skew, because evicting it later would silently change the skew the blueprint was reviewed against.

The general rule: **Kalena may occupy capacity the blueprint left idle, and may not consume constraint budget the blueprint spent.**

### 4.2. Scalability Techniques

Borg reports that scheduling a cell's entire workload from scratch took a few hundred seconds with the following techniques enabled, and **failed to complete after more than three days with them disabled.** Kalena operates at a smaller scale and on a narrower problem, and these techniques remain cheap enough to be worth implementing.

* **Score caching with coarse invalidation.** Feasibility and scoring results are cached per node and invalidated on state change. Borg records the essential refinement: "ignoring small changes in resource quantities reduces cache invalidations." This is critical for Kalena in a way it was not for Borg, because Kalena's reservations move continuously as usage fluctuates. Without quantization, every cAdvisor sample would invalidate the entire cache. Kalena therefore keys the cache on a quantized slack value:

  $$\widetilde{\text{Slack}}_n = \Delta \left\lfloor \text{Slack}_n / \Delta \right\rfloor$$

  with the bucket width $\Delta$ set per resource dimension. Only a crossing of a bucket boundary invalidates the node's cached score.

* **Equivalence classes.** Feasibility and scoring are computed once per group of workloads with identical requirements and constraints, rather than once per workload. In Kubernetes this maps cleanly onto pods owned by the same `Job`, `CronJob`, or `ReplicaSet`, which by construction share a pod template.

* **Relaxed randomization.** For clusters large enough that scoring every node is wasteful, Kalena examines nodes in random order until a sufficient number of feasible candidates have been scored, then selects the best within that sample. Borg notes this is akin to Sparrow's batch sampling while additionally handling priorities, preemptions, heterogeneity, and startup costs.

* **Optimistic concurrency against a cached view.** As a secondary scheduler, Kalena necessarily operates on a cached copy of cluster state, proposing bindings that the API server may reject as stale. Borg arrived at the same architecture for the same reason and treats rejection as normal: assignments that the master finds inappropriate "will cause them to be reconsidered in the scheduler's next pass."

### 4.3. Startup Cost and Eviction Cooldown

Borg measures median task startup latency at approximately 25 seconds, of which **package installation accounts for about 80%.** The Kubernetes analogue is image pull, and the arithmetic is unforgiving: an opportunistic workload that takes 25 seconds to become runnable and is evicted after 10 seconds performs no work while consuming real resources. A naive reclamation scheduler under a fluctuating production load will thrash.

Kalena applies three mitigations:

1. **Heavy image-locality weighting.** Borg's scheduler "prefers to assign tasks to machines that already have the necessary packages installed," and distributes packages using tree and torrent-like protocols. Kalena weights the Kubernetes `ImageLocality` signal well above its default, accepting a worse packing score in exchange for a workload that starts an order of magnitude faster.
2. **Minimum run time.** A batch workload that has been running for less than $T_{\text{min}}$ is exempt from eviction unless the node is in acute non-compressible pressure, where correctness overrides efficiency.
3. **Eviction cooldown and pairing blacklist.** A workload evicted from node $n$ is ineligible for rescheduling onto $n$ for a cooldown interval. This generalizes Borg's availability rule that the system "avoids repeating task::machine pairings that cause task or machine crashes," and it breaks the specific pathology where a batch pod is repeatedly placed on the one node whose production load is about to spike.

### 4.4. Requeue Semantics and Failure Handling

Kalena deliberately does not implement migration or checkpoint-restore. Evicted workloads are returned to the pending queue and rescheduled from scratch. Borg made the identical choice and records it in a single footnote, with a single documented exception for tasks providing virtual machines. The complexity of live migration is not justified for workloads that are already required to tolerate termination.

Kalena additionally inherits two rate-limiting behaviors from Borg's availability design:

* **Rescheduling from unreachable nodes is rate-limited,** because the scheduler cannot distinguish large-scale node failure from a network partition, and a stampede in the latter case is self-inflicted damage.
* **Disruption rate and simultaneous-downtime limits** are enforced per workload group, so that a reclamation event cannot take down every replica of a batch service at once.

### 4.5. Admission Control

Borg's answer to more work arriving than the cluster can hold is quota applied at admission rather than at scheduling: "jobs with insufficient quota are immediately rejected upon submission." Quota is priced by priority, production-priority quota is capped at the physically available resources in the cell, and **every user has effectively unlimited quota at priority zero**, which is admitted freely and frequently remains pending.

Kalena adopts a simplified form appropriate to its scale. Batch workloads are admitted without capacity checking and may remain pending indefinitely, which is already Kubernetes' native behavior. Operators may optionally configure a per-namespace ceiling on concurrently *running* batch workloads, bounding the blast radius of a single tenant saturating cluster slack. Sophisticated quota pricing is explicitly out of scope, since it addresses a multi-tenancy problem that self-managed clusters largely do not have.

---

## 5. Ecosystem Fit: Symbiosis with Kuberina

### 5.1. The Solid Rock and Liquid Flow Paradigm

In Naughtian mythology, Kalena and Kuberina are companions. Architecturally, they form a two-level dual-temporal scheduling system:

* **Kuberina (offline pre-planning):** the port naval architect. Kuberina calculates the stowage placement of heavy shipping containers (production workloads) onto fixed hull coordinates before departure.
* **Kalena (online dynamic tuning):** the voyage crew. Kalena packs light cargo parcels (batch workloads) into crevices between containers while at sea, jettisoning light cargo when storm conditions threaten ship stability.

This hybrid model delivers three architectural properties:

1. **Zero-latency baseline:** production workloads have their placement statically decided by Kuberina, reducing production scheduling overhead to 0 ms at runtime.
2. **Focused runtime scheduling:** Kalena expends scheduling cycles exclusively on packing opportunistic jobs into unharvested headroom.
3. **Closed-loop feedback:** Kalena records empirical consumption profiles over time and exports this telemetry back to Kuberina. Future planning cycles use empirical distributions to tighten bin-packing margins.

### 5.2. Kalena and the Resource Canal

Kuberina's own paper already names the symbiosis it expects with runtime systems, and Kalena must be positioned against that existing concept rather than alongside a competing one.

Kuberina describes the **Resource Canal Effect**: offline MDBP optimization establishes fixed physical boundaries, the canal banks, and dynamic systems then operate within them adjusting to real-time traffic, the water level. The paper's named example is Google Autopilot and the Vertical Pod Autoscaler, and its argument is that an RL cost function operating inside a Kuberina-defined canal converges faster because the extremes of overrun and underrun have already been eliminated.

Kalena occupies the same canal and does something categorically different inside it.

| | Autopilot / VPA | Kalena |
| --- | --- | --- |
| Acts on | The production workload's own envelope | Other people's workloads |
| Direction | Vertical: raise or lower the request | Horizontal: admit a foreign workload into unused space |
| Effect on the blueprint | Mutates `requests`, invalidating Kuberina's feasibility proof until re-planned | Leaves `requests` untouched (Section 2.3 restoration invariant) |
| Failure mode | Under-provisioning causes OOM for the production workload itself | Over-harvesting causes eviction of batch, production unaffected |
| Relationship to the canal | Adjusts the width of the banks | Uses the water the banks are not currently holding |

The distinction matters because the two approaches are not interchangeable and can be run together. A vertical autoscaler eventually forces a Kuberina re-plan, since it changes the very quantity the blueprint packed against. Kalena never does, which is why it can operate continuously between planning cycles.

**The Pareto reserve is the canal, made concrete.** Kuberina's `--pareto` flag caps node capacities during optimization while emitting the blueprint against real capacity, so the reserve is not an emergent property to be hoped for. On the Irina benchmark at `--pareto 80` the result is a maximum node utilization of 79% and an average of 74.6%, which is a guaranteed and quantified per-node reserve on every one of the 182 active nodes. The reserve costs 30 nodes relative to full packing (182 active instead of 152), and it buys measurably better balance: utilization variance drops from 0.0374 to 0.0256 and soft affinity violations from 643 to 549.

Kalena changes the economics of that trade. Without a reclamation layer the Pareto reserve is pure insurance, paid for continuously and consumed only during bursts. With Kalena the reserve carries opportunistic work whenever production is not bursting, so the operator buys burst headroom and batch throughput with the same capacity. **The question of what the Pareto threshold should be therefore becomes a joint Kuberina-Kalena question**, and Section 6.3 adds it to the evaluation as a metric rather than treating it as a Kuberina configuration detail.

### 5.3. Answering Kuberina's Stated Limitation

Kuberina's paper enumerates its own limitations, and two of them describe Kalena's contribution precisely.

> **No Runtime Feedback Loop.** "Unlike Autopilot, Kuberina does not observe actual resource consumption. Its placement decisions are based solely on declared requests/limits, which may diverge from real-world usage patterns."

This is the gap the usage archive fills (Section 5.5). Kuberina packs against declared requests because declared requests are the only input it has. Supplying the empirical distribution of actual usage lets a subsequent planning cycle pack against what workloads do rather than what their authors guessed.

> **Static vs. Dynamic.** "When workloads change at runtime [...] the blueprint may become stale. Organizations must determine an appropriate re-planning frequency: per-deployment (CI/CD trigger), periodic (e.g., daily), or event-driven (when utilization deviation exceeds a threshold)."

Kalena supplies the missing signal for the third option. The event-driven trigger requires a continuously maintained measure of how far reality has drifted from the blueprint, and the reservation ledger is exactly that measure. Kalena defines **blueprint drift** as the aggregate divergence between committed requests and steady-state reservations:

$$D(t) = \frac{1}{|\mathcal{P}|}\sum_{i \in \mathcal{P}} \frac{\left\lVert \text{req}_i - R_i(t) \right\rVert_1}{\left\lVert \text{req}_i \right\rVert_1}$$

When $D(t)$ crosses an operator-configured threshold, Kalena emits a re-plan recommendation carrying the empirical distributions needed to act on it. Kalena does not trigger a re-plan itself. The blueprint is a peer-reviewed artifact in Kuberina's design philosophy, and silently regenerating it would destroy the property that makes it valuable.

### 5.4. Architectural Feasibility: Decoupling Production Placement from Slack Harvesting

The primary reason centralized systems like Google Borg or generic container schedulers encounter immense complexity when attempting online overcommitment is the conflation of two conflicting responsibilities:

1. Solving the NP-hard, multi-constraint placement problem (affinity, anti-affinity, gang scheduling, and topology spread) for mission-critical production workloads within milliseconds.
2. Estimating dynamic resource slack and co-scheduling opportunistic batch workloads in real time.

Kuberina isolates and resolves the first problem entirely in an offline phase. Because Kuberina spends the necessary computational time upfront to generate an optimal, immutable blueprint, production workloads arrive at the cluster with their node assignments pre-determined.

The Borg literature supplies quantitative support for this decomposition. Every scalability technique enumerated in Section 4.2 exists to make online production placement tractable, and their collective necessity is stark: with them disabled, a full scheduling pass "did not finish after more than 3 days." Kalena requires none of them for production placement, because it performs none.

This architectural division fundamentally shifts Kalena's operating requirements:

* **Localized, univariate problem space:** Kalena evaluates residual slack node-by-node. It matches lightweight opportunistic tasks to local idle capacity without having to re-solve cluster-wide affinity graphs.
* **Trivial preemption decisions:** when a production workload surges, Kalena executes a binary intervention: throttle or evict the local batch task. The system avoids complex cluster-wide re-balancing.
* **Realistic engineering scope:** decoupling the production placement problem allows Kalena to function as a compact, maintainable plugin. The implementation avoids the pitfalls of an overwhelming monolithic scheduler.

Borg's own trajectory corroborates the direction. Section 3.4 of the paper records that Borg eventually adopted optimistic concurrency control in the spirit of Omega and "recently added the ability for Borg to use different schedulers for different workload types." Kalena's secondary-scheduler design is the endpoint of a path Borg was already travelling.

### 5.5. The Usage Archive and the Interface Contract

Borg records all job submissions, task events, and fine-grained per-task resource usage in Infrastore, a queryable read-only data store. It is used for usage-based charging, debugging job and system failures, and long-term capacity planning, and it is the source of the public Google cluster traces.

Kalena requires the equivalent, and it is the concrete mechanism behind the closed-loop feedback promised in Section 5.1. The Kalena usage archive retains per-workload reservation and usage time series across all eight dimensions, eviction events with their triggering cause, and throttling durations.

**What Kalena reads from Kuberina.** The current solver emits a flat assignment map, `solution: {namespace/pod: node}`, alongside the Kuberina IR v0.2.0 input files describing nodes, DaemonSets, pods, and their requests. Manifest rendering with injected placement is scheduled as the `kuberina-forge` frontend in v0.3.0 and does not exist yet. Kalena therefore consumes the IR and the assignment map directly, which is the more stable interface in any case: it is the same data Kuberina's solver operated on, so the two systems cannot disagree about capacities, requests, or DaemonSet deductions.

**What Kalena writes back.** The archive exports per-workload empirical distributions in the same 8-dimensional shape as `ResourceVector`, so a subsequent planning cycle can substitute an observed percentile for a declared request without any schema translation. The exported record per workload is: the declared request, the steady-state reservation distribution, the observed peak, the burst frequency, and the fraction of samples exceeding the request.

Which percentile Kuberina should pack against is a policy choice for the operator rather than a fact Kalena can determine, and it is the natural place to express risk tolerance. Packing against P50 maximizes density and relies on Kalena to absorb the error; packing against P99 approaches the declared-request behavior Kuberina has today. This is the same knee-of-the-curve decision as $\lambda$ in Section 6.4, expressed at planning time instead of runtime.

The archive is also what makes Section 6.4's calibration protocol possible, since the safety curve relating $\lambda$ to eviction and OOM rates can only be drawn from historical data.

### 5.6. Boundary with Kuberina's Scheduler Extender

Kuberina's future work proposes "a scheduler extender that automatically applies the blueprint as scoring preferences within `kube-scheduler`, bridging the gap between offline planning and runtime execution." That component and Kalena both attach to the Kubernetes scheduling path, and the boundary between them should be stated before either is built.

The extender expresses the blueprint's *intent* for production pods to the default scheduler, so that a pod recreated after a node failure lands where the blueprint wanted it. Kalena schedules an entirely different pod population into capacity the blueprint never allocated. They operate on disjoint workload sets and disjoint ledgers, which is the same separation Section 2.3 establishes, and they compose: the extender keeps production faithful to the blueprint, and Kalena's restoration invariant guarantees it can always return the node to the state the extender is trying to maintain.

---

## 6. Implementation & Evaluation

### 6.1. Technology Stack

* **Core language: Go (Golang)** for the prototype and initial production releases, ensuring native compatibility with `k8s.io/kubernetes` (Scheduling Framework), `client-go`, and `moby/moby` (Docker SDK).
* **Alignment with the Kuberina toolchain.** Kuberina's solver is Rust and its planned `kuberina-forge` frontend is Go, so Kalena's Go implementation shares a language with the component it exchanges data with. Kuberina's v0.4.0 roadmap moves the forge-to-solver interface from static YAML to streaming gRPC over Protobuf, and Kalena's archive export should target that transport once it lands rather than committing to a YAML-only contract.
* **Rust core, if needed.** The design permits integrating a Rust optimization core via Go FFI if real-time calculations require specialized numeric throughput. The bar for this is high: Kalena's per-node scoring problem is far smaller than Kuberina's cluster-wide GA, which itself completes 2,714 pods across 186 nodes in under 44 seconds.
* **Licensing.** Kalena is released under AGPLv3, matching Kuberina's Phase 1 licensing and subject to the same three-phase transition roadmap, so the two components of the ecosystem can be distributed and relicensed together.

### 6.2. Evaluation Methodology: Cluster Compaction

Average utilization is an inadequate primary metric, and Borg says so explicitly: "Our jobs have placement constraints and need to handle rare workload spikes, our machines are heterogenous, and we run batch jobs in resources reclaimed from service jobs. So, to evaluate our policy choices we needed a more sophisticated metric than 'average utilization'."

Their replacement is **cell compaction**, and Kalena adopts it as **cluster compaction**:

> Given a workload, determine the smallest cluster it can be fitted into by removing nodes until the workload no longer fits, repeatedly re-packing the workload from scratch to avoid getting stuck on an unlucky configuration.

The experimental discipline surrounding it matters as much as the definition:

* **Repeat each experiment 11 times per cluster** with different random seeds, to maintain heterogeneity through randomized node removal.
* **Report the 90th percentile, not the mean or median.** Borg's justification is operational rather than statistical: "the mean or median would not reflect what a system administrator would do if they wanted to be reasonably sure that the workload would fit." Error bars show the full min-max range across trials.
* **Convert hard constraints to soft ones** for workload groups larger than half the original cluster size, and permit a small fraction (Borg used 0.2%) of especially constrained workloads to go pending.

The headline result is then expressed the way Borg expresses the value of reclamation in its Figure 10: **the number of additional nodes required if reclamation is disabled.** This produces a direct cost-benefit figure, it is comparable against Borg's published result, and it is considerably more defensible than a raw utilization percentage.

**The compaction baseline is Kuberina, not `kube-scheduler`.** Borg compacted against its own scheduler because it had no upstream planner. Kalena does, and comparing Kalena-plus-Kuberina against a naive first-fit cluster would credit Kalena with the node reduction Kuberina already achieved. Every compaction experiment therefore runs both arms through Kuberina first, and the only variable is whether reclamation is enabled. Kuberina's published Irina figures (152 or 182 active nodes depending on Pareto mode) are the baselines that Kalena's result must be reported against.

### 6.3. Evaluation Metrics

| # | Metric | Target | Method |
| --- | --- | --- | --- |
| 1 | Nodes saved by reclamation | Primary result | Cluster compaction with reclamation enabled vs. disabled, both arms pre-planned by Kuberina |
| 2 | Fraction of workload running in reclaimed capacity | Comparable to Borg's ~20% in a median cell | Reservation-ledger accounting over trace replay |
| 3 | Production SLO preservation | Bounded, calibrated (see below) | P99 latency and throughput on service-tier workloads, co-located vs. isolated |
| 4 | CPU scheduling delay under load | Sub-5 ms wait for the large majority of runnable threads at 80-100% node utilization | Per-cgroup PSI and `schedstat`, bucketed by node CPU utilization |
| 5 | Mitigation reaction latency | Sub-second | Time from PSI notification to CFS throttle applied or eviction issued |
| 6 | Reservation accuracy | Low over-estimation area | CDF of reservation/request and usage/request ratios |
| 7 | Batch forward progress | Bounded starvation | Distribution of completion time inflation and cumulative throttled time |
| 8 | Pareto reserve yield | Reserve carries useful work | Fraction of Kuberina's per-node Pareto reserve occupied by batch, measured over a diurnal cycle |
| 9 | Blueprint fidelity | Zero violations at all times | Continuous verification that evicting all batch restores the blueprint state, plus zero production anti-affinity or spread violations introduced by Kalena |
| 10 | Optimal Pareto threshold | Joint result | Sweep `--pareto` from 70 to 100 with reclamation on, and locate the setting maximizing total useful work |

Metrics 8 through 10 have no Borg analogue and exist only because Kuberina exists upstream. Metric 9 is a correctness gate rather than a performance figure: any nonzero value invalidates the run. Metric 10 is the joint question raised in Section 5.2, and it is the experiment most likely to change how Kuberina is operated, since it converts the Pareto threshold from an intuition into a measured optimum.

Verification for metric 9 reuses Kuberina's own external validator (`research/inspector.py`), which re-reads infrastructure, workload, and solution files and checks every constraint from scratch. Running it against the live cluster state with batch workloads filtered out is a direct test of the restoration invariant, and it has the property that the checker was written by the upstream system rather than by Kalena.

**A note on metric 3.** Earlier drafts of this proposal targeted P99 latency degradation under 2%. The Borg measurements suggest this may be optimistic if interpreted as a general interference bound. Borg sampled cycles-per-instruction across roughly 12,000 production tasks over a week and found a mean CPI of 1.58 in shared cells against 1.53 in dedicated cells, indicating **CPU performance approximately 3% worse under co-location.** A cleaner control, the Borglet itself, which runs on every machine in both cell types, showed a larger gap: CPI 1.20 in dedicated cells against 1.43 in shared ones.

Two qualifications keep this from being discouraging. First, CPI degradation and request-latency degradation are different quantities, and a service that is not CPU-bound will show a much smaller latency effect than its CPI shift implies. Second, and more importantly, Borg observes that the correlations, while statistically significant, "only explain 5% of the variance we saw in CPI measurements," with application-specific characteristics dominating.

Kalena therefore states its target as a calibrated envelope rather than a fixed constant: interference is measured per workload class during the calibration protocol, and the $\lambda$ setting is chosen to hold the observed degradation within the operator's declared tolerance. The 3% figure is carried in this document as the honest prior.

Metric 4 is the encouraging counterweight. Borg's Figure 13 shows that even at 80-100% machine CPU utilization, the fraction of time a runnable thread waited longer than 5 ms to obtain a CPU remained within a few percent, and waits beyond 10 ms were almost nonexistent. High utilization and low scheduling latency are compatible, which is the premise the entire proposal rests on.

### 6.4. Parameter Calibration Protocol

$\alpha$, $\lambda$, $T_{\text{grace}}$, and $T_{\text{min}}$ have no published values. Kalena's defaults must be derived experimentally, and Borg documents a protocol for exactly this.

Borg ran a live production cell through four consecutive weeks: baseline, **aggressive** (reduced safety margin), **medium** (midway between baseline and aggressive), and baseline again. Two quantities were tracked together: the gap between reservation and usage, and the cumulative count of out-of-memory events. Reservations tracked usage visibly more closely under the aggressive setting, and the OOM rate increased only slightly. Borg concluded that "the net gains outweighed the downsides" and deployed the medium setting fleet-wide.

Kalena reproduces this structure:

1. Run identical workload under a sweep of $\lambda$ settings, each for a full diurnal cycle at minimum, in an A/B/A/B arrangement so that drift in the workload is separable from the effect of the parameter.
2. Record jointly: reclaimed capacity, eviction count, kernel OOM count, and service-tier P99 latency.
3. Plot the **safety curve** of reclaimed capacity against SLO violation rate, and ship the knee of that curve as the default.
4. Expose $\lambda$ as a runtime-tunable value so operators can move along the curve according to their own risk tolerance.

The methodological point generalizes: **Kalena's defaults are experimental results, not design constants,** and the document should present them as such.

### 6.5. Experimental Setup

Evaluation follows a four-pronged methodology.

**The MSC Irina testbed, inherited from Kuberina.** Kalena reuses Kuberina's synthetic benchmark rather than constructing its own, because a shared testbed is the only way the two systems' results compose into a single claim about the ecosystem. The generator is `research/gen_irina_testdata.py`, and the cluster comprises 186 nodes across standard (64-core, 256 GiB), memory-optimized (32-core, 512 GiB), and GPU (48-core, 192 GiB, 8 GPU) types, carrying 2,714 pods with 4,632 anti-affinity and 496 affinity constraints, and 4 DaemonSets pre-deducted in Phase 0.

Two extensions are required to make it a reclamation benchmark. First, the workloads carry declared requests and no usage behavior, so each pod is assigned a synthetic diurnal usage profile parameterized by a request-to-peak ratio and a burst frequency, calibrated against the request-versus-usage distributions observed in the Google and Alibaba traces. Second, a batch workload population is added, since the existing 2,714 pods are all production. These extensions are contributed back to the Kuberina repository, because they are equally useful there.

**Trace replay.** Using public industry traces:

* *Google Cluster Workload Traces* (`clusterdata-2011-2` and `clusterdata-2019`), representing heterogeneous scheduling events from Borg cells. These are the traces produced by the Infrastore system described in Section 5.5, which makes them directly commensurable with the mechanisms Kalena reproduces.
* *Alibaba Cluster Trace* (`clusterdata`), containing co-located microservices and batch compute traces.

Kuberina's own threats-to-validity section identifies this as an outstanding gap on its side: "validation on real-world cluster traces (e.g., Google Cluster Trace, Alibaba Cluster Trace) would strengthen external validity." The trace ingestion harness Kalena requires produces exactly the artifact Kuberina needs, in Kuberina IR v0.2.0 form, so building it once serves both papers.

A second shared gap is worth naming. Kuberina reports that its benchmark loads zero pod groups, leaving the gang scheduling machinery formally specified and empirically unevaluated. Gang workloads are the archetypal batch population, so the batch extension described above supplies gang-structured jobs and exercises Kuberina's Block Booking path as a side effect.

**Large-scale cluster simulation.**

* **`kwok` (Kubernetes WithOut Kubelet):** simulating thousands of nodes and tens of thousands of pods on a single developer workstation with minimal memory footprint. This is the vehicle for the cluster compaction experiments in Section 6.2, since compaction requires repacking the same workload many times over.
* **`kube-burner`:** generating pod lifecycle churn and synthetic traffic bursts to benchmark scheduler resilience.

**High-fidelity replay.** Borg built Fauxmaster, a simulator containing a complete copy of the production Borgmaster code with stubbed-out Borglet interfaces, driven by checkpoints of real cell state. It was used for debugging, for capacity planning, and for pre-flight sanity checks answering questions such as "will this change evict any important jobs?"

Kalena's equivalent runs the **actual scheduler plugin binary** against a `kwok`-backed cluster fed by replayed cAdvisor time series, with only the node agent's enforcement calls stubbed. The value is that policy changes are evaluated against the code that will run in production rather than against a model of it. The same harness serves as the operator-facing pre-flight tool: given the current cluster's recorded state, report which batch workloads a proposed parameter change would evict.

A note on cost, which Borg raises and which applies with more force at smaller budgets: their experiments consumed 200,000 CPU cores at one point, "even at Google's scale, this is a non-trivial investment." Compaction is expensive because it repacks repeatedly. `kwok` is the choice that makes this tractable on a workstation.

### 6.6. Known Limitations & Technical Challenges

* **cAdvisor sampling latency.** cAdvisor polls metrics periodically at a default of 10-15 seconds, while memory consumption spikes can occur in sub-second timeframes. This bounds the accuracy of the estimator. It does not bound the safety of the system, because enforcement runs on the PSI fast channel (Section 3.1). The residual risk is over-estimation of available slack between samples, which manifests as an eviction rather than an outage.
* **Linux kernel OOM risk.** Delayed eviction could trigger the kernel OOM killer before Kalena terminates batch workloads, risking inadvertent termination of production processes. Mitigations: cgroups v2 `memory.high` thresholds enforce kernel-level throttling on batch memory allocations before `memory.max` is breached, and PSI `eventfd` integration provides non-polling notification of memory contention.
* **Memory accounting under eager file caching.** Borg records that "Linux's eager file-caching significantly complicates the implementation because of the need for accurate memory-accounting." Page cache attribution remains genuinely ambiguous, and a workload's reclaimable cache should not be counted against it identically to its anonymous memory. Kalena's estimator operates on working-set approximations derived from cgroups v2 `memory.current` less reclaimable page cache, and the accuracy of this decomposition is an open item.
* **Low-level interference beyond cgroup control.** Borg notes that even with full cgroup containment, "occasional low-level resource interference (e.g., memory bandwidth or L3 cache pollution) still happens." Kalena inherits this limitation without a solution. It is the irreducible floor under metric 3 and the likeliest explanation for residual latency degradation that the reservation model cannot predict.
* **Best-effort preemption notice.** As described in Section 3.5, grace periods are not guaranteed under acute pressure.
* **Enforcement gaps on the disk and network dimensions.** As stated in Section 3.2, cgroups v2 `io.max` behaves inconsistently across storage stacks and there is no cgroup controller for network bandwidth at all. Four of Kuberina's eight dimensions are therefore accounted but not yet enforced, which means Kalena can detect I/O and network contention and rank placements to avoid it, and cannot yet compel a batch workload to yield bandwidth.
* **Blueprint staleness bounds Kalena's correctness guarantees.** The restoration invariant guarantees Kalena can return a node to the blueprint state. It does not guarantee that state is still appropriate. If production workloads have been rescheduled by node failure, scaled by an HPA, or mutated by a vertical autoscaler, the running cluster no longer matches the blueprint and Kalena's request ledger drifts from reality. Kalena detects this through the drift metric in Section 5.3 and reports it. Resolving it requires a Kuberina re-plan, which is a human-gated action.
* **GPU capacity is not reclaimed.** Section 2.4 excludes the GPU dimension entirely. On Kuberina's Irina benchmark this leaves 88 of 240 GPU units unallocated and unavailable to opportunistic work, which is the largest single category of capacity Kalena knowingly declines to harvest.

---

## 7. Observability and Operator Experience

Borg treats introspection as a first-class requirement rather than a feature, and its reasoning transfers directly:

> "An important design decision in Borg was to surface debugging information to all users rather than hiding it: Borg has thousands of users, so 'self-help' has to be the first step in debugging."

A reclamation scheduler makes decisions that are invisible by construction. A batch pod is pending, and the reason is that node slack fell below its request four seconds ago. A batch pod was killed, and the reason is that a production pod on the same node crossed its reservation. Without explanation, this reads as nondeterministic scheduler misbehavior, which is fatal to operator trust in exactly the systems Kalena targets.

Kalena therefore commits to three surfaces:

1. **A "why pending?" explanation,** following Borg's practice of providing a pending annotation "together with guidance on how to modify the job's resource requests to better fit the cell." Kalena emits Kubernetes events naming the binding constraint (which resource dimension, on how many nodes, by what margin) and the request adjustment that would make the workload schedulable.
2. **A "why evicted?" record,** naming the triggering node condition, the workload whose reservation rose, the priority comparison that selected this victim, and whether the limit-breach override applied.
3. **A per-node slack view,** exposing capacity, aggregate limits, aggregate reservations, and live usage as four distinct series. Borg's Figure 12 plots exactly these four quantities, and the visual gap between limit and reservation is the most direct representation of what the system is doing that any operator will encounter.

Borg's own retrospective flags the counterweight, and Kalena should heed it. Under "lessons learned: the bad," the paper identifies **optimizing for power users at the expense of casual ones**, noting that the BCL specification grew to roughly 230 parameters and that "the richness of this API makes things harder for the 'casual' user, and constrains its evolution." Kalena's entire OpX premise is the single-label opt-in of Section 2.8. Every knob introduced in this document is optional and defaulted, and that property is a constraint on future development rather than an accident of the current draft.

---

## 8. Conclusion & Next Steps

Kalena completes the resource management cycle in the Naughtian ecosystem. Pairing Kuberina's offline combinatorial rigor with reclamation-based online slack harvesting maximizes hardware efficiency while honoring Operator Experience principles.

The design target is a faithful reproduction of Borg's reclamation and co-scheduling behavior at self-managed scale: the dual-ledger feasibility rule, the asymmetric reservation estimator with its startup grace, the three-tier control loop separating estimation from enforcement, priority-ordered eviction terminating against the reservation ledger, and the compaction-based evaluation methodology that makes the result comparable to the published Borg figures.

Where Kalena departs from Borg, it does so because Kuberina occupies the position Borg's own scheduler held. Borg estimated reservations against limits because it also decided placement; Kalena estimates against requests because Kuberina decided placement first, and the blueprint restoration invariant is what keeps that decision inviolate. Borg reclaimed two resource classes; Kalena reclaims across Kuberina's eight dimensions and declines the ninth case, GPU, openly. Borg had no upstream planner to feed; Kalena's usage archive answers the runtime feedback gap Kuberina names as its own limitation.

Immediate development roadmap:

1. Develop the initial Go prototype as a Kubernetes Scheduling Framework plugin, implementing the dual-ledger invariant (Section 2.3) first, since every other mechanism depends on it. Verify it continuously against the blueprint restoration property using Kuberina's `inspector.py`.
2. Build the Kuberina IR v0.2.0 ingestion path, so that node capacities, DaemonSet deductions, requests, and topology constraints are read from the same artifacts the solver used rather than re-derived from the live cluster.
3. Implement the node agent's three-tier control loop (Section 3.1) and validate cgroups v2 PSI `eventfd` triggers for sub-second preemption response. CPU and memory enforcement first; disk and network remain accounted-but-advisory.
4. Extend the MSC Irina testbed with synthetic usage profiles and a batch workload population (Section 6.5), contributing both back to the Kuberina repository, and implement cluster compaction (Section 6.2) as the primary evaluation harness.
5. Execute the calibration protocol (Section 6.4) to establish shipping defaults for $\alpha$, $\lambda$, and $T_{\text{grace}}$, then run the joint Pareto threshold sweep (Section 6.3, metric 10) and report the result to the Kuberina side as an operating recommendation.

---

## Appendix A: Borg Provenance Map

Each mechanism adopted in this proposal, mapped to its source in Verma et al., *Large-scale cluster management at Google with Borg*, EuroSys 2015.

| Kalena mechanism | Section here | Borg source | Adaptation |
| --- | --- | --- | --- |
| Dual-ledger feasibility (requests for service, reservations for batch) | 2.3 | §5.5 | Borg's "limit" becomes the Kubernetes **request**, because that is what Kuberina packs against; the request ledger is frozen by Kuberina offline |
| Reservation initialized to the Kuberina request | 2.5 | §5.5 | Borg initializes to the limit; Kalena initializes to the request and caps the reservation at the limit |
| 300 s startup grace before estimation | 2.5 | §5.5 | Adopted directly, exposed per-workload |
| Slow decay toward usage, immediate rise | 2.5 | §5.5 | Reformulated as asymmetric EWMA to separate $\alpha$ from $\lambda$ |
| Per-workload estimation opt-out | 2.5 | §2.5 | Annotation instead of user capability |
| Tier and priority as orthogonal axes | 2.6 | §2.5, §6.2 | Appclass becomes `tier`; priority bands become an integer |
| No preemption within the service tier | 2.6 | §2.5 | Adopted to protect the Kuberina blueprint |
| Slack CPU on by default, slack memory off | 2.7 | §6.2 | Adopted directly |
| Estimation central and slow, enforcement local and fast | 3.1 | §5.5, §6.2 | Escalation tier made explicit |
| Compressible throttle vs. non-compressible evict | 3.2 | §6.2 | Extended from Borg's 2 classes to Kuberina's 8 dimensions, adding a third non-reclaimable class for GPU |
| Shares insufficient, CFS bandwidth control required | 3.2 | §6.2 | Adopted directly |
| Evict lowest priority first until reservations are met | 3.3 | §6.2 | Adopted directly, including the stopping condition |
| Limit-breach override on eviction ordering | 3.3 | §5.5 | Adopted directly |
| Anti-starvation cap on greedy service workloads | 3.4 | §6.2 | Restricted to workloads exceeding their own reservation |
| SIGTERM before SIGKILL, best-effort | 3.5 | §2.3 | Adopted with the 80% delivery caveat retained |
| Hybrid scoring minimizing stranded resources | 4.1 | §3.2 | Adopted directly |
| Prefer mixing priorities on one node | 4.1 | §3.2 | Adopted directly |
| Score caching ignoring small quantity changes | 4.2 | §3.4 | Formalized as slack quantization, since reservations move continuously |
| Equivalence classes | 4.2 | §3.4 | Mapped to pod-template owners |
| Relaxed randomization | 4.2 | §3.4 | Adopted directly |
| Optimistic concurrency on a cached view | 4.2 | §3.4 | Native to secondary schedulers |
| Package locality in scoring | 4.3 | §3.2 | Becomes image locality, weighted up |
| Requeue rather than migrate or hibernate | 4.4 | §3.2 fn. 3 | Adopted directly |
| Rate-limited rescheduling from unreachable nodes | 4.4 | §4 | Adopted directly |
| Avoid repeating harmful workload-node pairings | 4.3 | §4 | Generalized into an eviction cooldown |
| Quota at admission | 4.5 | §2.5 | Simplified to an optional per-namespace running cap |
| Usage archive feeding capacity planning | 5.5 | §2.6 (Infrastore) | Feedback consumer is Kuberina |
| Cluster compaction as evaluation metric | 6.2 | §5.1 | Adopted directly, including 11 trials and the 90th percentile |
| Reclamation valued as "extra nodes needed without it" | 6.2 | §5.5, Fig. 10 | Adopted directly |
| A/B/A parameter calibration on a live cluster | 6.4 | §5.5, Fig. 12 | Adopted directly |
| High-fidelity replay against real scheduler code | 6.5 | §3.1 (Fauxmaster) | `kwok` plus cAdvisor trace replay |
| "Why pending?" self-service diagnostics | 7 | §2.6, §8.2 | Adopted directly |
| Avoid power-user parameter sprawl | 7 | §8.1 | Treated as a design constraint |

Mechanisms below have no Borg antecedent and exist because Kuberina sits upstream.

| Kalena mechanism | Section here | Origin in Kuberina |
| --- | --- | --- |
| Blueprint restoration invariant | 2.3 | The blueprint is a feasibility proof that Kalena must not invalidate |
| Node capacity is the post-Phase-0 net quantity | 2.3 | PAPER.md §3.2 DaemonSet pre-deduction |
| DaemonSets excluded from the eviction set | 3.3 | DaemonSets are non-decision variables (ballast water) |
| 8-dimensional reclaimability taxonomy | 2.4 | CHANGELOG v0.2.0 8D MDBP expansion |
| GPU excluded from reclamation | 2.4 | GPU is a hard CSP constraint with no throttling primitive |
| Production anti-affinity binds batch placement | 4.1 | Anti-affinity targets encoded in Kuberina IR |
| Batch never counts toward production topology skew | 4.1 | `maxSkew` / `topologyKey` soft penalty in the fitness function |
| Blueprint drift metric $D(t)$ | 5.3 | Answers PAPER.md §8.1 "event-driven re-planning threshold" |
| Empirical distributions exported for re-planning | 5.5 | Answers PAPER.md §8.1 "No Runtime Feedback Loop" |
| Pareto reserve as the primary harvest ground | 5.2 | `--pareto` capping, PAPER.md §6.2 Resource Canal |
| Pareto threshold sweep as a joint metric | 6.3 | Converts a Kuberina configuration choice into a measured optimum |
| Compaction baseline is Kuberina, not `kube-scheduler` | 6.2 | Avoids crediting Kalena with Kuberina's node reduction |
| Verification via Kuberina's `inspector.py` | 6.3 | Reuses the upstream external validator |

## Appendix B: Reference Figures from Borg

Baseline values carried forward into this proposal's targets and justifications.

| Quantity | Value | Source |
| --- | --- | --- |
| Production CPU allocated vs. used | ~70% allocated, ~60% of usage | §2.1 |
| Production memory allocated | ~55%, representing ~85% of memory usage | §2.1 |
| Workload running in reclaimed resources, median cell | ~20% | §5.5 |
| Extra machines if production and batch were segregated | 20-30% median | §5.2, Fig. 5 |
| Extra machines if resource requests were bucketed to powers of two | 30-50% median | §5.4, Fig. 9 |
| Packing efficiency of hybrid scoring over best-fit | 3-5% | §3.2 |
| Mean CPI, shared vs. dedicated cells | 1.58 vs. 1.53 (~3% worse) | §5.2 |
| Borglet CPI, shared vs. dedicated | 1.43 vs. 1.20 | §5.2 |
| Variance in CPI explained by co-location | ~5% | §5.2 |
| Thread wait > 5 ms at 80-100% node CPU utilization | a few percent | §6.2, Fig. 13 |
| Median task startup latency | ~25 s, ~80% package installation | §3.2 |
| Preemption notice delivery rate | ~80% | §2.3 |
| Non-production tasks requesting < 0.1 cores | 20% | §3.2 |
| Batch tasks opting into slack memory | 79% | §6.2 |
| Full-workload scheduling pass, techniques disabled | did not finish in 3 days | §3.4 |
| Machines running 9 or more tasks | 50% | §6 |

## Appendix C: Kuberina Interface Contract

The precise coupling surface between the two systems, as of Kuberina v0.2.0 (2026-08-02).

### C.1. Data Kalena reads

| Artifact | Source | Use |
| --- | --- | --- |
| `nodes[].allocatable` (8-vector) | Kuberina IR infrastructure file | Raw node capacity, before Phase 0 |
| `daemonsets[]` with `nodeSelector` and `tolerations` | Kuberina IR infrastructure file | Recompute the identical Phase 0 deduction to obtain $C_n$ |
| `nodes[].labels`, `.taints`, `.zone`, `.rack` | Kuberina IR infrastructure file | Feasibility filtering and topology domain resolution for batch placement |
| `pods[].requests` (8-vector) | Kuberina IR workload file | The request ledger, and the initial value of every reservation |
| `pods[].antiAffinity` | Kuberina IR workload file | Binding constraint on batch placement (Section 4.1) |
| `pods[].topologySpread` (`maxSkew`, `topologyKey`) | Kuberina IR workload file | Skew accounting that batch must not disturb |
| `solution: {namespace/pod: node}` | Solver output | Which production workloads Kalena should expect on each node |

Kalena recomputes the Phase 0 deduction rather than reading a derived capacity, because the derived value is not currently emitted. Any divergence between Kalena's recomputation and the solver's is a bug in one of the two, and the shared `inspector.py` validator detects it.

### C.2. Data Kalena writes

Per production workload, in `ResourceVector` shape so it drops into the IR without translation:

| Field | Meaning |
| --- | --- |
| `declared_request` | What the manifest asked for, carried through unchanged for comparison |
| `reservation_p50`, `reservation_p95`, `reservation_p99` | Steady-state reservation distribution, excluding the startup grace window |
| `observed_peak` | Maximum sampled usage over the retention window |
| `burst_frequency` | Fraction of samples exceeding `declared_request` |
| `exceeded_limit_events` | Count of limit breaches, which flag a workload as mis-sized rather than merely over-provisioned |

Per node:

| Field | Meaning |
| --- | --- |
| `slack_yield` | Reclaimed capacity actually occupied by batch, integrated over time |
| `eviction_events` | Count and cause, which identifies nodes whose production load is too volatile to co-locate against |
| `drift` | The node's contribution to $D(t)$ (Section 5.3) |

### C.3. Invariants Kalena guarantees to Kuberina

1. Production workload placements are never mutated.
2. Production workload `requests` are never mutated.
3. Evicting every batch workload restores each node to the blueprint state exactly.
4. No production anti-affinity constraint is violated by a Kalena placement.
5. No production topology skew is altered by a Kalena placement.
6. DaemonSet workloads are never evicted.
7. No blueprint regeneration is triggered automatically. Drift is reported, and re-planning remains a human-gated action, preserving the reviewability that is Kuberina's stated primary contribution.
