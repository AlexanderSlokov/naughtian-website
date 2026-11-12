---
title: Licensing roadmap
description: Kuberina's three-phase licensing strategy, and what each phase means for you.
sidebar:
  order: 3
---

Kuberina uses a three-phase licensing strategy intended to sustain development
and protect intellectual property in the short term, while committing to
delivering a fully permissive open-source project in the long term.

:::danger[This is binding]
By using, modifying or distributing Kuberina you acknowledge and agree to this
roadmap. Read it before you build a product on top of the tool.
:::

## Phase 1 — Kuberina (AGPLv3)

**Applies to:** all versions from `0.1.0` onward, up to but not including
`12.0.0`, unless Phase 2 triggers first.

**Licence:** GNU Affero General Public License v3.0.

**What it means for you:** any modification or deployment of Kuberina offered
as a network service must make its source available to users under the same
AGPLv3 terms. If you fork it and run it as a SaaS, your fork is AGPLv3 too.

## Phase 2 — Naughtian Kuberina (SSPLv1)

**Trigger:** formal legal incorporation of the author's corporate entity — for
example *Naughtian Lab* or *Naughtian Corp*.

**Action:** intellectual property and repository ownership transfer to that
entity.

**Licence:** from the exact date of transfer, all new versions and commits are
licensed under the Server Side Public License v1.

**Crucially:** previously released AGPLv3 versions remain AGPLv3 permanently.
Re-licensing applies strictly to releases made after the transfer. A version
you already depend on does not change licence underneath you.

## Phase 3 — Liberated Kuberina (Apache 2.0)

The project commits to an eventual fully permissive model. The repository and
its subsequent releases transition to **Apache License 2.0** on whichever of
these happens first:

1. **CNCF donation.** As a formal prerequisite for donating Kuberina to the
   Cloud Native Computing Foundation, the project re-licenses to Apache 2.0 to
   satisfy CNCF intellectual property policy.
2. **Version 12.0.0.** Reaching that milestone triggers the transition.

### The 48-month guarantee

To guarantee permanent availability to the open-source community regardless of
release cadence, **any given release automatically transitions to Apache 2.0
exactly 48 months after its own initial release date.**

This is the safety valve: even if `12.0.0` never arrives and no CNCF donation
happens, every release becomes permissive four years after it ships.

### Long-term support

On the release of `12.0.0` the project establishes a dedicated `12.0.0-lts`
branch. The stated intent of the governing entity is a minimum **five-year
window of maintenance and security patching** for that LTS release, under
Apache 2.0.

## Contributing

To keep the project legally able to execute these transitions, **all pull
requests require agreeing to a Contributor License Agreement.** The CLA grants
the project author the right to re-license your contributions in line with the
roadmap above.

Without it, a single contribution under incompatible terms would freeze the
whole plan.

## Other projects in the ecosystem

Licensing is per-project, not ecosystem-wide:

| Project | Licence |
|---|---|
| Kuberina | AGPLv3, transitioning per this page |
| [Kallisto](/kallisto/) | AGPLv3; commercial and enterprise terms negotiable |
| [Helvilette](/helvilette/) | Apache License 2.0 |
