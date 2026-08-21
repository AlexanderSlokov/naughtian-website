---
title: Why pull-based
description: The security and operational argument against push-based configuration delivery.
sidebar:
  order: 2
---

Helvilette's single most consequential design decision is that agents pull
rather than that a server pushes. This page explains why.

## The invisible divide

The cloud-native era split organisations into two groups that get discussed as
if they were one.

**Tier 1, roughly 20%.** Kubernetes, ArgoCD or Flux, a full GitOps ecosystem.
Configuration drift is absorbed by reconciliation loops that run whether anyone
is watching or not.

**Tier 2, roughly 80%.** Startups, SMBs, universities, government agencies,
homelabs. Five to fifty VMs on bare metal, Proxmox, or VPS instances scattered
across several providers. Drift happens daily and there is no reconciliation
loop to catch it.

Almost all tooling investment goes to Tier 1. Tier 2 is left with Ansible and
the instruction to "run it from CI".

## What "run it from CI" actually costs

```text
Playbook ready
    │
    ├─► Push to Git
    ├─► Configure GitHub Actions / GitLab CI
    ├─► Setup SSH keys in CI secrets
    ├─► Open port 22 (or hack a bastion host / VPN tunnel)
    ├─► Write CI pipeline YAML calling ansible-playbook
    ├─► Debug why the CI runner can't SSH into some nodes
    ├─► 4 hours scratching your head + 4 more for a post-mortem
    │
    ▼
Server maybe configured???
```

Every step is glue work — necessary, unrewarding, and not the thing anyone was
hired to be good at.

## The security problem is structural

The glue work is annoying. The security posture is worse, and it is not a
matter of doing push-based delivery carefully.

Push requires that the pushing machine can reach every managed node, and hold
credentials to authenticate to all of them. That produces a single point where
all SSH root keys are concentrated — a laptop, or a CI server.

- Laptop stolen? Entire infrastructure compromised.
- Engineer leaves? Infrastructure knowledge walks out of the door with them.
- CI server breached? The attacker inherits root on the whole fleet.

Nobody should have to expose port 22 just to run a playbook. But the push model
requires inbound reachability by construction, so no amount of care removes the
requirement — it only makes the concentration more carefully guarded.

## What pull changes

Invert the direction and the properties invert with it.

Agents open outbound connections to Othela. Othela holds no node credentials
and has no route inward. There is nothing on the control plane worth stealing
in the way an SSH key store is worth stealing, and nodes need no inbound
firewall rule at all.

This is also what makes edge deployment tractable. A node behind carrier-grade
NAT, on a residential connection, or on an intermittent link cannot accept
inbound connections at all. Under push it is unmanageable. Under pull it is
ordinary — it connects when it can.

## Reconciliation, not deployment

The second consequence is subtler and matters more over time.

A CI pipeline runs when triggered. Between runs, nothing watches. Someone SSHes
in to debug at 2am, changes an `nginx.conf`, and that change survives until the
next deploy — or forever, if the next deploy does not touch that file. Nobody
finds out until it breaks.

An agent polling on an interval is a **reconciliation loop**. It re-applies
desired state continuously, so drift has a bounded lifetime measured in poll
intervals. Self-healing is not a feature bolted on; it is what the loop does by
existing.

This is the difference the comparison table frames as *imperative versus
convergent*: a CI runner asks "where should this code run?", while Helvilette
asks "what should this server look like?"

## What it costs

Pull is not free, and the trade-offs are real:

- **Latency.** A push deploys immediately. A pull deploys within one poll
  interval. If you need instant fleet-wide changes, that window matters.
- **An extra component.** Every node now runs an agent that must itself be
  maintained — though at ~20MB of RAM as a systemd unit, it is a small thing to
  maintain.
- **Control plane availability.** If Othela is down, no new work is
  distributed. Existing state persists, but convergence stops.
- **A bootstrap step.** Something must install the agent. Helvilette uses
  Ansible over SSH exactly once for this — see
  [architecture](/helvilette/explanation/architecture/).

For a fleet where drift is the daily problem and inbound SSH is the standing
risk, these are cheap. For a single server you deploy to twice a year, they are
not worth it.

## Further reading

- [Comparison with other tools](/helvilette/explanation/comparisons/) — how
  this differs from Puppet, AWX and CI runners.
- [Architecture](/helvilette/explanation/architecture/) — the components that
  implement the loop.
