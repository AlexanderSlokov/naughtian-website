---
title: Agent configuration
description: Every agent setting, its CLI flag, environment variable, YAML key and default.
sidebar:
  order: 2
---

The agent's configuration model is deliberately modelled on Kubernetes'
`KubeletConfiguration`.

## Precedence

Sources are applied in this order, each overwriting the last:

1. Built-in defaults
2. Environment variables
3. YAML config file, if `--config` is given
4. CLI flags

Equivalently, from strongest to weakest: **CLI flags > YAML config file >
environment variables > defaults**.

The config file outranking the environment is deliberate, and it is where
Helvilette parts company with the viper/12-factor convention. An explicit,
version-controlled file is the artifact you can read, grep and review; an
ambient `OTHELA_URL` inherited from a systemd `EnvironmentFile=` or a container
environment is not. See [why the config file outranks the
environment](/helvilette/explanation/config-precedence/) for the full argument.

## Settings

| Setting | CLI flag | Environment variable | YAML key | Default |
|---|---|---|---|---|
| Control plane URL | `--othela-url` | `OTHELA_URL` | `othelaURL` | `http://localhost:8080/api/v1` |
| Node identifier | `--node-id` | `NODE_ID` | `nodeID` | machine hostname |
| Poll interval | `--poll-interval` | `POLL_INTERVAL` | `pollInterval` | `5s` |
| Workspace directory | `--workspace-dir` | `WORKSPACE_DIR` | `workspaceDir` | `/tmp/helvilette` |
| Node labels | `--labels` | `AGENT_LABELS` | `labels` | empty |
| Config file path | `--config` | — | — | none |
| Print resolved config and exit | `--print-config` | — | — | `false` |

:::caution[YAML keys are case-sensitive]
The keys are `othelaURL` and `nodeID`, with capitalised `URL` and `ID`. Writing
`othelaUrl` or `nodeId` is the most common mistake here.

It is no longer a silent one: unrecognised keys are **rejected at startup**, so
a typo surfaces as a startup error rather than an agent quietly running on
defaults. The failure is loud, but you still have to spell the keys correctly to
get past it.
:::

### Node identity

If nothing sets `nodeID`, the agent uses the machine's hostname so that nodes
stay distinguishable without configuration. Setting it explicitly is still
recommended — a hostname is a fallback, not an identity you control.

Should the hostname be unavailable, the agent falls back to `agent-unknown` and
logs a warning. That name is deliberately implausible: any *plausible* static
default makes every affected node register under one identity, which is how a
single misconfiguration becomes a fleet-wide identity collision.

:::note[Upgrading from 0.1.0]
`nodeID` previously defaulted to the static `agent-01`. A node that relied on
that implicit default — rather than setting `nodeID`, `NODE_ID` or `--node-id`
— will register under a new identity after upgrading. Set `nodeID` explicitly
to pin it.
:::

### Label syntax

On the command line and in the environment, labels are comma-separated
`key=value` pairs:

```bash
--labels="role=edge-proxy,env=production"
```

```bash
export AGENT_LABELS=role=edge-proxy,env=production
```

In YAML they are a mapping:

```yaml
labels:
  role: "edge-proxy"
  env: "production"
```

All three sources **merge per key**. A higher-priority source wins only the keys
it actually sets; keys it does not mention survive from below. No source
replaces the map wholesale.

Given `AGENT_LABELS=env=production,region=eu-west,owner=sre`, a config file
setting `role: edge-proxy` and `region: us-east`, and `--labels="role=db"`, the
agent ends up with:

| Label | Value | Won by |
|---|---|---|
| `owner` | `sre` | environment — nothing else sets it |
| `env` | `production` | environment — nothing else sets it |
| `region` | `us-east` | config file, over the environment |
| `role` | `db` | CLI flag, over the config file |

### Duration syntax

`pollInterval` is parsed by Go's `time.ParseDuration`, so it accepts values
like `5s`, `30s`, `1m30s` and `2h`. A bare number is not valid — `5` will fail
where `5s` succeeds.

An invalid duration in the **config file** is a fatal error and the agent
refuses to start. An invalid duration in `POLL_INTERVAL` or `--poll-interval`
is ignored, leaving the previous value in place — `--print-config` will report
the source that actually won, which is how you spot it.

## Config file example

```yaml
# /var/lib/helvilette/agent.yaml
othelaURL: "http://othela-server:8080/api/v1"
nodeID: "node-01"
pollInterval: "5s"
workspaceDir: "/var/lib/helvilette/workspace"
labels:
  role: "edge-proxy"
  env: "production"
```

```bash
./bin/agent --config=/var/lib/helvilette/agent.yaml
```

Keys are matched exactly as written. An unrecognised key is a startup error.

## Inspecting the resolved configuration

Because values arrive from four sources, the agent can report which one won
each value. There are two ways to read that.

### `--print-config`

Resolves the configuration, prints every value with its source, and exits
without starting the agent:

```console
$ ./bin/agent --config=/var/lib/helvilette/agent.yaml --print-config
othelaURL    = http://othela-server:8080/api/v1  source=config-file
nodeID       = node-01                           source=config-file
pollInterval = 5s                                source=default
workspaceDir = /var/lib/helvilette/workspace     source=config-file
labels.owner = sre                               source=env(AGENT_LABELS)
labels.role  = edge-proxy                        source=config-file
```

Field order is stable and labels are sorted, so the output of two nodes — or
two runs on the same node — can be diffed directly. This also makes it usable
as a config-file validity check in CI: an unknown key or an invalid
`pollInterval` fails here without anything having to start.

### The startup log

The agent logs the same information when it starts, under the message
`effective configuration`, with the values in a `config` object and their
sources in a matching `configSources` object. A node's behaviour can therefore
be explained from its own logs, without reconstructing the precedence rules
from its systemd unit and container environment.

Set `HELVILETTE_DEV=1` for human-readable console output instead of JSON.

If `nodeID` fell back to `agent-unknown`, a warning is logged alongside it.

### Source names

| Source | Meaning |
|---|---|
| `default` | Nothing set the value; the built-in default applies |
| `default(hostname)` | `nodeID` was unset and resolved to the machine hostname |
| `config-file` | The YAML file given to `--config` |
| `env(NAME)` | The named environment variable, e.g. `env(OTHELA_URL)` |
| `cli(--flag)` | The named CLI flag, e.g. `cli(--othela-url)` |

Labels are reported per key as `labels.<key>`, each with its own source.

## See also

- [Configure the agent](/helvilette/how-to/configure-the-agent/) — guidance on
  choosing between the three mechanisms.
- [Why the config file outranks the
  environment](/helvilette/explanation/config-precedence/) — the reasoning
  behind the precedence order.
- [helvilette.yml reference](/helvilette/reference/helvilette-yml/) — the
  manifest whose `nodeSelector` these labels are matched against.
