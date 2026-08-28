---
title: Why the manifest is helvilette.io/v1alpha1
description: How Kubernetes API group conventions apply to a tool that is not Kubernetes, and why the version says alpha.
sidebar:
  order: 5
---

`helvilette.yml` opens with two lines that look like boilerplate:

```yaml
apiVersion: helvilette.io/v1alpha1
kind: PlaybookDeployment
```

They used to say `apps/v1` and `Cluster`. Both halves were wrong, in ways worth
explaining, because the reasoning applies to anyone borrowing Kubernetes'
surface for a tool that is not Kubernetes.

The decision is recorded upstream as
[ADR-0002](https://github.com/AlexanderSlokov/Helvilette/blob/main/docs/informations/ADRs/ADR-0002.md),
which carries the full argument and the rejected alternatives.

## The group belongs to whoever owns the domain

Kubernetes `apiVersion` values come in two shapes. The core group is bare —
`v1`, covering Pod, Service, ConfigMap, Secret. Everything else is
`<group>/<version>`, where the group is required to be a DNS subdomain.

The short, domain-less groups that everyone recognises — `apps`, `batch`,
`policy`, `autoscaling` — are not a pattern to copy. They are holdovers from
Kubernetes 1.x, kept for compatibility, and the API conventions explicitly ask
new groups to use a domain the project owns. The `.k8s.io` suffix is reserved
for Kubernetes itself.

`apps/v1` is worse than merely unfashionable: it is an occupied group.
Deployment, StatefulSet, DaemonSet and ReplicaSet live there. Filing
`kind: Cluster` into `apps` means putting a foreign kind inside someone else's
namespace.

### k3s settles it

The decisive evidence is k3s, because it had every excuse to do otherwise. It
is a Kubernetes distribution. If any project could plausibly file its own kinds
under a core group, it is the one that ships the core groups.

It does not. Every k3s-owned kind sits under a domain Rancher owns:

| Project | Group for its own kinds |
|---|---|
| k3s | `k3s.cattle.io`, `helm.cattle.io` |
| Flux | `source.toolkit.fluxcd.io`, `kustomize.toolkit.fluxcd.io` |
| Argo CD | `argoproj.io` |
| cert-manager | `cert-manager.io` |
| Prometheus Operator | `monitoring.coreos.com` |
| Cluster API | `cluster.x-k8s.io` |

Six projects, one rule, no exceptions: your kinds go under your domain.
Helvilette follows it.

There is a caveat worth stating plainly. The convention asks for a domain the
project actually controls. The practical risk of getting that wrong is close to
zero here, because Helvilette manifests are never submitted to a Kubernetes API
server and therefore cannot collide with a real CustomResourceDefinition. The
group functions as a namespace label, not a registered API surface.

## The version is a promise, not a counter

This is the half that is easiest to get wrong, because `v1` looks like a
starting point rather than a commitment.

In Kubernetes the suffix is a contract:

| Level | What it promises |
|---|---|
| `v1alpha1` | May change or disappear without notice |
| `v1beta1` | Enabled by default, may still change, with a conversion path |
| `v1` | Backward compatible for the lifetime of v1 |

Helvilette cannot honour the third. Two sections — `spec.vault` and
`nodeGroups[].probes` — appear in the project's own example manifests with no
parser behind them, and the schema has already been rewritten once since it was
first proposed. Declaring `v1` would promise stability the manifest has not
earned.

`v1alpha1` states the true situation and leaves room for those sections to land
without breaking anyone. The [reference
page](/helvilette/reference/helvilette-yml/#not-yet-implemented) lists exactly
what is not yet real.

## The kind should name the thing

`kind` names the object a manifest declares. That is the whole job of the
field.

`helvilette.yml` lives inside a playbook repository and declares which playbook
is deployed to which node groups with which variables. That is not a cluster.
In Cluster API, `cluster.x-k8s.io/v1beta1` `kind: Cluster` means an actual
cluster resource — a real thing with a lifecycle, not a deployment description.

`PlaybookDeployment` names what the file does. It is longer, and it is
self-explanatory to somebody reading a manifest for the first time, which is
the case that matters.

## Why enforcement arrived at the same time

Naming is only half the story. Before this change, **nothing read either
field.** `apiVersion` was declared in the Go types and never referenced
anywhere in the codebase, and the parser unmarshalled YAML with no validation
at all.

The symptom was three different spellings of the schema identity coexisting in
one repository — `apps/v1`/`Cluster` in the example manifests,
`v1`/`Helvilette` in the parser's own tests, `helvilette.io/v1`/`Blueprint` in
the original design issue. They coexisted precisely because no code ever
compared them.

The consequence was worse than untidiness. A manifest with a stale
`apiVersion`, or with `nodegroups` misspelled, unmarshalled cleanly into an
empty object. It matched no node. Every agent received `204 No Content` and
kept polling contentedly. There was no error, no warning, and no log line
naming the file.

That is the same failure shape as [the configuration precedence
problem](/helvilette/explanation/config-precedence/): something explicit and
version-controlled, read successfully, doing nothing, with no signpost pointing
at the cause. Both were resolved on the same principle — the expensive failure
is the silent one, so make it loud and make it early.

Renaming without enforcing would have produced a fourth spelling and fixed
nothing.

## What it cost

Every existing manifest had to be updated. The project was pre-release, so the
bill was three files, and the breaking change was spent once on the group,
version and kind together rather than three times.

The failure mode for anyone who misses the update is a rejection message naming
both the value found and the value expected — which is the cheapest possible
way to discover a schema change.

## Related

- [helvilette.yml reference](/helvilette/reference/helvilette-yml/) — every
  field, what is required, and what is not yet implemented.
- [Diagnose a manifest that deploys
  nothing](/helvilette/how-to/diagnose-a-silent-manifest/) — what to do when a
  manifest is rejected.
- [Why the config file outranks the
  environment](/helvilette/explanation/config-precedence/) — the same
  silent-failure argument, applied to agent configuration.
