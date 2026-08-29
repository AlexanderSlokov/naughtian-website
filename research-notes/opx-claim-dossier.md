# OpX claim dossier — harvested from conversation logs

Working note. **Not published** (lives outside `src/content/docs/`). Source material for
`src/content/docs/research/operator-experience.md` and its Vietnamese counterpart.

## Provenance keys

- **[L1]** — *Naughtian projects and national tech infrastructure*, 2026-08-28 → 2026-08-29
- **[L2]** — *Helvilette_concorde_test*, 2026-08-18 → 2026-08-27

Claims marked **(author)** originate as the author's own formulation in the log; claims marked
**(dialogue)** were sharpened or contested across turns. The distinction matters for a paper
written under a single author's name.

---

## A. The spine: why OpX is structurally under-supplied

This is the strongest and most original body of material in both logs, and the current draft has
nowhere to put it. Recommendation: it becomes its own section, and it is the paper's spine.

**A1. Developers are buyers; operators are heirs.** [L2 2026-08-23]
A developer picks a library without asking permission, so good DevEx propagates itself — the
product-led-growth model of the last fifteen years. Operators *inherit* infrastructure. Nobody
chose Puppet because they liked Puppet; they were handed it. Investment in the experience of
people who have no purchasing power produces no measurable growth.

**A2. The population asymmetry.** [L2 2026-08-23]
Roughly 30M developers against 1–2M ops/SRE. Every unit of DevEx spend is amortised across
twenty times more heads. *(Needs a citable source before publication — currently an
order-of-magnitude assertion.)*

**A3. Feedback latency decides the budget.** [L2 2026-08-23]
DevEx is felt at minute five: demoable, videoable, funnel-measurable. OpX is felt at month
eighteen: "in two years this will not ruin your Tuesday night" cannot be A/B tested and appears
on no growth dashboard. What cannot be measured does not get funded. The same logic runs
*inside* companies: shipped features are visible and credited; reliability is the story of
nothing bad happening — invisible, uncredited.

**A4. Painful self-hosting is a business model, not a bug.** [L2 2026-08-23] — the paper's
sharpest claim.
If self-hosting my software hurts, you buy my cloud version. The pain is not a defect in the
model; it *is* the sales funnel. Nearly every open-core company has an incentive for
`docker compose up` to be smooth in five minutes and for day 300 to be miserable. No meeting is
required to decide this — it falls out of "fund what raises conversion" repeated for three
years. **PaaS does not win by being better; it wins because the alternative is not funded by
anyone.**

**A5. Enterprise tools optimise for the signing moment.** [L2 2026-08-23]
The buyer of an enterprise automation platform is not the person paged at 03:00 — it is a VP
signing a contract. What wins an enterprise bid is the RBAC matrix, audit logs, compliance
reporting, SSO. Nobody in that room asks whether the error message tells you what to do next.
Two different products; the gap does not close with money.

**A6. At 12–50 machines the operator *is* the buyer.** [L2 2026-08-23] **(author)**
Same person. Which is why in this segment OpX is not a secondary feature — it is the entire
purchase decision. This is the market-structure justification for the whole framework.

**A7. The incentive moat.** [L2 2026-08-23]
The only party with no incentive to make self-hosting bad is the party that does not sell a
managed service. Not a skill advantage — an *incentive* advantage, and the kind money cannot
buy back.

**A8. The fair counter-argument, which the paper must state.** [L2 2026-08-23]
Some of the badness is not conspiracy. Infrastructure software genuinely is harder: dev tools
run on a laptop, infrastructure tools run on someone's peculiar RHEL 7 with SELinux enforcing,
behind a proxy, with broken DNS. The combinatorics of failure explode and testing them costs
real money. A paper that omits this is polemic, not analysis.

---

## B. Definition and boundaries

**B1. OpX is the cost, borne by a human, of understanding and correcting a system's behaviour
under time pressure.** Already in the draft. Keep.

**B2. Day 0 vs day *n* — and the Vietnamese draft's sharper version.** [`vi/` §3]
The vi draft already improves on the EN: DevEx is bounded (dev environment → shippable
artifact), whereas OpX is measured across the *whole lifecycle*, from installation until the
system is decommissioned and removed. The EN text should adopt this, and it makes uninstall
(§C4) a definitional matter rather than a nicety.

**B3. Hide the complexity of setup; expose consequences fully.** [L2 2026-08-26] **(dialogue)**
Formulated while classifying Helvilette's design lineage. This is the single most compact
statement of the framework's position and resolves the apparent contradiction between "easy to
adopt" and "no magic": installation is one command; what the tool is about to do to your machine
is not hidden by one character.

**B4. Design-lineage framing.** [L2 2026-08-26]
French school (Traefik, Meilisearch, early Docker) buys ease by *hiding*; German school
(systemd, SUSE) buys trust by *exposing*. The framework deliberately splits the difference along
the setup/consequence line. It deliberately declines the Silicon Valley school — not because it
is bad, but because its architecture presumes a funding model the author does not have.
*Caveat the log itself raises: national design-school taxonomy is folklore, not fact (Grafana is
Swedish, Kubernetes is Google). Use as vocabulary, not as evidence.*

**B5. OpX is not a gate, it is a ladder.** [L1 2026-08-29] **(dialogue — author's position
corrected)**
The author initially proposed "skill-oriented, tightly bound to the user's operational and
Ansible skill". Counter-argument accepted: the tool does not *demand* high skill, it *rewards*
it. The default mode requires almost nothing; higher tiers unlock with competence. This matters
beyond phrasing: the "skill-oriented" framing repels exactly the target segment (SMB,
university, 5–50 VM homelab), who need the bottom rung most.

**B6. What OpX is not.** Already in the draft: not ease of installation, not documentation
quality, not the absence of complexity. Add from the logs: **not the absence of danger** — see
C7, escape hatches.

---

## C. Operational rules — what makes OpX falsifiable

The logs are emphatic that OpX-as-slogan dies like every slogan. Recommendation: these become a
section of their own, because they are the paper's operational contribution.

**C0. The falsifiability test.** [L2 2026-08-23]
> "Operator Experience" left as a slogan will die like every slogan; everyone claims to be
> friendly. It is only real when it can **fail a pull request**.

**C1. Every error message must state the next action.** Not "connection refused" but "could not
reach X — check Y". Greppable, CI-testable.

**C2. A time-to-first-success budget.** From install command to first successful run on a blank
machine: under N minutes, as a test, not a promise.

**C3. Diagnosable from the node, not only from the dashboard.** At 03:00 the dashboard may be
the thing that is down. `journalctl -u <service>` must be enough to answer "why did nothing
happen".

**C4. One-command uninstall, and actually clean.** This is the OpX form of the zero-lock-in
promise, and because it is testable it should be a test.

**C5. Peak OpX for any system that acts autonomously: automation you can interrogate and
interrupt.** [L2 2026-08-23]
A reconciliation loop grants a new power *and* a new fear: the machine acts while you sleep.
Push-based tooling has no such property — if you do not type, nothing happens. Everything else
follows from this.

- **`why`** — what changed, who decided it, why, and the command that undoes it. The
  cross-tool claim worth defending: GitOps tools are good at "differs from desired state" but
  still cannot answer *who decided this*. The person woken at 03:00 needs a name and a reason,
  not a diff.
- **`pause --reason "…"`** — the frightening property of a reconciliation loop is that you
  cannot make it stop. Puppet's `agent --disable "<reason>"` is prior art worth citing: a
  mandatory string turns a 03:00 riddle into a handover note.
- Both must run **when everything else is dead** — control plane down, network cut — which
  forces the architectural consequence: structured history is written locally, on the node.

**C6. Dangerous actions always leave a note.** `--reason` mandatory on pause and on force.
Three simultaneous benefits: it cannot be pasted into a runbook without someone writing why; it
generates the audit-log line; and it makes `why` able to answer "why was this applied despite a
red warning".

**C7. The escape hatch is mandatory, and it is an OpX feature.** [L2 2026-08-23]
Without one, the on-call person disables the tool or SSHes in by hand — and then the action
falls *outside the system's field of view*. A good escape hatch keeps dangerous actions on the
books. Corollary: a tool with no override is not safer, it is merely blinder.

**C8. Print the dangerous lines, not a percentage.** [L2 2026-08-23] **(dialogue — author's
proposal corrected)**
Six unsafe tasks out of forty is 15%, which sounds benign; it is meaningless if one of them is
`shell: rm -rf /var/lib/postgresql`. Danger lives in what the tasks *do*, not in their ratio.
Percentages hide precisely the thing that must be looked at.

**C9. Alert fatigue kills features faster than bugs do.** [L2 2026-08-23]
If the default nags constantly, users raise the threshold to maximum and never look again.
Thresholds must be configurable per repository.

**C10. The agent reports only about itself; it never speculates about the node.** [L2
2026-08-23] **(author — the log records this as the author's sharper formulation)**
"I have not been *told* that your logs have a shipper" is a different claim from "I detect that
you lack a log shipper". The first is an empty field in the tool's own config (`log_sink:
unset` — not a warning, not red, not an exclamation mark). The second requires the tool to probe
the process list and *judge* the node, on authority it does not have. Generalises to a law:
**a component reports what it knows about itself.**

**C11. Answer when asked; never speak unprompted.** [L2 2026-08-23]
A fleet-status command showing gaps is a *fact derived from state*. A line saying "you should
install X" is an *opinion*, i.e. advertising, and operators smell it instantly. The moment a
tool raises a notification nobody asked for, it becomes Clippy — and users mute it, then mute
the warnings that matter. **Clippy is born from exactly one behaviour: guessing intent.**

**C12. Laziness is not a failure of will; it is a high cost-to-start.** [L2 2026-08-23]
You know you need the observability stack. You do not do it because there are five steps before
step one. A single read-only inventory command deletes three of them. **Nobody fixes laziness by
nagging; only by making the right thing cheap.** — the humane version of the whole thesis.

---

## D. Legibility: the artifact contract

**D1. One artifact serving three questioners is the root cause.** [L2 2026-08-23]
- the person watching now — wants *flow*, human-readable
- the person reading at 03:00 — wants a *summary*, not the full record
- the machine — wants *structured, queryable, durable*

Emitting the third format to all three is the entire defect.

**D2. Store rich, display poor.** [L2 2026-08-23] **(dialogue, in answer to the author's
"operator above all, but respect the machine")**
Exactly one source of truth — a lossless structured event stream. Everything a human sees is a
*view computed from it*, never a second source. "Respect the machine" = discard nothing.
"Operator above all" = by default nobody has to look at it.

**D3. The two symmetric failures.** [L2 2026-08-23]
Making humans read JSON sacrifices the human to the machine. Making machines parse pretty prose
sacrifices the machine to the human, and is why everyone automating around such tools writes
fragile parsers. Keep both, and **never force either side to use the other's format.**

**D4. Test for the artifact contract.** [L2 2026-08-23]
> The raw log must exist, and must almost never be read.

If the operator has to open the raw format to understand what happened, the summary is broken.
If the raw format does not exist, the machine has been betrayed.

**D5. Failure must be treated differently from success.** [L2 2026-08-23]
Nobody reads the log of a successful run; when it fails the log is everything. Fold everything,
auto-expand the failing step with its stderr and N preceding steps (the CI-platform idiom).
Name the flag `-C` / `--context`, because operators knew that flag from `grep` and `diff` before
they knew your tool existed — borrow existing muscle memory rather than inventing.

**D6. Translate tool-events into machine-facts.** [L2 2026-08-23]
The automation engine says *which task* changed. The operator needs to know *what on the machine*
changed. Those are different statements and **the gap between them is the entire value
created.** It is mechanically translatable — file modules yield a path, service modules a unit
and an action, package modules an old→new version. About fifteen module types cover ~90% of real
playbooks.

**D7. The symbol set, and the one nobody else has.** [L2 2026-08-23]
`+` create, `-` delete, `~` modify, `↻` restart/reload, `?` **ran a command — cannot determine
what changed.** Terraform has three because its world is create/modify/delete. `?` is the
original contribution and it connects directly to preflight fidelity scoring.

**D8. The honesty law.** [L2 2026-08-23] — strongest candidate for a named principle.
> Never display a clean summary for a run that contained unpredictable tasks.

Otherwise the summary *lies*, and lies precisely on the runs that most needed scrutiny. Fastest
possible way to lose trust permanently.

**D9. Report what did *not* change.** [L2 2026-08-23]
"44 tasks · 4 changed · 40 already correct · 0 failed". Without that line, at 03:00 "nothing
changed because the system has converged" and "nothing changed because it could not run" are
the same blank screen.

**D10. `git status` is the industry's highest OpX standard.** [L2 2026-08-23]
It does not merely report state; it tells you the next command. Tens of millions of people
learned Git from its output rather than its documentation. Generalised rule: **every time you
print state, print the next command.**

**D11. Verbs, not flags; and preview as the default path.** [L2 2026-08-23]
People remember verbs; flags require the manual. Separating preview from execution converts
"the thing you must remember" into "the road you are already on". Nothing dangerous happens
without asking. What *not* to copy from Terraform: the state-manipulation vocabulary
(`state mv/rm`, `import`, `taint`) and `force-unlock`. Keep Ansible's install moment, keep
Terraform's lifecycle.

**D12. Name it honestly: preflight, not plan.** [L2 2026-08-23]
`terraform plan` is a *contract*; a check-mode run is a *prediction*. If users expect
Terraform-grade accuracy and receive a prediction, the first surprise destroys trust
permanently. Naming is an OpX decision.

**D13. Distinguish "the check ran and failed" from "the check could not run".** [L2 2026-08-23]
Halting is correct for the first and wrong for the second — the second is a report, not a block.
A tool that conflates them wakes people at 03:00 for a reason that does not exist.

**D14. A preview must be bound to what it previewed.** [L2 2026-08-23]
Bind to (node state hash, commit SHA); refuse to apply if either moved. Without the binding the
preview is decoration.

**D15. Locks are an OpX liability; use TTL leases.** [L2 2026-08-23]
An agent that dies holding a lock is a weekly event on flaky VPS networks, and
`terraform force-unlock` is notorious for exactly this reason. A self-expiring lease has the
same effect with nobody cleaning up by hand at 03:00.

---

## E. Level-triggering and the honest-machine rules

**E1. Events are hints; truth is a full comparison.** [L1 2026-08-28]
Kubelet's PLEG learns that a container died by polling and diffing, not by being told. Even
after event-driven PLEG was added, the periodic relist was **kept**, because events can be lost
and relists cannot. **Never reconstruct state by accumulating events.** This is the cleanest
existing-systems anchor for the whole "visible state" axis in §3.2.

**E2. Cache decides what to display, never whether to check.** [L1 2026-08-28]
Confusing the two silently destroys level-triggering.

**E3. Splay/jitter is not an optimisation, it is a correctness property at fleet scale.**
[L1 2026-08-28]
Fifty nodes polling on the same minute is a punch in the face to the git server every half hour.
Puppet and Chef both paid for this lesson; add it while you still have one node, because adding
it later hurts.

**E4. Prior art worth taking from Puppet/Chef.** [L1 2026-08-28]
The 30-minute default run interval and its rationale (how long may drift live vs. cost per run);
`last_run_summary.yaml` written on the node, so status works when the control plane is dead
(direct support for C3); `--disable "<reason>"` as independent confirmation of C6. What *not* to
take: apply-by-default, and central catalog compilation as a chokepoint.

**E5. Least harm to the user's infrastructure is the default.** [L1 2026-08-29] **(author)**
> The system chooses the option least damaging to the user's infrastructure: make noise so a
> human notices the drift and intervenes. Once they have fixed it, and know what to write in
> their playbook so it revives the service *idempotently*, they grant the tool permission to act
> on that specific service.

Responsibility is placed honestly rather than promised away: the claim is not "we will fix it
safely" but "if your playbook is idempotent this is safe; if it is not, you were already playing
Russian roulette and the tool only makes it regular".

**E6. Remediation config is a pointer to a playbook, not a boolean.** [L1 2026-08-29]
The operator does not write `restart: true`; they write "when probe X is red, run play Y". The
tool never invents a fix — the knowledge lives in the playbook, not in the tool.

**E7. Nothing runs automatically that was never watched running dry.** [L1 2026-08-29]
A remediation play must have passed a dry run at least once before it can be attached to a
probe.

**E8. ONESHOT and halt.** [L1 2026-08-29] **(author)**
Run once, re-check, green → be quiet, not green → **halt and make noise**. No retry, no backoff.
If the rescue play did not save it the first time it will not the second, and by the third you
have written three times into a system already in disarray. Companion law: **the agent may not
release itself from halt.** A halt that expires after thirty minutes and retries creates a slow
loop — the worst kind, because it gnaws while everyone believes things have stopped.

**E9. The boundary is consensus, not data.** [L1 2026-08-29] **(dialogue — author's boundary
sharpened)**
The author proposed "tasks without domain data semantics". The sharper line: *if two nodes both
act on this, is the consequence unrecoverable?* Promoting a database replica → yes (needs
fencing and an arbiter; out of scope). Renewing a certificate, rotating logs, reloading a
config → no. Plenty of "data" work stays in scope; leader election never does.

**E10. It cares for the caretakers.** [L1 2026-08-29]
HA tooling cannot install itself, cannot notice that someone hand-edited its config at 02:00 to
put out a fire and never wrote it back, cannot see that three nodes run three different config
versions. That class of drift kills HA tooling *precisely when it is needed*, because HA
misconfiguration only surfaces during a real failover — six months can pass between the typo and
the knowledge of it.

**E11. Do not duplicate the process supervisor.** [L1 2026-08-29] **(dialogue, partially
conceded in both directions)**
A unit file missing `Restart=` is *drift* and must be reported, not silently compensated for.
Conceded to the author: the genuinely blind spot is "the process is alive but the configuration
is wrong, so it runs incorrectly, and systemd will never know" — that is the most dangerous
class of drift because it is silent. Probes are justified exactly and only there.

**E12. Naming: "readiness" is borrowed wrongly.** [L1 2026-08-29]
In Kubernetes it means *do not route traffic here*. A tool with no traffic router has no such
concept; what it actually needs is a *gate condition* before moving to the next node in a
rolling update. Renaming now avoids explaining the difference to every Kubernetes user later.

---

## F. Assistive OpX — the evidence the draft's §5 needs

**F1. Knowing what has drifted, stated as four consequences.** [L1 2026-08-29]
- **The 02:00 incident.** Without drift detection the first question is always "is anything
  different on this machine?" and nobody can answer, so people guess. Most infrastructure
  debugging time is *elimination*, not repair.
- **Drift lifetime.** Unmeasured, it is typically months: someone changes a `sysctl` during a
  March incident, forgets to write it into the playbook, and it sits until a September reboot
  fails in a way nobody understands. Detection turns "months" into "one poll cycle". *This is
  the single most quantifiable claim in the whole paper — see G2.*
- **It converts the playbook from documentation into truth.** In most organisations the
  configuration repo describes state *at some point in the past*, and nobody dares run it because
  nobody knows what it would do to today. Continuous detection keeps that distance visible, so it
  never grows frightening.
- **It is the precondition for everything else.** You cannot automatically fix what you cannot
  see, and people only opt into automation for things they have watched break a few times.

**F2. The reframing of what Kubernetes actually gave people.** [L1 2026-08-29]
The strongest property of Kubernetes is not self-healing — it is **knowing the true state of the
whole cluster in one place.** For someone running 30 VMs, the life-changing capability is not
"fixes itself" but answering, for the first time, "which machine differs from what I think".
This is the cleanest statement of assistive OpX in either log.

**F3. Self-healing demos; detection retains.** [L1 2026-08-29]
Self-healing is what impresses in a demo. Drift detection is what makes people still have the
tool after six months. It also has near-zero trial cost because it changes nothing on the
machine.

**F4. Configuration management has no memory.** [L2 2026-08-23]
Each run is an amnesiac event: it exists for the eight minutes you typed it and then the terminal
closes. Four questions no team using it can answer — when did the playbook last actually run on
this host and with what result; which commit is this node carrying; is the change we made six
weeks ago still there; which nodes have never had a successful run. In practice these are
answered by Slack scrollback, a spreadsheet, and the memory of the longest-serving engineer.
**Memory falls out of the architecture (a resident agent writing local history) — it is not a
feature you build.**

**F5. Inventory is a declaration, not a fact.** [L2 2026-08-23]
Inventory files rot from week one: deleted machines remain, new machines are never added, and
the tool trusts the file absolutely. Self-registration exposes both *ghosts* (in inventory, does
not exist) and *orphans* (running, not in inventory).

**F6. The tax test for adopting any new artifact.** [L2 2026-08-23]
Adding a config file to someone's repo is a permanent tax; it must buy something unobtainable
elsewhere. Three laws, and violating any of them voids the argument: it must work without the
file; the repo must still run under the plain upstream tool (zero lock-in, made concrete at file
level); every field must be derivable or omittable. If the minimal file exceeds ten lines you
have lost. Measure: **the file must pay for itself in the first week, not the first quarter.**

---

## G. Evaluation — instruments the draft's §6 can actually use

The draft calls §6 "the hard part" and it is right. The logs supply four instruments and one
uncomfortable fact.

**G1. The stranger test.** [L2 2026-08-23]
Hand a node to someone who has never heard of the tool. Break something. Measure whether they
can diagnose it and stop it within 60 seconds without reading documentation. Pass = peak OpX;
fail = everything else is just features. This is a real, runnable, cheap experiment and it is
the best evaluation instrument in either log.

**G2. Drift lifetime as the headline metric.** Derived from F1.
Time from divergence to operator awareness. Baseline (no detection) is unbounded and anecdotally
months; instrumented, it is bounded by the poll interval. This is measurable, it is the paper's
most defensible quantitative claim, and it does not require a user study.

**G3. Diagnosis-cost counters — already in the draft, and now supported.**
Number of systems that must be consulted; hops from symptom to cause; whether the failure names
its own source; whether a conflict is resolvable from one artifact. The logs add a fourth:
**whether diagnosis is possible with the control plane dead** (C3, E4).

**G4. Evaluate by how it fails, not by how it runs.** [L2 2026-08-26]
The SQLite discipline: roughly 600 lines of test per line of code, most of it *fault simulation*
— out of memory, full disk, power loss mid-write, I/O returning garbage. The lesson is not the
ratio, which is unreachable, but the habit: **the project's effort goes into proving it does not
break, not into making it run.** Concretely instantiated as an acceptance rubric of four
*failing* runs (power pulled mid-run; a broken change mid-fleet; the agent severing its own
network; restore onto a blank machine) rather than one clean one.

**G5. The Concorde test, and — importantly — its precondition.** [L2 2026-08-26 → 2026-08-27]
Definition: *a finite externally-imposed window, a fixed workload, and the system must hold
cadence inside the window* — not "what is the maximum load". Thrashing is a failure even if the
work completes. Publish the number at which you lose.
**The precondition matters more than the test for this paper**: it only means anything when
slow-ness causes a *different kind of failure*, when the window is imposed from outside, and when
multiple components must converge together. The log then applies that test to the author's own
project and concludes it **does not qualify** — at 12–50 VMs, taking 20 minutes instead of 8
breaks nothing, and the design deliberately waits for human approval at each step, so its
deadline is human-imposed. This is the single best piece of evidence that the framework can
falsify its author's own preferences, and §6's "threats to validity" should use it.

**G6. The uncomfortable fact, stated plainly.** [L1 2026-08-29]
The tools have not run in production, not even the author's. A position paper may argue from
design; it may not present design intent as evidence. The draft's existing honesty (§4.4 already
concedes there is no HA story) should be extended: **§6 should state what has not been measured
before listing what has.** This costs nothing and pre-empts the first reviewer.

---

## H. Material deliberately NOT for this paper

Recorded so the decision is made once rather than re-litigated.

- **Licensing strategy** (Apache-2.0 vs BSL, CLA, the relicensing record of the 2023–2025 wave).
  A real argument, but it is a governance essay, not this paper. [L2 2026-08-18]
- **Free/paid boundary rules** ("free is whatever a 1–2 person team needs to operate safely;
  paid is whatever only becomes necessary because other people are involved"), the SSO-tax
  argument, and the compliance analysis (SOC 2 / ISO 27001 audit organisations, not software;
  FIPS 140 is a real artifact; sell evidence, not certificates). [L2 2026-08-23]
  **Exception:** one rule *is* an OpX claim and should be kept — **never paywall the API or data
  export.** Sell what is built on the data, never the right to touch it; "respect the machine"
  taken literally means machines must always be able to read. That belongs in §C.
- **Funding, sustainability, CNCF status, bus factor.** [L2 2026-08-18, 2026-08-26]
- **The Vietnam / national-infrastructure material and the deployment anxiety.** [L1]
  This is the author's own account of motivation and it is genuinely moving, but a paper is the
  wrong venue and it would be read as a bid for sympathy. The log itself reaches this conclusion:
  the national grievance is not universal; **the four hours of head-scratching because CI could
  not reach a node is**, and it is the same in Ohio. If any of it is used, use only that
  sentence — and it belongs in a blog post, not here.
- **Competitive analysis of Chef/Puppet/Salt ownership and market position.** [L2 2026-08-18]
  Useful for §2 as *background* on why the vocabulary stalled, not as an argument.

---

## I. Recommended structural change

The current skeleton has no home for section A, which is the paper's strongest material, and no
home for section C, which is its operational contribution. Proposed outline:

| § | Section | Source |
|---|---|---|
| 1 | Introduction | existing |
| 2 | Related work and background | existing |
| 3 | **Why operator experience is under-supplied** | **new — dossier A** |
| 4 | Defining operator experience | existing §3 + B |
| 5 | **Operational rules: making OpX falsifiable** | **new — dossier C, D, E** |
| 6 | Reflexive OpX | existing §4 |
| 7 | Assistive OpX | existing §5 + F |
| 8 | Evaluation | existing §6 + G |
| 9 | Discussion | existing §7 |
| 10 | Conclusion and future work | existing §8 |

Rationale: an opinion paper's contribution is a *frame plus a diagnosis*. A3–A7 are the
diagnosis, and without them the paper reads as a description of one person's tools. C and D are
what stop the frame from being a slogan — they are the part a reviewer can disagree with, which
is what makes it a position rather than a preference.
