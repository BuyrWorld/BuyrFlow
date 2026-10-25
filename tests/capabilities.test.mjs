/**
 * Release B, Stage 5 — the Price Increase Defender as a capability.
 *
 * Stage 5 says existing engines consume case context and return structured
 * evidence, and that watered-down copies must not be rebuilt. So the test
 * that matters most here is the first one: that the engine in this repo is
 * byte-for-byte the engine in buyrworld.com, not a version of it that has
 * quietly drifted into a second implementation.
 *
 * The rest check the seam. A capability proposes; it never decides, and
 * nothing it returns can reach a gate.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import * as D from "../public/domain.js";
import * as V from "../public/views.js";
import { defender, CAPABILITIES, capabilityById, capabilitiesFor } from "../public/capabilities.js";
import { workspace, refused, MANAGER } from "./helpers.mjs";

const provenance = JSON.parse(readFileSync("public/engine/PROVENANCE.json", "utf8"));

/* ------------------------------------------------- the engine is the engine */

describe("the vendored engine has not drifted", () => {
  test("every file matches the hash recorded when it was carried over", () => {
    const files = Object.entries(provenance.sha256);
    assert.ok(files.length >= 4, "the provenance record lists fewer files than were vendored");
    for (const [file, expected] of files) {
      const actual = createHash("sha256").update(readFileSync(`public/engine/${file}`)).digest("hex");
      assert.equal(actual, expected,
        `public/engine/${file} has been edited here. A fix belongs in buyrworld.com and arrives by re-vendoring.`);
    }
  });

  test("the record covers every engine file, so one cannot be added unrecorded", () => {
    const onDisk = readdirSync("public/engine").filter((f) => f.endsWith(".mjs")).sort();
    assert.deepEqual(onDisk, Object.keys(provenance.sha256).sort(),
      "a file in public/engine/ is not in the provenance record, or the record names one that is gone");
  });

  test("it says where it came from, exactly", () => {
    assert.match(provenance.source.commit, /^[0-9a-f]{40}$/, "the source commit is not pinned");
    assert.ok(provenance.source.repository, "no source repository recorded");
    assert.ok(provenance.resync, "there is no recorded way back to the source");
  });

  test("the seam calls the engine rather than carrying its own arithmetic", () => {
    const cap = readFileSync("public/capabilities.js", "utf8");
    assert.match(cap, /import \{ costBridge.*\} from "\.\/engine\/cost-bridge\.mjs"/);
    assert.doesNotMatch(cap, /function costBridge/, "the engine was reimplemented in the seam");
  });
});

/* ------------------------------------------------------------------ fixtures */

/** A claim case, with whatever the Defender needs supplied through apply(). */
function claim({ askBp = null, baseline = false, drivers = [] } = {}) {
  const w = workspace();
  const out = w.step({
    type: "createCase", caseType: "claim", title: "Nickel surcharge",
    statement: "The supplier wants considerably more money from January.",
    ...(Number.isInteger(askBp) ? { askBp } : {}),
  });
  const id = out.result.caseId;
  if (baseline) w.step({ type: "setClaimBaseline", caseId: id, unitPricePence: 1_000_00, annualVolume: 5000 });
  for (const d of drivers) w.step({ type: "addClaimDriver", caseId: id, ...d });
  return { w, id, c: () => w.state.cases.find((x) => x.id === id) };
}

/* 50% of the price is nickel, which moved 10%; 20% is energy, up 5%.
   Warranted: 0.5 × 10% + 0.2 × 5% = 6.00% exactly. */
const NICKEL = { label: "Nickel", weightBp: 5000, movementBp: 1000, source: "LME cash settlement" };
const ENERGY = { label: "Energy", weightBp: 2000, movementBp: 500, source: "Ofgem" };

/* ---------------------------------------------------- what it needs, and says */

describe("the Defender withholds rather than guessing", () => {
  test("it applies to a claim and to nothing else", () => {
    const w = workspace();
    assert.equal(defender.appliesTo(w.case("NI718")), true);
    assert.equal(defender.appliesTo(w.case("AMS5599")), false);
    assert.deepEqual(capabilitiesFor(w.case("AMS5599")), []);
    assert.deepEqual(capabilitiesFor(w.case("NI718")).map((x) => x.id), ["defender"]);
  });

  test("with nothing recorded it names what it needs, and computes nothing", () => {
    const { c } = claim();
    const r = defender.run(c());
    assert.equal(r.ok, false);
    assert.match(r.withheld, /^Needs /);
    assert.ok(r.missing.length >= 3, `only named ${r.missing.length}: ${r.missing.join("; ")}`);
    assert.equal(r.warrantedBp, undefined, "it produced a figure despite missing inputs");
    assert.equal(r.evidence, undefined, "it produced evidence despite missing inputs");
  });

  test("a baseline alone is still not enough, and it says which part is absent", () => {
    const { c } = claim({ askBp: 900, baseline: true });
    const r = defender.run(c());
    assert.equal(r.ok, false);
    assert.match(r.withheld, /cost driver/);
    assert.ok(!r.missing.some((m) => /unit price|annual volume/.test(m)),
      "it asked again for something already recorded");
  });

  test("drivers without a baseline are not enough either", () => {
    const { c } = claim({ askBp: 900, drivers: [NICKEL] });
    const r = defender.run(c());
    assert.equal(r.ok, false);
    assert.match(r.withheld, /unit price/);
  });
});

/* --------------------------------------------------------- it actually runs */

describe("the Defender decomposes a real ask", () => {
  const ready = (askBp) => claim({ askBp, baseline: true, drivers: [NICKEL, ENERGY] });

  test("the weighted decomposition is exact", () => {
    const r = defender.run(ready(900).c());
    assert.equal(r.ok, true);
    assert.equal(r.warrantedBp, 600, "0.5×10% + 0.2×5% should warrant exactly 6.00%");
    assert.equal(r.gapBp, 300, "9.00% asked against 6.00% warranted leaves 3.00 points unevidenced");
  });

  test("the figures survive the round trip through the engine's own scale", () => {
    /* bp → Ratio → bp is where a float would show up. An awkward figure that
       is not a round number of basis points is the one that would break. */
    const r = defender.run(claim({
      askBp: 783, baseline: true,
      drivers: [{ label: "Alloy", weightBp: 3333, movementBp: 1777 }],
    }).c());
    assert.equal(r.warrantedBp, 592, "0.3333 × 17.77% = 5.9237…%, truncated by the engine to 5.92%");
    assert.equal(r.gapBp, 783 - 592);
    assert.equal(Number.isInteger(r.warrantedBp), true, "a non-integer reached a figure");
  });

  test("it says what it found in words a buyer can use", () => {
    const r = defender.run(ready(900).c());
    assert.match(r.evidence.text, /asks for 9\.00%/);
    assert.match(r.evidence.text, /warrants 6\.00%/);
    assert.match(r.evidence.text, /3\.00% of the ask is not supported/);
    assert.match(r.evidence.basis, /2 drivers/);
  });

  test("the share of the price nobody has explained is surfaced, not buried", () => {
    /* Two drivers cover 70% of the price. The other 30% is treated as
       unchanged, which is an assumption and has to read as one. */
    const unexplained = defender.run(ready(900).c()).assumptions.find((a) => a.id === "unexplained-weight");
    assert.ok(unexplained, "nothing said that 30% of the price is unaccounted for");
    assert.match(unexplained.text, /30\.00%/);
  });

  test("where the evidence supports the ask, it does not invent a gap", () => {
    const r = defender.run(ready(600).c());
    assert.equal(r.gapBp, 0);
    assert.match(r.evidence.text, /agree/);
    assert.deepEqual(r.work, [], "it suggested chasing a gap that does not exist");
  });

  test("where the drivers support more than is asked, it says so plainly", () => {
    const r = defender.run(ready(400).c());
    assert.equal(r.gapBp, -200);
    assert.match(r.evidence.text, /support more than is being asked/);
    assert.deepEqual(r.work, []);
  });

  test("it suggests work for the unevidenced part, and only suggests it", () => {
    const { w, c } = ready(900);
    const before = w.state.actions.length;
    const r = defender.run(c());
    assert.equal(r.work.length, 1);
    assert.match(r.work[0].title, /3\.00%/);
    assert.ok(r.work[0].why, "the suggested work does not say why");
    assert.equal(w.state.actions.length, before, "a capability created governed work by itself");
  });

  test("the contract cap is left to claimExcess, so the two answers stay separate", () => {
    /* NI718 is seeded asking 7.80% against a 4.00% contractual cap. The
       Defender must not fold that cap into the warranted figure: a gap of
       "unevidenced" and a breach of a cap are different arguments. */
    const w = workspace();
    const id = w.case("NI718").id;
    w.step({ type: "setClaimBaseline", caseId: id, unitPricePence: 1_000_00, annualVolume: 5000 });
    w.step({ type: "addClaimDriver", caseId: id, ...NICKEL });
    const c = w.state.cases.find((x) => x.id === id);
    assert.equal(c.claim.capBp, 400, "the fixture no longer has a cap, so this proves nothing");
    const r = defender.run(c);
    assert.equal(r.warrantedBp, 500, "the 4.00% cap was folded into the evidence answer");
    assert.equal(D.claimExcess(c).excessBp, 380, "the contract test changed");
  });
});

/* ------------------------------------- what the drivers themselves must satisfy */

describe("recording a driver is governed like everything else", () => {
  test("drivers cannot add up to more than the whole price", () => {
    const { w, id } = claim({ askBp: 900, baseline: true, drivers: [NICKEL, ENERGY] });
    const said = refused(() => w.step({ type: "addClaimDriver", caseId: id, label: "Freight", weightBp: 4000, movementBp: 100 }), "weight");
    assert.match(said, /more than the whole price/);
  });

  test("a driver needs a share and a movement, and a fall is allowed", () => {
    const { w, id, c } = claim({ askBp: 900, baseline: true });
    refused(() => w.step({ type: "addClaimDriver", caseId: id, label: "X", weightBp: 0, movementBp: 100 }), "weight");
    refused(() => w.step({ type: "addClaimDriver", caseId: id, label: "X", weightBp: 100 }), "movement");
    refused(() => w.step({ type: "addClaimDriver", caseId: id, weightBp: 100, movementBp: 100 }), "label");
    w.step({ type: "addClaimDriver", caseId: id, label: "Scrap credit", weightBp: 100, movementBp: -200 });
    assert.equal(c().claim.drivers.at(-1).movementBp, -200);
  });

  test("a baseline refuses a nonsense price or volume rather than defaulting one", () => {
    const { w, id } = claim();
    refused(() => w.step({ type: "setClaimBaseline", caseId: id, unitPricePence: 0, annualVolume: 5000 }), "price");
    refused(() => w.step({ type: "setClaimBaseline", caseId: id, unitPricePence: 1000, annualVolume: 0 }), "volume");
  });

  test("neither belongs on a case that is not a claim", () => {
    const w = workspace();
    const id = w.case("AMS5599").id;
    refused(() => w.step({ type: "addClaimDriver", caseId: id, label: "Nickel", weightBp: 100, movementBp: 100 }), "type");
    refused(() => w.step({ type: "setClaimBaseline", caseId: id, unitPricePence: 1000, annualVolume: 10 }), "type");
  });

  test("recording one leaves a timeline entry naming the figures", () => {
    const { w, id } = claim({ askBp: 900, baseline: true, drivers: [NICKEL] });
    const said = w.state.events.filter((e) => e.caseId === id).map((e) => e.text).join("\n");
    assert.match(said, /Nickel: 50\.00% of the price, moved 10\.00%/);
    assert.match(said, /a unit, 5000 a year/);
  });
});

/* -------------------------------------- what it writes, and what it cannot do */

describe("a capability's output is evidence, not authority", () => {
  const run = (askBp = 900) => {
    const f = claim({ askBp, baseline: true, drivers: [NICKEL] });
    return { ...f, result: defender.run(f.c()) };
  };

  const record = ({ w, id, result }) => w.step({
    type: "runCapability", caseId: id, capabilityId: "defender",
    capabilityLabel: defender.label, result,
  });

  test("it is recorded as DERIVED, because code produced it", () => {
    const f = run();
    record(f);
    const e = f.c().evidence.find((x) => x.capabilityId === "defender");
    assert.ok(e, "nothing was recorded");
    assert.equal(D.current(e).state, D.STATE.DERIVED);
    assert.match(D.current(e).source.from, /Price Increase Defender \(calculated\)/);
    assert.equal(D.evidenceStatus(e), "derived");
  });

  test("running it again versions the evidence rather than overwriting it", () => {
    const f = run();
    record(f);
    /* A new driver changes what the evidence warrants, so the second run says
       something different. The first version has to still say the first thing. */
    f.w.step({ type: "addClaimDriver", caseId: f.id, ...ENERGY });
    record({ ...f, result: defender.run(f.c()) });
    const e = f.c().evidence.find((x) => x.capabilityId === "defender");
    assert.equal(e.versions.length, 2);
    assert.match(e.versions[0].text, /warrants 5\.00%/);
    assert.match(e.versions[1].text, /warrants 6\.00%/);
    assert.equal(e.versions[0].v, 1);
    assert.equal(e.versions[1].v, 2);
  });

  test("a withheld result writes nothing at all", () => {
    const f = claim();                       // nothing recorded, so it withholds
    const before = f.c().evidence.length;
    const said = refused(() => f.w.step({
      type: "runCapability", caseId: f.id, capabilityId: "defender", result: defender.run(f.c()),
    }), "withheld");
    assert.match(said, /Needs /, "the refusal did not pass on what the capability said it needed");
    assert.equal(f.c().evidence.length, before);
  });

  test("a result that is not a capability's is refused too", () => {
    const f = run();
    refused(() => f.w.step({ type: "runCapability", caseId: f.id, capabilityId: "x", result: null }), "result");
    refused(() => f.w.step({
      type: "runCapability", caseId: f.id, capabilityId: "x", result: { ok: true, evidence: { title: "Made up" } },
    }), "evidence");
  });

  test("its evidence does not make a case decidable", () => {
    /* The point of the whole seam: a capability can fill a Case with findings
       and move it not one step closer to a decision. The gaps are unchanged. */
    const f = run();
    record(f);
    refused(() => f.w.step({
      type: "recordDecision", caseId: f.id, title: "Accept",
      rationale: "The capability worked it out.", decider: MANAGER,
    }), "gaps");
  });

  /** Close every open question, so only the governed gates are left standing. */
  function closeTheQuestions({ w, c }) {
    for (const e of c().evidence.filter((x) => x.material && x.question)) {
      w.step({ type: "receiveEvidence", evidenceId: e.id, text: "Provided in full.", source: { from: "Supplier" } });
      w.step({ type: "assessEvidence", evidenceId: e.id, verdict: D.VERDICT.SUPPORTS, note: "Checked against the contract." });
    }
  }

  test("and the value gate still bites, capability or no capability", () => {
    const f = run();
    record(f);
    closeTheQuestions(f);
    refused(() => f.w.step({
      type: "recordDecision", caseId: f.id, title: "Challenge the gap",
      rationale: "Three points are unevidenced.", decider: MANAGER,
    }), "value");
  });

  test("once the gates are satisfied, the finding is frozen into the decision", () => {
    const f = run();
    record(f);
    closeTheQuestions(f);
    f.w.step({ type: "setCaseValue", caseId: f.id, valuePence: 1_000_000 });
    const out = f.w.step({
      type: "recordDecision", caseId: f.id, title: "Challenge the unevidenced part",
      rationale: "Four points of the nine asked for have nothing behind them.", decider: MANAGER,
    });
    const d = f.w.state.decisions.find((x) => x.id === out.result.decisionId);
    const cited = d.snapshot.evidence.find((x) => x.title === "What the cost drivers warrant");
    assert.ok(cited, "the decision snapshot does not carry the capability's finding");
    assert.equal(cited.state, D.STATE.DERIVED);
    assert.match(cited.text, /warrants 5\.00%/, "the snapshot did not freeze what it said");
  });

  test("re-running it after a decision makes that decision stale", () => {
    /* A capability is not exempt from the rule that a decision goes stale when
       material evidence changes under it. */
    const f = run();
    record(f);
    closeTheQuestions(f);
    f.w.step({ type: "setCaseValue", caseId: f.id, valuePence: 1_000_000 });
    const out = f.w.step({
      type: "recordDecision", caseId: f.id, title: "Challenge it",
      rationale: "Four points are unevidenced.", decider: MANAGER,
    });
    const before = D.decisionStatus(f.w.state, f.w.state.decisions.find((x) => x.id === out.result.decisionId));
    assert.equal(before.status, "authorising");

    f.w.step({ type: "addClaimDriver", caseId: f.id, ...ENERGY });
    record({ ...f, result: defender.run(f.c()) });
    const after = D.decisionStatus(f.w.state, f.w.state.decisions.find((x) => x.id === out.result.decisionId));
    assert.equal(after.status, "stale");
    assert.match(after.said, /What the cost drivers warrant changed since/);
  });

  test("no capability can reach a commercial command", () => {
    const cap = readFileSync("public/capabilities.js", "utf8");
    for (const governed of ["advanceAction", "closeAction", "recordDecision", "approveDecision", "recordOutcome"]) {
      assert.doesNotMatch(cap, new RegExp(governed), `the capability layer reaches ${governed}`);
    }
    assert.doesNotMatch(cap, /\bapply\s*\(/, "the capability layer calls apply() itself");
  });

  test("the registry is a list, so Stage 5's remaining capabilities have somewhere to go", () => {
    assert.equal(CAPABILITIES.length, 1);
    assert.equal(capabilityById("defender"), defender);
    assert.equal(capabilityById("quote-comparator"), null);
    for (const key of ["id", "label", "says", "appliesTo", "missing", "run"]) {
      assert.ok(key in defender, `the capability contract has no "${key}"`);
    }
  });
});

/* ============================================ what the Case page says about it */

describe("the Case page offers the capability honestly", () => {
  const ctx = { today: "2026-10-18", params: new URLSearchParams("?id=C-NI"), pendingIntake: null, intakeMessage: null };
  const page = (s) => V.renderCases(s, ctx);

  test("a claim case offers it; a shortage case does not", () => {
    const s = D.seedState();
    assert.match(page(s), /Price Increase Defender/);
    const shortage = V.renderCases(s, { ...ctx, params: new URLSearchParams("?id=C-AMS") });
    assert.doesNotMatch(shortage, /Price Increase Defender/);
    assert.doesNotMatch(shortage, /Add a cost driver/);
  });

  test("before it can run, the page says what is missing instead of a dead button", () => {
    const html = page(D.seedState());
    assert.match(html, /Not enough recorded yet/);
    assert.match(html, /cost driver/);
    assert.doesNotMatch(html, /data-action="run-capability"/, "it offered to run with inputs missing");
    assert.match(html, /data-action="claim-baseline"/, "no way to supply what it asked for");
    assert.match(html, /data-action="claim-driver"/);
  });

  test("once it can run, the button appears and the gap wording goes", () => {
    const w = workspace();
    const id = w.case("NI718").id;
    w.step({ type: "setClaimBaseline", caseId: id, unitPricePence: 1_000_00, annualVolume: 5000 });
    w.step({ type: "addClaimDriver", caseId: id, ...NICKEL });
    const html = page(w.state);
    assert.match(html, /data-action="run-capability"[^>]*data-cap="defender"/);
    assert.doesNotMatch(html, /Not enough recorded yet/);
    assert.match(html, /£1,000\.00<\/strong> a unit/);
  });

  test("the share of the price nobody has explained is on the page, not only in the result", () => {
    const w = workspace();
    const id = w.case("NI718").id;
    w.step({ type: "setClaimBaseline", caseId: id, unitPricePence: 1_000_00, annualVolume: 5000 });
    w.step({ type: "addClaimDriver", caseId: id, ...NICKEL });
    const html = page(w.state);
    assert.match(html, /These cover 50\.00% of the price/);
    assert.match(html, /remaining 50\.00% is unexplained and is treated as unchanged/);
  });

  test("the page says a capability produces evidence, not a decision", () => {
    assert.match(page(D.seedState()), /produces evidence, never a decision/);
  });

  test("a recorded finding is shown with its version and a link to the ledger", () => {
    const w = workspace();
    const id = w.case("NI718").id;
    w.step({ type: "setClaimBaseline", caseId: id, unitPricePence: 1_000_00, annualVolume: 5000 });
    w.step({ type: "addClaimDriver", caseId: id, ...NICKEL });
    const c = w.state.cases.find((x) => x.id === id);
    w.step({ type: "runCapability", caseId: id, capabilityId: "defender", capabilityLabel: defender.label, result: defender.run(c) });
    const html = page(w.state);
    assert.match(html, /What it found — derived, version 1/);
    assert.match(html, /warrants 5\.00%/);
    assert.match(html, /See it in the evidence ledger/);
    assert.match(html, /Run it again/);
  });

  test("a driver label from a person is escaped like everything else", () => {
    const w = workspace();
    const id = w.case("NI718").id;
    w.step({ type: "addClaimDriver", caseId: id, label: `<img src=x onerror="alert(1)">`, weightBp: 100, movementBp: 100,
      source: `"><script>alert(2)</script>` });
    const html = page(w.state);
    assert.doesNotMatch(html, /<img src=x/);
    assert.doesNotMatch(html, /<script>alert\(2\)/);
    assert.match(html, /&lt;img src=x/);
  });

  test("the page renders nothing undefined once a capability has run", () => {
    const w = workspace();
    const id = w.case("NI718").id;
    w.step({ type: "setClaimBaseline", caseId: id, unitPricePence: 1_000_00, annualVolume: 5000 });
    w.step({ type: "addClaimDriver", caseId: id, ...NICKEL });
    w.step({ type: "addClaimDriver", caseId: id, ...ENERGY });
    const c = w.state.cases.find((x) => x.id === id);
    w.step({ type: "runCapability", caseId: id, capabilityId: "defender", capabilityLabel: defender.label, result: defender.run(c) });
    assert.doesNotMatch(page(w.state), /undefined|NaN|\[object Object\]/);
  });
});
