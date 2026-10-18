# BuyrFlow Release A — v0.8.0

**Date:** 18 October 2026
**Responds to:** the independent audit of v0.7.0 (18 Oct 2026), findings BF-1 to BF-16.
**Verdict:** the three blockers and six high findings are fixed and held by tests. Release A is still a candidate, not a pass: no unbriefed buyer has used it, and two decisions only you can make are open (below).

## What changed, finding by finding

| ID | Finding | What v0.8.0 does | Held by |
| --- | --- | --- | --- |
| BF-1 | Any text closed a gap; the dialog pre-wrote the evidence | Receiving and judging are two steps. A reply is recorded in its own words (nothing pre-filled), then a named person marks it supports, contradicts or not enough. Only "supports" closes a gap; "contradicts" raises risk to Critical and must be acknowledged by name in any decision. | `tests/domain.test.mjs` BF-1; browser walk |
| BF-2 | Decisions not bound to evidence | Evidence is versioned, never overwritten. A decision freezes every item's text, version, source and verdict; it goes stale when material evidence changes or arrives; stale and legacy decisions cannot authorise execution. Decider name and role are required. | BF-2, authority tests |
| BF-3 | Lifecycle could be skipped | One lifecycle per kind of action (evidence, execution, workspace) in one table. Nothing closes except from Validate; Execute needs an authorising decision; an outcome needs an action executed after that decision and names the decision it validates. | BF-3 tests |
| BF-4 | Risk was one line | Named rules, each returning its inputs: evidence (gaps, contradictions, inference), timing (arrival against need date along the planned route), claim (ask against cap), concentration. | BF-4 tests |
| BF-5 | Arbitrary supplier score drove the decision | Removed. Quotes are compared on lead time, approval, price against the lowest quote in pence, and OTD. No ranking is pre-filled or frozen. | BF-5 tests, views test |
| BF-6 | Intake stored as fact; user cases could not reach suppliers | Intake is a CLAIM (who said it). Each case type starts with its own evidence checklist as gaps. Any case can link suppliers, with quotes. | BF-6 tests |
| BF-7 | Dates without years | ISO timestamps and dates everywhere; due dates are real dates and can be overdue. | event and views tests |
| BF-8 | `Date.now()` ids collided | UUIDs (with a fallback for non-secure contexts); counters for human references. | BF-8 tests; browser checks no duplicate ids |
| BF-9 | Two supplier lists joined by name | One Supplier entity; cases reference ids; duplicate names refused. | BF-9 tests |
| BF-10 | Keyword routing misrouted and false-refused | Whole-word rules, scored, with alternatives; the person can change the type before anything is created; new types for sourcing, specification and demand changes. | BF-10 tests |
| BF-11 | ASSUMED and DERIVED missing | ASSUMED needs a basis and is listed for acknowledgement; DERIVED is produced only by code. | BF-11 tests |
| BF-12 | Schema change wiped data; tabs overwrote each other | v0.7 data is migrated (dates kept as written, marked as having no year); the v0.7 key is left untouched as a backup. Export and Import JSON. A tab that sees another tab's save refuses to overwrite it. | BF-12 tests; browser two-tab check |
| BF-13 | iPhone zoom, small targets | 16px inputs and 44px targets at phone width. Measured in Chromium at 390px: 16px, 44px, no horizontal overflow. | `tests/mobile-css.test.mjs`; browser walk |
| BF-14 | Tests searched source text | 96 behavioural tests on `node:test`, all through `apply()`; the grep suite is gone. | `npm run check` |
| BF-15 | Inline code, no headers, internal docs public | Static shell with external modules, a CSP with no `unsafe-inline`, security headers, the programme and audit no longer served. `vercel.json` makes it deployable as a static site. | `tests/server.test.mjs` |
| BF-16 | Dialog Escape worked once; focus lost | Escape works at any time; focus is trapped in the dialog and returned afterwards; the page behind is inert and does not scroll. | browser walk |

Also fixed: the production logo is now bundled (`public/buyrworld-logo.png`) instead of hotlinked, which was Release A blocker 2 in the v0.7 audit.

## The two calculations

- **Shortage:** for each supplier on the case, arrival if ordered today against the need date, in calendar days. AMS5599: Northstar arrives 29 Dec 2026, 18 days late; Aven 26 Nov, 15 days spare (as of 18 Oct 2026).
- **Claim:** the ask against the contract cap on annual spend, in integer pence and basis points. NI718: +7.80% against a 4.00% cap is 3.80 points, £8,846.40 a year.

Both withhold the figure, and say what is missing, rather than guessing.

## How it was checked

- `npm run check`: syntax, then 96 tests. All pass on Node 22.
- A scripted walk in headless Chromium at 1280px and 390px: set the user, an intake refused then accepted, a reply recorded and assessed, a decision refused until the inference was acknowledged, execution, the outcome, Escape after typing, and a second tab's save blocking the first. No console or page errors other than the Google Fonts request, which the sandbox blocks. Screenshots are in `docs/screenshots/`.

## What is not done, and why

1. **Brand direction is unresolved.** The review brief describes the production identity as cream/white with mint and pink; the programme's Stage 1, this build and buyrworld.com are all dark with lime. This build keeps dark and lime. Stage 1's gate cannot be marked until you choose.
2. **The authority threshold is a placeholder.** Second approval above £250,000 is a review-build default, editable on the Decisions page. Set it to your delegation of authority.
3. **No unbriefed user has used it.** The browser walk proves the controls work, not that a junior buyer understands them in 60 seconds.
4. **Not yet integrated with buyrworld.com's engines.** Release B should build BuyrFlow on the live repo's `src/domain` and `src/case` rather than keep two case models.
5. **Storage is one browser.** Accounts, multi-user storage and hosting remain out of Release A, as the programme intends.
