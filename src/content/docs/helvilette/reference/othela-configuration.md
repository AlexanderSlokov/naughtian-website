---
title: Othela configuration
description: Every flag on the Othela control plane, what it defaults to, and which directories Othela reads from and writes to.
sidebar:
  order: 3
---

Othela is configured entirely by CLI flags. There is no config file and no
environment variable layer, which is the opposite of the agent: Othela runs in
one place under one systemd unit, so the flexibility the agent needs would only
be surface area here.

## Flags

| Flag | Short | Default | Description |
|---|---|---|---|
| `--fleet-repo` | — | none, **required** | Git repository containing the `helvilette.yml` manifests |
| `--fleet-branch` | — | `main` | Revision of the fleet repository to check out |
| `--fleet-sync-interval` | — | `1m` | How often the fleet repository is re-pulled |
| `--state-dir` | — | `/var/lib/helvilette/othela` | Writable directory for the SQLite database and the fleet clone |
| `--port` | `-p` | `8080` | Port to listen on |
| `--log-level` | `-l` | `info` | `debug`, `info`, `warn` or `error` |

`--fleet-repo` has no default and Othela exits immediately without it:

```
[FATAL] --fleet-repo is required
```

## The two directories

Othela reads manifests from Git and writes state to disk. Those are different
locations on purpose, and Othela never writes into the first one.

| Location | Contents | Access |
|---|---|---|
| `--fleet-repo` (remote) | Manifests, pulled every `--fleet-sync-interval` | Read-only |
| `--state-dir` | SQLite database and the fleet clone | Read-write |

Inside `--state-dir`:

| Path | Contents |
|---|---|
| `{state-dir}/db/state.db` | Node registrations, labels and reports |
| `{state-dir}/fleet` | The working clone of the fleet repository |

:::caution[The default state directory needs root]
`/var/lib/helvilette/othela` is the FHS location a systemd-managed install
wants, and it is the wrong choice for a development run. Without write access,
Othela logs a warning and falls back to in-memory storage, losing every node
registration and report on restart:

```
[WARN] Could not initialize SQLite at /var/lib/helvilette/othela/db/state.db: ...
[WARN] Falling back to in-memory storage
```

Pass an explicit writable path when running locally, for example
`--state-dir=./data/othela`.
:::

## Typical invocations

Development, on your own machine:

```bash
go run ./cmd/othela \
  --port=8080 \
  --fleet-repo=/home/you/fleet \
  --state-dir=./data/othela \
  --log-level=debug
```

A local filesystem path is a valid Git URL, so a fleet repository that exists
only on your laptop works without a Git server.

Under systemd, with a real Git host:

```ini
[Service]
Type=simple
User=helvilette
ExecStart=/usr/local/bin/othela \
  --port=8080 \
  --fleet-repo=http://git.example.com/helvi-test/baseline.git \
  --state-dir=/var/lib/helvilette/othela
Restart=always
RestartSec=5
```

## How the fleet repository is used

1. On startup, and then every `--fleet-sync-interval`, Othela clones or pulls
   `--fleet-repo` into `{state-dir}/fleet` and checks out `--fleet-branch`.
2. It walks that clone recursively for files named `helvilette.yml`, skipping
   hidden directories such as `.git`.
3. Each manifest is validated. A rejected one is logged at `WARN` and its
   playbook is never dispatched.
4. Accepted manifests replace the in-memory set that agent polls are matched
   against.

`--fleet-branch` is resolved as a Git revision rather than strictly a branch
name, so a tag or a commit SHA pins the fleet to an exact state.

A failed sync leaves the previous set in place and logs at `ERROR`:

```
[ERROR] Failed to sync fleet repository http://git.example.com/org/fleet.git: ...
```

Othela keeps serving the last good scan, so a stale manifest set is a symptom
worth checking the log for. See [diagnose a manifest that deploys
nothing](/helvilette/how-to/diagnose-a-silent-manifest/).

The playbook the agent actually runs does not come from the fleet repository.
It comes from `spec.repo` and `spec.playbook` inside the manifest, and the
agent clones it directly. The two repositories can be the same one.

## Removed flags

Both of these now exit with an error naming the replacement. Neither is
accepted as a deprecated alias, because neither maps cleanly onto one successor.

| Removed flag | Replacement |
|---|---|
| `--data-dir`, `-d` | `--fleet-repo` for manifests, `--state-dir` for writable state |
| `--playbook-dir` | `--fleet-repo` |

`--data-dir` named the directory playbooks were loaded from **and** received
the SQLite database at `{data-dir}/server/db/state.db`, so read-only input and
read-write state shared one directory. In the e2e stack that directory was
bind-mounted from inside the Go module tree, and Othela running as root wrote
`root:root` files into it, which broke `go vet ./...` on the host before it
compiled anything. Splitting the two is
[ADR-0003](https://github.com/AlexanderSlokov/Helvilette/blob/main/docs/informations/ADRs/ADR-0003.md).

`--playbook-dir` was the read-only half of that split, and it lasted only until
manifest resolution moved to Git entirely. Othela no longer reads manifests
from local disk at all.

:::note[The old default was misspelled]
`--data-dir` defaulted to `helvillette/othela/data/playbooks`, with a doubled
`l`. Anyone who copied that path verbatim into a script or a systemd unit needs
to correct the spelling as well as the flag.
:::

## See also

- [helvilette.yml reference](/helvilette/reference/helvilette-yml/) — the
  manifests Othela discovers in the fleet repository.
- [Agent configuration](/helvilette/reference/agent-configuration/) — the other
  half of the loop, which does have a config file and an environment layer.
- [Run your first reconciliation
  loop](/helvilette/tutorials/quickstart/) — these flags in context.
