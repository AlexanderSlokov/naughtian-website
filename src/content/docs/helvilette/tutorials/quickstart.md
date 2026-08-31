---
title: Run your first reconciliation loop
description: Start Othela and an agent locally against a Git fleet repository, and watch a playbook get delivered, executed and reported.
sidebar:
  order: 1
---

By the end of this tutorial you will have the Othela control plane and one
agent running on your own machine, and you will have watched a full
reconciliation cycle: the agent registers, polls for work, clones a playbook,
runs `ansible-playbook`, and reports structured output back.

You need two terminals. You do not need a fleet, a Git server, or an open SSH
port. You do need one Git repository, and a directory on your own disk is a
valid one.

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

## Step 2: Create a fleet repository

Othela reads its manifests from Git and nowhere else. Give it something to
read.

```bash
mkdir -p ~/helvilette-fleet
cd ~/helvilette-fleet
```

The playbook, which is an ordinary Ansible playbook with nothing
Helvilette-specific in it:

```yaml
# ~/helvilette-fleet/playbook.yml
---
- name: First reconciliation
  hosts: all
  gather_facts: false
  tasks:
    - name: Say hello
      ansible.builtin.debug:
        msg: "Hello Wunjo! Reconciled by Helvilette."
```

The manifest, which declares where that playbook runs. Replace `/home/you`
with your own home directory — `spec.repo` has to be a path or URL the agent
can clone:

```yaml
# ~/helvilette-fleet/helvilette.yml
apiVersion: helvilette.naughtian.org/v1alpha1
kind: PlaybookDeployment
metadata:
  name: "first-flight"

spec:
  repo: "/home/you/helvilette-fleet"
  branch: "main"
  playbook: "playbook.yml"

  nodeGroups:
    - name: "local"
      nodeSelector:
        role: "demo"
```

Commit both. Othela clones a repository, so an uncommitted working tree is
invisible to it:

```bash
git init -b main
git add .
git commit -m "first flight"
```

:::note[Two repositories, one directory]
`--fleet-repo` is where Othela finds manifests. `spec.repo` is where the
**agent** finds the playbook. They are separate concepts and here they happen
to be the same directory, which is the normal arrangement for a single
playbook.
:::

## Step 3: Start Othela

In your first terminal, back in the Helvilette checkout:

```bash
go run ./cmd/othela \
  --port=8080 \
  --fleet-repo="$HOME/helvilette-fleet" \
  --state-dir=./data/othela \
  --log-level=debug
```

You should see it clone the fleet repository and find your manifest:

```
[STORAGE] SQLite initialized at data/othela/db/state.db
{"level":"info","component":"playbook-loader","count":1,"message":"scan complete"}
[DEBUG] Fleet sync complete, loaded 1 playbooks
Helvilette Othela is listening on :8080...
```

Othela is now listening on port 8080. Leave it running.

:::caution[Always pass --state-dir locally]
`--state-dir` defaults to `/var/lib/helvilette/othela`, which needs root. Left
unset, Othela warns and falls back to in-memory storage, losing every
registration on restart. The full flag list is in [Othela
configuration](/helvilette/reference/othela-configuration/).
:::

:::note[What Othela is]
Othela plays the role `kube-apiserver` plays in Kubernetes: it receives
declarations and dispatches jobs to agents. It comprises
`helvilette-api-server`, `helvilette-exec-manager` and
`helvilette-controller-manager`. The name comes from
[the saga](/ecosystem/naming/) — Othela is one of the twelve long-term agents
of Helvilette.
:::

## Step 4: Start an agent

In your second terminal:

```bash
go run ./cmd/agent \
  --othela-url=http://localhost:8080/api/v1 \
  --node-id=agent-local \
  --labels="role=demo" \
  --poll-interval=5s
```

The `--labels` value is what makes this agent eligible. It has to satisfy the
`nodeSelector` you wrote in the manifest; an agent that matches nothing
registers, polls, receives `204 No Content` forever, and stays idle.

The agent registers with Othela, sending its `nodeID` and labels, then begins
polling every five seconds.

:::tip[Not sure a setting took effect?]
Add `--print-config` to that command and the agent prints the configuration it
resolved, naming the source of each value, then exits without starting. See
[configure the agent](/helvilette/how-to/configure-the-agent/#confirming-which-mechanism-won).
:::

## Step 5: Watch the cycle

You do not have to do anything else. Watch both terminals and you should see
this sequence play out:

1. The **agent** registers, and Othela logs it:
   `[REGISTER] Node agent-local registered with labels map[role:demo]`
2. The **agent** polls, Othela matches `role=demo` against the manifest's
   `nodeSelector`, and returns a Job carrying a Git reference rather than any
   playbook content:
   `processing new job` with `job_id=job-…-local`
3. The **agent** clones `spec.repo` into its workspace: `ensuring git repo`
4. The **agent** runs `ansible-playbook -i "localhost," -c local` with
   `ANSIBLE_STDOUT_CALLBACK=json`.
5. The **agent** captures the JSON output and sends it back to Othela:
   `sending report to Othela`
6. **Othela** prints the report:

```
[REPORT] Received Report from Node: agent-local, Job: job-4813494d137e1631-local
[REPORT] Status: Success
[REPORT] Full Output (JSON):
{"plays":[{"play":{"name":"First reconciliation"},"tasks":[{"hosts":{"localhost":{
  "action":"ansible.builtin.debug","changed":false,
  "msg":"Hello Wunjo! Reconciled by Helvilette."}}}]}], ... }
```

That is the whole loop. Everything Helvilette does at scale is this cycle,
repeated across a fleet, forever.

:::note[Why it runs once and then goes quiet]
The agent keeps polling, and it skips a job whose ID it has already completed.
The job ID is derived from the manifest and the node group, so it is stable
across polls. To watch a second execution, commit a change to the fleet
repository and restart the agent, or give the node group a different name.
:::

## Step 6: Understand what just happened

The important detail is what *did not* happen. Othela never connected to the
agent. It has no SSH key, no credentials for the node, and no way to reach in.
The agent initiated every connection outbound.

The second detail is that no playbook content crossed the wire. Othela sent a
repository URL, a revision and a path, and the agent fetched the playbook
itself. Inline playbook delivery was removed: a job carrying neither a repo URL
nor a playbook path is now rejected by the agent rather than written to disk as
an empty file.

Scale that to fifty VPS instances across three providers and the operational
difference becomes the whole point: there is no bastion host to maintain, no
firewall rule per node, and no key material sitting on a CI runner.

## Where to go next

- [Configure the agent](/helvilette/how-to/configure-the-agent/) — labels,
  polling intervals, and the three configuration mechanisms.
- [Othela configuration](/helvilette/reference/othela-configuration/) — every
  control plane flag, and the two directories it uses.
- [helvilette.yml reference](/helvilette/reference/helvilette-yml/) — how to
  declare what runs where.
- [Test on real VMs with Vagrant](/helvilette/how-to/test-with-vagrant/) — two
  Debian VMs, systemd units and a Gitea server, closer to a real deployment
  than `go run` on localhost.
- [Run the E2E suite](/helvilette/how-to/run-e2e-tests/) — the containerised
  test harness.
- [Architecture](/helvilette/explanation/architecture/) — how each piece maps
  onto a Kubernetes concept.
