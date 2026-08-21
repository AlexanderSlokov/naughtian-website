---
title: Architecture
description: The dataplane and controlplane split, and why Kallisto caches rather than stores.
sidebar:
  order: 1
---

Kallisto splits into two components with sharply different jobs. Understanding
the split explains most of the design decisions that follow from it.

## The dataplane

Runs on **every node**. Answers secret reads locally.

This is the part that changes the economics. Without a node-local dataplane,
fetching a secret means a network round trip to a central Vault, so workloads
fetch once at boot and hold the plaintext in an environment variable for the
process lifetime. Every long-lived process becomes a small, permanent secret
store, and rotation becomes a restart.

With a dataplane on the node, a read is cheap enough that your API gateway,
worker nodes and CI runners can fetch **per request** instead. Secrets stop
being boot-time configuration and become request-time data.

The performance model is **scale-per-core**: the better your AMD64 chip, the
better it performs. The server is a shared-nothing Rust design with separate
hot and cold async paths. Encryption is AES-256-GCM with hardware acceleration,
which requires the AES-NI instruction set.

## The controlplane

Runs the fleet. Three responsibilities:

1. **Pushing invalidations.** A cache that cannot be invalidated is a liability
   during a rotation — the whole point of rotating is that the old value stops
   working everywhere.
2. **Warming caches before a rollout.** A cold cache during a deploy is exactly
   the stampede against the root of trust the system exists to prevent.
3. **Reporting plaintext residency.** How much decrypted secret material is
   resident across every node — an answer most infrastructures cannot produce
   at all.

:::danger[Not implemented]
The controlplane is listed under "not built yet" in the project's own status.
Everything in this section describes intended design, not shipped code. See
[project status](/kallisto/reference/status/).
:::

## Why a cache and not a store

Kallisto deliberately refuses to be a root of trust.

Being a root of trust means owning key management, access policy, audit,
compliance attestation and the entire threat model that comes with holding the
crown jewels. That is an enormous surface, and doing it credibly takes years and
scrutiny that a young project has not accumulated.

By positioning as a cache in front of Vault, OpenBao, Infisical or Conjur,
Kallisto inherits the upstream's policy and audit story and takes on a much
narrower problem: serve reads fast, invalidate correctly, and do not leak.

This is why the project states so firmly that it must not be used as a drop-in
Vault replacement. It is not modesty — the security properties you would need
are located in the upstream system, and using Kallisto alone means those
properties are simply absent.

## The one-line contract

API compatibility with Vault KV-v2 is the mechanism that makes the cache
adoptable:

```diff
- VAULT_ADDR=https://vault.internal:8200
+ VAULT_ADDR=https://localhost:8200
```

Removing it is the same line.

This symmetry is a design constraint, not a marketing line. A cache that is
painful to remove is a cache you cannot safely experiment with, and an
infrastructure component nobody dares roll back becomes permanent by
accident rather than by merit.

The same principle runs through the ecosystem — remove
[Helvilette](/helvilette/) and you still have working Ansible playbooks; ignore
a [Kuberina](/kuberina/) blueprint and your cluster schedules normally.

## Extensibility

The core is hexagonal — ports and adapters — with the intent of supporting
unlimited plugin integrations. Storage is pluggable: RocksDB is the reference
implementation, with SQLite and other key/value systems planned.

The same architectural approach appears in Kuberina's roadmap, where the solver
is being refactored onto ports and adapters to decouple the optimisation core
from I/O.

## Further reading

For depth beyond this page — ADRs, replication, KEK rotation, HA, telemetry —
the Kallisto repository's own Hugo docs under `docs/` remain authoritative. See
[documentation status](/kallisto/reference/status/#documentation).
