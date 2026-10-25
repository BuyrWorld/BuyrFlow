# BuyrFlow Release B, Stage 5 — tools become capabilities

**Date:** 25 October 2026
**Implements:** `FLAGSHIP_IMPLEMENTATION_PROGRAM.md` → Release B, Stage 5
**Baseline:** v0.9.1 — 187 tests, 35 suites
**Now:** 230 tests, 42 suites, all passing on Node 22

**Verdict: the slice is done; the release is not.** One of the seven named
capabilities is built, end to end, on a seam the other six can use. The
browser walkthrough has still not happened — see *What was not checked* — and
Stage 5 is not finished until the remaining six exist.

## What Stage 5 asked for

> Do not rebuild watered-down copies. Existing engines should consume case
> context and return structured evidence.
>
> `consume case -> create structured evidence -> recommend work -> feed
> BuyrFlow -> update case`

Taken literally. The Price Increase Defender in BuyrFlow does no arithmetic
of its own.

## The engine is buyrworld.com's, byte for byte

`public/engine/` holds `exact.mjs`, `index-series.mjs`, `fx.mjs` and
`cost-bridge.mjs`, copied unmodified from buyrworld.com at commit
`10f6b661bf14304c59a504e2ce1b38a231e31012`. `PROVENANCE.json` records a
SHA-256 for each and the procedure for re-vendoring.

They are never edited here. A fix belongs in buyrworld.com and arrives by
re-vendoring — and `node tools/engine-hashes.mjs --check` runs first in
`npm run check`, so an edit made here fails the build with a message saying
where the fix belongs. That check is what keeps "do not rebuild watered-down
copies" true after the commit that said it.

The first attempt at this recorded the wrong hashes. `core.autocrlf=true` had
given the working copy CRLF line endings, the hashes were taken from those,
and they matched nothing upstream — so the record asserted "byte-for-byte"
while describing different bytes. Caught by cloning the repository into a
temporary directory and running the suite there, which is now the only way to
see it: `.gitattributes` marks `public/engine/** -text` so git never rewrites
a line ending in them, and the four recorded hashes are the upstream blob
hashes exactly.

The four files were chosen by following the import graph: they are the
closure of `cost-bridge.mjs` and pull in nothing else, inside or outside the
repository.

## The seam

`public/capabilities.js`. A capability is an object with six members — `id`,
`label`, `says`, `appliesTo`, `missing`, `run` — and `CAPABILITIES` is a list,
so the remaining six have somewhere to go without a second design.

Two rules the seam exists to keep, both under test:

- **It withholds rather than guessing.** Missing inputs come back as a named
  list and no figure at all. A missing input is not an input of zero.
- **It proposes; it never decides.** `run()` returns structured evidence and
  suggested work. It cannot reach `apply()`, and a test reads the file to
  prove it does not name `recordDecision`, `approveDecision`, `advanceAction`,
  `closeAction` or `recordOutcome`.

## The Price Increase Defender

A supplier asks for more. The engine decomposes the ask across the recorded
cost drivers and returns the change the evidence warrants; the part it does
not warrant is what a buyer negotiates against.

It answers a **different question** from the Case's existing `claimExcess`:

| | Question | Fails when |
| --- | --- | --- |
| `claimExcess` | Does the ask breach the contract cap? | ask > cap |
| Defender | Do the cost drivers warrant the ask? | ask > weighted movement |

A claim can fail either, both or neither, so both are shown. The Defender is
deliberately **not** passed the contract cap: capping the warranted figure at
the contract ceiling would make the gap it reports include a part the drivers
do support, and describe it as unevidenced. One question per answer.

### Commands added

| Command | What it records |
| --- | --- |
| `setClaimBaseline` | Unit price in pence, annual volume. Refuses zero or a non-integer rather than defaulting one. |
| `addClaimDriver` | A driver's label, its share of the price in basis points, how far it moved, and the source. Refuses a set of drivers totalling more than the whole price. A fall is negative and lowers what the ask can be justified by. |
| `runCapability` | Writes what a capability produced as `DERIVED` evidence, versioned and never overwritten. Refuses a withheld result, passing on the capability's own sentence. |

`DERIVED` is produced only by code, which is why `runCapability` takes a
result object rather than text.

### What the output can and cannot do

A capability can fill a Case with findings and move it **not one step** closer
to a decision. Proved by test:

- its evidence does not close a gap, so `recordDecision` still refuses;
- the value gate still refuses a case with no recorded value;
- re-running it after a decision makes that decision **stale**, like any other
  material evidence changing underneath one;
- the finding is frozen verbatim into the decision snapshot.

## On the page

A **Capabilities** panel on claim cases, above the supplier positions:

- what the capability does, in a sentence;
- what is still missing, named — never a disabled button with no explanation;
- the drivers recorded, with the share of the price **nobody has explained**
  stated on the page rather than only inside a result;
- **Run it**, which shows the finding, its basis, what it had to assume and
  what it suggests — and records nothing until a second press. What goes into
  the ledger is evidence somebody chose to put there.

Three new actions: `claim-baseline`, `claim-driver`, `run-capability`, each in
the `ACTIONS` table, none an inline handler.

## Tests

230 passing, 42 suites, up from 187/35. All 43 new ones are in
`tests/capabilities.test.mjs` and `tests/server.test.mjs`.

Seven mutations were introduced deliberately and each was caught by exactly
the test meant to catch it:

| Mutation | Caught by |
| --- | --- |
| Edit a vendored engine file | the hash drift test |
| Fold the contract cap into the warranted figure | the cap-separation test |
| Let a withheld result write evidence | "a withheld result writes nothing at all" |
| Overwrite evidence instead of versioning it | "running it again versions the evidence" |
| Write capability output as `SUPPLIED` | two tests |
| Drop the driver weight ceiling | "drivers cannot add up to more than the whole price" |
| Remove `capabilities.js` from the server allow-list | the module-graph test |
| Add a file to `public/engine/` without recording it | the record-coverage test |

The allow-list one matters more than it looks. The server serves an
allow-list, and a 404 inside an ES module graph takes down the whole
application rather than the feature that needed it — so the test now walks
the imports from the page's entry module and fetches every one. Vendoring the
engine added five files to that graph in a single commit.

## Exact arithmetic

Unchanged and extended. Two float expressions that had crept into figures
shown to a person were removed while wiring this up:

- `(unitPricePence / 100).toFixed(2)` in the capability's basis line → `formatPence`;
- `(weightBp / 100).toFixed(2)` in two `addClaimDriver` timeline messages → `formatBp`.

Basis points convert to the engine's 1e9-scaled Ratio and back through integer
BigInt arithmetic only. A test runs an awkward figure — 33.33% of the price
moving 17.77% — through the round trip and pins the result at 5.92%.

## What was not checked

Said plainly, because the project's rules require it:

- **No browser walkthrough.** Not at desktop width, not at 390px. The
  stylesheet rules for phone width are asserted by reading the CSS, which
  proves the rules exist and nothing about how the panel looks. The new
  dialogs have never been opened by a person.
- **No screen reader.** The panel's heading order and table captions follow
  the existing pattern; that is a resemblance argument, not a test.
- **Six of seven capabilities do not exist.** Quote Comparator, RFQ Generator,
  Should-Cost, drawing/spec/material analysis, contract/evidence review and
  supply risk. Stage 5 is not complete.
- **Nobody has run the Defender against a real supplier letter.** The drivers
  are typed in by hand; there is no extraction path into them yet.
