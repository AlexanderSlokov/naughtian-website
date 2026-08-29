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
This paper is being written. Sections carrying prose are drafted; sections still
showing italic prompts are scaffolding, and the prompts state what belongs there.
Nothing here should be cited yet.

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
Developer Experience in both moment and duration. DevEx is bounded: it begins
when someone sets up a development environment and ends when they have something
shippable. OpX is measured across the whole remaining lifecycle — from the
moment an operator installs the system until the day it is decommissioned and
removed.

The claim this paper defends is that OpX is not a matter of polish applied
after the architecture is settled. It is decided *by* the architecture — by
which artifacts exist, which state is visible, and which failures are
self-explanatory — and it can therefore be reasoned about as a design
constraint rather than as a quality of the documentation.

The constraint has a compact statement, which the rest of the paper elaborates:

> **Hide the complexity of setup. Expose consequences fully.**

Installation may be one command. What the system is about to do to the
operator's machines may not be hidden by one character.

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

For the Naughtian stack, we introduce a new design priority: Operator Experience (OpX).
OpX is the day-0 through day-n experience of an SRE/infra engineer running the tool.
When a design call is contested, break the tie on operator cost — especially
the *cost of diagnosing a problem under pressure*, not the cost of the happy path.
This favours approaches with visible/explicit sources over invisible/ambient ones;
fail loudly at startup over silently degrading to defaults; and defaults that 
contain blast radius rather than collide fleet-wide.  

---

## 1. Introduction

*"infrastructure software is operated by humans under
pressure"*

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
- **Contributions.** Drafted last so they match what the paper delivers.
  Current candidates: (i) a definition of diagnosis cost sharp enough to compare
  two designs; (ii) a structural account of why operator experience is
  systematically under-supplied, which is an economic argument rather than a
  cultural one; (iii) a set of operational rules stated so that they can fail a
  code review; (iv) an evaluation instrument — the stranger test — and an
  honest statement of what remains unmeasured.

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
- **Configuration management, 2009–2025.** Not as market history, but to
  establish why the vocabulary stalled: the agent-based generation had a
  reconciliation loop and paid for it with a language tax; the agentless
  generation won adoption by discarding the agent and paid for it with the loop.
  The industry has lived with that hole for over a decade, and the operator's
  cost was never the axis on which either trade was argued.
- **Twelve-factor and the configuration conventions.** The convention this work
  deliberately breaks, and why the break is principled rather than contrarian.
- **The distinction.** Where this paper stands against all of the above.

---

## 3. Why operator experience is under-supplied

This section argues that the scarcity of operator experience is not a failure of
craft or of care. It is the predictable output of an incentive structure, and it
is therefore stable: it will not be corrected by exhortation, and it has not been
corrected by two decades of increasing engineering budgets.

### 3.1. Developers are buyers; operators are heirs

A developer selects a library, a framework, a language, without asking anyone's
permission. Good developer experience therefore propagates itself, which is the
product-led growth model that has dominated the last fifteen years. Operators
*inherit* infrastructure. Nobody ever chose Puppet because they liked Puppet;
they were handed it. Investment in the experience of people who hold no
purchasing authority produces no measurable growth, and so it is not made.

The population asymmetry compounds this: the industry counts developers in the
tens of millions and operations engineers in the low millions. Every unit spent
on developer experience is amortised across roughly twenty times more people.
*(This ratio needs a citable source before publication; it is currently an
order-of-magnitude assertion.)*

### 3.2. The feedback latency decides the budget

Developer experience is felt at minute five. It can be demonstrated, recorded,
put on a landing page, and measured through a conversion funnel. Operator
experience is felt at month eighteen. "In two years this will not ruin your
Tuesday night" cannot be A/B tested and appears on no growth dashboard. What
cannot be measured does not get funded.

The same logic operates inside organisations, which is why the effect survives
even where nobody is selling anything. Shipped features are visible and someone
is credited for them. Operational reliability is the story of nothing bad
happening: invisible, and nobody is credited for it. Even internally, operator
experience loses when the budget is divided.

### 3.3. Painful self-hosting is a business model

This is the least comfortable claim in the paper and the one that most needs
stating.

If self-hosting a piece of software is painful, its users buy the vendor's cloud
edition. The pain is not a defect in the business model; it *is* the sales
funnel. Almost every open-core vendor has a structural incentive for
`docker compose up` to work beautifully in the first five minutes and for day
three hundred to be miserable. No meeting is required to decide this. It is what
falls out of "fund whatever raises conversion", repeated for three years.

The conclusion follows directly, and it is the paper's central diagnostic claim:
**managed platforms do not win because they are better. They win because the
alternative is not funded by anyone.**

### 3.4. Enterprise tooling optimises for the signing moment

The buyer of an enterprise automation platform is not the person carrying the
pager at 03:00. It is an executive signing a contract. What wins an enterprise
procurement is the RBAC matrix, the audit log, the compliance report, the SSO
integration. Nobody in that room asks whether the error message tells the
operator what to do next.

These are two different products, and the distance between them does not close
with more money. It is not a quality gap; it is a specification gap.

### 3.5. The segment where the operator is the buyer

Between "run the configuration tool by hand from a laptop" and "stand up a
Kubernetes cluster" there is very little, and the organisations in that gap —
small teams, universities, public-sector departments, homelabs running five to
fifty machines — share one property that changes the economics completely: the
person who operates the system is the person who chooses it.

In that segment operator experience is not a secondary feature. It is the entire
purchase decision. This is the market-structure justification for treating OpX
as a first-class constraint rather than as a refinement.

### 3.6. The incentive moat, and the honest counter-argument

The only party with no incentive to make self-hosting unpleasant is the party
that does not sell a managed service. This is not a claim to superior skill; it
is a claim about incentives, and it is the kind of advantage that capital cannot
buy back.

The counter-argument must be stated, because it is partly correct. Not all of
this badness is structural self-interest. Infrastructure software genuinely is
harder than developer tooling. Developer tools run on a laptop. Infrastructure
tools run on someone's peculiar long-term-support distribution with mandatory
access control enforcing, behind a corporate proxy, with broken DNS. The
combinatorics of failure explode, and testing them costs real money. Any
treatment that omits this is polemic rather than analysis.

The claim this paper defends is therefore narrower than "the industry is
negligent": the incentives and the intrinsic difficulty point in the same
direction, and there is no counterweight pushing back.

---

## 4. Defining Operator Experience

*The definitional contribution. This section has to make OpX something that can
be argued about rather than merely asserted.*

- **4.1. Diagnosis cost.** A definition sharp enough to compare two designs.
  See the Vietnamese draft, which is ahead of this one and should be
  back-translated here rather than re-derived.
- **4.2. The properties that drive it.** Candidate axes to be argued and pruned:
  visibility of state, explicitness of artifacts, self-explanation of failure,
  blast radius of a single mistake, and the number of systems that must be
  healthy for the answer to be obtainable. To this list the operational rules in
  §5 add a sixth: whether diagnosis remains possible when the control plane is
  the thing that is down.
- **4.3. The asymmetry principle.** When two designs both "work", the one whose
  failure mode points at its own cause is strictly cheaper, and the difference
  is largest exactly when the operator is least able to pay it. Worked through
  the [configuration precedence
  decision](/helvilette/explanation/config-precedence/), where the two
  directions of an identical conflict differ by an order of magnitude in cost
  to diagnose.
- **4.4. A ladder, not a gate.** OpX does not *demand* operator skill; it
  *rewards* it. The default mode of a well-designed tool asks almost nothing of
  its user — receiving a report of what has diverged requires far less skill
  than detecting the divergence by hand. Higher tiers unlock with competence.
  The distinction is not cosmetic: describing such a tool as
  "skill-oriented" repels precisely the segment identified in §3.5, whose
  members most need the bottom rung, while the operators who already have the
  skill generally already have a platform.
- **4.5. What OpX is not.** Not ease of installation; not the quality of the
  documentation; not the absence of complexity; and not the absence of danger —
  see the argument for escape hatches in §5.1.

---

## 5. Operational rules: making OpX falsifiable

A design priority that cannot reject a change is not a priority; it is a
preference. Left as a slogan, "operator experience" dies the way every slogan
dies, because every project claims to be friendly. It becomes real at the moment
it can **fail a pull request**.

This section states the rules in that form. They are grouped by what they
constrain: the tool's behaviour toward the operator (§5.1), the artifacts it
produces (§5.2), and the honesty of the machine about its own knowledge (§5.3).

### 5.1. Interrogability and interruption

An autonomous reconciliation loop grants a new capability and creates a new
fear: the machine acts while the operator sleeps. Push-based tooling has no such
property — if nobody types, nothing happens. Everything in this subsection
follows from closing that gap.

**Automation must be interrogable and interruptible.** Concretely, two
capabilities, both of which must work when everything else is dead:

- *Interrogation* answers four things on one screen: what changed, who decided
  it, why, and the command that undoes it. This is where deployment tooling
  generally stops short. GitOps tools are good at reporting that live state
  differs from desired state; they still do not answer *who decided this*. The
  person woken at 03:00 needs a name and a reason before they need a diff.
- *Interruption* addresses the property that makes a reconciliation loop
  frightening: that it cannot be made to stop. Prior art is unambiguous here —
  Puppet's `agent --disable "<reason>"` has required a reason string for years.

Because both must survive the control plane being unreachable, they impose an
architectural consequence rather than a cosmetic one: structured history is
written locally, on the node, at the time it happens.

**Every dangerous action leaves a note.** A mandatory `--reason` string buys
three things at once: nobody pastes the command into a runbook without recording
why, the audit record writes itself, and the interrogation command can later
answer "why was this applied despite the warning".

**The escape hatch is mandatory, and it is an OpX feature.** Without an override,
the on-call engineer disables the tool or connects to the machine by hand — and
the action then falls outside the system's field of view entirely. A good escape
hatch keeps dangerous actions on the books. A tool with no override is not
safer; it is blinder.

**Print the dangerous lines, not a percentage.** Six unpredictable operations out
of forty is fifteen percent, which sounds benign, and is meaningless if one of
them recursively deletes a database directory. Danger is a property of what the
operations do, not of their ratio. Aggregates conceal exactly the thing that must
be looked at.

**Alert fatigue destroys features faster than defects do.** A default that
complains constantly will be silenced, and the operator who silences it also
silences the warnings that mattered. Thresholds belong in the user's repository,
set by the user.

### 5.2. The artifact contract

Most bad operational output has a single cause: **one artifact is being asked to
serve three questioners.** The person watching now wants flow, in a form a human
reads. The person reading at 03:00 wants a summary, not the complete record. The
machine wants something structured, queryable and durable. Emitting the third
form to all three is the whole defect.

The resolution is a rule about storage rather than about formatting:

> **Store rich, display poor.**

There is exactly one source of truth — a lossless structured event stream — and
everything a human sees is a view computed from it, never a second source.
*Respect the machine* means discard nothing. *Operator above all* means that by
default nobody has to look at it.

This has a symmetric pair of failure modes, and designs tend to fall into one
while fleeing the other. Making humans read structured data sacrifices the human
to the machine. Making machines parse prose sacrifices the machine to the human,
and is why everyone who automates around such tools ends up maintaining a fragile
parser. The correct position keeps both and never forces either side to consume
the other's format. Stated as a test:

> The raw record must exist, and must almost never be read. If the operator has
> to open it to understand what happened, the summary is broken. If it does not
> exist, the machine has been betrayed.

Four consequences follow, each independently testable:

**Failure is not the same artifact as success.** Nobody reads the log of a
successful run; when a run fails the log is the only thing that matters. Fold
everything by default and auto-expand the failing step with its error output and
a few preceding steps. Where a flag controls that window, name it `-C` /
`--context`, because operators knew that flag from `grep` and `diff` before they
knew this tool existed. Borrowed muscle memory is free; invented vocabulary is
not.

**Translate tool events into machine facts.** The execution engine reports which
*task* changed. The operator needs to know what changed *on the machine*. These
are different statements, and the distance between them is the value the tool
creates. The translation is mechanical — file operations yield a path, service
operations a unit and an action, package operations an old and a new version —
and a small number of operation types covers the large majority of real-world
content.

**State what did not change.** A line reporting that forty-four operations ran,
four changed something, forty were already correct and none failed is not
decoration. Without it, "nothing changed because the system has converged" and
"nothing changed because it could not run" are the same blank screen at 03:00.

**Print the next command.** The highest operator-experience standard in the
industry is not held by an infrastructure tool at all; it is `git status`, which
does not merely report state but names the command that acts on it. Tens of
millions of people learned that system from its output rather than from its
documentation. Generalised: every time a tool prints state, it prints the next
command.

### 5.3. Honesty about the limits of knowledge

The rules above concern what the operator is shown. These concern what the
machine is permitted to claim.

**Never present a clean summary for a run that contained unpredictable
operations.** A summary that omits what it could not determine is not merely
incomplete — it lies, and it lies precisely on the runs that most needed
scrutiny. This is the fastest available route to permanent loss of trust. The
corresponding notation deserves to be explicit: alongside the familiar create,
delete and modify markers, and a restart marker, there must be a marker meaning
*an opaque operation ran and its effect could not be determined*. Three-symbol
vocabularies exist because their authors' worlds contained only creation,
modification and deletion. This one does not.

**Name the artifact honestly.** A plan produced by a system that models every
change is a contract. A preview produced by a system whose check mode is
advisory for a meaningful fraction of operations is a prediction. Calling the
second one a plan invites contract-grade expectations, and the first surprise
destroys trust permanently. Naming is an operator-experience decision, not a
marketing one.

**Distinguish "the check ran and failed" from "the check could not run."**
Halting is correct for the first and wrong for the second; the second is a report,
not a block. A system that conflates them wakes people at 03:00 for a condition
that does not exist.

**Bind a preview to what it previewed.** A preview generated at time *T* and
applied at *T+n* is decoration unless it is bound to the state it observed —
in practice, to the pair (observed state, source revision) — and unless
application refuses when either has moved.

**Prefer expiring leases to locks.** An agent that dies holding a lock is a
weekly occurrence on unreliable networks, and manual unlock commands are
notorious for exactly this reason. A lease that expires by itself has the same
effect with nobody cleaning up by hand at 03:00.

**A component reports what it knows about itself; it does not speculate about
its host.** "I have not been told where logs should go" is a different claim from
"I detect that you have no log shipper". The first is an unset field in the
component's own configuration, displayed as a value like any other — not a
warning, not red, not an exclamation mark. The second requires probing the host
and passing judgement on authority the component does not have. The general form
of this rule prevents an entire class of future arguments, and it is also what
keeps a tool from becoming an assistant nobody asked for: unsolicited advice is
born from exactly one behaviour, which is guessing intent.

**Answer when asked; do not speak unprompted.** A read-only inventory that
displays gaps is a fact derived from state. A line recommending a specific
product is an opinion, and operators identify it instantly as advertising. The
moment a tool raises a notification nobody requested, its users mute it — and
then they are also muting the notifications that mattered.

**Never place a paywall on data export or the programmatic interface.** Whatever
commercial arrangement sits on top, the operator's own data must remain
extractable. Sell what is built on the data, never the right to touch it.
"Respect the machine" taken literally means machines must always be able to read.

### 5.4. Level-triggering as a design constraint

Several of the rules above depend on a property that deserves to be stated
directly, because it is the mechanism that makes drift visible at all.

**Events are hints; truth is a full comparison.** The canonical example is the
kubelet's pod lifecycle event generator, which learns that a container has died
not by being told but by listing everything and diffing against its previous
snapshot. When an event-driven path was later added, the periodic relist was
*kept* — because events can be lost and relists cannot. The rule generalises:
never reconstruct state by accumulating events, and never allow a cache to decide
*whether* to check. A cache may decide what to display; the moment it decides
whether to look, level-triggering is gone.

Two smaller consequences, both learned expensively by the previous generation of
configuration management and available for free:

**Jitter is a correctness property at fleet scale, not an optimisation.** Fifty
nodes polling on the same minute deliver a synchronised load spike to the source
of truth every interval. Add it while the fleet is one node, because adding it
later is painful.

**Write the last-run summary on the node.** A small file on local disk is what
makes status work when the control plane is dead — which is the constraint
§5.1 already imposes, arrived at independently two decades ago.

### 5.5. The remediation ladder

The rules so far describe a system that observes. This subsection concerns the
one that acts, and the argument is that permission to act must be earned per
service rather than granted globally.

**The default is the least-harmful option: report, and let a human intervene.**
Once the operator has fixed the problem, and knows what to write so that the fix
is idempotent, they may grant the system permission to apply that specific
remedy. Responsibility is then placed honestly rather than promised away. The
claim is not "this system will repair your infrastructure safely". It is: if your
automation is idempotent, this is safe; if it is not, you were already exposed,
and the system only makes the exposure regular.

**Remediation configuration is a pointer to an existing procedure, not a
boolean.** The operator does not write `restart: true`; they write "when this
check fails, run that procedure". The system never invents a repair. The
knowledge lives in the operator's own automation, which means it can be reviewed,
versioned and argued with — the same move §7 identifies as the common shape of
assistive OpX.

**Nothing runs automatically that was never watched running dry.** A remedy must
have passed a dry run at least once before it may be attached to a check.

**Run once, then stop.** Execute the remedy, re-check, and if the system is
healthy, be quiet. If it is not: halt and make noise. No retry, no backoff. A
remedy that failed once will not succeed on the second attempt, and by the third
the system has written three times into something already disordered. The
companion rule is what makes this safe: **the automation may not release itself
from a halt.** A halt that expires after thirty minutes and retries has created
a slow loop, which is the worst kind, because it gnaws while everyone believes
things have stopped.

**The boundary of autonomous action is consensus, not data.** The question is not
whether an operation touches business data. It is: *if two nodes both act on
this, is the consequence unrecoverable?* Promoting a database replica requires
fencing and an arbiter, and is out of scope for any system without one. Renewing
a certificate, rotating logs, reloading a configuration — none of these need an
arbiter, and a great deal of ordinary data work falls on the safe side of that
line.

**Do not duplicate the process supervisor.** A unit file missing its restart
directive is drift and must be reported as such, not silently compensated for.
The genuine blind spot, and the only place a health probe is justified, is the
process that is alive but misconfigured, and therefore running incorrectly while
the supervisor reports success. That is the most dangerous class of drift because
it is silent.

---

## 6. Reflexive OpX: the cost of the tool itself

*The day-2 problem, stated as the constraint it imposes on anything proposing
to sit at the bottom of a stack.*

- **6.1. Every control plane needs a control plane.** The regress, and why most
  tooling declares the bottom of the stack out of scope. Builds on [the day-2
  problem](/ecosystem/the-day-2-problem/).
- **6.2. Quorum as a disqualifier.** Strong consistency requires quorum; quorum
  implies a failure threshold that stops everything. Correct for what Consul
  and Vault do, and precisely what makes them ineligible to be underneath
  everything else.
- **6.3. The eligibility criteria.** What a component must give up to be
  foundational, and what it may keep. The operational floor established in §5
  supplies several of these directly: local diagnosis without the control plane,
  a single-command backup that includes its own keys, and a single-command
  removal that leaves the host as it was.
- **6.4. The cost of adopting a new artifact.** Asking an operator to add a file
  to their repository is a permanent tax, and it must buy something unobtainable
  elsewhere. Three constraints, and violating any one of them voids the
  argument: the system must work without the file; the repository must still run
  under the plain upstream tool with the file present; and every field must be
  derivable or omittable. The measure is that the artifact pays for itself in
  the first week, not the first quarter.
- **6.5. How the stack scores against its own criteria.** Including the places
  it currently fails — Othela is a service someone has to run, with no HA
  story today. A paper that only reports where its own thesis succeeds is
  worth less than one that marks the boundary.

---

## 7. Assistive OpX: the cost of the platform underneath

*The second direction. Each tool takes an implicit, runtime, black-box decision
in an incumbent platform and turns it into an artifact that can be read,
reviewed and argued with before it takes effect.*

### 7.1. What the incumbent platform actually gave people

The strongest property of a container orchestrator is widely misidentified. It
is not self-healing. It is **knowing the true state of the whole system in one
place.** For an operator running thirty machines without such a platform, the
capability that changes the work is not "it repairs itself"; it is being able to
answer, for the first time, *which machine differs from what I believe*.

This reframing is what makes assistive OpX a research position rather than a
product claim, and it is the axis along which the remaining subsections are
argued.

### 7.2. Kuberina — placement

`kube-scheduler` decides in milliseconds and invisibly; a blueprint is
reviewable, version-controlled, and defensible against "ten years of experience
and trust me". Cross-reference the
[stowage-scheduling paper](/research/kuberina-stowage-scheduling/) for the
optimisation argument, which this section deliberately does not repeat.

### 7.3. Helvilette — machine state

Removing inbound SSH removes a standing risk; a reconciliation loop bounds the
lifetime of drift; provenance logging makes a node explain its own configuration
without the operator reconstructing precedence rules from systemd units.

Three claims support this, in decreasing order of how easily they can be
defended:

**Configuration management has no memory.** Each run is an amnesiac event: it
exists for the minutes the operator typed it, and then the terminal closes. Four
questions that teams using such tools cannot answer — when the automation last
actually ran against a given host and with what result; which revision a node is
currently carrying; whether a change made six weeks ago is still in place; and
which nodes have never had a successful run at all. In practice these are
answered by chat scrollback, a spreadsheet, and the memory of the
longest-serving engineer. A resident agent writing local history answers all four
as a side effect of its architecture. Memory is not a feature to be built; it
falls out.

**Inventory is a declaration, not a fact.** Inventory files rot from the first
week: deleted machines remain listed, new machines are never added, and the
tooling trusts the file absolutely. Self-registration exposes both directions of
the error — hosts listed but absent, and hosts running but unlisted.

**Drift lifetime is the quantity that changes.** Unmeasured, the interval between
a divergence and anyone noticing it is typically months. Someone adjusts a kernel
parameter during an incident in March, does not write it into the automation, and
it sits there until a reboot in September fails in a way nobody can explain.
Continuous detection bounds that interval by the poll cycle. This is developed as
a metric in §8.

Two further consequences are worth stating because they are what actually
persuades an operator:

- Drift detection converts the automation repository from *documentation* into
  *truth*. In most organisations the repository describes the state of the system
  at some point in the past, and nobody dares run it because nobody knows what it
  would do to the present. Continuous comparison keeps that distance visible, so
  it never grows large enough to be frightening.
- Detection is the precondition for everything else. Nothing can be repaired
  automatically that cannot be seen, and operators only grant automation
  permission over failures they have already watched happen several times.
  Self-healing is what impresses during a demonstration; drift detection is what
  makes the tool still be installed six months later.

### 7.4. Kallisto — secret access

What a node-local cache changes about the 03:00 failure mode when the root of
trust is unreachable or sealed.

### 7.5. The common shape

Implicit → explicit; runtime → pre-deployment; opaque → auditable. Whether this
generalises into a design rule, or is three instances of one taste.

---

## 8. Evaluation

*This section decides whether the paper is a position piece or a contribution.
The instruments below are drafted; the results are not yet obtained, and §8.5
says so plainly.*

### 8.1. What has not been measured

Stated first, deliberately. The systems described here have not run in production,
including the author's own. A position paper may argue from design; it may not
present design intent as evidence. Every claim in §5 and §7 is therefore an
argued prediction unless it is marked otherwise, and the instruments below are
proposed rather than executed.

### 8.2. The stranger test

The primary instrument, and the cheapest. Hand a node to someone who has never
heard of the system. Break something. Measure whether they can diagnose it and
stop it within sixty seconds, without reading documentation.

It is runnable at this scale, it produces a number, and it fails honestly: if the
subject cannot do it, the tool has features rather than operator experience.

### 8.3. Drift lifetime

The most defensible quantitative claim available, and it requires no user study.
Time from divergence to operator awareness. Without detection the quantity is
unbounded and anecdotally measured in months; with a reconciliation loop it is
bounded by the poll interval and the reporting path. Reporting the *distribution*
rather than the mean matters here, because the tail is the incident.

### 8.4. Diagnosis-cost counters

Countable properties of a design, evaluated by walking the same incident through
two designs and counting: how many systems must be consulted to explain one
observed value; how many hops separate symptom from cause; whether the failure
names its own source; whether a conflict is resolvable from a single artifact;
and whether diagnosis remains possible with the control plane down.

### 8.5. Evaluate by how it fails, not by how it runs

The discipline worth borrowing is SQLite's: the overwhelming majority of that
project's effort goes into proving it does not break rather than into making it
run, and much of its test suite simulates a hostile environment — exhausted
memory, full disks, power loss during a write, storage returning garbage. The
ratio is unreachable for a small project. The habit is not.

Instantiated as an acceptance rubric, this means a system is judged on failing
runs rather than clean ones: power removed mid-operation; a bad change released
across part of a fleet; the agent severing its own network path while running;
and restoration onto a blank machine from a backup. A clean run demonstrates that
the operator's automation was correct. It demonstrates nothing about the tool.

### 8.6. Bounded-window testing, and when it does not apply

A distinct instrument, worth defining precisely because it is easy to misuse: a
finite externally-imposed window, a fixed workload, and a requirement that the
system hold cadence *inside* the window — not a measurement of peak throughput.
Thrashing counts as failure even when the work eventually completes, and the
load at which the system loses the window is published even when it is
unflattering.

The precondition matters more than the test. It is meaningful only where being
slow causes a *different kind of failure* rather than mere inconvenience; where
the window is imposed from outside rather than chosen; and where multiple
components must converge together. A great deal of infrastructure software fails
these conditions — a build that takes forty minutes instead of twenty costs
patience, not correctness — and forcing the instrument onto such a system
produces a meaningless number.

Applied honestly, the framework rejects one of the author's own preferences here:
a tool designed to wait for human approval at each step has a human-imposed
deadline, not an externally imposed one, and does not qualify. Its real bounded
window is a different quantity — the incident window, meaning how long an
operator has to freeze and roll back a bad change before it propagates. That
observation is used in §8.7 rather than discarded.

### 8.7. Threats to validity

Chief among them: the author designed both the criteria and the systems being
scored against them. Three mitigations are available and each should be stated
rather than assumed —

- the framework must be shown rejecting a design the author prefers (§8.6
  provides one instance, and more are needed);
- the counters in §8.4 must be applied to at least one system outside the
  author's control;
- the absence of production evidence (§8.1) must be repeated wherever a claim
  would otherwise read as a result.

---

## 9. Discussion

- Where optimising OpX costs something else — performance, convention,
  familiarity — and how those trades were made. The explicit trade this
  framework accepts is feature count: a system built to these rules will have
  fewer capabilities than the incumbent enterprise platform, deliberately, and
  saying so in advance is what prevents the drift back toward feature parity.
- The cases where the conventional choice is right and this framework would
  lead you astray.
- Why exhortation will not work. If §3 is correct, operator experience is
  under-supplied for structural reasons, and the corollary is uncomfortable: no
  amount of advocacy changes the incentives of a vendor whose revenue depends on
  the difficulty of self-hosting. The framework's applicability is therefore
  narrower than its argument — it applies where the operator is the buyer, and
  where the author has no managed service to sell.
- Laziness, correctly understood. Operators do not fail to do the right thing
  through weakness of will; they fail because the right thing has five steps
  before its first step. Nobody has ever fixed this by nagging. It is fixed by
  making the correct action cheap, which is the humane form of everything argued
  above.
- What the framework predicts about systems outside the Naughtian stack. A
  frame that only explains its author's own tools is not a frame.

---

## 10. Conclusion and future work

*What was claimed, what was shown, and what remains open.*

---

## References

*To be assembled. Likely anchors: the SRE books, the DORA / Accelerate work,
the DevEx literature, twelve-factor, and the ecosystem survey already collected
in [ADR-0001](https://github.com/AlexanderSlokov/Helvilette/blob/main/docs/informations/ADRs/ADR-0001.md).*

Additional anchors required by the sections drafted above: the kubelet lifecycle
event generator design and the rationale for retaining periodic relisting
(§5.4); Puppet's agent disable mechanism and last-run summary (§5.1, §5.4);
SQLite's testing methodology (§8.5); and a citable source for the
developer-to-operator population ratio asserted in §3.1.

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

---

## Appendix B — source material (working note)

*Delete before publication.* The arguments in §3, §5, §7 and §8 were harvested
from two design conversations and organised in
`research-notes/opx-claim-dossier.md`, which records for each claim whether it
originated as the author's own formulation or was sharpened in dialogue, and
which material was deliberately excluded from this paper.
