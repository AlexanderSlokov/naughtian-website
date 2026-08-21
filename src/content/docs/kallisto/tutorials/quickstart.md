---
title: Run Kallisto with Docker
description: Get a Kallisto server answering KV-v2 requests, then point a workload at it.
sidebar:
  order: 1
---

By the end of this tutorial you will have a Kallisto server running in Docker
with persistent storage, and you will understand how a workload is pointed at
it.

:::danger[Prototype software]
Kallisto has no authentication on the data port, no TLS, and no encryption
barrier yet. Run this on a local machine or an isolated network. Do not put it
anywhere that matters.
:::

## Before you start

You need **Docker**. Nothing else — this path does not require a Rust
toolchain.

## Step 1: Start the server

```bash
docker run -d \
  --name kallisto \
  -p 8200:8200 \
  -p 8202:8202 \
  -v my-kallisto-data:/kallisto/data \
  ghcr.io/alexanderslokov/kallisto:latest
```

Two ports are exposed:

- **8200** — the data port, the same port Vault uses by default. This is what
  workloads talk to.
- **8202** — the secondary port.

The volume mount matters. Without `-v`, everything you store vanishes when the
container is removed.

## Step 2: Confirm it is running

```bash
docker ps --filter name=kallisto
docker logs kallisto
```

## Step 3: Point a workload at it

This is the step that makes Kallisto worth using, and it is deliberately
trivial. Anything already speaking to Vault via `VAULT_ADDR` needs one line
changed:

```diff
- VAULT_ADDR=https://vault.internal:8200
+ VAULT_ADDR=https://localhost:8200
```

Because Kallisto implements the Vault KV-v2 API, your existing client code,
SDKs and tooling keep working unchanged.

The point of the change: reads that previously crossed the network to a central
Vault now terminate on the local node. That is what makes per-request secret
fetching affordable, instead of fetching once at boot and holding plaintext in
an environment variable for the lifetime of the process.

## Step 4: Understand what you have — and have not — got

What is working underneath: the KV-v2 read/write path, a cuckoo cache, and
CLOCK eviction.

What is not there yet: authentication on the data port, TLS, the encryption
barrier, and the controlplane. There is currently nothing stopping anything
that can reach port 8200 from reading every secret it serves.

This is why the isolation warning at the top of this page is not boilerplate.

## Where to go next

- [Build from source](/kallisto/how-to/build-from-source/) — if you want to
  develop against it.
- [Run the benchmarks](/kallisto/how-to/run-benchmarks/) — validate the
  performance claims yourself.
- [Project status](/kallisto/reference/status/) — the full picture of what is
  and is not implemented.
- [Architecture](/kallisto/explanation/architecture/) — dataplane, controlplane,
  and why it caches rather than stores.
