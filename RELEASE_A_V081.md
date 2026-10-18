# BuyrFlow Release A — v0.8.1

**Date:** 18 October 2026
**Responds to:** the independent audit of v0.8.0 (18 Oct 2026), findings A-1 to A-7.
**Verdict:** all seven are addressed. A-3 is reduced, not closed — identity cannot be verified without accounts, and the build now says so rather than implying otherwise.

## What changed, finding by finding

| ID | Finding | What v0.8.1 does | Held by |
| --- | --- | --- | --- |
| A-1 | A case with no recorded value never required a second approver, at any true value | `recordDecision` refuses until the value is recorded. `setCaseValue` records it after intake, because it is often unknown when somebody first describes a problem. `caseRisk` names it as an `authority` driver and `recommendation` asks for it one step before the refusal. The case screen shows "Not recorded" with a control rather than a dash. | 8 tests |
| A-2 | Natural problem statements were refused, with no manual fallback | A refusal keeps the person's words and offers the seven case types to choose from. The classifier gained the verb forms buyers use. A single keyword in a short phrase is a weak guess and the screen says to check it. | 5 tests |
| A-3 | The second approver was a lowercased name string | People are entities with ids. A decision records `deciderPersonId`; approving refuses when it resolves to that person. A *typed* approver is also refused when the name could be a variant of the decider's. Every approval stores `asserted: true` and the dialog says names are not verified. | 7 tests |
| A-4 | Malformed thousands separators were silently accepted | `parseMoneyToPence` validates the separators before stripping them. | 3 tests |
| A-5 | `>=` let a same-instant execution count as after the decision | `>`. | 3 tests |
| A-6 | Toasts covered case content | Alerts are in the flow above the content and push it down; transient confirmations may still float. | 2 tests |
| A-7 | The brief named a file that does not exist, and a stale version | Corrected. | — |

## A-3 is reduced, not closed

Worth stating plainly, because it is an authority control.

**What is now caught:** the decider approving their own decision, whether they type the same name, type a variant of it (`Jo Reid` → `J Reid`), or pick themselves from the people list.

**What is not:** anybody can still choose any person. There are no accounts, so nothing verifies that the human at the keyboard is who the record says. The heuristic is also narrow by design — `A Reid` approving `Jo Reid` is allowed, because refusing every shared surname would make the control unusable.

**What that means for a reviewer:** this records who *said* they approved it, not who did. Real segregation of duties needs authentication, which is Release B.

## How it was checked

- `npm run check`: syntax, then **126 tests** (96 at v0.8.0; 30 added). All pass on Node 22.
- **Each fix was reverted in turn to confirm its test fails without it.** A-3, A-4 and A-5 were checked this way; the first version of the A-3 test passed against the old code and was rewritten until it did not.
- The probes that found A-1 and A-2 were re-run against the new code.

## What was not checked

**Not walked in a browser.** This build's own `CLAUDE.md` asks for a walk at desktop and 390px before a change is called finished, and that did not happen — no browser was available to the session that made these changes.

Unverified by eye:

1. The type picker shown when classification refuses, including that its disabled placeholder cannot be submitted.
2. The "Not recorded · record it" control on the case screen, and `.linklike` at 390px where it is sized to a 44px target.
3. The approver picker, and whether "Someone else…" reads clearly beside the list.
4. The alert region now pushing content down rather than covering it — the A-6 fix is the one whose whole point is visual.

## Still open

- **No unbriefed buyer has used it.** A-2 was the largest obstacle; whether it is now enough is a question for a person, not a test.
- **Identity, properly.** See above.
- **Five of seven case types have a checklist and no calculation.** Depth on shortage and claim is worth more than breadth.
- **The brand question.** The review brief says cream, mint and pink; this build, the programme and buyrworld.com all say dark and lime. Unresolved, and not a code decision.
