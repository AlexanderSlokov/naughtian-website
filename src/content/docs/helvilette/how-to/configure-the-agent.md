---
title: Configure the agent
description: Set the agent's identity, labels and polling behaviour using flags, environment variables or a config file.
sidebar:
  order: 1
---

The agent supports Kubernetes-style configuration through three mechanisms.
When the same setting appears in more than one, later sources overwrite earlier
ones in this order:

**defaults → YAML config file → environment variables → CLI flags**

CLI flags win over everything. Defaults apply only when nothing else sets a
value.

:::caution[The README states a different order]
The upstream README documents precedence as *"CLI flags > YAML config >
Environment variables > Defaults"*, which would put the config file above
environment variables. The implementation in `cmd/agent/main.go` applies the
config file first and then lets environment variables override it, so the real
order is the one above. Trust the code, not the README.
:::

## Using CLI flags

Best for development and one-off runs.

```bash
./bin/agent \
  --othela-url=http://othela-server:8080/api/v1 \
  --node-id=node-01 \
  --poll-interval=5s \
  --labels="role=edge-proxy,env=production"
```

## Using environment variables

Best for containers and systemd unit files.

```bash
export OTHELA_URL=http://othela-server:8080/api/v1
export NODE_ID=node-01
export POLL_INTERVAL=5s
export AGENT_LABELS=role=edge-proxy,env=production
./bin/agent
```

## Using a config file

Best for managed fleets — this is the mechanism that "tastes like" kubelet.

```yaml
# /var/lib/helvilette/agent.yaml
othelaURL: "http://othela-server:8080/api/v1"
nodeID: "node-01"
pollInterval: "5s"
workspaceDir: "/tmp/helvilette"
labels:
  role: "edge-proxy"
  env: "production"
```

Then point the agent at it:

```bash
./bin/agent --config=/var/lib/helvilette/agent.yaml
```

:::danger[The README's example uses wrong key names]
The upstream README shows `otherlaUrl` and `nodeId`. Neither is what the parser
reads. `AgentConfiguration` in `cmd/agent/main.go` declares the keys as
`othelaURL` and `nodeID` — note the capitalised `URL` and `ID`.

Because unrecognised keys are simply ignored rather than rejected, copying the
README's example gives you an agent that silently falls back to the defaults
`http://localhost:8080/api/v1` and `agent-01`. If your agent is trying to reach
localhost when you configured a remote Othela, this is why.
:::

## Choosing labels

Labels are the entire targeting mechanism. Othela matches an agent's labels
against `nodeSelector` rules in `helvilette.yml` and hands back only the jobs
that match. An agent whose labels match nothing simply receives no work.

Label along the axes you will actually want to target:

```bash
--labels="role=edge-proxy,env=production,region=sgn,arch=arm64"
```

Getting this wrong is the most common reason an agent sits idle while you
expect it to be doing something. If a node is not picking up a job, compare its
labels against the `nodeSelector` before looking anywhere else.

## Tuning the poll interval

`--poll-interval` controls how often the agent asks Othela for work, and
therefore how quickly a Git push propagates to the fleet.

- **Short (1–5s)** — fast convergence, more requests. Fine for a handful of
  nodes or during development.
- **Longer (30s–5m)** — appropriate for large fleets, metered connections, or
  edge devices where waking the radio costs power.

Since agents poll independently, a large fleet on a short interval produces
steady load on Othela proportional to fleet size divided by interval.

## Related

- [Agent configuration reference](/helvilette/reference/agent-configuration/) —
  every setting in table form.
- [helvilette.yml reference](/helvilette/reference/helvilette-yml/) — the other
  half of the targeting equation.
