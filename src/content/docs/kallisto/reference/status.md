---
title: Project status
description: What is implemented, what is not, and the version and licensing warnings that apply.
sidebar:
  order: 1
---

Kallisto is a **prototype**. This page collects every caveat the project states
about itself, in one place, so you can make an informed decision rather than
discovering them later.

## Implementation status

| Component | State |
|---|---|
| KV-v2 read/write path | Working |
| Cuckoo cache | Working |
| CLOCK eviction | Working |
| Authentication on the data port | **Not built** |
| TLS | **Not built** |
| Encryption barrier | **Not built** |
| Controlplane | **Not built** |

The project's own summary is blunt:

> Do not run this where it matters.

Note what the missing rows mean together: anything that can reach the data port
can read every secret Kallisto serves, over plaintext HTTP, with the values
unencrypted at the barrier. Network isolation is currently the only control.

## Version warnings

**Versions 1.0.0 to 2.0.0 are not official production releases.** The project
explicitly declines accountability for application security, compliance or
stability if you use these versions in production — directly or indirectly —
and it causes damage to your business. Use at your own consent.

**Version 1.0.0 begins the rewrite in Rust.** Breaking changes are expected and
will affect stability during this period.

**Version 2.0.0, tagged `2.0.0-lts`, is the intended first production-ready
release.** The project's advice is to wait for it.

## Not a replacement for your root of trust

This deserves its own heading because it is the most likely way to misuse the
software.

Kallisto should be integrated into an **existing** secret management system —
Vault, OpenBao, Infisical, Conjur. That is an intentional design decision to
avoid taking on the security responsibilities and complexity of being a root of
trust.

Despite offering a similar API interface and contract to Vault and OpenBao,
Kallisto **cannot and should not** replace them as an upstream secret
management platform. It is a cache in front of one.

## Licensing

Kallisto is licensed under **AGPLv3**. Custom commercial or enterprise licences
can be discussed with the author.

For the wider ecosystem picture, see [Kuberina's licensing
reference](/kuberina/reference/licensing/), which sets out the three-phase
strategy applied there.

## Planned work

- **Pluggable storage backends.** RocksDB is the reference implementation;
  SQLite and other key/value systems are planned.
- **Docker Engine secret storage support**, for storing a Docker PAT safely.

## Documentation

Kallisto maintains its own documentation site inside its repository at `docs/`,
built with Hugo and already organised along Diátaxis lines — `tutorials`,
`operations`, `references`, `explanation`, `examples`.

That corpus is substantially larger than what has been brought into this site.
It includes:

- **ADRs** — a numbered sequence of architecture decision records
- **Benchmarks** — archived results across the C++ and Rust implementations,
  plus a DragonflyDB comparison
- **Internals** — HA, integrated storage, KEK rotation, limits, replication,
  telemetry, tokens
- **Operations** — audit sinks (file, socket, syslog), storage configuration
  (RocksDB, SQLite, S3), Kubernetes CSI deployment
- **API reference** — the Vault KV-v2 contract

Until that material is migrated, the repository's `docs/` directory is the
authoritative source for those topics. Serve it locally with `make docs-serve`.

The section naming maps onto this site as follows:

| Kallisto Hugo docs | This site |
|---|---|
| `tutorials/` | Tutorials |
| `operations/` | How-to guides |
| `references/` | Reference |
| `explanation/` | Explanation |
