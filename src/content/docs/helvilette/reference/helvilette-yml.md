---
title: helvilette.yml reference
description: Every field in the declarative manifest that tells Othela what runs where, which ones are required, and which are declared but not yet enforced.
sidebar:
  order: 1
---

`helvilette.yml` lives inside your Ansible playbook repository and declares
what should run where. It follows Kubernetes API conventions closely enough
that the structure should already be familiar.

## Complete example

```yaml
apiVersion: helvilette.io/v1alpha1
kind: PlaybookDeployment
metadata:
  name: "my-company-edge-proxy-fleet"
  labels:
    app: "nginx-collection"
    version: "1.0.0"

spec:
  repo: "http://git-server:3000/helvilette/nginx-collection.git"
  branch: "main"
  playbook: "playbook.yml"

  nodeGroups:
    - name: "standard-proxies"
      nodeSelector:
        role: "edge-proxy"
      ansible:
        extra_vars:
          nginx_http_port: "80"
          nginx_https_port: "443"
```

## Top-level fields

| Field | Type | Required | Description |
|---|---|---|---|
| `apiVersion` | string | yes | Must be exactly `helvilette.io/v1alpha1` |
| `kind` | string | yes | Must be exactly `PlaybookDeployment` |
| `metadata` | object | yes | Identifying information — see below |
| `spec` | object | yes | The declaration itself — see below |

`apiVersion` and `kind` are compared literally. No other value is accepted, and
no legacy value is tolerated — a manifest carrying the older `apps/v1` /
`Cluster` pair is rejected rather than upgraded in place. The reasoning for
those particular values is in [schema
identity](/helvilette/explanation/schema-identity/).

## `metadata`

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Name of this declaration |
| `namespace` | string | no | Logical grouping |
| `labels` | map | no | Arbitrary key/value labels on the manifest itself |
| `description` | string | no | Free text describing the deployment |

Note that `metadata.labels` describes *this manifest*. It is not the mechanism
that targets nodes — that is `spec.nodeGroups[].nodeSelector`.

## `spec`

| Field | Type | Required | Description |
|---|---|---|---|
| `repo` | string | yes | Git URL of the playbook repository the agent clones |
| `branch` | string | no | Branch to check out. Empty means the clone's default branch |
| `playbook` | string | yes | Path to the playbook within the repository |
| `nodeGroups` | list | yes | At least one targeting group — see below |

## `spec.nodeGroups[]`

Each node group binds a set of nodes to a set of Ansible variables.

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Name of the group |
| `nodeSelector` | map | yes | Labels an agent must have to receive this job. Must contain at least one entry |
| `ansible` | object | no | Ansible-specific configuration — see below |

### How matching works

Othela compares an agent's labels — set via `--labels`, `AGENT_LABELS`, or the
config file — against `nodeSelector`. A group matches when every key/value pair
in its `nodeSelector` is present in the agent's labels. The agent may carry
extra labels beyond those.

An agent that matches nothing receives no work and stays idle. This is the same
mental model as Kubernetes pod scheduling: label your nodes, then select them.

An empty `nodeSelector` matches **no** node, not every node. Because that reads
the opposite way round to most people's intuition, it is rejected at load time
rather than left to surprise you.

:::caution[Overlapping selectors]
If an agent's labels match more than one `nodeGroup`, only the **first** one is
dispatched and the rest are discarded without any log line. The winner is the
first matching group declared in the alphabetically first matching playbook
directory.

Until this is resolved, write `nodeSelector` rules that are mutually exclusive.
Tracked as
[issue #15](https://github.com/AlexanderSlokov/Helvilette/issues/15).
:::

## `spec.nodeGroups[].ansible`

| Field | Type | Status | Description |
|---|---|---|---|
| `extra_vars` | map | working | Variables passed through to `ansible-playbook` |
| `vault-password-file` | string | **parsed but inert** | Names a vault secret. See below |

Note the inconsistent casing: `extra_vars` uses an underscore, matching
Ansible's own naming, while `vault-password-file` uses hyphens. Both are as the
parser declares them in `pkg/manifest/types.go`.

`extra_vars` values are strings. Quote numeric-looking values — `"80"`, not
`80` — to avoid YAML coercing them into integers.

## Validation

The manifest is validated when Othela loads it. A manifest that fails
validation is rejected, logged at `WARN` with a message stating the playbook
will not be dispatched, and its playbook is never handed to any agent.

Rejection happens when any of these is true:

| Condition | Message names |
|---|---|
| `apiVersion` is not `helvilette.io/v1alpha1` | the value found and the value expected |
| `kind` is not `PlaybookDeployment` | the value found and the value expected |
| `metadata.name` is empty | the field and an example value |
| `spec.repo` is empty | the field and an example Git URL |
| `spec.playbook` is empty | the field and an example path |
| `spec.nodeGroups` is empty or absent | the field and what a group requires |
| A group has no `name` | the group's index and an example name |
| A group has an empty `nodeSelector` | the group's index, its name, and an example label |

Every message names the offending field, the value found, and the shape
expected, so a manifest can be corrected without reading the parser.

Validation checks the *presence* of fields, not their spelling. Unknown keys
are still accepted silently, so a typo inside `ansible:` is not yet caught.
Strict unknown-key rejection is planned but cannot land until the sections
below have types.

For what to do when a manifest is rejected — or when it is accepted and still
nothing deploys — see [diagnose a manifest that deploys
nothing](/helvilette/how-to/diagnose-a-silent-manifest/).

## Not yet implemented

Three things appear in Helvilette's own example manifests and in older
documentation but do **not** work today. Do not rely on them.

| Section | State |
|---|---|
| `spec.vault` | Not parsed. Absent from the Go types entirely, so it is discarded during unmarshalling |
| `spec.nodeGroups[].probes` | Not parsed. Same as above |
| `spec.nodeGroups[].ansible.vault-password-file` | Parsed into the manifest struct, then never read. It is not carried on the job the agent receives, so it reaches neither the agent nor `ansible-playbook` |

The third is the easiest to be misled by, because it is a recognised key that
survives parsing. A manifest naming a vault password file loads without
complaint and runs without ever using it.

Progress on all three is tracked under Vault / Secret Integration and Health
Probes in the upstream
[BACKLOG](https://github.com/AlexanderSlokov/Helvilette/blob/main/BACKLOG.md).

## Kubernetes equivalents

The manifest is deliberately isomorphic to concepts you already know:

| Kubernetes | Helvilette |
|---|---|
| OCI image | Ansible playbook repository |
| Container registry | Git server |
| `Dockerfile` | `playbook.yml` plus `roles/` |
| `values.yaml` (Helm) | `helvilette.yml` |
| Pod spec / `nodeSelector` | `nodeGroup` / `nodeSelector` |

See [architecture](/helvilette/explanation/architecture/) for the full mapping,
including the control plane and agent components.

## Related

- [Schema identity](/helvilette/explanation/schema-identity/) — why
  `helvilette.io/v1alpha1` rather than `apps/v1`, and what the alpha level
  promises.
- [Diagnose a manifest that deploys
  nothing](/helvilette/how-to/diagnose-a-silent-manifest/) — the task-oriented
  companion to the validation table above.
