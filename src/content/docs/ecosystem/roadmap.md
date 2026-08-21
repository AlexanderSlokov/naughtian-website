---
title: Roadmap
description: What is real today across the Naughtian ecosystem, and what is planned.
sidebar:
  order: 5
---

:::danger[Read the maturity column before deploying anything]
Nothing in this ecosystem is production-ready. Kallisto's own README is blunt
about it: *"Do not run this where it matters."* Treat every project here as
research code until its documentation says otherwise.
:::

## Current state

| Project | Language | Maturity | What works today |
|---|---|---|---|
| [Kuberina](/kuberina/) | Rust solver, Go frontend planned | Alpha | Rust solver: FFD warm-start, GA optimisation, CSP forward checking. Benchmark and validation pipeline via Make targets. |
| [Helvilette](/helvilette/) | Go | Alpha | Othela control plane, polling agent, Git clone and `ansible-playbook` execution, structured JSON reporting, E2E suite. |
| [Kallisto](/kallisto/) | Rust 2024 | Prototype | KV-v2 read/write path, cuckoo cache, CLOCK eviction. |

## Known gaps

These are the things most likely to bite you, stated plainly.

**Kuberina** — the `kuberina` Go binary is currently a stub. The CLI described
as `kuberina plan` in the project README is the *planned* frontend
(`kuberina-forge`), not shipped code. What runs today is the Rust solver,
driven through the Makefile. See
[running the solver](/kuberina/how-to/build-and-run/).

**Helvilette** — the project is pre-release. Contributor guide, mailing lists
and communication channels are still placeholders in the upstream repository.

**Kallisto** — not built yet: authentication on the data port, TLS, the
encryption barrier, and the entire controlplane. The dataplane is the only part
that exists.

## Planned work

### Kuberina

**Phase 1 — Forge and hexagonal architecture (v0.3.0).** Build the
`kuberina-forge` Go CLI as a compiler-style frontend and backend: ingest raw
manifests, Helm charts, Kustomize output and cloud API state into a
standardised Kuberina IR, then render the optimised blueprint back into
executable manifests. Refactor the Rust solver onto ports and adapters so the
FFD/GA/CSP domain core is fully decoupled from I/O.

**Phase 2 — Distributed solving and agnostic targets (v0.4.0).** Replace the
YAML exchange between forge and solver with streaming gRPC over Protobuf.
Because the solver only ever sees Kuberina IR, extend it beyond Kubernetes to
Proxmox, Nomad, Slurm and IoT edge provisioning. Run lightweight forge agents
in expensive cloud environments while the heavy genetic-algorithm computation
happens on cheap on-premise hardware.

### Kallisto

Pluggable storage backends beyond the RocksDB reference implementation —
SQLite and other key/value systems. Docker Engine secret storage support.

Version numbering carries a warning worth repeating: releases `1.0.0` through
`2.0.0` are not production releases, and `1.0.0` begins the rewrite into Rust,
so breaking changes are expected. `2.0.0-lts` is intended to be the first
production-ready tag.

## New projects

**Kalena**, **Kaeliir** and **Ginnungagap** are planned members of the
ecosystem. They will get their own documentation sections here as they become
public — the site structure already accommodates them, and adding one is a
single entry in the sidebar configuration.

## Licensing trajectory

Kuberina publishes an unusually explicit three-phase licensing plan, worth
understanding before you build on it:

1. **AGPLv3** from `0.1.0` up to (not including) `12.0.0`.
2. **SSPLv1** if and when the author's corporate entity is formally
   incorporated and the IP transfers to it. Already-released AGPLv3 versions
   stay AGPLv3 permanently.
3. **Apache 2.0** on either a CNCF donation initiative or reaching `12.0.0` —
   and in any case automatically, 48 months after each release's own date.

Kallisto is AGPLv3, with commercial licensing negotiable. Helvilette is Apache
2.0. Full detail lives in [Kuberina's licensing
reference](/kuberina/reference/licensing/).
