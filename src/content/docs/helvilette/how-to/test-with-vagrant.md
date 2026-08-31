---
title: Test on real VMs with Vagrant
description: Bring up a two-node Helvilette lab with Vagrant, provisioned end to end by Ansible, as an alternative to hand-built Proxmox VMs.
sidebar:
  order: 4
---

The Helvilette repository ships a Vagrant environment under `vagrant/` that
builds a working two-node lab: Othela and Gitea on one Debian VM, an agent on
another, both under systemd. It is the manual-testing rig, and it replaces the
hand-built Proxmox VMs the first-flight test plan originally assumed.

Use it when what you are testing is the agent meeting a real operating system.

## Why VMs rather than containers

The [E2E suite](/helvilette/how-to/run-e2e-tests/) is faster and is the right
tool for the dispatch path, the clone logic and the Ansible invocation. It
stops being sufficient one layer down.

- The agent runs as a systemd service and talks to systemd over D-Bus.
  Inside a container systemd is absent or crippled.
- The test playbooks manage packages, services and `sysctl`, all of which
  behave differently in a container.
- Snapshot and rollback, and later tests such as pulling power mid-run, need a
  real VM.

A container makes you debug the environment instead of Helvilette.

## Prerequisites

- **Vagrant**
- **libvirt** with KVM/QEMU, plus `vagrant-libvirt`. The `Vagrantfile` sets
  libvirt as the provider
- **Ansible** on the host, which Vagrant uses to provision both VMs
- Around 2 GB of RAM and two spare CPU cores

Synced folders use `rsync` rather than NFS, so you do not need `nfsd` on the
host.

## Bring the environment up

```bash
cd vagrant
make up
```

That runs `vagrant up` and then the `helvilette-setup.yml` playbook, which:

1. Installs Go, Git and Make on both VMs, builds `othela` and `agent` from the
   synced source tree, and installs both to `/usr/local/bin`.
2. On the Othela node, creates a `helvilette` system user and
   `/var/lib/helvilette/othela`, then installs and starts `othela.service`.
3. On the agent node, installs Ansible and starts `helvi-agent.service`.
4. Installs Docker on the Othela node and starts Gitea in a container.

The two VMs:

| Role | Hostname | Address | Services |
|---|---|---|---|
| Control plane | `othela-node` | `192.168.121.10` | Othela on `:8080`, Gitea on `:3000` |
| Managed node | `agent-node-1` | `192.168.121.11` | `helvi-agent.service` |

Debian 12 (Bookworm) is the box on both, chosen because it is boring: standard
systemd, Python 3.11 present, and an apt that does not interrupt itself. When
something breaks it is very probably Helvilette that broke.

## Seed the fleet repository

Othela starts with
`--fleet-repo=http://192.168.121.10:3000/helvi-test/baseline.git`, which does
not exist until you create it. Gitea needs a one-time manual setup:

1. Open `http://192.168.121.10:3000` and complete the installer.
2. Register a user named `helvi-test`. The first user registered becomes the
   administrator.
3. Create a repository named `baseline`.

Then put a playbook and a manifest in `vagrant/baseline-repo/` on your host and
push them:

```bash
cd vagrant
make repo
```

That target initialises `baseline-repo/`, commits it, and pushes to
`http://192.168.121.10:3000/helvi-test/baseline.git` on `main`. The directory
is gitignored, so its contents are yours to write.

:::caution[Give the agent labels before you expect a dispatch]
`helvi-agent.service` starts with `--othela-url`, `--node-id` and
`--poll-interval`, and **no** `--labels`. An agent with no labels satisfies no
`nodeSelector`, and an empty `nodeSelector` in the manifest is rejected at load
time rather than treated as "match everything". Out of the box, nothing is
dispatched.

Add labels to the unit on the agent node:

```bash
vagrant ssh agent1
sudo systemctl edit --full helvi-agent.service   # append --labels="role=baseline"
sudo systemctl daemon-reload && sudo systemctl restart helvi-agent
```

and write a matching `nodeSelector` in your manifest:

```yaml
nodeGroups:
  - name: "all-agents"
    nodeSelector:
      role: "baseline"
```
:::

## Watch it run

```bash
make othela                        # ssh to the control plane VM
sudo journalctl -u othela -f
```

```bash
make agent                         # ssh to the managed node
sudo journalctl -u helvi-agent -f
```

The manifest Othela loads is a normal
[`helvilette.yml`](/helvilette/reference/helvilette-yml/), and every failure
mode in [diagnose a manifest that deploys
nothing](/helvilette/how-to/diagnose-a-silent-manifest/) applies unchanged.
The one difference from a local run is that both processes are under systemd,
so their output is in the journal rather than on a terminal.

## Managing the environment

| Command | Effect |
|---|---|
| `make up` | `vagrant up` with provisioning, then prints the Gitea setup steps |
| `make reload` | `vagrant reload --provision`, to re-run provisioning after a source change |
| `make down` | `vagrant destroy -f` |
| `make teardown` | Destroy and rebuild from scratch |
| `make othela` | SSH into the control plane VM |
| `make agent` | SSH into the managed node |

Take a snapshot of both VMs before a test run. Nothing about a test is
permanent damage when you can roll back, and you will want a clean baseline to
compare a second run against.

## Related

- [Run the E2E suite](/helvilette/how-to/run-e2e-tests/) — the containerised
  harness, faster and sufficient for most changes.
- [Othela configuration](/helvilette/reference/othela-configuration/) — the
  flags in `othela.service`.
- [Agent configuration](/helvilette/reference/agent-configuration/) — labels,
  identity, and the config file the systemd unit could use instead of flags.
