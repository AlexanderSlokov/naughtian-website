---
title: The stack
description: How Kuberina, Helvilette and Kallisto compose, and where the boundaries between them sit.
sidebar:
  order: 3
---

The three tools operate at different layers and do not depend on each other.
You can adopt any one of them alone. They are designed to compose, not to
require each other.

## Layer map

Helvilette's design document describes the layering that the whole ecosystem
inherits — the observation that the most useful place to stand is *underneath*
the thing everyone else is automating.

```text
Layer 4:  ┌─ Kubernetes ───────────────────────────┐
          │  Pods, Deployments, Services           │
          │  ← Kuberina plans what goes where,     │
          │    before any of this runs             │
Layer 3:  ├─ Container runtime (containerd) ───────┤
          │  ← Kallisto's dataplane answers secret │
          │    reads locally, per request          │
Layer 2:  ├─ systemd ──────────────────────────────┤
          │  kubelet.service, containerd.service   │
          │  etcd.service, kube-apiserver.service  │
          │  ← Helvilette Agent lives here, and    │
          │    can perform surgery on all of it    │
Layer 1:  ├─ OS (Linux) ───────────────────────────┤
          └────────────────────────────────────────┘
```

Helvilette's position at Layer 2 gives it a capability the layers above cannot
have: **managing the managers**. Kubernetes cannot rolling-update its own
`kubelet` or restart its own `kube-apiserver`, because it cannot operate on its
own brain. A systemd-level agent can.

## Time axis

The layer map is spatial. The other useful view is temporal — *when* each tool
acts relative to a deployment.

```text
       BEFORE                    DURING                    CONTINUOUSLY
  ┌─────────────────┐      ┌─────────────────┐       ┌─────────────────┐
  │    Kuberina     │      │    Kallisto     │       │   Helvilette    │
  │                 │      │                 │       │                 │
  │ Solve placement │ ───► │ Serve secrets   │  ◄──► │ Detect drift    │
  │ Emit blueprint  │      │ on every read   │       │ Re-converge     │
  │ Review it       │      │ Invalidate      │       │ Report state    │
  │ kubectl apply   │      │ fleet-wide      │       │ Heal Layer 2    │
  └─────────────────┘      └─────────────────┘       └─────────────────┘
    Runs offline,            Runs on the hot          Runs forever,
    zero cluster             path, node-local          pull-based, no
    interference                                       inbound SSH
```

Kuberina is a planner: it runs once, produces an artifact, and exits. Kallisto
is a data plane: it runs on every node and answers requests. Helvilette is a
control loop: it never stops.

## A worked composition

Nothing forces you to use all three, but here is what the seam looks like when
you do.

1. **Helvilette** brings a fleet of bare-metal nodes to a known state — kernel
   tuning, container runtime, `kubelet`, node labels. This is the one place
   Ansible still runs, and after the initial bootstrap it runs pull-based with
   no inbound SSH.
2. **Kuberina** reads the resulting cluster topology and your workload
   manifests, solves the packing problem offline, and emits
   `blueprint.yaml`. Your team reviews it the way they review code, iterates,
   and applies the version they agreed on.
3. **Kallisto** runs as a node-local dataplane on those same nodes. The
   workloads Kuberina placed fetch their secrets from `localhost` per request
   rather than from a central Vault at boot, so a rollout does not stampede the
   root of trust.

The seams are deliberately loose. Kuberina emits YAML that any Kubernetes
accepts. Helvilette runs playbooks that work fine without it. Kallisto speaks
an API that Vault already speaks.

## Choosing what you need

| If your problem is… | Reach for |
|---|---|
| Expensive GPU nodes sitting at 30% utilisation while pods go unschedulable | [Kuberina](/kuberina/) |
| Config drift across VMs, and SSH keys concentrated on one laptop or CI server | [Helvilette](/helvilette/) |
| Your services stalling every time Vault is sealed, failing over or upgrading | [Kallisto](/kallisto/) |
| Vault getting hammered at every rollout, or `.env` files lying around on disk | [Kallisto](/kallisto/) |
| Nobody owning the question of who operates Vault and Consul themselves | [The day-2 problem](/ecosystem/the-day-2-problem/) first |
| Needing to justify a placement decision to someone who will challenge it | [Kuberina](/kuberina/) plus the [paper](/research/kuberina-stowage-scheduling/) |
