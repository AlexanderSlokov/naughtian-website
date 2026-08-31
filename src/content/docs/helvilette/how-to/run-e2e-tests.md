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

You do not need to install Ginkgo. `make e2e` invokes it through
`go run github.com/onsi/ginkgo/v2/ginkgo`, so the runner comes from the version
pinned in `go.mod` on whatever machine you are on.

:::note[If you installed Ginkgo previously]
An earlier version of the target prepended a hardcoded Go SDK path to `PATH`,
which resolved to nothing on any machine but the author's and could silently
run the suite under a toolchain that did not match `go.mod`. A globally
installed `ginkgo` binary is now unused and can drift from the pinned version,
so remove it if you have one.
:::

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

## The rest of the development loop

Unit tests and end-to-end tests are deliberately separate. Unit tests need no
Docker and finish in about a second; the suite above needs a running stack and
takes minutes.

| Target | What it does |
|---|---|
| `make test` | Unit tests over `./cmd/...` and `./pkg/...`. No Docker |
| `make fmt-check` | Verifies gofmt without rewriting files. The same check CI runs |
| `make e2e` | The end-to-end suite |
| `make clean-e2e` | Tears down the stack and deletes the state it wrote |

`make test` is scoped rather than pointed at `./...` because `./...` pulls in
the Ginkgo suite, which hangs when no stack is running.

## Cleaning up

The stack writes runtime state to `tests/e2e/data` and `data/`:

```bash
make clean-e2e
```

Othela now runs as your own UID and keeps its database in a named volume, so a
current stack leaves nothing root-owned behind. If you ran an older one,
`tests/e2e/data/playbooks/server` may still be owned by `root` and unreadable,
which makes `go vet ./...` fail with `permission denied` before it compiles
anything. `make clean-e2e` clears that using a throwaway container, so no
`sudo` is needed.

## When to use this instead of the manual loop

The [quickstart](/helvilette/tutorials/quickstart/) runs both binaries with
`go run` against `localhost`. That is quick to iterate on, but it does not
exercise container packaging, network boundaries, or cloning over a real Git
transport.

Use the manual loop while writing code. Use the E2E suite before opening a pull
request, and whenever you touch the job dispatch path, the clone logic, or the
Ansible invocation.

Containers stop being enough where the agent meets the operating system. It
manages systemd units and applies playbooks with real package and service
tasks, and systemd inside a container is either absent or crippled. When what
you are testing is that behaviour, use the [Vagrant
environment](/helvilette/how-to/test-with-vagrant/), which gives you two real
VMs.
