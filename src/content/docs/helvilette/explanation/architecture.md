---
title: Architecture
description: How Helvilette maps onto Kubernetes concepts, transposed down to the systemd layer.
sidebar:
  order: 1
---

Helvilette's design is not "inspired by" Kubernetes in a vague sense. It maps
onto Kubernetes concept for concept, transposed from the container layer down
to the OS and systemd layer.

That correspondence is the whole design thesis: the reconciliation model
Kubernetes proved works for containers also works for machines, and you should
not need a Kubernetes cluster to benefit from it.

## The mapping

| Kubernetes concept | Helvilette equivalent | Role |
|---|---|---|
| `kube-apiserver` | **Othela** (control plane) | Receives declarations, dispatches jobs to agents |
| `kubelet` | **Helvilette Agent** | Sits on each node, pulls, executes, reports |
| OCI image | **Ansible playbook repo** | Artifact containing execution logic |
| Container registry | **Git server** | Artifact storage |
| `Dockerfile` | **`playbook.yml` + `roles/`** | Defines what needs to be done |
| `values.yaml` (Helm) | **`helvilette.yml`** | Per-deployment declarative configuration |
| Pod spec / `nodeSelector` | **`nodeGroup` / `nodeSelector`** | Declares what runs where |
| `livenessProbe` | **`livenessProbe`** *(planned)* | Identical concept, applied to systemd services. Declared in example manifests but [not yet parsed](/helvilette/reference/helvilette-yml/#not-yet-implemented) |
| Container runtime | **Ansible engine** | The actual executor |
| `etcd` | **SQLite / Git** | State storage |

## Othela

Othela is the control plane. Internally it comprises `helvilette-api-server`,
`helvilette-exec-manager` and `helvilette-controller-manager` — again mirroring
the Kubernetes control plane's decomposition.

Its job is narrow: accept declarations, match agent labels against
`nodeSelector` rules, and hand back job specifications containing a Git repo
reference and any `extra_vars`.

Declarations reach it through Git and only through Git. Othela clones the
repository named by `--fleet-repo`, re-pulls it on a timer, and scans the clone
for `helvilette.yml` manifests. There is no local manifest directory and no API
for pushing a declaration in, so the state of the fleet is whatever the fleet
repository says it is, and changing it means a commit. See [Othela
configuration](/helvilette/reference/othela-configuration/).

Note the two repositories this implies. The fleet repository holds manifests
and is read by Othela. The playbook repository named in each manifest's
`spec.repo` is read by the agent. Othela never fetches a playbook, and never
sends playbook content to an agent: the job carries a repository URL, a
revision and a path, and the agent does its own cloning.

Critically, **Othela never initiates a connection to an agent.** It has no
credentials for the nodes it manages and no route to reach them. Every
connection is outbound from the agent.

The name is from [the saga](/ecosystem/naming/): Othela is one of the twelve
long-term-operating Agents of Helvilette, acting as the apiserver for his
living-Kubernetes-like system.

## The agent

A single Go binary, around 20MB of RAM, running as a systemd service. It runs
on ARM64, so a Raspberry Pi is a legitimate target and edge deployment is in
scope rather than aspirational.

Its loop:

1. Register with Othela, sending `nodeID` and labels.
2. Poll for work at the configured interval.
3. Receive a job: a Git repository reference plus `extra_vars`.
4. Clone or pull the playbook repository into its workspace.
5. Run `ansible-playbook` with `ANSIBLE_STDOUT_CALLBACK=json` and the supplied
   variables.
6. Capture the structured JSON output and report the result back.

Then repeat, forever. Drift is corrected because the loop never stops, not
because anything detected a specific change.

## The bootstrap

There is a chicken-and-egg problem in any pull-based system: something has to
install the puller.

Helvilette resolves it by using Ansible itself, exactly once:

```text
Last SSH session ever:
┌──────────────────────────────────────────┐
│  ansible-playbook install-helvilette.yml │
│                                          │
│  → Installs agent on N servers           │
│  → Agent registers with Othela           │
│  → systemd enable + start                │
│                                          │
│  Done. Close port 22. Forever.           │
└──────────────────────────────────────────┘
```

Ansible installs the machine that delivers all future Ansible. The chicken lays
the egg-making machine, then retires.

## The immune system layer

Helvilette operates beneath Kubernetes, beneath container runtimes, beneath
everything:

```text
Layer 4:  ┌─ Kubernetes ───────────────────────────┐
          │  Pods, Deployments, Services           │
          │  ❌ Cannot self-heal                   │
Layer 3:  ├─ Container Runtime (containerd) ───────┤
          │  ❌ Cannot self-restart                │
Layer 2:  ├─ systemd ──────────────────────────────┤
          │  kubelet.service, containerd.service   │
          │  etcd.service, kube-apiserver.service  │
Layer 1:  ├─ OS (Linux) ───────────────────────────┤
          │                                        │
          │  🐈‍⬛ Helvilette Agent lives here.       │
          │  It is a systemd service.              │
          │  It can see EVERYTHING above.          │
          └────────────────────────────────────────┘
```

This position grants a capability the upper layers structurally cannot have:
**managing the managers.** Helvilette can rolling-update `kubelet`, restart
`kube-apiserver`, and repair what Kubernetes cannot repair — because Kubernetes
cannot perform surgery on its own brain.

A control plane cannot be the thing that heals its own control plane. Something
underneath it has to be.

### Why Helvilette is eligible to be that thing

Sitting at Layer 2 is necessary but not sufficient. What actually qualifies a
component to be the foundation is its failure mode.

**Nothing here votes.** There is no Raft group, no quorum, and therefore no
number of failures that stops the service outright. Agents hold their state
locally and reconcile against Git; Othela dispatches work but is not in the
critical path of a node continuing to function.

Compare the failure modes:

| | When it fails |
|---|---|
| Consul loses quorum | Service discovery stops; dependent applications break immediately |
| Vault is sealed | Every secret read fails; anything fetching at boot cannot start |
| Othela is unreachable | Agents keep their last known state and receive no new work |

The first two **fail hard**, and not because they are badly built — they must
be strongly consistent, consistency requires quorum, and quorum means a
failure threshold that stops everything. That is the correct trade for what
they do, and it is exactly what disqualifies them from being underneath
everything else.

This argument is developed in full in [the day-2
problem](/ecosystem/the-day-2-problem/), including what Naughtian does *not*
solve — Othela is still a service someone has to run, with no HA story today.

## Scope boundaries

The project is explicit about what it will not become:

**In scope** — desired-state reconciliation at the OS and systemd level;
pull-based GitOps without inbound SSH; a lightweight agent suitable for edge
and IoT.

**Out of scope** — container orchestration (that is Kubernetes or Swarm);
general-purpose CI/CD pipelines (GitHub Actions, GitLab CI); core configuration
management (Ansible already does this); infrastructure provisioning (Terraform
or Pulumi).

The last one matters most. Helvilette *delivers* Ansible; it does not replace
it. Remove Helvilette and you still have working playbooks and Git repos, with
no proprietary DSL to migrate off.
