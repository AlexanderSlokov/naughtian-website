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

Self-managed, on-premise, and edge clusters consistently run at only 30-40% average hardware capacity because cluster operators must allocate static, worst-case safety headroom for production services. Within the Naughtian ecosystem, Kuberina solves the offline combinatorial optimization problem, packing static workloads into an optimal initial blueprint. In production, dynamic runtime traffic variations inevitably leave substantial unharvested capacity idle.

We propose **Kalena**, a reclamation scheduler for Kubernetes, standalone Docker, and Docker Swarm. Kalena ingests runtime telemetry from cAdvisor and the Linux Pressure Stall Information subsystem, continuously estimates a per-container *reservation* using an asymmetric decay model derived from Google Borg, and exposes the difference between reservation and static limit as schedulable slack. Containment is enforced through a three-tier control loop separating slow central estimation from fast node-local mitigation. Kalena targets a cluster hardware utilization of 70-85% while keeping production P99 latency degradation within a bounded and empirically calibrated envelope.

The design goal is explicit: reproduce the scheduling and reclamation behavior that Borg documents in [Verma et al., EuroSys 2015], at the scale and operational complexity budget of infrastructure operators outside hyperscale control planes. Borg reports that approximately 20% of the workload in a median cell runs entirely in reclaimed resources. That figure is the target Kalena is designed against.

---

## 1. Context & Problem

### 1.1. The Static Headroom Waste

In modern infrastructure operations, engineers size container resource requests and limits around peak projected demand plus a safety margin. Kuberina solves the offline bin-packing challenge by mapping maritime container stowage planning onto pod placement, producing an optimal immutable blueprint.

A substantial gap remains between static reservation and dynamic utilization. Safety headroom produces massive hardware waste. Expensive on-premise nodes and edge servers idle at low CPU and memory footprints even when the control plane marks them fully booked.

This gap is quantified in the Borg literature. In a representative Borg cell, production jobs are *allocated* about 70% of total CPU resources while *representing* about 60% of total CPU usage, and are allocated about 55% of total memory. The discrepancy between allocation and usage is the entire economic basis for reclamation.

### 1.2. The Cost of Segregation

The conventional alternative to co-location is physical separation: one cluster for latency-sensitive services, another for batch compute. Borg measured this directly through cell compaction experiments and found that segregating production and non-production work into different cells would require **20-30% more machines** in the median cell. Splitting a single large cell into smaller ones, or granting large tenants private cells, is more expensive still: partitioning by tenant above a 10 TiB memory threshold would require 2-16 times as many cells and 20-150% additional machines.

Co-location is therefore an efficiency win even before accounting for the interference it introduces.

### 1.3. The Technical Gap

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

$$\text{Free}^{\text{prod}}_n = C_n - \sum_{i \in \mathcal{P}(n)} L_i$$

$$\text{Slack}_n(t) = C_n - \sum_{i \in \mathcal{P}(n)} R_i(t) - \sum_{j \in \mathcal{B}(n)} R_j(t)$$

where $C_n$ is node capacity, $\mathcal{P}(n)$ and $\mathcal{B}(n)$ are the production and batch workloads resident on node $n$, $L_i$ is the static limit of workload $i$, and $R_i(t)$ is its current reservation.

* **Production placement reads the limit ledger.** Production workloads are sized against declared limits and never see reclaimed capacity. They are structurally incapable of being scheduled into oversubscribed space. Batch workloads are excluded from this ledger entirely, because they are evictable and therefore do not constitute an obstruction.
* **Batch placement reads the reservation ledger.** Opportunistic workloads are sized against live reservations, which is precisely where the harvestable capacity appears.

Borg states the rule directly: the scheduler "uses limits to calculate feasibility for prod tasks, so they never rely on reclaimed resources and aren't exposed to resource oversubscription; for non-prod tasks, it uses the reservations of existing tasks so the new tasks can be scheduled into reclaimed resources."

For Kalena this invariant carries additional weight. Kuberina computes production placement offline against declared limits. The limit ledger is therefore Kuberina's ledger, computed once and frozen into the blueprint. Kalena owns and mutates only the reservation ledger. The two systems write to disjoint state, which is what reduces the runtime scheduling overhead of production workloads to zero.

### 2.4. Resource Estimation: The Reservation

The reservation $R_i(t)$ is Kalena's running estimate of how much of its limit a workload actually needs. Its dynamics are deliberately asymmetric: slow to release capacity, immediate to reclaim it.

Let $U_i(t)$ be the usage sampled from cAdvisor at interval $T$, and let $\lambda$ be the safety margin multiplier. Define the instantaneous target:

$$\text{Target}_i(t) = U_i(t) \times (1 + \lambda)$$

The reservation then evolves as:

$$
R_i(t) =
\begin{cases}
L_i, & t - t_i^{\text{start}} < T_{\text{grace}} \\[4pt]
\text{Target}_i(t), & \text{Target}_i(t) > R_i(t-1) \\[4pt]
\alpha R_i(t-1) + (1-\alpha)\,\text{Target}_i(t), & \text{otherwise}
\end{cases}
$$

Three properties deserve emphasis, and the first two were absent from earlier drafts of this proposal:

1. **The initial reservation equals the limit.** A newly admitted workload is credited its full declared limit. It contributes zero slack until it has proven, through observed usage, that it does not need the reservation. The failure mode this prevents is severe: a freshly deployed production pod that has not yet received traffic would otherwise be estimated at near-zero usage, its limit released as slack, and batch work packed on top of it immediately before its load arrives.

2. **A startup grace period $T_{\text{grace}}$ suppresses estimation entirely.** Borg holds the reservation at the limit for 300 seconds "to allow for startup transients." Container startup involves image extraction, JIT warmup, connection pool establishment, and cache population, none of which resemble steady-state behavior. Kalena adopts 300 seconds as the default and exposes it per-workload.

3. **Decay is slow, rise is immediate.** With $\alpha$ close to 1, released capacity is surrendered over minutes. Any sample exceeding the current reservation raises it in a single step. The decayed-maximum formulation used in earlier drafts is the limiting case of this rule with the margin applied outside the maximum, and the exponential form is preferred here because it makes $\alpha$ and $\lambda$ independently tunable.

Neither $\alpha$ nor $\lambda$ is published in the Borg literature. Both are treated in this proposal as parameters requiring empirical calibration, and Section 6.4 specifies the protocol.

**Estimation escape hatch.** Borg grants privileged users a capability to disable resource estimation on their jobs entirely. Kalena provides the equivalent through a `kalena.naughtian.io/reclaim: disabled` annotation, which pins $R_i(t) = L_i$ permanently. Workloads with pathological or unmeasurable burst behavior are better excluded than mismodeled.

### 2.5. Workload Classification: Two Orthogonal Axes

Borg separates two concerns that are frequently conflated. Kalena adopts the same separation.

* **Tier (isolation class).** Determines *how* a workload is treated by the enforcement machinery: whether it may consume slack, whether it is subject to eviction, and which cgroup policy applies. Two values: `service` and `batch`. This corresponds to Borg's *appclass* distinction between latency-sensitive and batch tasks.
* **Priority (eviction order).** A small non-negative integer determining *which* workload is sacrificed first under contention. This corresponds to Borg's *priority bands*.

The two axes are independent. A high-priority batch job is still throttled and still evictable, and simply dies last among batch workloads. This matters as soon as an operator runs more than one kind of opportunistic work: a CI build that a developer is waiting on and a nightly reindex are both `batch`, and they should not be equally disposable.

Kalena inherits one further rule from Borg: **workloads in the service tier may not preempt one another.** Borg introduced this constraint to eliminate preemption cascades, where a high-priority task displaces a slightly lower-priority one, which displaces another, and so on. Production placement in the Naughtian ecosystem is Kuberina's blueprint, and a runtime cascade would invalidate it.

### 2.6. Slack Consumption Policy

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

### 2.7. Zero-Friction Defaults

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

Kalena classifies resources exactly as Borg does, and responds accordingly:

* **Compressible resources (CPU, disk I/O bandwidth):** rate-based, and reclaimable from a workload by degrading its quality of service without killing it. Under contention, Kalena throttles opportunistic workloads using Linux CFS bandwidth controls, granting priority to service-tier workloads.
* **Non-compressible resources (memory, disk space):** generally unreclaimable without terminating the workload. When memory pressure crosses threshold, Kalena evicts batch workloads.

On the CPU mechanism specifically, Borg records a finding worth preserving: **cgroup shares alone are insufficient.** Because the system supports multiple priority levels rather than a single binary distinction, Borg "selectively applies CFS bandwidth control when needed" in addition to shares. Kalena's two-axis classification (Section 2.5) creates exactly the same multi-level structure, and therefore inherits the same requirement. Shares express proportional entitlement; bandwidth control expresses a hard ceiling. Both are needed.

Borg further reserves entire physical cores for latency-sensitive tasks and applies `cpuset` pinning sparingly for applications with particularly tight latency requirements. Kalena exposes the equivalent through Kubernetes' static CPU manager policy for service-tier workloads that declare it, while batch workloads remain permitted to run on any core with minimal shares.

### 3.3. Eviction Ordering and Stopping Condition

When a node exhausts non-compressible resources, Kalena evicts **from lowest to highest priority, until the remaining reservations can be met.**

The stopping condition is stated in terms of the reservation ledger rather than a free-bytes threshold. This is a deliberate inheritance from Borg, and it has a useful property: the eviction loop terminates against the same quantity the estimator maintains, so the enforcement path and the estimation path cannot disagree about when the node is healthy.

$$\text{evict until} \quad \sum_{i \in \mathcal{P}(n) \cup \mathcal{B}(n)} R_i(t) \le C_n$$

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

1. **Stranded-slack minimization.** Prefer nodes where placing this workload leaves the remaining slack vector balanced across CPU and memory. A node with 8 cores and 200 MiB of free memory strands the cores.
2. **Co-location preference.** Prefer nodes that already host a mix of service-tier and batch workloads. This is counterintuitive and is stated explicitly in Borg's scoring criteria: "putting a mix of high and low priority tasks onto a single machine to allow the high-priority ones to expand in a load spike." Concentrating batch onto nodes that also carry production is the mechanism by which production retains room to burst, since batch is the compressible ballast that yields.
3. **Image locality.** Weighted heavily, for reasons developed in Section 4.3.
4. **Volatility penalty.** Penalize nodes whose reservation series has shown high variance over the recent window. A node with stable production load is a better host for opportunistic work than a node with the same mean slack and a spiky profile.

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

1. **Zero-latency baseline:** production workloads have their placement (`nodeName`) statically decided by Kuberina in the blueprint YAML, reducing production scheduling overhead to 0 ms at runtime.
2. **Focused runtime scheduling:** Kalena expends scheduling cycles exclusively on packing opportunistic jobs into unharvested headroom.
3. **Closed-loop feedback:** Kalena records empirical consumption profiles over time and exports this telemetry back to Kuberina. Future planning cycles use empirical distributions to tighten bin-packing margins.

### 5.2. Architectural Feasibility: Decoupling Production Placement from Slack Harvesting

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

### 5.3. The Usage Archive

Borg records all job submissions, task events, and fine-grained per-task resource usage in Infrastore, a queryable read-only data store. It is used for usage-based charging, debugging job and system failures, and long-term capacity planning, and it is the source of the public Google cluster traces.

Kalena requires the equivalent, and it is the concrete mechanism behind the closed-loop feedback promised in Section 5.1. The Kalena usage archive retains per-workload reservation and usage time series, eviction events with their triggering cause, and throttling durations. Kuberina consumes this archive to replace declared limits with empirical distributions in subsequent planning cycles, tightening the blueprint against observed behavior rather than operator estimates.

The archive is also what makes Section 6.4's calibration protocol possible, since the safety curve relating $\lambda$ to eviction and OOM rates can only be drawn from historical data.

---

## 6. Implementation & Evaluation

### 6.1. Technology Stack

* **Core language: Go (Golang)** for the prototype and initial production releases, ensuring native compatibility with `k8s.io/kubernetes` (Scheduling Framework), `client-go`, and `moby/moby` (Docker SDK).
* **Future extension:** the design permits integrating a Rust optimization core via Go FFI/shim if real-time combinatorial calculations require specialized numeric throughput, matching Kuberina's Rust solver.

### 6.2. Evaluation Methodology: Cluster Compaction

Average utilization is an inadequate primary metric, and Borg says so explicitly: "Our jobs have placement constraints and need to handle rare workload spikes, our machines are heterogenous, and we run batch jobs in resources reclaimed from service jobs. So, to evaluate our policy choices we needed a more sophisticated metric than 'average utilization'."

Their replacement is **cell compaction**, and Kalena adopts it as **cluster compaction**:

> Given a workload, determine the smallest cluster it can be fitted into by removing nodes until the workload no longer fits, repeatedly re-packing the workload from scratch to avoid getting stuck on an unlucky configuration.

The experimental discipline surrounding it matters as much as the definition:

* **Repeat each experiment 11 times per cluster** with different random seeds, to maintain heterogeneity through randomized node removal.
* **Report the 90th percentile, not the mean or median.** Borg's justification is operational rather than statistical: "the mean or median would not reflect what a system administrator would do if they wanted to be reasonably sure that the workload would fit." Error bars show the full min-max range across trials.
* **Convert hard constraints to soft ones** for workload groups larger than half the original cluster size, and permit a small fraction (Borg used 0.2%) of especially constrained workloads to go pending.

The headline result is then expressed the way Borg expresses the value of reclamation in its Figure 10: **the number of additional nodes required if reclamation is disabled.** This produces a direct cost-benefit figure, it is comparable against Borg's published result, and it is considerably more defensible than a raw utilization percentage.

### 6.3. Evaluation Metrics

| # | Metric | Target | Method |
| --- | --- | --- | --- |
| 1 | Nodes saved by reclamation | Primary result | Cluster compaction with reclamation enabled vs. disabled |
| 2 | Fraction of workload running in reclaimed capacity | Comparable to Borg's ~20% in a median cell | Reservation-ledger accounting over trace replay |
| 3 | Production SLO preservation | Bounded, calibrated (see below) | P99 latency and throughput on service-tier workloads, co-located vs. isolated |
| 4 | CPU scheduling delay under load | Sub-5 ms wait for the large majority of runnable threads at 80-100% node utilization | Per-cgroup PSI and `schedstat`, bucketed by node CPU utilization |
| 5 | Mitigation reaction latency | Sub-second | Time from PSI notification to CFS throttle applied or eviction issued |
| 6 | Reservation accuracy | Low over-estimation area | CDF of reservation/limit and usage/limit ratios |
| 7 | Batch forward progress | Bounded starvation | Distribution of completion time inflation and cumulative throttled time |

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

Evaluation follows a three-pronged methodology.

**Trace replay.** Using public industry traces:

* *Google Cluster Workload Traces* (`clusterdata-2011-2` and `clusterdata-2019`), representing heterogeneous scheduling events from Borg cells. These are the traces produced by the Infrastore system described in Section 5.3, which makes them directly commensurable with the mechanisms Kalena reproduces.
* *Alibaba Cluster Trace* (`clusterdata`), containing co-located microservices and batch compute traces.

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

---

## 7. Observability and Operator Experience

Borg treats introspection as a first-class requirement rather than a feature, and its reasoning transfers directly:

> "An important design decision in Borg was to surface debugging information to all users rather than hiding it: Borg has thousands of users, so 'self-help' has to be the first step in debugging."

A reclamation scheduler makes decisions that are invisible by construction. A batch pod is pending, and the reason is that node slack fell below its request four seconds ago. A batch pod was killed, and the reason is that a production pod on the same node crossed its reservation. Without explanation, this reads as nondeterministic scheduler misbehavior, which is fatal to operator trust in exactly the systems Kalena targets.

Kalena therefore commits to three surfaces:

1. **A "why pending?" explanation,** following Borg's practice of providing a pending annotation "together with guidance on how to modify the job's resource requests to better fit the cell." Kalena emits Kubernetes events naming the binding constraint (which resource dimension, on how many nodes, by what margin) and the request adjustment that would make the workload schedulable.
2. **A "why evicted?" record,** naming the triggering node condition, the workload whose reservation rose, the priority comparison that selected this victim, and whether the limit-breach override applied.
3. **A per-node slack view,** exposing capacity, aggregate limits, aggregate reservations, and live usage as four distinct series. Borg's Figure 12 plots exactly these four quantities, and the visual gap between limit and reservation is the most direct representation of what the system is doing that any operator will encounter.

Borg's own retrospective flags the counterweight, and Kalena should heed it. Under "lessons learned: the bad," the paper identifies **optimizing for power users at the expense of casual ones**, noting that the BCL specification grew to roughly 230 parameters and that "the richness of this API makes things harder for the 'casual' user, and constrains its evolution." Kalena's entire OpX premise is the single-label opt-in of Section 2.7. Every knob introduced in this document is optional and defaulted, and that property is a constraint on future development rather than an accident of the current draft.

---

## 8. Conclusion & Next Steps

Kalena completes the resource management cycle in the Naughtian ecosystem. Pairing Kuberina's offline combinatorial rigor with reclamation-based online slack harvesting maximizes hardware efficiency while honoring Operator Experience principles.

The design target is a faithful reproduction of Borg's reclamation and co-scheduling behavior at self-managed scale: the dual-ledger feasibility rule, the asymmetric reservation estimator with its startup grace, the three-tier control loop separating estimation from enforcement, priority-ordered eviction terminating against the reservation ledger, and the compaction-based evaluation methodology that makes the result comparable to the published Borg figures.

Immediate development roadmap:

1. Develop the initial Go prototype as a Kubernetes Scheduling Framework plugin, implementing the dual-ledger invariant (Section 2.3) first, since every other mechanism depends on it.
2. Implement the node agent's three-tier control loop (Section 3.1) and validate cgroups v2 PSI `eventfd` triggers for sub-second preemption response.
3. Construct the benchmarking testbed using `kwok` and the Alibaba Cluster Trace, and implement cluster compaction (Section 6.2) as the primary evaluation harness.
4. Execute the calibration protocol (Section 6.4) to establish shipping defaults for $\alpha$, $\lambda$, and $T_{\text{grace}}$.

---

## Appendix A: Borg Provenance Map

Each mechanism adopted in this proposal, mapped to its source in Verma et al., *Large-scale cluster management at Google with Borg*, EuroSys 2015.

| Kalena mechanism | Section here | Borg source | Adaptation |
| --- | --- | --- | --- |
| Dual-ledger feasibility (limits for service, reservations for batch) | 2.3 | §5.5 | Limit ledger is frozen by Kuberina offline |
| Reservation initialized to limit | 2.4 | §5.5 | Adopted directly |
| 300 s startup grace before estimation | 2.4 | §5.5 | Adopted directly, exposed per-workload |
| Slow decay toward usage, immediate rise | 2.4 | §5.5 | Reformulated as asymmetric EWMA to separate $\alpha$ from $\lambda$ |
| Per-workload estimation opt-out | 2.4 | §2.5 | Annotation instead of user capability |
| Tier and priority as orthogonal axes | 2.5 | §2.5, §6.2 | Appclass becomes `tier`; priority bands become an integer |
| No preemption within the service tier | 2.5 | §2.5 | Adopted to protect the Kuberina blueprint |
| Slack CPU on by default, slack memory off | 2.6 | §6.2 | Adopted directly |
| Estimation central and slow, enforcement local and fast | 3.1 | §5.5, §6.2 | Escalation tier made explicit |
| Compressible throttle vs. non-compressible evict | 3.2 | §6.2 | Adopted directly |
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
| Usage archive feeding capacity planning | 5.3 | §2.6 (Infrastore) | Feedback consumer is Kuberina |
| Cluster compaction as evaluation metric | 6.2 | §5.1 | Adopted directly, including 11 trials and the 90th percentile |
| Reclamation valued as "extra nodes needed without it" | 6.2 | §5.5, Fig. 10 | Adopted directly |
| A/B/A parameter calibration on a live cluster | 6.4 | §5.5, Fig. 12 | Adopted directly |
| High-fidelity replay against real scheduler code | 6.5 | §3.1 (Fauxmaster) | `kwok` plus cAdvisor trace replay |
| "Why pending?" self-service diagnostics | 7 | §2.6, §8.2 | Adopted directly |
| Avoid power-user parameter sprawl | 7 | §8.1 | Treated as a design constraint |

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
