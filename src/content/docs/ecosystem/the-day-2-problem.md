---
title: The day-2 problem
description: Every control plane needs a control plane. What HashiCorp solved, what it left behind, and the property that qualifies something to sit at the bottom.
sidebar:
  order: 2
---

This is the argument the rest of the ecosystem exists to answer. If you read
one page here, read this one.

## What the previous generation got right

Nomad, Consul and Vault are excellent at the job they set out to do: manage
heterogeneous infrastructure that does not fit the Kubernetes mould. Mixed VMs
and bare metal, non-containerised workloads, multi-datacenter topologies,
service discovery across a fleet that nobody wants to rewrite.

That was a real problem and they solved it well. Nothing here disputes that.

## What it left behind

Each of those tools is itself a stateful distributed system that somebody has
to operate.

Vault manages your secrets. Who manages Vault? Consul discovers your services.
Who keeps Consul's quorum healthy? The official answer is Terraform for
provisioning and your own Ansible for configuration — which is precisely the
maze that [pull-based delivery](/helvilette/explanation/why-pull-based/) exists
to dismantle.

Solve workload management, inherit control-plane management. The problem did
not disappear; it moved down a layer and got harder, because the thing you are
now operating is stateful and consensus-bound.

**Every control plane needs a control plane.** The regress is real, and most
tooling pretends the bottom of the stack is somebody else's problem.

## Day 2, concretely

The pain is not in day 1. Installing Vault is a pleasant afternoon. The pain is
every day after.

### Vault

**It starts sealed.** Every restart, every upgrade, every node replacement.
Something or someone has to unseal it before it is useful.

Your two options both cost something:

- **Shamir key shares** distributed among humans. Now a restart at 3am requires
  waking up multiple people who each hold a fragment. This is operationally
  honest and operationally miserable.
- **Auto-unseal** against a cloud KMS or a transit backend. Now Vault has an
  external dependency, and you have introduced a chicken-and-egg you will
  discover during a disaster recovery drill — if you are lucky enough to run
  one — when the KMS you depend on is in the region that is down.

**Integrated storage means quorum.** Raft wants an odd number of servers, three
or five, and those servers are pets in every sense: named, nursed, upgraded in
a careful step-down order, and mourned individually when one dies.

### Consul

**Gossip is sensitive.** Serf is chatty and unhappy about network partitions
and clock skew, and it fails in ways that are annoying to diagnose because the
symptom appears far from the cause.

**Losing quorum is not a degraded mode.** When Consul's servers lose quorum,
service discovery stops. And when service discovery stops, dependent
applications do not slow down — they break, immediately, with no grace period.

**The ACL bootstrap token is a pet secret**, and the certificate rotation story
is one more thing that must keep working forever.

### Everything else

Nomad servers carry the same Raft quorum story. The pattern generalises: the
moment a component must be strongly consistent, it must have quorum, and the
moment it has quorum it has become a cluster of pets with an upgrade procedure.

(Backstage, often mentioned in the same breath, is a different animal — it is
Spotify's developer portal, not HashiCorp's, and it is close enough to
stateless that when it fails your developers are irritated rather than your
production being down. That contrast is exactly the point of this page.)

## The asymmetry that matters

Here is the distinction that determines what is allowed to sit at the bottom of
a stack:

| | Failure mode |
|---|---|
| **Consul loses quorum** | Service discovery stops. Dependent applications break **immediately**. |
| **Vault is sealed** | Every secret read fails. Anything fetching at boot cannot start. |
| **Othela is unreachable** | Agents keep their last known state. They simply receive no new work. |

The first two **fail hard**. The third **degrades gracefully**.

This is not because Helvilette is better engineered — it is alpha software and
Vault is not. It is because of what each one promises. Vault and Consul must be
strongly consistent, consistency requires quorum, and quorum means there exists
a number of failures that stops the service outright. That is not a flaw to be
fixed; it is the price of the guarantee, and it is the correct trade for what
they do.

But it disqualifies them from being the bottom layer.

## What qualifies something to be the bottom

From the above, three properties:

1. **No quorum.** Nothing that can lose a vote and stop.
2. **Graceful degradation.** When the coordinator is unreachable, managed nodes
   continue with what they already have.
3. **Pull-based.** Works behind NAT, on intermittent links, at the edge, with
   no inbound reachability required.

[Helvilette](/helvilette/) is built to those three constraints. Agents hold
their state locally and reconcile against Git. Othela dispatches work but is
not in the critical path of a node continuing to function. Nothing votes.

That is what makes it eligible to be the thing that operates *your* Vault and
*your* Consul — rolling-updating them, restarting them, healing them at the
systemd layer, in the same way it can perform surgery on a `kubelet` that
Kubernetes cannot perform on itself.

## Where Kallisto fits

The same reasoning produces Kallisto's real purpose, which is easy to
under-sell as a performance feature.

A node-local secret cache means the **request path survives Vault being
unavailable**. The unseal window after a restart, the leader election after a
Raft failover, the careful step-down during an upgrade — each of those is a
period where everything depending on Vault is stalled. With reads terminating
on the local node, that window stops being an outage.

That is not caching for throughput. It is **decoupling availability**: taking a
hard dependency on a quorum-bound system and turning it into a soft one.

The throughput benefit is real too — no stampede against the root of trust when
five hundred pods start at once — but it is the smaller half of the argument.

See [Kallisto's use cases](/kallisto/explanation/use-cases/).

## Where Kuberina fits

Kuberina attacks the same regress from the other end. Placement decided
*before* deployment is a decision that does not require a running control plane
to make, cannot be lost when one fails, and can be reviewed by humans while
everything is calm.

An offline planner has no day-2 story because it has no day 2 — it runs, emits
an artifact, and exits.

## What Naughtian does not solve

Being honest about this matters more than the argument above, because the
argument is seductive and could easily be overstated.

**The regress is not eliminated. It is made shallower.** Othela is still a
service someone must run. Its state lives in SQLite and Git, there is no
high-availability story today, and if it is down long enough your fleet stops
converging even though it keeps working.

**Nothing here is production-ready.** Helvilette and Kuberina are alpha.
Kallisto is a prototype with no authentication on its data port, no TLS and no
encryption barrier. Read [the roadmap](/ecosystem/roadmap/) before you believe
any of this in practice.

**The comparison is not apples to apples.** Vault has years of scrutiny,
security audits, an enterprise support contract and a track record. Naughtian
has an argument. Arguments are cheap; the tools have to earn the rest.

The honest claim is narrow and specific:

> The bottom layer of a stack must be something that, when it dies, nothing
> dies with it.

Vault and Consul cannot satisfy that, by construction, because they chose
consistency — correctly, for what they do. Something else has to sit
underneath them. That is the gap Naughtian is aimed at.
