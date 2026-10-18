# BuyrFlow Release A — v0.9.1

**Date:** 18 October 2026
**Implements:** `BUYRFLOW_SIMPLIFICATION_V091_CLAUDE_CODE.md`
**Baseline:** v0.8.1 — 126 tests, 23 suites
**Now:** 187 tests, 35 suites, all passing on Node 22

**Verdict: not complete.** The build is done and the engine is intact, but the
release's own standard is that a first-time buyer can use it without
product-specific guidance, and **nobody has tried.** No browser was available
to the session that wrote this, so the mobile gate and the first-use gate are
unverified. See *What was not checked*.

## The architectural correction

The interrupted v0.9.0 work would have pushed personal actions through the
governed lifecycle. v0.9.1 does not. A personal task is its own entity in its
own array, and the separation is structural rather than conditional:

- tasks live in `state.personalTasks` and never in `state.actions`, so
  `openActions()` cannot see them — a task can neither block nor unblock a
  decision or an outcome;
- `advanceAction` and `closeAction` resolve ids out of `actions`, so a task id
  does not exist to them;
- linking a task to a Case records a relationship and confers nothing: no
  evidence rules, no approval, and no entry in the Case timeline.

The acceptable alternative in the specification — a `KIND.PERSONAL` with a
short lifecycle — was not taken. It would have put personal work inside the
same table that governs execution, one mistaken condition away from the gates.

A task asks for a title and, optionally, a day. It moves between *to do*, *in
progress*, *waiting* and *done* in one click, in any direction.

## What changed

| Spec | What v0.9.1 does |
| --- | --- |
| §3 Navigation | Today and My work are primary; Cases, Suppliers and Decision memory sit under **More**, which opens itself when one of them is the current page. Routes and domain names are unchanged. |
| §4 Today | Greeting, one question, and two moves: Add a task / Resolve a procurement problem. Then the four counts a person asks — due today, overdue, waiting, needs a decision — then their tasks, what they are waiting on, and the cases with a next move. |
| §5 Personal tasks | `PersonalTask` as above. Quick-add asks two things; priority, Case, supplier and note are behind More options. |
| §6 Governed work | Untouched. Asserted by test against the v0.8.1 controls. |
| §7 First run | A three-point walkthrough, shown once, dismissal in localStorage, reopenable from a permanent `?` in the topbar. Focus-trapped and Escape-closable like every other dialog. |
| §8, §14 Hints | Per-screen, dismissible, remembered. An empty slot takes no space. |
| §9 My work | A list — Today / Upcoming / Waiting, then a separate **Case work** section that says it is governed. The six-column board is behind **Show workflow board**. |
| §10 Plain language | `plainStage()` translates at the presentation layer. No domain constant was renamed. |
| §11 Case | Next action, then what is blocking it, then open work and supplier position. The ledger, risk driver inputs, decisions and timeline are behind **Show evidence & case detail**. |
| §12 Deep link | Arriving at `#ev-…` opens the disclosure and shows a callout naming the Case and why the reader is there, with a way back. No UUID is shown. An in-page evidence link opens whatever it is nested inside. |
| §13 Empty states | Every list teaches instead of sitting blank. |
| §16 Honesty | The review notice is still there, lighter, and moved to the end of Today. |
| §17 Metrics | The four action counts link to My work and Cases. The portfolio metrics moved behind **Show workspace detail**. |

## The defect the walkthrough found

Walking the ten tasks in §19 surfaced one failure that the tests had not:
**a Case reached normally had no way back to daily work** except the sidebar,
which is behind a menu button at phone width. §20 lists *"How do I get back to
my daily work?"* as an acceptance criterion, so that was a fail. Every Case
now carries a persistent **← Back to my work** link, and a test holds it.

## Tests

61 added, none weakened.

- `tests/personal-tasks.test.mjs` — 20 tests. Most are about what a task
  *cannot* do: it is not in `actions`, the commercial commands do not know its
  id, linking it to a Case does not make it Case work or hold up an outcome,
  and finishing one touches no approval.
- `tests/simple-ux.test.mjs` — 41 tests across navigation, first run, hints,
  Today, My work, Case disclosure, the deep link, mobile CSS, and a block
  asserting the board, ledger, decisions, timeline and the v0.8.1 domain
  guards are all still there.

One existing test was edited rather than weakened: `views.test.mjs` pinned
Today's old headline, which the specification replaces. The structural
assertion (exactly one `<h1>`) is unchanged and a second was added, holding
that the problem router is still on the page.

## What was not checked

**No browser walkthrough was performed.** §14, §15 and §19 all require one and
it did not happen — no browser was available to this session. What was done
instead was a scripted walk of the ten §19 tasks through the real domain and
the real view functions, which proves the affordance is in the markup and the
command works. It cannot tell you whether any of it is legible.

Unverified by eye, and all of them matter:

1. **Mobile at 390 / 430 px.** The CSS rules are tested; the rendering is not.
   §15 is an acceptance gate and it is open.
2. **Whether a deep-linked evidence item scrolls clear of the sticky header.**
   The code centres it; nobody has watched it.
3. **The walkthrough overlay** — whether it reads in under thirty seconds, and
   whether the focus trap behaves.
4. **Whether the topbar is comfortable at 390 px** now it carries a help
   control, with `.top-state` hidden at that width.

## Against the acceptance table

Honest marks. The three that must not regress are verifiable and verified; the
UX gates are not mine to award.

| Area | Gate | Where it stands |
| --- | ---: | --- |
| Evidence integrity | 10/10 | **Met.** The v0.8.1 controls are untouched and asserted by test. |
| Authority integrity | 10/10 | **Met.** Value gate, person-based approval and the strict execution boundary all intact; no personal-task path reaches them. |
| Auditability | 10/10 | **Met.** Decision snapshots, staleness, versioned evidence and the Case timeline unchanged. |
| Navigation simplicity | 9.5 | Built as specified. Two primary items, three under More. |
| Personal daily-task usefulness | 9.5 | Built as specified: title plus optional day, one-click states. |
| Case next-action clarity | 9.5 | Built as specified, and the missing way back was fixed. |
| Progressive disclosure | 9.5 | Built as specified; every disclosed surface is asserted still present. |
| First-use clarity | 9.5 | **Cannot be scored from here.** It needs an unbriefed buyer. |
| Mobile usability | 9.0 | **Not met — unverified.** Rules exist and are tested; no device, no eye. |

## What to do next

1. Open it at 1440, 430 and 390 px and walk the ten tasks in §19.
2. Give it to a buyer who has never seen it, say nothing, and watch where they
   stop. Record every hesitation; each one is a defect to consider.
3. Only then decide whether the UX gates are met.
