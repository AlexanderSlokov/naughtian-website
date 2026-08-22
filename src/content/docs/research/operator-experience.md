---
title: "Operator Experience: Infrastructure Software's factors that matter"
description: Treating the cost of diagnosing a system under pressure as a measurable design property, and applying it in two directions — to the tools themselves, and to the platforms they assist.
tableOfContents:
  maxHeadingLevel: 3
sidebar:
  label: "Operator Experience"
  order: 3
  badge:
    text: Draft
    variant: caution
head:
  - tag: style
    content: |
      .sl-markdown-content p,
      .sl-markdown-content li { text-align: justify; }
---


:::caution[Draft in progress]
This paper is being written. The section skeleton below is a scaffold — the
prompts in each section state what belongs there, and are replaced by prose as
the argument is drafted. Nothing here should be cited yet.

The title is provisional. See [candidate
titles](#appendix-a--candidate-titles-working-note) at the foot of this page.
:::

> **Authors:** _Dinh Tan Dung (ORCID: https://orcid.org/0009-0003-1374-7525)_
>
> **Affiliation:** _Independent Researcher, Ho Chi Minh City, Vietnam_
>
> **Date:** _Draft — 2026_

---

## Working thesis

Operator Experience (OpX) is the cost, borne by a human, of understanding and
correcting a system's behaviour under time pressure. It is distinct from
Developer Experience: DevEx is measured on day 0, when someone is building;
OpX is measured on day *n*, at 03:00, when someone is diagnosing.

The claim this paper defends is that OpX is not a matter of polish applied
after the architecture is settled. It is decided *by* the architecture — by
which artifacts exist, which state is visible, and which failures are
self-explanatory — and it can therefore be reasoned about as a design
constraint rather than as a quality of the documentation.

The Naughtian stack applies that constraint in two directions:

- **Reflexive OpX** — each tool is cheap to operate *itself*. It does not
  answer the day-2 problem by adding another stateful, quorum-bound system that
  someone must now keep alive.
- **Assistive OpX** — each tool lowers the operating cost of the incumbent
  platform it sits alongside. Kubernetes, Ansible and Vault are not replaced;
  the expensive parts of operating them are made legible.

The second direction is what separates this from a critique. A tool that
improves only its own OpX has optimised a system nobody was struggling with.

---

## Abstract

*Written last. Context → the gap → the proposal → the evidence → the
implication, in 150–250 words.*

---

## 1. Introduction

*The funnel: from "infrastructure software is operated by humans under
pressure" down to the specific claim above.*

- **Opening.** Why the operator's cost is an engineering quantity and not a
  matter of temperament.
- **State of the art.** What the industry already measures — SRE's SLI/SLO and
  error budgets, DORA metrics, MTTR, DevEx research, the observability
  literature — and what each of them is actually measuring.
- **The gap.** All of the above measure the *system's* behaviour or the
  *developer's* throughput. None of them measure the cost of forming a correct
  explanation of a system's state while it is misbehaving. That cost is set at
  design time and is not currently a design input.
- **The proposed approach.** Diagnosis cost as the unit of account, with the
  asymmetry principle as its first operational rule.
- **Contributions.** 3–4 bullets, drafted last so they match what the paper
  actually delivers.

---

## 2. Related work and background

*Not a history. An argument that the existing frames are each necessary and
each insufficient for this question.*

- **Site Reliability Engineering.** Error budgets and toil reduction — the
  closest existing vocabulary; where it stops.
- **Developer Experience.** Why the day-0/day-n distinction matters and why
  DevEx findings do not transfer.
- **Observability.** Logs, metrics, traces answer *what is happening*.
  Provenance answers *why the system was configured to do that*, which is a
  different question and less well served.
- **Twelve-factor and the configuration conventions.** The convention this work
  deliberately breaks, and why the break is principled rather than contrarian.
- **The distinction.** Where this paper stands against all of the above.

---

## 3. Defining Operator Experience

*The definitional contribution. This section has to make OpX something that can
be argued about rather than merely asserted.*

- **3.1. Diagnosis cost.** A definition sharp enough to compare two designs.
- **3.2. The properties that drive it.** Candidate axes to be argued and pruned:
  visibility of state, explicitness of artifacts, self-explanation of failure,
  blast radius of a single mistake, and the number of systems that must be
  healthy for the answer to be obtainable.
- **3.3. The asymmetry principle.** When two designs both "work", the one whose
  failure mode points at its own cause is strictly cheaper, and the difference
  is largest exactly when the operator is least able to pay it. Worked through
  the [configuration precedence
  decision](/helvilette/explanation/config-precedence/), where the two
  directions of an identical conflict differ by an order of magnitude in cost
  to diagnose.
- **3.4. What OpX is not.** Not ease of installation; not the quality of the
  documentation; not the absence of complexity.

---

## 4. Reflexive OpX: the cost of the tool itself

*The day-2 problem, stated as the constraint it imposes on anything proposing
to sit at the bottom of a stack.*

- **4.1. Every control plane needs a control plane.** The regress, and why most
  tooling declares the bottom of the stack out of scope. Builds on [the day-2
  problem](/ecosystem/the-day-2-problem/).
- **4.2. Quorum as a disqualifier.** Strong consistency requires quorum; quorum
  implies a failure threshold that stops everything. Correct for what Consul
  and Vault do, and precisely what makes them ineligible to be underneath
  everything else.
- **4.3. The eligibility criteria.** What a component must give up to be
  foundational, and what it may keep.
- **4.4. How the stack scores against its own criteria.** Including the places
  it currently fails — Othela is a service someone has to run, with no HA
  story today. A paper that only reports where its own thesis succeeds is
  worth less than one that marks the boundary.

---

## 5. Assistive OpX: the cost of the platform underneath

*The second direction. Each tool takes an implicit, runtime, black-box decision
in an incumbent platform and turns it into an artifact that can be read,
reviewed and argued with before it takes effect.*

- **5.1. Kuberina — placement.** `kube-scheduler` decides in milliseconds and
  invisibly; a blueprint is reviewable, version-controlled, and defensible
  against "ten years of experience and trust me". Cross-reference the
  [stowage-scheduling paper](/research/kuberina-stowage-scheduling/) for the
  optimisation argument, which this section deliberately does not repeat.
- **5.2. Helvilette — machine state.** Removing inbound SSH removes a standing
  risk; a reconciliation loop bounds the lifetime of drift; provenance logging
  makes a node explain its own configuration without the operator
  reconstructing precedence rules from systemd units.
- **5.3. Kallisto — secret access.** What a node-local cache changes about the
  3am failure mode when the root of trust is unreachable or sealed.
- **5.4. The common shape.** Implicit → explicit; runtime → pre-deployment;
  opaque → auditable. Whether this generalises into a design rule, or is three
  instances of one taste.

---

## 6. Evaluation

*The hard part. This section decides whether the paper is a position piece or a
contribution, and it should be designed before the prose is written.*

- **What can be measured.** Candidates: number of systems that must be
  consulted to explain an observed value; number of hops from symptom to cause;
  whether a failure names its own source; whether a conflict is resolvable
  from a single artifact.
- **What can only be argued.** Stated honestly rather than dressed as data.
- **Method.** Worked incident walkthroughs are the most likely instrument —
  the same scenario diagnosed under both designs, counted in steps. Whether a
  reader survey or a small operator study is feasible at this scale.
- **Threats to validity.** Chief among them: the author designed both the
  criteria and the systems being scored against them.

---

## 7. Discussion

- Where optimising OpX costs something else — performance, convention,
  familiarity — and how those trades were made.
- The cases where the conventional choice is right and this framework would
  lead you astray.
- What the framework predicts about systems outside the Naughtian stack. A
  frame that only explains its author's own tools is not a frame.

---

## 8. Conclusion and future work

*What was claimed, what was shown, and what remains open.*

---

## References

*To be assembled. Likely anchors: the SRE books, the DORA / Accelerate work,
the DevEx literature, twelve-factor, and the ecosystem survey already collected
in [ADR-0001](https://github.com/AlexanderSlokov/Helvilette/blob/main/docs/informations/ADRs/ADR-0001.md).*

---

## Appendix A — candidate titles (working note)

*Delete before publication.* Candidates are recorded here so the choice is
made once, deliberately, rather than drifting between drafts.

| Candidate | Register |
|---|---|
| Operator Experience as a First-Class Design Constraint: Reflexive and Assistive OpX in the Naughtian Stack | Academic — current working title |
| The Cost of Being Woken: Operator Experience as a Measurable Design Property | Academic, image-led |
| Operator Experience: Infrastructure Software That Explains Itself at 3AM | Practitioner |
| Nobody Should Have to Swear at 3AM: Operator Experience as a Design Constraint | Original register, cleaned up |
| Diagnosis Cost: Designing Infrastructure Software for the Operator Holding the Pager | Academic, metric-led |
