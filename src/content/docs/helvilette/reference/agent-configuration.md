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
2. YAML config file, if `--config` is given
3. Environment variables
4. CLI flags

:::caution[Differs from the README]
The upstream README states *"CLI flags > YAML config > Environment variables >
Defaults"*. The implementation applies the config file **before** environment
variables, so environment variables win over the file. The order above reflects
`cmd/agent/main.go`.
:::

## Settings

| Setting | CLI flag | Environment variable | YAML key | Default |
|---|---|---|---|---|
| Control plane URL | `--othela-url` | `OTHELA_URL` | `othelaURL` | `http://localhost:8080/api/v1` |
| Node identifier | `--node-id` | `NODE_ID` | `nodeID` | `agent-01` |
| Poll interval | `--poll-interval` | `POLL_INTERVAL` | `pollInterval` | `5s` |
| Workspace directory | `--workspace-dir` | `WORKSPACE_DIR` | `workspaceDir` | `/tmp/helvilette` |
| Node labels | `--labels` | `AGENT_LABELS` | `labels` | empty |
| Config file path | `--config` | — | — | none |

:::danger[YAML keys are case-sensitive and not what the README shows]
The keys are `othelaURL` and `nodeID`, with capitalised `URL` and `ID`. The
README's example uses `otherlaUrl` and `nodeId`, which the parser does not
recognise. Unknown keys are ignored silently, so a mistyped key produces an
agent running on defaults rather than an error.
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

There is a behavioural difference worth knowing: labels supplied through
`AGENT_LABELS` are **merged** into whatever is already configured, key by key,
whereas a non-empty `labels` block in the config file **replaces** the current
map wholesale.

### Duration syntax

`pollInterval` is parsed by Go's `time.ParseDuration`, so it accepts values
like `5s`, `30s`, `1m30s` and `2h`. A bare number is not valid — `5` will fail
where `5s` succeeds.

An invalid duration in the **config file** is a fatal error and the agent
refuses to start. An invalid duration in `POLL_INTERVAL` is silently ignored,
leaving the previous value in place.

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

## See also

- [Configure the agent](/helvilette/how-to/configure-the-agent/) — guidance on
  choosing between the three mechanisms.
- [helvilette.yml reference](/helvilette/reference/helvilette-yml/) — the
  manifest whose `nodeSelector` these labels are matched against.
