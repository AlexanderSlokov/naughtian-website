---
title: Run your first reconciliation loop
description: Start Othela and an agent locally and watch a playbook get delivered, executed and reported.
sidebar:
  order: 1
---

By the end of this tutorial you will have the Othela control plane and one
agent running on your own machine, and you will have watched a full
reconciliation cycle: the agent registers, polls for work, clones a playbook,
runs `ansible-playbook`, and reports structured output back.

You need two terminals. You do not need a fleet, a Git server, or an open SSH
port.

## Before you start

- **Go** 1.25 or newer — [download](https://go.dev/dl/)
- **Ansible** installed locally
- **Git**

```bash
git clone https://github.com/AlexanderSlokov/Helvilette.git
cd Helvilette
```

## Step 1: Build both binaries

```bash
make build
```

Two binaries land in `./bin/`:

```bash
ls bin/
# othela  agent
```

`othela` is the control plane. `agent` is what sits on each managed node.

## Step 2: Start Othela

In your first terminal:

```bash
go run ./cmd/othela \
  --port=8080 \
  --data-dir=helvillette/othela/data/playbooks \
  --log-level=info
```

Othela is now listening on port 8080. Leave it running.

:::note[What Othela is]
Othela plays the role `kube-apiserver` plays in Kubernetes: it receives
declarations and dispatches jobs to agents. It comprises
`helvilette-api-server`, `helvilette-exec-manager` and
`helvilette-controller-manager`. The name comes from
[the saga](/ecosystem/naming/) — Othela is one of the twelve long-term agents
of Helvilette.
:::

## Step 3: Start an agent

In your second terminal:

```bash
go run ./cmd/agent \
  --othela-url=http://localhost:8080/api/v1 \
  --node-id=agent-local \
  --poll-interval=5s
```

The agent registers with Othela, sending its `nodeID` and labels, then begins
polling every five seconds.

:::tip[Not sure a setting took effect?]
Add `--print-config` to that command and the agent prints the configuration it
resolved, naming the source of each value, then exits without starting. See
[configure the agent](/helvilette/how-to/configure-the-agent/#confirming-which-mechanism-won).
:::

## Step 4: Watch the cycle

You do not have to do anything else. Watch both terminals and you should see
this sequence play out:

1. The **agent** connects to Othela.
2. **Othela** returns a Job containing an Ansible playbook — the bundled
   example prints *"Hello Wunjo!"*.
3. The **agent** saves it to its configured workspace directory.
4. The **agent** runs `ansible-playbook -i "localhost," -c local` with
   `ANSIBLE_STDOUT_CALLBACK=json`.
5. The **agent** captures the JSON output and sends it back to Othela.
6. **Othela** prints the JSON report to its console.

That is the whole loop. Everything Helvilette does at scale is this cycle,
repeated across a fleet, forever.

## Step 5: Understand what just happened

The important detail is what *did not* happen. Othela never connected to the
agent. It has no SSH key, no credentials for the node, and no way to reach in.
The agent initiated every connection outbound.

Scale that to fifty VPS instances across three providers and the operational
difference becomes the whole point: there is no bastion host to maintain, no
firewall rule per node, and no key material sitting on a CI runner.

## Where to go next

- [Configure the agent](/helvilette/how-to/configure-the-agent/) — labels,
  polling intervals, and the three configuration mechanisms.
- [helvilette.yml reference](/helvilette/reference/helvilette-yml/) — how to
  declare what runs where.
- [Run the E2E suite](/helvilette/how-to/run-e2e-tests/) — the containerised
  test harness, which is closer to a real deployment than this walkthrough.
- [Architecture](/helvilette/explanation/architecture/) — how each piece maps
  onto a Kubernetes concept.
