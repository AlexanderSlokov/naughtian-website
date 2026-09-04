---
title: "Naughtian Kalena: Online Overcommitment Scheduling (Borg-at-home)"
description: "Proposal and system architecture of Kalena: An online scheduler harvesting slack capacity in the Naughtian ecosystem."
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
> **Positioning:** _"Borg-at-home" - Online Overcommitment & Slack Resource Harvester_
>
> **Author:** _Dinh Tan Dung (ORCID: https://orcid.org/0009-0003-1374-7525)_
>
> **Status:** _Draft Proposal (2026)_

---

## Abstract

Self-managed, on-premise, and edge clusters consistently run at only 30-40% average hardware capacity because cluster operators must allocate static, worst-case safety headroom for production services. Within the Naughtian ecosystem, Kuberina solves the offline combinatorial optimization problem, packing static workloads into an optimal initial blueprint. In production, dynamic runtime traffic variations inevitably leave substantial unharvested capacity idle.

We propose **Kalena** ("Borg-at-home"), an online overcommitment scheduler for Kubernetes, standalone Docker, and Docker Swarm. Kalena ingests runtime telemetry directly from cAdvisor, applies an exponential decayed-maximum resource estimation model derived from Google Borg to determine safe slack capacity, and enforces containment through compressible (CFS CPU throttling) and non-compressible (proactive RAM eviction) mechanisms. Kalena targets a cluster hardware utilization of 70-85% while keeping production P99 latency degradation under 2%, bringing Borg-style hardware efficiency to the 80% of infrastructure operators outside hyperscale control planes.

---

## 1. Context & Problem

### The Static Headroom Waste

In modern infrastructure operations, engineers size container resource requests and limits around peak projected demand plus a safety margin. Kuberina solves the offline bin-packing challenge by mapping maritime container stowage planning onto pod placement, producing an optimal immutable blueprint.

A substantial gap remains between static reservation and dynamic utilization. Safety headroom produces massive hardware waste. Expensive on-premise nodes and edge servers idle at low CPU and memory footprints even when the control plane marks them fully booked.

### The Technical Gap

Hyperscale operators address this by co-scheduling high-priority latency-sensitive production jobs with low-priority batch workloads on shared hardware, as pioneered by Google Borg.

Self-managed infrastructure, edge clusters, and small-to-medium deployments lack a lightweight, standalone mechanism to perform similar opportunistic overcommitment without incurring the operational complexity of enterprise-grade Kubernetes add-ons or proprietary cloud control planes.

---

## 2. Proposed Architecture: "Borg-at-home"

Kalena functions as an online scheduling daemon and plugin focused on safe, dynamic slack capacity harvesting.

### 2.1. Target Environments

Kalena targets two operational tiers:

* **Kubernetes (K8s):** Implemented as a native Kubernetes Scheduling Framework plugin (extending `Filter`, `Score`, and `Reserve`). It injects overcommitment logic into the cluster scheduler and can also operate as a secondary scheduler dedicated to opportunistic workloads.
* **Docker Standalone & Docker Swarm:** Deployed as a lightweight standalone scheduler daemon communicating directly with the Docker Engine and Swarm manager APIs, directly serving the 80% of self-hosted deployments without full Kubernetes clusters.

### 2.2. Telemetry via cAdvisor

Kalena selects cAdvisor as its single source of truth for container resource telemetry:

* **Built-in Integration:** On Kubernetes, cAdvisor is already embedded inside every Kubelet, delivering node-local container metrics with minimal latency.
* **Zero Heavy Pipeline:** On Docker and Swarm nodes, cAdvisor runs as a single lightweight container. Kalena queries cAdvisor directly, eliminating external Prometheus pipelines or specialized exporters.

### 2.3. Borg-Aligned Preemption & Eviction

Kalena enforces strict resource containment modeled after Google Borg:

* **Resource Classification:**
  * *Compressible Resources (CPU):* Under contention, Kalena throttles opportunistic workloads using Linux CFS bandwidth controls, granting absolute priority to production jobs.
  * *Non-compressible Resources (RAM):* When memory pressure nears threshold, Kalena immediately evicts batch jobs in reverse priority order, safeguarding production workloads against Out-Of-Memory (OOM) termination.
* **Kalena Node Agent:** Analogous to Borglet, this local agent monitors node-level pressure in real time and executes emergency mitigation before the kernel intervenes.

### 2.4. Resource Estimation Algorithm

Drawing on Google Borg's resource estimation framework (EuroSys 2015), Kalena computes dynamically reclaimable slack capacity:

1. **Periodic Sampling:** The local agent samples container metrics from cAdvisor at intervals of $T$ seconds.
2. **Decayed Maximum:** Kalena tracks peak usage across a decaying sliding window, avoiding under-estimation during sudden load spikes:
   $$\text{DecayedMax}(t) = \max\left(\text{Usage}(t), \alpha \times \text{DecayedMax}(t-1)\right)$$
3. **Safety Margin:** A dynamic multiplier $\lambda$ accounts for burst uncertainty:
   $$\text{EstimatedUsage} = \text{DecayedMax}(\text{Usage}) \times (1 + \lambda)$$
4. **Slack Capacity Calculation:** The reclaimable headroom allocated to opportunistic tasks equals node capacity minus the aggregate safety estimates of production tasks:
   $$\text{Slack Capacity} = \text{NodeCapacity} - \sum \text{EstimatedUsage}_{\text{prod}}$$

### 2.5. Zero-Friction Workload Tiering

To preserve Operator Experience (OpX), Kalena minimizes manifest authoring overhead:

* **Safe Defaults:** Any workload lacking explicit classification is treated as a production job with full isolation and zero risk of unexpected eviction.
* **Minimal Syntax:** An operator classifies a workload as an opportunistic harvester using a single metadata label:
  ```yaml
  metadata:
    labels:
      kalena.naughtian.io/tier: batch
  ```
* **Automatic Inference:** When enabled, Kalena automatically classifies standard Kubernetes `Job` and `CronJob` objects as opportunistic workloads without requiring manifest modifications.

---

## 3. Ecosystem Fit: Symbiosis with Kuberina

### 3.1. The Solid Rock and Liquid Flow Paradigm

In Naughtian mythology, Kalena and Kuberina are companions. Architecturally, they form a two-level dual-temporal scheduling system:

* **Kuberina (Offline Pre-planning):** The port naval architect. Kuberina calculates the stowage placement of heavy shipping containers (production workloads) onto fixed hull coordinates before departure.
* **Kalena (Online Dynamic Tuning):** The voyage crew. Kalena packs light cargo parcels (batch workloads) into crevices between containers while at sea, jettisoning light cargo when storm conditions threaten ship stability.

This hybrid model delivers three architectural properties:

1. **Zero-Latency Baseline:** Production workloads have their placement (`nodeName`) statically decided by Kuberina in the blueprint YAML, reducing production scheduling overhead to 0ms at runtime.
2. **Focused Runtime Scheduling:** Kalena expends scheduling cycles exclusively on packing opportunistic jobs into unharvested headroom.
3. **Closed-Loop Feedback:** Kalena records empirical consumption profiles over time and exports this telemetry back to Kuberina. Future planning cycles use empirical distributions to tighten bin-packing margins.

### 3.2. Architectural Feasibility: Decoupling Production Placement from Slack Harvesting

The primary reason centralized systems like Google Borg or generic container schedulers encounter immense complexity when attempting online overcommitment is the conflation of two conflicting responsibilities:
1. Solving the NP-hard, multi-constraint placement problem (affinity, anti-affinity, gang scheduling, and topology spread) for mission-critical production workloads within milliseconds.
2. Estimating dynamic resource slack and co-scheduling opportunistic batch workloads in real time.

Kuberina isolates and resolves the first problem entirely in an offline phase. Because Kuberina spends the necessary computational time upfront to generate an optimal, immutable blueprint, production workloads arrive at the cluster with their node assignments pre-determined.

This architectural division fundamentally shifts Kalena's operating requirements:
* **Localized, Univariate Problem Space:** Kalena evaluates residual slack node-by-node. It matches lightweight opportunistic tasks to local idle capacity without having to re-solve cluster-wide affinity graphs.
* **Trivial Preemption Decisions:** When a production workload surges, Kalena executes a binary intervention: instantaneously throttle or evict the local batch task. The system avoids complex cluster-wide re-balancing.
* **Realistic Engineering Scope:** Decoupling the production placement problem allows Kalena to function as a compact, maintainable plugin. The implementation avoids the pitfalls of an overwhelming monolithic scheduler.

---

## 4. Implementation & Evaluation Plan

### 4.1. Technology Stack

* **Core Language: Go (Golang)** for the prototype and initial production releases, ensuring native compatibility with `k8s.io/kubernetes` (Scheduling Framework), `client-go`, and `moby/moby` (Docker SDK).
* **Future Extension:** The design permits integrating a Rust optimization core via Go FFI/shim if real-time combinatorial calculations require specialized numeric throughput, matching Kuberina's Rust solver.

### 4.2. Evaluation Metrics

System efficacy is assessed against three key performance indicators:

1. **Hardware Utilization:** Raising average node CPU and RAM utilization from 30-40% to 70-85%.
2. **Prod-job SLO Preservation:** Restricting P99 latency impact and throughput degradation on production workloads to less than 2%.
3. **Mitigation Reaction Latency:** Minimizing the delay between a production load spike and the enforcement of CFS throttling or batch eviction.

### 4.3. Experimental Setup

Evaluation follows a two-pronged test methodology:

* **Trace Replay:** Using public industry traces:
  * *Google Cluster Workload Traces* (`clusterdata-2011-2` and `clusterdata-2019`), representing heterogeneous scheduling events from Borg cells.
  * *Alibaba Cluster Trace* (`clusterdata`), containing co-located microservices and batch compute traces.
* **Large-Scale Cluster Simulation:**
  * **`kwok` (Kubernetes WithOut Kubelet):** Simulating thousands of nodes and tens of thousands of pods on a single developer workstation with minimal memory footprint.
  * **`kube-burner`:** Generating pod lifecycle churn and synthetic traffic bursts to benchmark scheduler resilience.

### 4.4. Known Limitations & Technical Challenges

The proposal explicitly identifies operational failure modes:

* **cAdvisor Sampling Latency:** cAdvisor polls metrics periodically (default 10-15 seconds), whereas memory consumption spikes can occur in sub-second timeframes. A production memory spike could escalate before cAdvisor delivers updated usage.
* **Linux Kernel OOM Risk:** Delayed eviction could trigger the kernel OOM killer before Kalena terminates batch tasks, risking inadvertent termination of production processes.
* **Mitigation Strategies:**
  * Leveraging cgroups v2 `memory.high` thresholds to enforce kernel-level throttling on batch memory allocations before `memory.max` is breached.
  * Integrating Linux kernel Pressure Stall Information (PSI) via eventfd in the Kalena Node Agent for immediate, non-polling notification of memory contention.

---

## 5. Conclusion & Next Steps

Kalena completes the resource management cycle in the Naughtian ecosystem. Pairing Kuberina's offline combinatorial rigor with Borg-inspired online slack harvesting maximizes hardware efficiency while honoring Operator Experience (OpX) principles.

Immediate development roadmap:
1. Develop the initial Go prototype as a Kubernetes Scheduling Framework plugin.
2. Construct the benchmarking testbed using `kwok` and the Alibaba Cluster Trace.
3. Validate cgroups v2 PSI eventfd triggers for sub-second preemption response.
