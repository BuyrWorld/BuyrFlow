# BuyrWorld Flagship Implementation Programme

Status: **ACTIVE — Release A / Foundation**  
Source of truth: BuyrWorld production design/domain documentation + this staged programme  
Working rule: **nothing advances because it looks acceptable; it advances only when it passes its gate.**

## North-star proposition

> **BuyrWorld turns complex procurement problems into evidence-backed decisions and coordinated execution.**

BuyrWorld should become the live digital representation of procurement work: requirements, evidence, suppliers, actions, decisions and outcomes. **BuyrFlow is the execution engine.** SupplyrFlow is the supplier collaboration surface. AI/agents are added only after the underlying workflows are trustworthy enough to operate.

## Non-negotiable flagship criteria

A release is not flagship unless it is:

- unmistakably BuyrWorld rather than generic SaaS;
- useful to a first-time buyer in under 60 seconds;
- evidence-native: supplied / derived / inferred / unknown are explicit;
- bidirectional: cases create work and completed work changes cases;
- provenance-preserving: recommendations, calculations and decisions retain their source/lineage;
- commercially measurable;
- mobile-usable;
- useful without AI;
- agent-ready without relying on screen clicking;
- safe at authority/spend/supplier-contact boundaries;
- differentiated without needing the phrase “we have AI”.

## Quality loop used for every stage

1. **Plan** — write problem, user outcome, domain objects, acceptance criteria and failure modes.
2. **Implement** — smallest coherent vertical slice, not decorative placeholders.
3. **Functional audit** — prove controls change the correct state and lineage is retained.
4. **UX/design audit** — first-use, mobile, accessibility and BuyrWorld visual fidelity.
5. **Commercial audit** — identify time, cost, risk or decision-quality benefit.
6. **Stress test** — missing data, conflicting evidence, stale state, duplicate actions, failed assumptions.
7. **Re-implement** — fix weaknesses rather than explaining them away.
8. **Re-audit** — stage passes only when all acceptance gates pass.

## Release structure

### Release A — Foundation (Stages 0–4)
Goal: a trustworthy product skeleton before deeper tool/AI integration.

#### Stage 0 — Flagship specification
**Status: PASS / living specification**

Deliverables:
- north-star proposition;
- product boundaries;
- terminology;
- commercial wedge;
- quality gates;
- this master implementation programme.

Gate:
- the product can be explained in one sentence;
- no feature is added without a user problem and measurable outcome.

#### Stage 1 — BuyrWorld design system
**Status: IN PROGRESS**

Use the production BuyrWorld design language as the source of truth:
- dark workspace shell;
- `#0B1014` ground, `#11181E` / `#151E25` surfaces;
- scarce `#D6FF00` lime accent;
- Space Grotesk headings/metrics + Inter UI/body;
- compact 4/8/12/16/20/24/32 spacing rhythm;
- 10–14px radii;
- subtle borders and minimal shadow;
- high information density / low visual noise;
- real BuyrWorld brand/logo treatment;
- no giant marketing hero typography inside the workspace;
- no generic AI gradients/glow/glass UI.

Gate: **brand fidelity >= 9.5/10**. A screenshot without the logo should still read as BuyrWorld.

#### Stage 2 — First-use information architecture
**Status: IN PROGRESS**

Primary entry:
> **What needs resolving today?**

User describes the procurement problem. The system either:
- identifies a supported workflow and offers a concrete next action; or
- says it cannot confidently classify it and asks for the missing context.

Never silently route unknown work to a generic board.

Modules become secondary navigation. A buyer should not need to understand “Flow vs Cases vs Director” before receiving value.

Gate:
- first useful case/action in <60 seconds;
- no dead-end page;
- every exposed navigation destination works or is explicitly labelled unavailable.

#### Stage 3 — Procurement Case engine
**Status: IN PROGRESS**

The **Procurement Case** is the central object, not the task.

Case contains:
- requirement/objective;
- parties/suppliers;
- evidence ledger;
- risks;
- linked actions;
- decisions/approvals;
- events/timeline;
- outcome/learning.

Evidence states:
- **SUPPLIED / KNOWN** — directly supported by source evidence;
- **DERIVED** — exact deterministic calculation from known inputs;
- **INFERRED** — reasoned interpretation requiring review;
- **UNKNOWN** — material information still missing;
- **ASSUMED** — explicit user-approved placeholder with stated basis.

Every evidence item retains source/provenance and timestamp.

Gate:
- no orphan task;
- no unexplained recommendation;
- every material decision can be reconstructed from the information available at the time.

#### Stage 4 — BuyrFlow execution engine
**Status: IN PROGRESS**

BuyrFlow is not a generic Kanban. It executes the case.

Default work lifecycle:
1. Investigate
2. Prepare
3. Waiting externally
4. Decision required
5. Execute
6. Validate outcome

Actions carry:
- case id;
- objective;
- originating evidence/risk/event;
- owner;
- supplier/party;
- due date;
- dependencies;
- completion criteria;
- expected result;
- actual result;
- authority requirement.

**Critical rule:** completion changes the case. Example: receiving a written mill allocation moves the related evidence `UNKNOWN -> KNOWN`, records the source/event, recalculates case risk and updates the recommended next action.

Gate: **bidirectional workflow >= 9.5/10**.

---

### Release B — Procurement Intelligence (Stages 5–7)
Goal: connect the real BuyrWorld capabilities into the Case/Flow spine.

#### Stage 5 — Existing BuyrWorld tools become capabilities
Do not rebuild watered-down copies. Existing engines should consume case context and return structured evidence.

Priority capabilities:
- Price Increase Defender;
- Quote Comparator;
- RFQ Generator;
- Should-Cost;
- drawing/spec/material analysis;
- contract/evidence review;
- supply risk.

Each capability must:
`consume case -> create structured evidence -> recommend work -> feed BuyrFlow -> update case`.

#### Stage 6 — SupplyrFlow collaboration
Supplier workspaces must be materially better than email + attachment.

Supplier can receive/respond to authorised requests, upload evidence, confirm dates/capacity, submit quotes and recovery plans. Buyer case updates when supplier responses arrive.

#### Stage 7 — Decision engine + decision memory
Decision view must show:
- recommendation;
- deterministic commercial measures;
- supporting evidence;
- unresolved unknowns/assumptions;
- alternatives;
- authority/approval gate.

Record what was decided, by whom, why, using what evidence, and eventual outcome.

---

### Release C — Connected Procurement (Stages 8–9)

#### Stage 8 — Organisation / authority / escalation graph
Escalations arise from policy and context, not merely a button.

Examples:
- production stop <7 days -> supply-chain manager;
- commitment > configured threshold -> procurement director;
- technical deviation -> engineering/quality approval.

#### Stage 9 — Control Tower
Management surface answers:
- what needs intervention;
- money/risk at stake;
- what changed;
- which decisions are blocked;
- where workload/evidence is stuck.

Every dashboard item must have a clear next action.

---

### Release D — Flagship hardening (Stages 10–12)

#### Stage 10 — Usability massacre
Test as junior buyer, senior commodity manager, procurement director, supplier and mobile user. Remove dead ends, redundant navigation, unnecessary fields and decorative dashboards.

#### Stage 11 — Commercial audit
Every flagship workflow must expose measurable value: hours released, spend challenged/avoided, sourcing cycle reduction, risk reduction or decision-quality improvement.

#### Stage 12 — Competitive uniqueness audit
Benchmark against SAP, Ivalua, Coupa, Zip, Keelvar, Pactum, LightSource, aPriori and relevant new entrants.

Gate: explain BuyrWorld differentiation **without mentioning AI**.

Target moat:
> **evidence-native execution for complex/direct procurement, connecting technical evidence, commercial intelligence, workflow, supplier collaboration and organisational memory.**

---

### Release E — AI-native BuyrWorld (Stages 13–16)

#### Stage 13 — Real AI capability layer
Agents operate the same Case/Flow objects via APIs/tools. No browser imitation.

Candidate tools:
- read_case;
- inspect_evidence;
- run_quote_analysis;
- request_supplier_evidence;
- create_actions;
- assess_risk;
- build_negotiation_position;
- prepare_rfq;
- escalate_case;
- recommend_decision.

#### Stage 14 — Autonomy levels
- L0 observe
- L1 analyse
- L2 recommend
- L3 prepare
- L4 execute safe/reversible actions
- L5 commercial actions within explicit policy

Every action has identity, permission, evidence, audit, authority and approval controls.

#### Stage 15 — Daily-use audit
Test real procurement-day scenarios from shortage to supplier increase to quote review to management update. If it only demos well, it fails.

#### Stage 16 — Final flagship gate
Minimum scores:

| Category | Minimum |
|---|---:|
| Visual / brand | 9.5 |
| First-use UX | 9.5 |
| Functional depth | 9.0 |
| Workflow integrity | 9.5 |
| Direct procurement usefulness | 9.5 |
| Supplier experience | 9.0 |
| Evidence / provenance | 10.0 |
| Mobile | 9.0 |
| AI readiness | 9.5 |
| Safety / governance | 10.0 |
| Commercial ROI | 9.0 |
| Differentiation | 9.0 |

A major category scoring 7/10 returns to implementation.

## Current execution ledger

### 2026-10-17 — Release A started

**Implemented in the standalone working branch/project:**
- canonical programme added;
- BuyrWorld design tokens/shell being aligned to production North Star;
- task-first intake changed so unsupported text is not silently guessed;
- Procurement Case model expanded to structured evidence and event lineage;
- BuyrFlow lifecycle changed from generic board semantics to procurement execution stages;
- evidence-completion event wired to update the case rather than only the task;
- fake “Assign AI” owner relabelling removed from the flagship path.

**Next audit:**
- first-use <60 sec;
- evidence lineage integrity;
- case -> flow -> case round trip;
- mobile navigation;
- brand fidelity against production BuyrWorld.

## Development rule

At every stage ask:

> **Would we be comfortable showing this exact workflow to a Head of Procurement at a £1bn manufacturer and asking them to pay for it?**

If no, the stage is not complete.

### 2026-10-17 — Release A v0.3.0 audit pass

**Implemented / strengthened:**
- all review pages visibly label synthetic/demo data so no supplier metric can be mistaken for live organisational fact;
- evidence is normalised to explicit provenance (`kind`, `ref`, `captured`) rather than relying only on a free-text source line;
- BuyrFlow actions now have explicit scope (`case` or `workspace`), origin, expected result, actual result, dependencies and authority;
- supplier evidence requests must attach to a Procurement Case rather than creating orphan external work;
- manual work without a case is explicitly stored as a workspace action, not silently orphaned;
- case recommendations now identify the highest-priority evidence gap and the linked next action;
- decision records snapshot current risk, evidence states, unresolved unknowns and open actions at decision time;
- completing linked evidence writes provenance, records the actual result, advances the action to validation, appends a case event and recalculates risk;
- supplier comparison score is explicitly labelled illustrative until Release B introduces customer-configurable policy weights and evidence-backed commercial measures.

**Automated Release A audit:** PASS
- syntax checks: PASS;
- all standalone routes: PASS;
- master programme route: PASS;
- unsupported intake refusal: PASS;
- no implicit orphan-action model: PASS;
- evidence provenance normalisation: PASS;
- `AMS5599` evidence round trip: `UNKNOWN -> KNOWN`: PASS;
- linked action transition to validation: PASS;
- case risk recalculation `Critical -> High`: PASS;
- decision snapshot reconstruction data: PASS.

**Stages 1–4 remain IN PROGRESS.** The core vertical slice passes its automated model/route audit, but the strict flagship gates are not earned until the deployed build has been visually reviewed at desktop and mobile widths and first-use behaviour has been tested as a new user. A passing unit/integration test is not a substitute for the 9.5/10 usability and visual gates.

## Release A reimplementation log — v0.4.0 (17 October 2026)

This pass responds to the first live/mobile UX audit. It does **not** promote Stages 1–4 to complete; it removes prototype interaction patterns that would prevent those gates from passing.

### Reimplemented
- Replaced all native browser `prompt()` interactions with one reusable BuyrWorld workbench dialog for evidence receipt, action creation, supplier evidence requests and human decisions.
- Added mobile navigation scrim, explicit close behaviour and background scroll locking.
- Rebuilt mobile BuyrFlow from six sideways 82vw workflow columns into a single-stage operational view with a stage selector.
- Supplier search now visually focuses and scrolls to the matched supplier rather than merely routing to the page.
- Added workflow transition guardrails:
  - open dependencies block advancement;
  - material evidence gaps block entry to Decision or Execute;
  - Execute requires an evidence-backed human decision snapshot.
- Kept case/workflow lineage unchanged: evidence completion still updates provenance, actual result, event history and calculated case risk.

### v0.4.0 audit result
**Automated functional audit: PASS.** The suite now also verifies that native `prompt()` is absent, mobile stage-view/workbench styles exist, transition guardrails behave correctly and the health endpoint reports the current release.

### Gate status after v0.4.0
- Stage 0 — **PASS / living specification**
- Stage 1 — **IN PROGRESS**: production visual tokens and logo treatment are used; final visual-device comparison remains.
- Stage 2 — **IN PROGRESS**: problem-first intake works and refuses unsupported classification; true first-time-user observation remains.
- Stage 3 — **IN PROGRESS**: case/evidence/decision lineage works; wider entity integration remains.
- Stage 4 — **IN PROGRESS**: bidirectional evidence workflow and transition guards work; broader workflow policy and exception paths remain.

No Stage is marked complete merely because this build is functional. The next gate is live iPhone/desktop review against BuyrWorld's Visual North Star and first-use expectations.


## Release A reimplementation log — v0.5.0 / v0.6.0 (17 October 2026)

This cycle focused on the three failures identified in the flagship audit: first-use clarity, genuine supplier/workflow hand-offs, and completing the Case lifecycle rather than ending at a task board.

### v0.5.0 — first-use + living workflow
- Rebuilt the Today surface around one signature entry point: **Tell BuyrWorld what changed.**
- Added four plain-language example intents and retained the no-silent-guessing rule.
- Added three obvious first-use choices: **Describe a problem / Add evidence / Continue my work**.
- Added a visible four-step Case journey: **Evidence → Decision → Execution → Outcome**.
- Case recommendations now change with the actual Case phase rather than ending permanently at “ready for decision”.
- Decision snapshots now include open-action states, owners and expected results, not only task IDs.
- Added case-level evidence capture with explicit provenance and evidence state.
- Supplier evidence requests now create two linked objects:
  1. an `UNKNOWN` evidence item in the Procurement Case;
  2. a BuyrFlow action carrying the evidence id, supplier, completion test and authority.
- Completing that supplier action promotes the linked evidence to `KNOWN`, writes provenance, moves the action to validation, appends a Case event and recalculates risk.
- First-use Enter-key behaviour and example-intent routing are explicit rather than decorative.

### v0.6.0 — close the evidence and outcome dead ends
The v0.5 review exposed two remaining architecture leaks. Both were reimplemented before accepting the cycle:
- New supplied evidence can resolve an existing `UNKNOWN` directly instead of leaving the original gap open and creating a duplicate fact.
- Evidence resolution is now a reusable domain transition (`resolveEvidenceGap`) shared by BuyrFlow completion and direct Case evidence capture.
- Added a validated Case Outcome object and outcome gate.
- Outcome recording is rejected unless:
  - material unknowns are closed;
  - an evidence-backed human decision exists;
  - no open Case actions remain.
- Outcome records capture the result, validation basis, validating owner and lessons learned. Monetary “savings” are deliberately not typed into this foundation workflow; future commercial capabilities must calculate value from auditable evidence.
- Once recorded, the Case moves to **Outcome recorded** and the recommendation changes to organisational learning / monitoring.

### Automated v0.6.0 audit result
**PASS — living-case outcome loop**

Verified:
- syntax and route health;
- unsupported first-use intake refusal;
- no native `prompt()` UX;
- explicit case/workspace action scope;
- evidence provenance on all seeded evidence;
- workflow transition guards;
- case risk `Critical → High` after evidence closure;
- decision snapshot reconstruction;
- execution blocked until an evidence-backed human decision;
- supplier request `UNKNOWN evidence → linked action → KNOWN evidence`;
- case risk recalculation after supplier evidence receipt;
- outcome rejected while open work remains;
- outcome accepted only after evidence + decision + execution gates;
- final Case phase changes to `Outcome recorded`;
- signature first-use and mobile/workbench CSS hooks are present.

### Strict gate status after v0.6.0
| Stage | Current assessment | Status |
|---|---|---|
| 0 — flagship specification | North star, boundaries, staged programme and quality gates are explicit and living | **PASS** |
| 1 — BuyrWorld design system | Production North Star tokens, typography and production logo reference are used; logo asset is not yet bundled locally and a live device comparison is still required | **IN PROGRESS** |
| 2 — first-use information architecture | One front door, no silent guessing, examples, evidence entry and continue-work path are implemented; live first-time-user observation remains | **IN PROGRESS** |
| 3 — Procurement Case engine | Evidence/provenance, events, decisions, linked actions, phase changes and outcomes now form a coherent vertical slice; wider document/tool entities remain Release B work | **IN PROGRESS** |
| 4 — BuyrFlow execution | Case → action → evidence → risk → decision → execution → outcome is bidirectional in the audited slice; exception/policy breadth and live-device review remain | **IN PROGRESS** |

### Current flagship judgement
The Release A vertical slice is no longer a static workflow demo. Its major objects now change one another and preserve lineage. It is suitable for continued flagship iteration.

It is **not yet approved as commercially flagship**. The remaining Release A blockers are:
1. live iPhone + desktop visual review against the BuyrWorld North Star;
2. bundle the exact brand asset rather than relying on the production-site logo URL;
3. broaden policy/exception testing beyond the three synthetic cases;
4. verify the first-use flow with an unbriefed user;
5. persistent authenticated storage remains a later production-hardening requirement and is not implied by this standalone review build.


## Release A reimplementation log — v0.7.0 release candidate (17 October 2026)

This pass removes interface claims that are not yet backed by product behaviour.

### Reimplemented
- Removed the dormant **Capabilities** registry from primary workspace navigation. The route remains available for implementation reference, but unfinished capabilities no longer compete with real daily work.
- Removed “ask Buyr…” from global search until a real agent exists. Search now promises only the exact Case / Supplier / Action retrieval it actually performs.
- Upgraded Decision Memory from a static historical record:
  - every decision can reopen its source Procurement Case;
  - evidence-backed decisions display their captured evidence snapshot;
  - the latest validated Case outcome appears alongside the decision;
  - cases without an outcome are explicitly shown as awaiting one.
- Preserved all v0.6 domain gates: evidence, decision, execution and outcome remain separate auditable transitions.

### v0.7.0 automated audit
**PASS — Release A candidate UX integrity**

The automated suite now also rejects:
- a non-functional capability registry in primary navigation;
- search copy that implies an AI assistant before Release E.

**Release A remains a candidate, not a final flagship pass.** Live-device visual review and first-time-user observation are still mandatory before Stages 1–4 can be signed off.


## Release A reimplementation log — v0.8.0 (18 October 2026)

This pass responds to the independent audit of v0.7.0, which found the v0.7 gates checked that fields were filled rather than that evidence supported the conclusion, and scored evidence/provenance 3/10 against the internal 9.7. Every finding (BF-1 to BF-16) is addressed; `RELEASE_A_V080.md` maps each one to the change and the test that holds it.

### Reimplemented
- One door: `apply(state, command, actor)` in `public/domain.js`; the page and the tests use nothing else.
- Evidence received, then assessed by a named person; versioned; never pre-filled.
- Decisions freeze evidence text, need a named decider, go stale on material change, and need a second approver above a configurable threshold.
- One lifecycle per kind of action; outcomes tied to the decision they validate.
- Risk as named rules with inputs; shortage timing and claim-against-cap worked out exactly; the composite supplier score removed.
- Supplier entity with ids; supplier Request object (asked, sent, answered).
- ISO dates, UUIDs, migration of v0.7 data, export/import, a two-tab guard.
- Static shell with external modules, CSP without `unsafe-inline`, bundled logo, programme and audit no longer served.

### v0.8.0 audit result
**Automated:** 96 behavioural tests pass (`npm run check`). **Browser:** a scripted walk in Chromium at 1280px and 390px passes with no page errors.

### Strict gate status after v0.8.0
| Stage | Status | What still holds it |
|---|---|---|
| 0 — specification | **PASS** | — |
| 1 — design system | **BLOCKED ON A DECISION** | The review brief says production is cream/mint/pink; this programme and buyrworld.com say dark/lime. Choose one. |
| 2 — first-use | **IN PROGRESS** | Needs an unbriefed buyer observed on a phone. |
| 3 — case engine | **IN PROGRESS** | Evidence, decision and outcome lineage now hold under test; build on the live repo's `src/domain` in Release B rather than keep two case models. |
| 4 — BuyrFlow execution | **IN PROGRESS** | Lifecycle enforced in one place; exception breadth (cancelled work, reassignment, re-opened cases) not yet modelled. |

No stage is marked complete because tests pass.


## Release B implementation log — v0.11.0 (18 October 2026)

### Stage 5 vertical slice — Price Increase Defender

Implemented as a real Case capability rather than a separate mini-app:
- consumes a supplier commercial-change Procurement Case;
- validates supplier ask, contract cap and annual spend;
- calculates ask/cap/excess using integer basis points and pence only;
- freezes the calculation as versioned DERIVED evidence with explicit basis/provenance;
- creates missing evidence actions without duplication;
- creates one governed negotiation-preparation action;
- re-running with unchanged inputs is idempotent; changed inputs create a new evidence version;
- never accepts the increase, contacts the supplier or bypasses the existing human decision/approval gate.

Stage 5 remains **IN PROGRESS** until the capability is exercised through the deployed browser workflow and the next capabilities (Quote Comparator / RFQ / Should-Cost) use the same Case contract.


## Release B implementation log — v0.12.0 (18 October 2026)

### Stage 5 second vertical slice — Quote Comparator

Implemented using the same Case capability contract as Price Increase Defender:
- compares at least two recorded supplier prices only when units are genuinely comparable;
- calculates unit-price spread and recorded-quantity exposure exactly in pence;
- calculates price spread in basis points without floating-point arithmetic;
- freezes price and lead-time comparison as versioned DERIVED evidence;
- creates missing evidence work without duplicating existing gap actions;
- creates one governed sourcing-review action;
- refuses unlike units rather than inventing a conversion;
- deliberately does not create a composite supplier score, select a winner or award business.

Stage 5 remains **IN PROGRESS**. The capability pattern is now proven across commercial-change and multi-quote cases; RFQ / Should-Cost / technical evidence remain to integrate before Stage 5 can be considered broadly complete.


## Release B implementation log — v0.13.0 (18 October 2026)

### Stage 5 third vertical slice — RFQ Generator

Implemented as a versioned structured Case artefact rather than generated prose:
- consumes quantity, unit, specification/requirement, linked suppliers and current evidence gaps;
- refuses to invent missing requirement data;
- creates/refreshes one versioned RFQ draft per Case;
- carries unresolved material evidence into the RFQ as explicit clarifications;
- freezes an RFQ-prepared DERIVED evidence item with provenance;
- creates one human RFQ-review action before any external issue step;
- never sends the RFQ or commits the organisation to a supplier;
- unchanged reruns are idempotent, while changed Case inputs create a new RFQ version.

Stage 5 remains **IN PROGRESS**. Price Increase Defender, Quote Comparator and RFQ Generator now demonstrate the shared capability contract across three workflows. Should-Cost and technical/document evidence remain the next depth targets.
