---
title: Configure the agent
description: Set the agent's identity, labels and polling behaviour using flags, environment variables or a config file.
sidebar:
  order: 1
---

The agent supports Kubernetes-style configuration through three mechanisms.
When the same setting appears in more than one, later sources overwrite earlier
ones in this order:

**defaults → environment variables → YAML config file → CLI flags**

CLI flags win over everything. Defaults apply only when nothing else sets a
value.

The one ordering that surprises people: the **config file beats environment
variables**, which is the opposite of the viper/12-factor convention and the
same way k3s resolves it. The reasoning is in [why the config file outranks the
environment](/helvilette/explanation/config-precedence/); the short version is
that a file you can read is easier to debug at 3am than a variable you cannot
see.

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

Note that this is the **weakest** of the three mechanisms. Environment
variables fill in whatever the config file leaves unset, but they will not
override a value the file sets. To override a config file at runtime — in a pod
spec, say — use `args:`, which are CLI flags.

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

Key names are case-sensitive: `othelaURL` and `nodeID`, with capitalised `URL`
and `ID`. An unrecognised key is rejected at startup, so a typo fails
immediately and visibly rather than leaving the agent running on defaults.

## Confirming which mechanism won

Once more than one mechanism is in play, the useful question is not "what does
the precedence table say?" but "what is *this* node actually using?".
`--print-config` answers it directly — it resolves the configuration, prints
each value with the source that supplied it, and exits without starting the
agent:

```console
$ ./bin/agent --config=/var/lib/helvilette/agent.yaml --print-config
othelaURL    = http://othela-server:8080/api/v1  source=config-file
nodeID       = node-01                           source=config-file
pollInterval = 5s                                source=default
workspaceDir = /var/lib/helvilette/workspace     source=config-file
labels.owner = sre                               source=env(AGENT_LABELS)
labels.role  = edge-proxy                        source=config-file
```

Run it the same way you run the agent — same unit file, same container, same
environment — or the answer describes a different situation than the one you
are debugging.

**If the agent is talking to the wrong Othela**, this is the first thing to
check. `source=default` on `othelaURL` means nothing you wrote was read at all:
a config file that was never passed with `--config`, a path that does not
exist, or a variable exported in a different shell than the one that started
the agent. `source=env(OTHELA_URL)` when you expected the file means the file
does not set that key — check the spelling of `othelaURL`.

**If a node registers under an unexpected identity**, look at `nodeID`. A
source of `default(hostname)` means nothing configured it and the machine's
hostname was used; `agent-unknown` means even the hostname was unavailable.
Either way, set `nodeID` explicitly.

The agent logs the same resolution at startup under the message `effective
configuration`, so you can also answer the question after the fact from a
node's logs. See the [configuration
reference](/helvilette/reference/agent-configuration/#inspecting-the-resolved-configuration)
for the full vocabulary of source names.

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
labels against the `nodeSelector` before looking anywhere else — [diagnose a
manifest that deploys
nothing](/helvilette/how-to/diagnose-a-silent-manifest/) walks the full
checklist.

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
- [Why the config file outranks the
  environment](/helvilette/explanation/config-precedence/) — the reasoning
  behind the precedence order above.
- [helvilette.yml reference](/helvilette/reference/helvilette-yml/) — the other
  half of the targeting equation.
- [Diagnose a manifest that deploys
  nothing](/helvilette/how-to/diagnose-a-silent-manifest/) — when the labels
  look right and the agent still gets no work.
