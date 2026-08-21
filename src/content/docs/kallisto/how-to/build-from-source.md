---
title: Build from source
description: Compile the Kallisto CLI and server, and build the container image locally.
sidebar:
  order: 1
---

## Prerequisites

The project recommends `linuxbrew` for setting up a Linux development
environment. You need:

- **Rust 2024 stable**, with the compiler and tooling
- **Git**, to clone the repository
- **k6**, for the newer benchmarks

## Core build — CLI only

No external dependencies:

```bash
make build
```

This gives you the command line interface for interactive local use.

## Server build — HTTP

```bash
make build-server
```

The first compile downloads and builds all dependencies. On a modern machine
this is fast in absolute terms but still noticeable the first time; subsequent
builds are much quicker.

## The two interfaces

Kallisto exposes two, and it is worth knowing which you are building:

- **CLI** — interactive local usage.
- **Server** — HTTP API for deployment, speaking the Vault KV-v2 contract.

## Build the container image

If you are contributing and want to build the image locally rather than pulling
it:

```bash
docker build . \
  -t kallisto-server:latest \
  -f Dockerfile
```

Or through the Makefile:

```bash
make docker-build
```

## Other useful targets

| Target | Purpose |
|---|---|
| `make build` | Core CLI build |
| `make build-server` | HTTP server build |
| `make test` | Run the test suite |
| `make e2e` | End-to-end tests |
| `make clean` | Remove build artifacts |
| `make docker-build` | Build the container image |
| `make docker-run` | Run the container |
| `make docker-test` | Run tests in a container |
| `make docs-serve` | Serve the project's Hugo docs locally |
| `make docs-build` | Build the project's Hugo docs |
| `make help` | List available targets |

Benchmark targets are covered separately in [run the
benchmarks](/kallisto/how-to/run-benchmarks/).

:::note[Two documentation sites]
`make docs-serve` builds the Hugo site inside the Kallisto repository, which is
a separate thing from the page you are reading. See [documentation
status](/kallisto/reference/status/#documentation).
:::
