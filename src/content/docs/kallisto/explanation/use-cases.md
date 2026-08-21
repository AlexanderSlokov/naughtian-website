---
title: Use cases
description: The three problems Kallisto is built to solve, and when it is the wrong tool.
sidebar:
  order: 2
---

The project states three purposes; they are set out below as four, because the
first one bundles two arguments of very different weight. Each is a shape of
the same
underlying idea: secrets should be available where they are needed, at the
moment they are needed, without a network round trip to the root of trust.

## 1. Surviving an unavailable root of trust

The case that justifies the component, and the one most easily mistaken for a
performance feature.

A quorum-bound secret store has scheduled and unscheduled windows where it
serves nothing:

- **After every restart, Vault is sealed** until someone or something unseals
  it. Shamir shares mean waking up humans; auto-unseal means a dependency on a
  KMS that may be in the region that is down.
- **Raft failover** means a leader election, during which writes stop and reads
  may too.
- **An upgrade** means a deliberate, careful step-down across the cluster.

A failed secret read is rarely graceful. A slow database query degrades a
response; a process that cannot fetch its credentials does not start at all. So
those windows do not degrade your system — they stop it.

With a node-local dataplane answering reads, the window stops being an outage.
This is **decoupling availability**: converting a hard dependency on a
consensus-bound system into a soft one.

That is the real pitch, and it is the same argument the whole ecosystem rests
on — see [the day-2 problem](/ecosystem/the-day-2-problem/).

## 2. A cache layer that stops the stampede

The throughput half. Serve secrets from an upstream system in a fast, scalable
way at the node level — **without self-DDoS-ing your own infrastructure**.

That names a real failure mode. Central Vault deployments fall over during
rollouts, when hundreds of pods start simultaneously and each fetches its
secrets at once. The load is bursty, correlated, and arrives precisely when the
system is least able to absorb it, because a deploy is already in progress.

A node-local cache flattens the burst. The first read on a node reaches
upstream; the rest are answered locally.

The second-order effect matters more. When reads are cheap, workloads can fetch
per request rather than at boot, which means a rotated secret takes effect
without a restart — and plaintext stops living in long-lived process memory for
weeks at a time.

## 3. Secure secret storage in standalone mode

Kallisto can run standalone, storing key/value pairs and encrypting data before
writing it to persistent storage.

The problem this addresses is `.env` files. They sit unencrypted on disk, get
copied to laptops, land in backups, and occasionally reach a Git repository.
Standalone Kallisto lets a system use secrets without files lying around.

:::caution[Weigh this one carefully]
Standalone mode is the case where the [missing security
features](/kallisto/reference/status/) hurt most, because there is no upstream
system to fall back on. With no authentication on the data port, no TLS and no
encryption barrier, standalone mode today offers less protection than the
`.env` file it replaces.

Of the four, this is the one to defer until the security work lands.
:::

## 4. A secure edge config server

Provide shared TLS certificates, API keys and similar material to an API
gateway or load balancer fleet at the edge.

Edge fleets have an awkward property: they need current certificates but are
often on unreliable links to the core network. A local cache means a node can
keep serving with what it has when the link is down, rather than failing
because it cannot reach a central store.

This composes with the rest of the ecosystem — [Helvilette](/helvilette/)
targets the same edge fleets, for the same reason.

## When Kallisto is the wrong tool

Stated plainly, because a use-case page written by the project is not a neutral
document.

**You do not already have a root of trust.** Kallisto is explicitly designed to
sit in front of Vault, OpenBao, Infisical or Conjur. Without one, you are
relying on a prototype for properties it does not claim to provide. Get the
upstream system first.

**You need production-grade security today.** No authentication on the data
port, no TLS, no encryption barrier. Network isolation is currently the only
control.

**Your read volume is low.** If your workloads fetch a handful of secrets at
boot and Vault is comfortable, a cache adds a component without solving a
problem you have.

**You need the controlplane features.** Fleet-wide invalidation, cache warming
and plaintext residency reporting are all design intent, not shipped code.

## Further reading

- [Architecture](/kallisto/explanation/architecture/) — the dataplane and
  controlplane split.
- [Project status](/kallisto/reference/status/) — the full implementation
  picture.
