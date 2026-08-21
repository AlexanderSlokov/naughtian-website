---
title: Run the E2E test suite
description: Exercise the full GitOps reconciliation loop in containers using Ginkgo and Testcontainers.
sidebar:
  order: 2
---

Helvilette's end-to-end suite is the recommended way to verify a change,
because it exercises the real loop — a Git server, the control plane, and an
agent, all in containers — rather than a mocked approximation.

## Prerequisites

- **Docker**, running
- **Go** 1.25 or newer
- **Ginkgo**, the BDD test runner:

```bash
go install github.com/onsi/ginkgo/v2/ginkgo@latest
```

## Run the suite

```bash
make e2e
```

## What it does

The suite is built on [Ginkgo](https://onsi.github.io/ginkgo/) and
[Testcontainers-Go](https://golang.testcontainers.org/), and it manages its own
infrastructure:

1. Builds a lightweight `git-daemon` container serving test playbooks over
   `git://`.
2. Builds the `othela` and `agent` images directly from the local Dockerfiles,
   so you are testing your working tree, not a published image.
3. Asserts the state and outputs of the GitOps reconciliation loop
   programmatically.
4. Tears down every container and network it created.

Because it builds images from local Dockerfiles, the first run is slow and
subsequent runs benefit from Docker's layer cache.

## When to use this instead of the manual loop

The [quickstart](/helvilette/tutorials/quickstart/) runs both binaries with
`go run` against `localhost`. That is quick to iterate on, but it does not
exercise container packaging, network boundaries, or cloning over a real Git
transport.

Use the manual loop while writing code. Use the E2E suite before opening a pull
request, and whenever you touch the job dispatch path, the clone logic, or the
Ansible invocation.
