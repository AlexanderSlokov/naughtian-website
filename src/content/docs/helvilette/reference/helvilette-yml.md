---
title: helvilette.yml reference
description: Every field in the declarative manifest that tells Othela what runs where.
sidebar:
  order: 1
---

`helvilette.yml` lives inside your Ansible playbook repository and declares
what should run where. It follows Kubernetes API conventions closely enough
that the structure should already be familiar.

## Complete example

```yaml
apiVersion: apps/v1
kind: Cluster
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

| Field | Type | Description |
|---|---|---|
| `apiVersion` | string | API version of the manifest, e.g. `apps/v1` |
| `kind` | string | Resource kind, e.g. `Cluster` |
| `metadata` | object | Identifying information — see below |
| `spec` | object | The declaration itself — see below |

## `metadata`

| Field | Type | Description |
|---|---|---|
| `name` | string | Name of this declaration |
| `namespace` | string | Logical grouping |
| `labels` | map | Arbitrary key/value labels on the manifest itself |
| `description` | string | Free text describing the deployment |

Note that `metadata.labels` describes *this manifest*. It is not the mechanism
that targets nodes — that is `spec.nodeGroups[].nodeSelector`.

## `spec`

| Field | Type | Description |
|---|---|---|
| `repo` | string | Git URL of the playbook repository the agent clones |
| `branch` | string | Branch to check out |
| `playbook` | string | Path to the playbook within the repository |
| `nodeGroups` | list | One or more targeting groups — see below |

## `spec.nodeGroups[]`

Each node group binds a set of nodes to a set of Ansible variables.

| Field | Type | Description |
|---|---|---|
| `name` | string | Name of the group |
| `nodeSelector` | map | Labels an agent must have to receive this job |
| `ansible` | object | Ansible-specific configuration — see below |

### How matching works

Othela compares an agent's labels — set via `--labels`, `AGENT_LABELS`, or the
config file — against `nodeSelector`. An agent that matches receives the job.
An agent that matches nothing receives no work and stays idle.

This is the same mental model as Kubernetes pod scheduling: label your nodes,
then select them.

## `spec.nodeGroups[].ansible`

| Field | Type | Description |
|---|---|---|
| `extra_vars` | map | Variables passed through to `ansible-playbook` |
| `vault-password-file` | string | Path to an Ansible Vault password file |

Note the inconsistent casing: `extra_vars` uses an underscore, matching
Ansible's own naming, while `vault-password-file` uses hyphens. Both are as the
parser declares them in `pkg/manifest/types.go`.

`extra_vars` values are strings. Quote numeric-looking values — `"80"`, not
`80` — to avoid YAML coercing them into integers.

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
