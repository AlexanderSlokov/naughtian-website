---
title: Why the config file outranks the environment
description: The reasoning behind Helvilette's configuration precedence, and why the Kubernetes ecosystem resolves it differently from viper.
sidebar:
  order: 4
---

The agent resolves configuration as **CLI flags > YAML config file >
environment variables > defaults**. The middle two are the interesting pair:
most Go tools put the environment above the file, and Helvilette deliberately
does not.

This page explains why. The decision is recorded upstream as
[ADR-0001](https://github.com/AlexanderSlokov/Helvilette/blob/main/docs/informations/ADRs/ADR-0001.md),
which carries the full argument and its sources.

## The intuition is real, and it comes from somewhere specific

"Environment variables always win" feels like a law of nature if you have
written Go services for a while. It is not. It is
[viper](https://github.com/spf13/viper)'s ordering, reinforced by
[12-factor](https://12factor.net/config), and viper is common enough in the Go
ecosystem to pass for a universal convention.

The Kubernetes ecosystem — the one Helvilette models itself on — does not
agree:

| Tool | Order | env vs file |
|---|---|---|
| k3s | CLI > config file > env > defaults | **file wins** |
| kubelet | CLI > config file > defaults | no env layer at all |
| kubectl | `--kubeconfig` > `KUBECONFIG` > `~/.kube/config` | env only *locates* the file; it never overrides values inside it |
| viper | Set > flag > env > config > defaults | **env wins** |

kubectl is the clearest statement of the underlying idea: the environment is
allowed to say *which* file, never *what is in it*.

## The argument: conflicts are not symmetric

Two sources disagree. Whichever one you let win, an operator eventually has to
work out what happened. The two directions are not equally expensive:

| Direction | What the operator experiences | Cost |
|---|---|---|
| env beats file | `agent.yaml` shows the correct `othelaURL`, yet the agent talks to a different control plane. The cause must be hunted through `systemctl show`, `/proc/<pid>/environ`, `docker inspect`, a shared `EnvironmentFile=`, or a stale `export` | High, with **nothing pointing at the cause** |
| file beats env | An env override does not take effect. Opening the file reveals the winning value immediately | Low, **self-explanatory** |

The first row is the expensive failure: the evidence you would naturally reach
for — the config file — is *correct*, and correct evidence that contradicts
observed behaviour is the worst thing to hold during an incident. The second
row fails in the direction of the thing you were already looking at.

The property underneath is visibility. Environment variables are ambient: not
greppable, not in version control, inherited by accident from a parent process,
and invisible in every artifact a change-management process reviews. The YAML
file is the explicit thing that configuration management pushes and that review
gates. Letting ambient state override it inverts that governance model — and
lets a config-management tool report "converged" while the node runs different
values.

Helvilette optimises for the operator's day-2 experience over conventional
purity. This is one of the places where those two point in different
directions.

## What it does not cost

Two objections come up, and both are answered by the ordering rather than
argued against.

**Day-0 ergonomics.** CLI flags remain the highest-priority source, so the
"bring one node up quickly" story is untouched. Nothing about this decision
affects the first ten minutes.

**Container overrides.** Environment injection is still a viable path —
`args:` in a pod spec *are* CLI flags, and config files can be mounted. The
change removes one override route and leaves the stronger one in place.

What it does cost is a behavioural change: a deployment that relied on an
environment variable beating a config file changed behaviour when this landed.
That is recorded as a breaking change in the upstream CHANGELOG.

## On the k3s evidence

The k3s row in the table deserves a footnote, because it is not documented
upstream. The [k3s
documentation](https://docs.k3s.io/installation/configuration) states only that
CLI arguments take precedence over the config file; it says nothing about the
environment.

The ordering was derived from the implementation instead.
[`pkg/configfilearg`](https://github.com/k3s-io/k3s/blob/master/pkg/configfilearg/parser.go)
does not unmarshal YAML into a struct at all — it converts each config entry
into a command-line argument (`--key=value`) and injects those before the
user's own arguments. Because config values thereby *become* genuine CLI
arguments, and because urfave/cli treats `EnvVar` only as a flag's default
value, they outrank the environment. Hence: CLI > config file > env > defaults.

One caveat: several `K3S_*` variables (`K3S_TOKEN`, `K3S_URL`,
`INSTALL_K3S_*`) are consumed by the install script or read through
`os.Getenv` outside urfave/cli, so the rule does not hold uniformly for every
k3s environment variable.

## The better answer: stop needing the rule

Precedence rules are a tax on memory, and memory is the first thing to go
during an incident. The more durable fix is to make the question answerable
without recalling any ordering at all.

That is what `--print-config` and the `effective configuration` startup log
are for. Every value is reported with the source that supplied it —
`config-file`, `env(NODE_ID)`, `cli(--othela-url)`, `default`,
`default(hostname)` — so a node explains itself, and this page becomes
background reading rather than something you need in the moment.

See [confirming which mechanism
won](/helvilette/how-to/configure-the-agent/#confirming-which-mechanism-won)
for how to use them.

## Related

- [Configure the agent](/helvilette/how-to/configure-the-agent/) — the three
  mechanisms and when to reach for each.
- [Agent configuration reference](/helvilette/reference/agent-configuration/) —
  every setting, and the full source-name vocabulary.
