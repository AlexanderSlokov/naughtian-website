---
title: Comparison with other tools
description: How Helvilette relates to Puppet, Ansible AWX, CI runners, Kubernetes and SaltStack.
sidebar:
  order: 3
---

Helvilette occupies a specific niche. This page places it against the tools it
is most often confused with, including the cases where you should use the other
one.

## Summary

| Tool | Relationship to Helvilette |
|---|---|
| **Puppet** | Same pull-based architecture. But Puppet requires a proprietary DSL, Hiera, Facter and PuppetDB. Helvilette uses YAML plus Ansible — nothing new to learn. |
| **Ansible AWX / Semaphore UI** | Still push-based. SSH keys move from a laptop to the AWX server — the attack surface is relocated, not eliminated. No continuous reconciliation. |
| **GitHub / GitLab Runner** | A CI runner asks "where should this code run?". Helvilette asks "what should this server look like?". Imperative versus convergent. |
| **Kubernetes** | K8s manages containers; Helvilette manages systemd services. K8s cannot self-heal its own control plane. Helvilette can, routinely. |
| **SaltStack** | Replaces Ansible entirely with its own language. Helvilette preserves your existing Ansible investment. |

## Puppet

Puppet is the closest architectural relative — genuinely pull-based, genuinely
convergent, and it got there decades earlier.

The difference is adoption cost. Puppet brings its own DSL, plus Hiera for data
lookup, Facter for system inventory, and PuppetDB for state. Each is
well-designed and each is another thing your team must learn and operate.

Helvilette's bet is that most Tier 2 organisations already have Ansible
playbooks and nobody wants to rewrite them. If you are starting fresh with a
large team and want a mature ecosystem, Puppet is a defensible choice.

## Ansible AWX and Semaphore UI

These are the tools people reach for when Ansible-from-CI becomes painful, and
they genuinely help — a real UI, scheduling, audit logs, RBAC.

But they remain push-based. AWX still needs to reach every node, and still
needs credentials for all of them. The concentration of SSH keys did not go
away; it moved from a laptop to a server. That server is now the single most
valuable target in your infrastructure.

They also do not reconcile. AWX runs a job when scheduled or triggered.
Between runs, drift is unobserved.

If you want a UI and approval workflows more than you want to close port 22,
AWX is the better fit today — Helvilette is younger and has neither.

## GitHub Actions and GitLab Runner

The distinction here is conceptual rather than architectural.

A CI runner is an **imperative** executor: it runs a sequence of steps when
triggered. Its question is *where should this code run?*

Helvilette is **convergent**: it repeatedly asserts a desired state. Its
question is *what should this server look like?*

Both can invoke `ansible-playbook`. Only one keeps asking. CI is the right tool
for building artifacts and running tests; it is a poor fit for maintaining
machine state, because it only acts when something triggers it.

## Kubernetes

Not a competitor — a different layer, and often a customer.

Kubernetes manages containers. Helvilette manages systemd services. On a node
running Kubernetes, `kubelet` and `containerd` are systemd units, which puts
them squarely in Helvilette's domain.

That yields the capability described in
[architecture](/helvilette/explanation/architecture/): Kubernetes cannot
rolling-update its own `kubelet` or restart a failed `kube-apiserver`, because
those are the things doing the managing. A layer beneath can.

If you already run Kubernetes for your workloads, Helvilette is a candidate for
the nodes underneath it, not a replacement for it.

## SaltStack

Salt supports both push and pull, is fast, and scales well.

It also replaces Ansible entirely with its own state language. That is a
migration, and migrations of working configuration management are expensive and
risky.

Helvilette's non-negotiable constraint is that removing it leaves you with
working Ansible playbooks and Git repos. There is no proprietary DSL, and
therefore no lock-in to escape. Salt makes a different trade: more capability,
in exchange for committing to its ecosystem.

## When not to use Helvilette

Stated plainly, because the comparison tables above are written by the project
and this section is the honest counterweight:

- **A single server, deployed rarely.** Run the playbook by hand. The agent is
  overhead you will not recover.
- **You need instant fleet-wide changes.** Pull introduces poll-interval
  latency by design.
- **You need a UI, RBAC and approval workflows today.** AWX has them; this
  project does not.
- **You need production stability now.** Helvilette is alpha. Contributor
  guide, mailing lists and communication channels are still placeholders in the
  upstream repository.
