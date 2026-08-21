---
title: Names and mythology
description: Where the names in the Naughtian ecosystem come from.
sidebar:
  order: 3
---

Every name in this ecosystem comes from a saga the author has been writing
separately. This page is the canonical source for what each one means, so that
documentation, code comments and commit messages stay consistent.

## Naughtian

The umbrella name for the ecosystem.

Naughtian is a character from the saga: the goddess of *the end* and of
*death*, titled **God-mother of Destruction**.

The name is used as the family label — the way HashiCorp names a house that
Terraform, Vault and Nomad all live in. Individual tools are referred to either
bare (*Kuberina*) or fully qualified (*Naughtian Kallisto*) depending on
context; the fully qualified form is preferred in package names, container
images and legal text.

## Helvilette

Pronounced **hel-vih-let**.

Helvilette is Naught's cat — literally, in that the author also has a black cat
named *Helvilette the First*. In the saga he is the god who controls the cycle
of life and death, a **psychopomp**, usually taking the shape of a black cat
with blue eyes.

His Agents operate across all Realms, which is why he had to organise them into
a system that resembles a living Kubernetes. That is the direct origin of the
project's architecture: [Helvilette](/helvilette/) maps 1:1 onto Kubernetes
concepts, transposed down to the OS and systemd layer.

### Othela

One of the twelve long-term-operating Agents of Helvilette, acting as the
apiserver for his living-Kubernetes-like system.

In the software, **Othela** is the control plane, comprising
`helvilette-api-server`, `helvilette-exec-manager` and
`helvilette-controller-manager`.

## Kuberina

[Kuberina](/kuberina/) is the outlier: its name is descriptive rather than
mythological. It fuses *Kubernetes* with **MSC Irina**, one of the largest
container ships afloat, whose stowage planning problem is the direct
inspiration for the scheduler's mathematics.

The connection is not decorative. The paper argues a structural isomorphism
between the Container Stowage Planning Problem and Kubernetes pod scheduling,
in which every maritime constraint maps onto a Kubernetes scheduling primitive.
The benchmark that exercises the solver at hyperscale is named `irina` for the
same reason.

## Kallisto

[Naughtian Kallisto](/kallisto/) is the secret engine.

:::note[Not yet documented]
The saga origin of *Kallisto* is not recorded in the project glossary. If it
has one, this section should be filled in from the same source as the entries
above rather than guessed at.
:::

## Coming later

**Kalena**, **Kaeliir** and **Ginnungagap** are planned additions to the
ecosystem. Their entries belong here once the projects become public.

:::caution[Placeholder]
These three are listed because they are planned, not because their meanings are
known to this document. Nothing about their origin or their scope should be
inferred until the entries are written.
:::

## Source

The canonical glossary lives in the Helvilette repository at
`docs/GLOSSARY.md`. When the two disagree, that file wins and this page should
be corrected to match.
