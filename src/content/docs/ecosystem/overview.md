---
title: What is Naughtian?
description: The problem the ecosystem exists to solve, and the principle the three tools share.
sidebar:
  order: 1
---

Naughtian is a family of infrastructure tools built around two convictions.

The first is about **how decisions are made**:

> Infrastructure decisions should be written down before they are executed —
> not reconstructed afterwards from a dashboard.

The second is about **what is allowed to sit at the bottom of a stack**:

> The bottom layer must be something that, when it dies, nothing dies with it.

The second is the load-bearing one, and it has its own page: [the day-2
problem](/ecosystem/the-day-2-problem/). It argues that the previous generation
of infrastructure tooling solved workload management and left control-plane
management as an exercise for the reader — and that a system which must have
quorum is structurally disqualified from being the foundation.

Everything else here is an application of those two ideas to a different layer.

## The divide it addresses

The cloud-native era produced an invisible split between two kinds of
organisation.

**Tier 1 — roughly 20%.** Full Kubernetes, ArgoCD or Flux, a mature GitOps
ecosystem. Configuration drift is absorbed by reconciliation loops. Someone is
paid full-time to keep the control plane healthy.

**Tier 2 — roughly 80%.** Startups, small and medium businesses, universities,
government agencies, homelabs. Five to fifty VMs on bare metal, Proxmox, or
VPS providers scattered across three vendors. Drift happens daily. Without
Kubernetes there is no reconciliation loop to catch it, and there is no budget
for a platform team.

Tier 2 is not a smaller version of Tier 1. It has a different shape of problem,
and most tooling is built for the other 20%.

Naughtian targets the gap — while staying useful to Tier 1, because the
problems it solves (fragmented schedulers, push-based delivery, secret
round-trips) do not disappear once you have a control plane.

## The shared principle

Each tool takes something that is normally decided implicitly, at runtime,
inside a black box, and turns it into an artifact you can read, review and
argue with before it takes effect.

| Layer | Normally | With Naughtian |
|---|---|---|
| Pod placement | `kube-scheduler` decides in milliseconds, invisibly | [Kuberina](/kuberina/) computes a blueprint you can review and version |
| Machine state | Someone SSHes in and runs a playbook | [Helvilette](/helvilette/) agents pull and reconcile continuously |
| Secret access | Fetched at boot, cached in an env var, hoped for | [Kallisto](/kallisto/) serves them per request from a node-local cache |

This is the same shift Git brought to code — reviewable diffs instead of FTP
uploads — and Terraform brought to infrastructure — `terraform plan` instead of
clicking in a console.

A blueprint backed by thousands of generations of evolutionary optimisation is
more defensible than a whiteboard drawing justified with "ten years of
experience" and "trust me".

## What Naughtian is not

Being explicit about non-goals keeps the boundaries honest:

- **Not a Kubernetes replacement.** Kuberina computes placement plans that
  Kubernetes then executes. It never touches a running cluster.
- **Not a configuration management system.** Helvilette delivers Ansible; it
  does not replace it. Remove Helvilette and you still have working playbooks.
- **Not a root of trust.** Kallisto caches secrets in front of Vault, OpenBao
  or Infisical. It is explicitly not a drop-in replacement for any of them.
- **Not a CI/CD platform.** None of these tools want to be GitHub Actions.

Every tool in the ecosystem is designed so that removing it leaves you with
working infrastructure, not a hostage situation.

## Where to go next

- [The day-2 problem](/ecosystem/the-day-2-problem/) — the core argument: who
  operates the operators, and why quorum disqualifies a system from being the
  bottom layer.
- [The stack](/ecosystem/stack/) — how the three tools compose in practice.
- [Roadmap](/ecosystem/roadmap/) — what is real today and what is coming.
- [Names and mythology](/ecosystem/naming/) — why a scheduler is named after a
  container ship and a delivery agent after a cat.
