---
title: Diagnose a manifest that deploys nothing
description: Work through the reasons Othela accepts a helvilette.yml and still hands no job to an agent that looks like it should match.
sidebar:
  order: 3
---

An agent is polling, reporting healthy, and doing no work. This page walks the
failure modes in the order they are cheapest to rule out.

Run Othela with `--log-level=debug` before you start. Two of the four checks
below produce no output at the default level.

```bash
./bin/othela --data-dir=data/playbooks --log-level=debug
```

## 1. Check the manifest was accepted at all

A manifest that fails validation is rejected, and its playbook is never
dispatched to anybody. Othela says so at `WARN`:

```
WRN rejected manifest, playbook will not be dispatched to any node
    manifest=data/playbooks/nginx-collection/helvilette.yml
    error="invalid manifest ...: unsupported apiVersion \"apps/v1\", expected \"helvilette.io/v1alpha1\""
```

The message names the field, the value found, and the value expected. Fix the
named field and restart Othela.

The most common cause after an upgrade is the old schema identity. Change:

```yaml
apiVersion: apps/v1      # old
kind: Cluster            # old
```

to:

```yaml
apiVersion: helvilette.io/v1alpha1
kind: PlaybookDeployment
```

See the [validation
table](/helvilette/reference/helvilette-yml/#validation) for every condition
that triggers a rejection.

## 2. Check the playbook is loaded

If there is no `WARN`, confirm Othela actually found the directory:

```bash
curl -s http://localhost:8080/api/v1/playbooks | jq
```

A playbook only appears here if its directory contains a `playbook.yml`. A
directory holding a valid `helvilette.yml` and no `playbook.yml` is skipped
silently — there is no log line for it.

If the list is empty, check `--data-dir` points at the directory *containing*
the playbook directories, not at a playbook directory itself.

## 3. Check the agent is registered

An agent must register before it can receive work. If it has not, the sync
endpoint returns `403`:

```bash
curl -i http://localhost:8080/api/v1/sync/node-1
```

```
HTTP/1.1 403 Forbidden
node not registered, call POST /api/v1/nodes/register first
```

This normally resolves itself — the agent registers on startup. A persistent
`403` means the agent is failing to reach Othela at all, or is registering
under a different `nodeID` than the one you are querying. Confirm which
identity it uses:

```bash
./bin/agent --print-config
```

Since `nodeID` defaults to the machine hostname, two nodes with the same
hostname register as one identity.

## 4. Compare labels against nodeSelector

This is the most common cause. A `204 No Content` from the sync endpoint means
the agent is registered, Othela is healthy, and nothing matched:

```bash
curl -i http://localhost:8080/api/v1/sync/node-1
```

```
HTTP/1.1 204 No Content
```

At debug level Othela states it directly:

```
[DEBUG] Node node-1 has labels map[role:web], but no nodeSelectors matched
```

Compare that against the `nodeSelector` in your manifest. Matching is a subset
test: **every** key/value pair in the `nodeSelector` must be present on the
agent. The agent may carry extra labels; it may not be missing any.

```yaml
nodeSelector:
  role: "edge-proxy"
  env: "production"
```

| Agent labels | Result |
|---|---|
| `role=edge-proxy,env=production` | matches |
| `role=edge-proxy,env=production,region=sgn` | matches — extra labels are fine |
| `role=edge-proxy` | no match — `env` missing |
| `role=edge-proxy,env=prod` | no match — `production` ≠ `prod` |

Values are compared literally. `prod` and `production` are different labels,
and so are `Edge-Proxy` and `edge-proxy`.

## 5. The job runs, but not with the variables you wrote

If the agent receives work and executes it, yet some `extra_vars` never take
effect, check whether the agent's labels match more than one `nodeGroup`.

Only the first matching group is dispatched. The rest are discarded with no log
line at any level, so a second group's `extra_vars` simply never appear.

```yaml
nodeGroups:
  - name: "standard-proxies"
    nodeSelector:
      role: "edge-proxy"        # matches
  - name: "high-performance-proxies"
    nodeSelector:
      role: "edge-proxy"        # also matches, silently ignored
```

Give each group a `nodeSelector` that cannot match the same agent — add a
distinguishing label such as `tier: standard` versus `tier: high-performance`,
and label the agents accordingly.

Tracked as [issue
#15](https://github.com/AlexanderSlokov/Helvilette/issues/15).

## 6. Rule out the sections that do not work yet

If what is missing is vault or probe behaviour, it is not a misconfiguration.
None of the following is implemented:

- `spec.vault` — discarded during parsing
- `spec.nodeGroups[].probes` — discarded during parsing
- `spec.nodeGroups[].ansible.vault-password-file` — parsed, then never read

The third is the misleading one. It is a recognised key, so the manifest loads
without complaint, and the value never reaches `ansible-playbook`. A playbook
depending on a vault secret will fail to decrypt it, and the cause will not
appear anywhere in Helvilette's own output.

See [not yet
implemented](/helvilette/reference/helvilette-yml/#not-yet-implemented).

## Related

- [helvilette.yml reference](/helvilette/reference/helvilette-yml/) — every
  field and every validation rule.
- [Configure the agent](/helvilette/how-to/configure-the-agent/) — setting
  labels, and confirming which configuration mechanism won.
- [Schema identity](/helvilette/explanation/schema-identity/) — why the
  `apiVersion` changed, and why validation arrived with it.
