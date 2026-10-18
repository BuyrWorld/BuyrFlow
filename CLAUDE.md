# BuyrFlow — rules for changing it

Read this before changing anything. Each rule closes a finding from the 18 Oct 2026 audit.

## The one door

- **State changes only through `apply(state, command, actor, ctx)` in `public/domain.js`.** The page, the tests and any future agent use it. Nothing else assigns to state. A test that mutates state directly is a broken test.
- **Every command needs an actor** (name and role). Every event gets an ISO timestamp and that actor.
- **A refusal is a `Refusal` with a code and a sentence a person can act on.** Show it where they are looking; save nothing.

## Personal work and governed work

- **A personal task is not an action.** Tasks live in `state.personalTasks`, never in `state.actions`, so `openActions()` cannot see them and they can neither block nor unblock a decision or an outcome. `advanceAction` and `closeAction` resolve ids out of `actions`, so a task id does not exist to them.
- **Linking a task to a Case confers nothing.** It records a relationship. A task on a Case is still a task: no evidence rules, no approval, and no entry in the Case timeline.
- **A task asks for a title and, optionally, a day.** Never a completion test, a stage, an evidence state, a kind or an expected result. If a personal task ever seems to need those, it was governed work all along.
- **Making the surface simple is never permission to simplify the engine.** The controls below are the product.

## Evidence

- **Receiving is not judging.** A reply is recorded in its own words, then a named person assesses it: supports, contradicts, or not enough. Only "supports" closes a gap.
- **Never pre-fill evidence text.** Not the content, not the conclusion. Metadata such as the sender may be suggested.
- **Evidence is versioned, never overwritten.**
- **DERIVED is produced only by code. ASSUMED needs a basis.** A decision resting on anything that is not evidence (inferred, assumed, claimed, contradicted) must acknowledge it by name.

## Decisions and work

- A decision freezes the text of everything it saw, needs a decider's name and role, and goes stale when material evidence changes.
- Above the second-approval threshold, a different person must approve before execution.
- **A gate's trigger is part of the gate.** The threshold is applied to the case value, so a decision is refused until that value is recorded — an optional input under a control means the control never fires. Intake may leave it unknown; `setCaseValue` records it later, and the risk and the recommendation both name it meanwhile.
- **People are entities, not names.** A decision records a `deciderPersonId`, and a second approval is refused when it resolves to that person. A *typed* approver is also refused when the name could be a variant of the decider's, because a new spelling is a new person to any registry; picking somebody from the list is the deliberate way past that. **None of this is verification** — Release A has no accounts, every approval is stored `asserted: true`, and the screen says so.
- **An outcome needs an execution strictly after its decision.** `>`, not `>=`: on a fixed clock, equal timestamps would let work done before the decision satisfy it.
- One lifecycle per kind of action, in `LIFECYCLE`. Nothing closes except from Validate. An outcome needs an action executed after its decision.

## Numbers

- **Money is integer pence; rates are integer basis points.** Multiply-divide through `mulDivRound` (BigInt, half-up). No floats in any figure shown to a person.
- **Validate a number before reshaping it.** `parseMoneyToPence` checks the separators before stripping them: stripping first turned "12,34.56" into £1,234.56, a mistyped figure silently becoming a plausible different one.
- **A missing input withholds the figure** and says what is missing. Never guess, never default a number.
- **No composite supplier score.** Weighting criteria into one number is the customer's policy decision, not this build's.

## The way in

- **Classification is a guess, and a refusal is never a dead end.** Where nothing matches, the person picks the kind themselves and their words are kept. Telling somebody to rephrase asks them to guess which verbs a table holds.
- **Match the verbs buyers use, not only the nouns a system would.** "Run out", "miss", "find someone else" are how the problem arrives.
- **Say how sure it is.** One keyword out of a short phrase is a weak guess and is labelled as one.

## The first screen

- **Today is one person's day, not the workspace's metrics.** Due today, overdue, waiting, needs a decision — with the portfolio figures one disclosure down.
- **Progressive disclosure, never deletion.** The board, the evidence ledger, the risk driver inputs, the decisions and the timeline all still render; they stopped going first. A test asserts each is still present.
- **A deep link opens what it points at.** An evidence anchor inside a closed disclosure is a broken link, so arriving by hash opens it and a callout says why the reader is there.
- **Translate stage names at the presentation layer only** — `plainStage()` in views.js. Never rename a domain constant for display.

## Page

- `views.js` is pure; `app.js` owns the DOM. Everything from a person or a record goes through `esc()`.
- No inline script, style or event handler: the CSP forbids them.
- Phone width: 16px inputs, 44px targets. Check at 390px before calling a screen done.
- **An alert belongs in the flow; a confirmation may float.** A message asking somebody to act is placed above the content and pushes it down — pinned over the page, it covered the case title it was about. A toast confirming what just happened may stay fixed.

## Before you say it is finished

- `npm run check` passes.
- Walk the change in a real browser at desktop and 390px width.
- Say plainly what was not checked.
