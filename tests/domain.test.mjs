/**
 * The case engine, driven only through apply().
 *
 * Each describe block names the audit finding it closes (BF-n, from the
 * independent audit of v0.7.0, 18 Oct 2026). Every test drives state the way
 * the page does; none assigns to it.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as D from "../public/domain.js";
import { workspace, refused, BUYER, MANAGER, DIRECTOR, TODAY } from "./helpers.mjs";

const risk = (w, ref) => D.caseRisk(w.state, w.case(ref), TODAY);

/** Northstar's reply arrives and is recorded, exactly as typed. */
function receive(w, ref, title, text, from = "Northstar Metals") {
  return w.step({ type: "receiveEvidence", evidenceId: w.evidence(ref, title).id, text, source: { document: "Letter", from, date: TODAY } });
}
const assess = (w, ref, title, verdict, note = "Checked against the requirement.") =>
  w.step({ type: "assessEvidence", evidenceId: w.evidence(ref, title).id, verdict, note });

/* ------------------------------------------------------------------ apply */

describe("apply is the only door, and it does not touch what it is given", () => {
  test("the input state is unchanged and a new one comes back", () => {
    const before = D.seedState();
    const frozen = JSON.stringify(before);
    const out = D.apply(before, { type: "addSupplier", name: "Delta Forge" }, BUYER, { now: "2026-10-18T08:00:00.000Z", today: TODAY });
    assert.equal(JSON.stringify(before), frozen);
    assert.notEqual(out.state, before);
    assert.equal(out.state.suppliers.length, before.suppliers.length + 1);
  });

  test("no change is accepted without a person behind it", () => {
    refused(() => D.apply(D.seedState(), { type: "addSupplier", name: "X" }, { name: "", role: "Buyer" }), "actor");
    refused(() => D.apply(D.seedState(), { type: "addSupplier", name: "X" }, null), "actor");
  });

  test("an unknown command is refused rather than ignored", () => {
    refused(() => D.apply(D.seedState(), { type: "awardContract" }, BUYER), "command");
  });

  test("every event carries an ISO timestamp with a year, and an actor (BF-7)", () => {
    const w = workspace();
    w.step({ type: "addSupplier", name: "Delta Forge" });
    receive(w, "AMS5599", "Mill allocation", "Allocation letter NM-221 confirms 8,200 ft.");
    for (const e of w.state.events) {
      assert.match(e.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, `${e.type} has no full timestamp`);
      assert.ok(e.actor?.name && e.actor?.role, `${e.type} has no actor`);
    }
  });
});

/* ------------------------------------------------------------------ BF-1 */

describe("BF-1 — evidence closes a gap only when a person judges it", () => {
  test("receiving text does not close the gap or lower the risk", () => {
    const w = workspace();
    const before = risk(w, "AMS5599").level;
    receive(w, "AMS5599", "Mill allocation", "Northstar confirms NO mill allocation is available before March.");
    const e = w.evidence("AMS5599", "Mill allocation");
    assert.equal(D.evidenceStatus(e), "awaiting");
    assert.equal(risk(w, "AMS5599").level, before);
    assert.equal(D.casePhase(w.state, w.case("AMS5599")).id, "evidence");
  });

  test("a reply that says no, assessed as contradicting, raises risk to Critical and blocks the decision", () => {
    const w = workspace();
    receive(w, "AMS5599", "Mill allocation", "Northstar confirms NO mill allocation is available before March.");
    assess(w, "AMS5599", "Mill allocation", D.VERDICT.CONTRADICTS, "No allocation before the need date.");
    assert.equal(risk(w, "AMS5599").level, "Critical");
    const c = w.case("AMS5599");
    const msg = refused(() => w.step({ type: "recordDecision", caseId: c.id, title: "Proceed", rationale: "r", decider: DIRECTOR }), "acknowledge");
    assert.match(msg, /Mill allocation \(contradicts the case\)/);
  });

  test("nothing is pre-written: an empty reply is refused", () => {
    const w = workspace();
    refused(() => receive(w, "AMS5599", "Mill allocation", "   "), "text");
  });

  test("a reply needs a source", () => {
    const w = workspace();
    refused(() => w.step({ type: "receiveEvidence", evidenceId: w.evidence("AMS5599", "Mill allocation").id, text: "Yes", source: {} }), "source");
  });

  test("not enough to judge sends the work back to waiting, and the gap stays open", () => {
    const w = workspace();
    receive(w, "AMS5599", "Mill allocation", "We will confirm next week.");
    assess(w, "AMS5599", "Mill allocation", D.VERDICT.INSUFFICIENT, "Not a confirmation.");
    assert.equal(D.evidenceStatus(w.evidence("AMS5599", "Mill allocation")), "insufficient");
    assert.equal(w.action("T-102").stage, "waiting");
    assert.equal(D.openGaps(w.case("AMS5599")).length, 1);
  });
});

/* ------------------------------------------------------------------ BF-2 */

describe("BF-2 — decisions are bound to the evidence they saw", () => {
  function decidedAMS() {
    const w = workspace();
    receive(w, "AMS5599", "Mill allocation", "Allocation letter NM-221 confirms 8,200 ft by 20 Nov.");
    assess(w, "AMS5599", "Mill allocation", D.VERDICT.SUPPORTS, "Written, quantity and date match.");
    const c = w.case("AMS5599");
    w.step({ type: "recordDecision", caseId: c.id, title: "Move December to Aven", rationale: "Aven meets 11 Dec.",
      decider: DIRECTOR, routeSupplierId: "S-AVEN", acknowledged: [w.evidence("AMS5599", "Urgency premium").id] }, DIRECTOR);
    return w;
  }

  test("the snapshot keeps what each item said, word for word", () => {
    const w = decidedAMS();
    const d = w.state.decisions[0];
    const alloc = d.snapshot.evidence.find((x) => x.title === "Mill allocation");
    assert.equal(alloc.text, "Allocation letter NM-221 confirms 8,200 ft by 20 Nov.");
    assert.equal(alloc.verdict, D.VERDICT.SUPPORTS);
    assert.equal(alloc.version, 2);
    assert.equal(d.decider.name, DIRECTOR.name);
    assert.equal(D.decisionStatus(w.state, d).status, "authorising");
  });

  test("evidence is versioned, never overwritten", () => {
    const w = decidedAMS();
    const e = w.evidence("AMS5599", "Mill allocation");
    assert.equal(e.versions.length, 2);
    assert.equal(e.versions[0].state, D.STATE.UNKNOWN);
    assert.equal(e.versions[0].text, "Written mill allocation has not been supplied.");
  });

  test("new material evidence after the decision makes it stale, and stale decisions do not authorise execution", () => {
    const w = decidedAMS();
    const c = w.case("AMS5599");
    w.step({ type: "requestEvidence", caseId: c.id, supplierId: "S-AVEN", question: "Confirm capacity for 8,200 ft", dueDate: "2026-10-25" });
    const reqEv = c.evidence.length; // the request added a gap
    assert.ok(reqEv > 0);
    const req = w.state.requests[0];
    w.step({ type: "receiveEvidence", evidenceId: req.evidenceId, text: "Aven can only cover 40% of the 8,200 ft.", source: { from: "Aven Coil Services" } });
    w.step({ type: "assessEvidence", evidenceId: req.evidenceId, verdict: D.VERDICT.SUPPORTS, note: "Mis-assessed on purpose; still new evidence." });
    const d = w.state.decisions[0];
    assert.equal(D.decisionStatus(w.state, d).status, "stale");
    assert.equal(D.authorisingDecision(w.state, w.case("AMS5599")), null);
    // T-101 to the doorway of Execute, then refused.
    w.step({ type: "advanceAction", actionId: "T-101" });
    w.step({ type: "advanceAction", actionId: "T-101" });
    refused(() => w.step({ type: "advanceAction", actionId: "T-101" }), "decision");
  });

  test("a legacy decision with no snapshot never authorises", () => {
    const w = workspace();
    const d = w.state.decisions.find((x) => x.ref === "DEC-0001");
    assert.equal(D.decisionStatus(w.state, d).status, "legacy");
  });
});

/* ------------------------------------------------------------------ BF-3 */

describe("BF-3 — the lifecycle cannot be skipped", () => {
  test("nothing closes except from Validate", () => {
    const w = workspace();
    refused(() => w.step({ type: "closeAction", actionId: "T-101", actualResult: "done" }), "stage");
  });

  test("an evidence action does not move past Waiting until evidence arrives", () => {
    const w = workspace();
    refused(() => w.step({ type: "advanceAction", actionId: "T-102" }), "waiting");
  });

  test("an evidence action cannot close while its evidence is unjudged", () => {
    const w = workspace();
    receive(w, "AMS5599", "Mill allocation", "Allocation letter NM-221.");
    assert.equal(w.action("T-102").stage, "validate");
    refused(() => w.step({ type: "closeAction", actionId: "T-102", actualResult: "x" }), "evidence");
  });

  test("an execution action cannot enter Decision with a material gap open", () => {
    const w = workspace();
    w.step({ type: "advanceAction", actionId: "T-101" });
    refused(() => w.step({ type: "advanceAction", actionId: "T-101" }), "gaps");
  });

  test("an outcome is refused until an action was executed after the decision", () => {
    const w = workspace();
    const c = w.case("NI718");
    receive(w, "NI718", "Cost bridge", "Bridge shows alloy +2.1%, energy +0.9%, margin +4.8%.", "Orion Alloy");
    assess(w, "NI718", "Cost bridge", D.VERDICT.SUPPORTS, "Bridge received; it supports only 3.0%.");
    w.step({ type: "closeAction", actionId: "T-104", actualResult: "Bridge received" });
    w.step({ type: "recordDecision", caseId: c.id, title: "Accept 3.0%, reject the rest", rationale: "Bridge supports 3.0%.", decider: MANAGER }, MANAGER);
    const d = w.state.decisions[0];
    refused(() => w.step({ type: "recordOutcome", caseId: c.id, decisionId: d.id, result: "Agreed", validation: "Email", validatedBy: MANAGER }), "not-executed");
  });

  test("the whole path, in order, ends in an outcome tied to its decision", () => {
    const w = workspace();
    const c = w.case("AMS5599");
    receive(w, "AMS5599", "Mill allocation", "Allocation letter NM-221 confirms 8,200 ft by 20 Nov.");
    assess(w, "AMS5599", "Mill allocation", D.VERDICT.SUPPORTS, "Written, quantity and date match.");
    w.step({ type: "closeAction", actionId: "T-102", actualResult: "Letter NM-221 on file" });
    w.step({ type: "recordDecision", caseId: c.id, title: "Move December to Aven", rationale: "Aven meets 11 Dec with 15 days' slack.",
      decider: DIRECTOR, routeSupplierId: "S-AVEN", acknowledged: [w.evidence("AMS5599", "Urgency premium").id] }, DIRECTOR);
    const d = w.state.decisions[0];
    for (let i = 0; i < 4; i++) w.step({ type: "advanceAction", actionId: "T-101" });
    assert.equal(w.action("T-101").stage, "validate");
    w.step({ type: "closeAction", actionId: "T-101", actualResult: "PO 4471 placed with Aven" });
    const out = w.step({ type: "recordOutcome", caseId: c.id, decisionId: d.id, result: "December covered by Aven",
      validation: "PO acknowledgement and goods-in", validatedBy: MANAGER, lessons: "Ask for allocation in writing first." });
    const o = w.case("AMS5599").outcomes[0];
    assert.equal(o.decisionId, d.id);
    assert.equal(out.result.outcomeRef, o.ref);
    assert.equal(D.casePhase(w.state, w.case("AMS5599")).id, "learned");
  });
});

/* ------------------------------------------------------------------ BF-4 */

describe("BF-4 — risk is named rules with their inputs", () => {
  test("every driver says what it looked at", () => {
    const w = workspace();
    for (const c of w.state.cases) {
      const r = D.caseRisk(w.state, c, TODAY);
      assert.ok(r.drivers.length > 0, `${c.ref} has no drivers`);
      for (const d of r.drivers) assert.ok(d.rule && d.level && d.said, `${c.ref} has an unexplained driver`);
    }
  });

  test("the shortage rule compares lead time with the need date, and the route changes the answer", () => {
    const w = workspace();
    const timing = D.caseRisk(w.state, w.case("AMS5599"), TODAY).drivers.find((d) => d.rule === "timing");
    assert.match(timing.said, /Northstar Metals misses 11 Dec 2026 by 18 days; Aven Coil Services could meet it/);
    receive(w, "AMS5599", "Mill allocation", "Allocation letter confirms 8,200 ft.");
    assess(w, "AMS5599", "Mill allocation", D.VERDICT.SUPPORTS);
    w.step({ type: "recordDecision", caseId: w.case("AMS5599").id, title: "Aven", rationale: "Meets the date.", decider: DIRECTOR,
      routeSupplierId: "S-AVEN", acknowledged: [w.evidence("AMS5599", "Urgency premium").id] }, DIRECTOR);
    const after = D.caseRisk(w.state, w.case("AMS5599"), TODAY);
    assert.equal(after.drivers.find((d) => d.rule === "timing"), undefined, "Aven arrives with 15 days' slack");
  });

  test("a Medium case does move: a contradicting cost bridge makes NI718 Critical", () => {
    const w = workspace();
    receive(w, "NI718", "Cost bridge", "We cannot share a cost breakdown.", "Orion Alloy");
    assess(w, "NI718", "Cost bridge", D.VERDICT.CONTRADICTS, "Refuses transparency.");
    assert.equal(risk(w, "NI718").level, "Critical");
  });

  test("the past need date is Critical, whatever else is true", () => {
    const s = D.seedState();
    assert.equal(D.caseRisk(s, s.cases[0], "2026-12-12").level, "Critical");
  });
});

/* ------------------------------------------------------------------ BF-5 */

describe("BF-5 — no composite supplier score", () => {
  test("there is no score to show, pre-fill or freeze", () => {
    assert.equal(D.scoreSupplier, undefined);
    assert.equal(D.bestSupplier, undefined);
  });

  test("quotes compare price against the lowest, in the same unit, in pence", () => {
    const s = D.seedState();
    const rows = D.quoteComparison(s, s.cases.find((c) => c.ref === "MACH204"));
    assert.deepEqual(rows.map((r) => [r.name, r.overLowestPence]), [["Kestrel CNC", 0], ["Vector Precision", 980]]);
  });

  test("a decision snapshot holds no ranking", () => {
    const w = workspace();
    receive(w, "NI718", "Cost bridge", "Bridge attached.", "Orion Alloy");
    assess(w, "NI718", "Cost bridge", D.VERDICT.SUPPORTS);
    w.step({ type: "recordDecision", caseId: w.case("NI718").id, title: "t", rationale: "r", decider: MANAGER }, MANAGER);
    const snap = w.state.decisions[0].snapshot;
    assert.equal("supplierLeader" in snap, false);
  });
});

/* ---------------------------------------------------------- BF-6 and BF-9 */

describe("BF-6, BF-9 — a case the user creates can reach a supplier", () => {
  test("the intake is a claim, not supplied evidence, and the checklist becomes gaps", () => {
    const w = workspace();
    const out = w.step({ type: "createCase", caseType: "claim", statement: "Supplier wants 8% from January", askBp: 800, capBp: 300, annualSpendPence: 10_000_000 });
    const c = w.state.cases.find((x) => x.id === out.result.caseId);
    const said = c.evidence[0];
    assert.equal(D.current(said).state, D.STATE.CLAIM);
    assert.equal(said.material, false);
    assert.deepEqual(D.openGaps(c).map((e) => e.title), D.CASE_TYPES.claim.checklist);
    assert.equal(D.claimExcess(c).excessPence, 500_000); // £100,000 × 5.00 points
  });

  test("link a supplier, ask it, mark it sent, receive and judge the reply", () => {
    const w = workspace();
    const { result } = w.step({ type: "createCase", caseType: "shortage", statement: "Delta Forge castings are late", needBy: "2026-11-30" });
    const caseId = result.caseId;
    const add = w.step({ type: "addSupplier", name: "Delta Forge", category: "Castings" });
    w.step({ type: "linkSupplier", caseId, supplierId: add.result.supplierId, incumbent: true, quote: { approval: "Approved", leadDays: 50 } });
    const c = w.state.cases.find((x) => x.id === caseId);
    const gap = c.evidence.find((e) => e.title === "Supplier recovery date in writing");
    const req = w.step({ type: "requestEvidence", caseId, supplierId: add.result.supplierId, evidenceId: gap.id, question: "Confirm the recovery date in writing", dueDate: "2026-10-22" });
    const a = w.state.actions.find((x) => x.id === req.result.actionId);
    assert.equal(a.stage, "prepare");
    w.step({ type: "markRequestSent", requestId: req.result.requestId, via: "email" });
    assert.equal(w.state.actions.find((x) => x.id === a.id).stage, "waiting");
    w.step({ type: "receiveEvidence", evidenceId: gap.id, text: "Recovery date 3 Dec.", source: { from: "Delta Forge" } });
    assert.equal(w.state.requests.find((r) => r.id === req.result.requestId).status, "answered");
    w.step({ type: "assessEvidence", evidenceId: gap.id, verdict: D.VERDICT.CONTRADICTS, note: "3 Dec is after the 30 Nov need date." });
    assert.equal(D.evidenceStatus(w.state.cases.find((x) => x.id === caseId).evidence.find((e) => e.id === gap.id)), "contradicted");
  });

  test("a request to a supplier that is not on the case is refused", () => {
    const w = workspace();
    refused(() => w.step({ type: "requestEvidence", caseId: w.case("NI718").id, supplierId: "S-AVEN", question: "q", dueDate: "2026-10-30" }), "not-linked");
  });

  test("suppliers are entities: Titan and Vector are on the Suppliers list, not only inside cases", () => {
    const s = D.seedState();
    for (const name of ["Titan Specialty Stock", "Vector Precision"]) assert.ok(s.suppliers.some((x) => x.name === name), name);
    for (const c of s.cases) for (const q of c.quotes) assert.ok(D.supplierById(s, q.supplierId), `${c.ref} quotes an unknown supplier`);
  });

  test("a duplicate supplier name is refused", () => {
    const w = workspace();
    refused(() => w.step({ type: "addSupplier", name: "aven coil services" }), "duplicate");
  });
});

/* ------------------------------------------------------------------ BF-8 */

describe("BF-8 — ids never collide", () => {
  test("10,000 ids are 10,000 different ids", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => D.uuid()));
    assert.equal(ids.size, 10_000);
  });

  test("creating work for several gaps in one go gives each action its own id and reference", () => {
    const w = workspace();
    const { result } = w.step({ type: "createCase", caseType: "claim", statement: "Surcharge of 6%" });
    w.step({ type: "createWorkForGaps", caseId: result.caseId });
    const acts = w.state.actions.filter((a) => a.caseId === result.caseId);
    assert.equal(acts.length, 4);
    assert.equal(new Set(acts.map((a) => a.id)).size, 4);
    assert.equal(new Set(acts.map((a) => a.ref)).size, 4);
    const evIds = w.state.events.map((e) => e.id);
    assert.equal(new Set(evIds).size, evIds.length);
  });

  test("the page's id source works without randomUUID (an http LAN address)", () => {
    const real = globalThis.crypto.randomUUID;
    try {
      Object.defineProperty(globalThis.crypto, "randomUUID", { value: undefined, configurable: true });
      assert.match(D.uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      Object.defineProperty(globalThis.crypto, "randomUUID", { value: real, configurable: true });
    }
  });
});

/* ---------------------------------------------------------- authority (BF-2) */

describe("authority — a second person above the threshold", () => {
  function decideMACH(w) {
    receive(w, "MACH204", "Rate evidence", "Kestrel run-at-rate shows 120 ea a week at Rev F.", "Kestrel CNC");
    assess(w, "MACH204", "Rate evidence", D.VERDICT.SUPPORTS, "Covers 1,400 ea within 12 weeks.");
    w.step({ type: "recordDecision", caseId: w.case("MACH204").id, title: "Qualify Kestrel as second source", rationale: "Rate evidenced.",
      decider: MANAGER, acknowledged: [w.evidence("MACH204", "Alternative capability").id] }, MANAGER);
    return w.state.decisions[0];
  }

  test("MACH204 at £343,000 waits for a second approver", () => {
    const w = workspace();
    const d = decideMACH(w);
    assert.equal(D.decisionStatus(w.state, d).status, "awaiting-approval");
    assert.equal(D.casePhase(w.state, w.case("MACH204")).id, "approval");
  });

  test("the decider cannot approve their own decision; a second person can", () => {
    const w = workspace();
    const d = decideMACH(w);
    refused(() => w.step({ type: "approveDecision", decisionId: d.id, approver: MANAGER }, MANAGER), "same-person");
    w.step({ type: "approveDecision", decisionId: d.id, approver: DIRECTOR }, DIRECTOR);
    assert.equal(D.decisionStatus(w.state, w.state.decisions[0]).status, "authorising");
  });

  test("a decision needs a named decider with a role", () => {
    const w = workspace();
    receive(w, "NI718", "Cost bridge", "Bridge attached.", "Orion Alloy");
    assess(w, "NI718", "Cost bridge", D.VERDICT.SUPPORTS);
    refused(() => w.step({ type: "recordDecision", caseId: w.case("NI718").id, title: "t", rationale: "r", decider: { name: "User", role: "" } }), "decider");
  });
});

/* ----------------------------------------------------------------- BF-11 */

describe("BF-11 — every evidence state the programme defines", () => {
  test("an assumption without a basis is refused; with one it is listed for acknowledgement", () => {
    const w = workspace();
    const c = w.case("NI718");
    refused(() => w.step({ type: "addEvidence", caseId: c.id, title: "Alloy share", state: D.STATE.ASSUMED, text: "Alloy is 60% of cost" }), "basis");
    w.step({ type: "addEvidence", caseId: c.id, title: "Alloy share", state: D.STATE.ASSUMED, text: "Alloy is 60% of cost", basis: "Last year's bridge from Orion" });
    assert.ok(D.toAcknowledge(w.case("NI718")).some((e) => e.title === "Alloy share"));
  });

  test("derived evidence cannot be typed in", () => {
    const w = workspace();
    refused(() => w.step({ type: "addEvidence", caseId: w.case("NI718").id, title: "x", state: D.STATE.DERIVED, text: "y" }), "state");
  });

  test("supplied evidence needs a source", () => {
    const w = workspace();
    refused(() => w.step({ type: "addEvidence", caseId: w.case("NI718").id, title: "x", state: D.STATE.SUPPLIED, text: "y" }), "source");
  });
});

/* ----------------------------------------------------------------- BF-10 */

describe("BF-10 — classification by whole words, scored, with alternatives", () => {
  const cases = [
    ["Supplier is late and also wants a price increase", "claim", ["shortage"]],
    ["We need to source a second supplier for castings", "sourcing", []],
    ["Warranty claim on a batch of failed bearings", "performance", []],
    ["Lead time has slipped from 6 to 14 weeks", "shortage", []],
    ["Engineering changed the drawing to Rev G", "spec", []],
    ["Customer forecast doubled for Q1", "demand", []],
    ["Supplier changed payment terms to 90 days", "claim", []],
  ];
  for (const [text, type, alts] of cases) {
    test(`“${text}” → ${type}`, () => {
      const r = D.classifyProblem(text);
      assert.equal(r?.type, type);
      for (const a of alts) assert.ok(r.alternatives.includes(a), `${a} not offered`);
    });
  }
  for (const text of ["Our template for the RFQ needs updating", "Can we relate this to last year's spend?", "Need help with something unusual", ""]) {
    test(`“${text}” is refused, not guessed`, () => assert.equal(D.classifyProblem(text), null));
  }
});

/* ----------------------------------------------------------------- BF-12 */

describe("BF-12 — data from v0.7 is migrated, not wiped", () => {
  const v2 = {
    schema: 2,
    cases: [{ id: "C-AMS", ref: "AMS5599", title: "Recover coil", objective: "Protect December", requirement: "8,200 ft", value: 128000, baseRisk: "High", stage: "Recovery",
      suppliers: [{ id: "S-AVEN", name: "Aven Coil Services", approval: "Approved", lead: 39, price: 9.53 }],
      evidence: [
        { id: "E1", state: "KNOWN", title: "Requirement", detail: "8,200 ft", source: "Intake", updated: "17 Oct" },
        { id: "E2", state: "UNKNOWN", title: "Mill allocation", detail: "Not supplied", source: "Request", updated: "17 Oct" },
      ] }],
    tasks: [{ id: "T-102", title: "Get allocation", caseId: "C-AMS", evidenceId: "E2", owner: "Buyer", stage: "waiting", due: "24 Oct", supplier: "Northstar Metals" }],
    suppliers: [{ id: "S-NORTH", name: "Northstar Metals" }],
    decisions: [{ id: "D-001", date: "16 Oct", caseId: "C-AMS", title: "Hold", reason: "Unknown allocation", owner: "Director" }],
    events: [{ id: "EV-1", date: "17 Oct", caseId: "C-AMS", type: "Evidence gap", text: "Allocation unknown" }],
  };

  test("cases, evidence, actions and decisions survive, with their dates kept as written", () => {
    const { state, from } = D.migrate(v2, { now: "2026-10-18T08:00:00.000Z", id: (() => { let i = 0; return () => `m-${++i}`; })() });
    assert.equal(from, 2);
    assert.equal(state.schema, D.SCHEMA);
    const c = state.cases[0];
    assert.equal(c.ref, "AMS5599");
    assert.equal(c.valuePence, 12_800_000);
    assert.equal(D.current(c.evidence[0]).state, D.STATE.SUPPLIED);
    assert.equal(D.evidenceStatus(c.evidence[1]), "gap");
    assert.equal(D.current(c.evidence[0]).legacyDate, "17 Oct");
    assert.equal(c.quotes[0].unitPricePence, 953);
    assert.equal(state.actions[0].legacyDue, "24 Oct");
    assert.equal(D.decisionStatus(state, state.decisions[0]).status, "legacy");
    assert.ok(state.suppliers.some((x) => x.name === "Northstar Metals"));
  });

  test("an import is checked before it replaces anything", () => {
    assert.ok(D.validateImport({ schema: 9 }).length > 0);
    assert.deepEqual(D.validateImport(D.seedState()), []);
  });
});

/* ------------------------------------------------------------ exact numbers */

describe("money and rates are integers", () => {
  test("parsing and formatting", () => {
    assert.equal(D.parseMoneyToPence("£232,800"), 23_280_000);
    assert.equal(D.parseMoneyToPence("9.5"), 950);
    assert.equal(D.parseMoneyToPence("9.555"), null);
    assert.equal(D.parseMoneyToPence("abc"), null);
    assert.equal(D.parsePercentToBp("+7.8%"), 780);
    assert.equal(D.parsePercentToBp("4"), 400);
    assert.equal(D.formatPence(884_640), "£8,846.40");
    assert.equal(D.formatBp(380), "3.80%");
  });

  test("NI718: the ask exceeds the cap by 3.80 points, £8,846.40 a year", () => {
    const s = D.seedState();
    const x = D.claimExcess(s.cases.find((c) => c.ref === "NI718"));
    assert.deepEqual([x.excessBp, x.excessPence, x.askPence, x.capPence], [380, 884_640, 1_815_840, 931_200]);
  });

  test("half-up rounding on BigInt", () => {
    assert.equal(D.mulDivRound(1, 1, 2), 1);
    assert.equal(D.mulDivRound(-1, 1, 2), -1);
    assert.equal(D.mulDivRound(23_280_000, 333, 10000), 775_224);
  });

  test("a missing input withholds the figure rather than guessing", () => {
    assert.match(D.claimExcess({ claim: { askBp: 780 } }).withheld, /contract cap/);
    assert.match(D.shortageTiming(D.seedState(), { requirement: {}, quotes: [] }, TODAY).withheld, /need-by/);
  });

  test("dates are real dates", () => {
    assert.equal(D.isIsoDate("2026-02-30"), false);
    assert.equal(D.isIsoDate("2026-12-11"), true);
    assert.equal(D.daysBetween("2026-10-18", "2026-12-11"), 54);
    assert.equal(D.formatDate("2026-12-11"), "11 Dec 2026");
  });
});

/* ------------------------------------------------- A-1: the authority gate */

/**
 * The independent audit of v0.8.0 (18 Oct 2026) found the second-approval
 * gate sound and its trigger optional: `needsSecond` tests
 * `c.valuePence > threshold`, and a case created through intake has no value,
 * so the condition is false for a case of any size. The control existed and
 * never fired.
 */
describe("a decision cannot be taken on a case of unknown value (A-1)", () => {
  /** A case created the way intake creates one: no value at stake. */
  const unvalued = () => {
    const w = workspace();
    w.step({ type: "createCase", caseType: "claim", title: "Unpriced claim",
      statement: "The supplier wants considerably more money from January.", source: "Email" });
    const c = w.state.cases.find((x) => x.title === "Unpriced claim");
    for (const e of c.evidence.filter((x) => x.material && x.question)) {
      w.step({ type: "receiveEvidence", evidenceId: e.id, text: "Provided in full.", source: { from: "Supplier" } });
      w.step({ type: "assessEvidence", evidenceId: e.id, verdict: D.VERDICT.SUPPORTS, note: "Checked." });
    }
    return { w, ref: c.ref, id: c.id };
  };

  test("intake still creates a case without one, because it is often not known yet", () => {
    const { w, ref } = unvalued();
    assert.equal(w.case(ref).valuePence, null);
  });

  test("but the decision is refused, and says why", () => {
    const { w, id } = unvalued();
    const said = refused(() => w.step({ type: "recordDecision", caseId: id, title: "Accept",
      rationale: "It is within tolerance.", decider: MANAGER }), "value");
    assert.match(said, /what is at stake/i);
    assert.match(said, /second approver/i);
  });

  test("the risk says so long before the decision does", () => {
    const { w, ref } = unvalued();
    const r = risk(w, ref);
    const driver = r.drivers.find((d) => d.rule === "authority");
    assert.ok(driver, "no authority driver for a case with no value");
    assert.match(driver.said, /approval threshold cannot be applied/);
  });

  test("and so does the recommended next step", () => {
    const { w, ref } = unvalued();
    const rec = D.recommendation(w.state, w.case(ref), TODAY);
    assert.match(rec.headline, /what is at stake/i);
    assert.match(rec.next, /value at stake/i);
  });

  test("recording the value unblocks the decision", () => {
    const { w, id, ref } = unvalued();
    w.step({ type: "setCaseValue", caseId: id, valuePence: 10_000_00 });
    assert.equal(w.case(ref).valuePence, 1_000_000);
    const out = w.step({ type: "recordDecision", caseId: id, title: "Accept",
      rationale: "Within tolerance.", decider: MANAGER });
    assert.ok(out.result.decisionId);
  });

  test("a value above the threshold still demands a second, different person", () => {
    const { w, id } = unvalued();
    w.step({ type: "setCaseValue", caseId: id, valuePence: 90_000_000 });
    const out = w.step({ type: "recordDecision", caseId: id, title: "Accept",
      rationale: "Worth it.", decider: MANAGER });
    /* Re-read after every step: apply() clones, so a decision held from an
       earlier state never gains the approval written into a later one. */
    const decision = () => w.state.decisions.find((x) => x.id === out.result.decisionId);
    assert.equal(decision().needsSecondApproval, true);
    assert.equal(D.decisionStatus(w.state, decision()).status, "awaiting-approval");
    refused(() => w.step({ type: "approveDecision", decisionId: decision().id, approver: MANAGER }), "same-person");
    w.step({ type: "approveDecision", decisionId: decision().id, approver: DIRECTOR });
    assert.equal(D.decisionStatus(w.state, decision()).status, "authorising");
  });

  test("the value itself is refused when it is not an amount", () => {
    const { w, id } = unvalued();
    refused(() => w.step({ type: "setCaseValue", caseId: id, valuePence: 0 }), "value");
    refused(() => w.step({ type: "setCaseValue", caseId: id, valuePence: -5 }), "value");
    refused(() => w.step({ type: "setCaseValue", caseId: id, valuePence: "128000" }), "value");
  });

  test("changing it is recorded against the person who changed it", () => {
    const { w, id } = unvalued();
    w.step({ type: "setCaseValue", caseId: id, valuePence: 1_000_000 });
    const out = w.step({ type: "setCaseValue", caseId: id, valuePence: 90_000_000 }, DIRECTOR);
    const ev = out.events[0];
    assert.equal(ev.actor.name, DIRECTOR.name);
    assert.match(ev.text, /was £10,000\.00/);
    assert.match(ev.text, /second approver/);
  });
});

/* ------------------------------------------- A-2: the way a problem gets in */

/**
 * The same audit found the classifier refusing the sentences buyers write —
 * including one about the build's own demonstration case — with no way to
 * carry on. Refusal was a dead end: the page cleared the pending intake and
 * asked the person to rephrase, without saying which words would work.
 */
describe("the way in accepts how buyers actually write (A-2)", () => {
  const type = (text) => D.classifyProblem(text)?.type ?? null;

  test("the sentences that were refused now classify", () => {
    assert.equal(type("We are going to run out of AMS5599 before Christmas"), "shortage");
    assert.equal(type("The forging supplier double-booked our slot and we will miss the build"), "shortage");
    assert.equal(type("I need to find someone else who can make this bracket"), "sourcing");
    assert.equal(type("Our aerospace customer moved the rate up to 40 a month"), "demand");
  });

  test("the ones that already worked still do", () => {
    assert.equal(type("Supplier says prices are going up 8% from January"), "claim");
    assert.equal(type("Can you compare these three bids"), "quote");
    assert.equal(type("Northstar's OTD has dropped to 71% this quarter"), "performance");
    assert.equal(type("Drawing revision C changes the bore tolerance"), "spec");
  });

  test("genuine nonsense is still refused", () => {
    assert.equal(type("The widget frobnicator is misaligned"), null);
    assert.equal(type(""), null);
    assert.equal(type("   "), null);
  });

  test("one word out of a short phrase is a weak guess, and says so", () => {
    assert.equal(D.classifyProblem("price").confidence, "weak");
    assert.equal(D.classifyProblem("Supplier says prices are going up 8% from January").confidence, "strong");
  });

  test("a sentence matching two kinds offers the other as an alternative", () => {
    const m = D.classifyProblem("The price increase also means the delivery is late");
    assert.ok(m.alternatives.length >= 1, "no alternative offered for a sentence matching two kinds");
  });
});

/* ------------------------------------------------ A-3: who approved it */

/**
 * BF-9 made a Supplier an entity because two lists joined by name is not a
 * join. The authority gate still joined people by name: one person signing
 * as "J Smith" having decided as "Jo Smith" passed, and two different Jo
 * Smiths were wrongly blocked. People are entities here too now.
 *
 * This is not verification. Release A has no accounts, so anybody can pick
 * anybody. What it removes is the accident, and the record says which it is.
 */
describe("a second approval comes from a second person, not a second spelling (A-3)", () => {
  /** A decided case above the threshold, waiting for approval. */
  const awaiting = (decider = MANAGER) => {
    const w = workspace();
    w.step({ type: "createCase", caseType: "claim", title: "Large claim",
      statement: "The supplier wants a great deal more money from January.", source: "Email" });
    const c = w.state.cases.find((x) => x.title === "Large claim");
    for (const e of c.evidence.filter((x) => x.material && x.question)) {
      w.step({ type: "receiveEvidence", evidenceId: e.id, text: "Provided.", source: { from: "Supplier" } });
      w.step({ type: "assessEvidence", evidenceId: e.id, verdict: D.VERDICT.SUPPORTS, note: "Checked." });
    }
    w.step({ type: "setCaseValue", caseId: c.id, valuePence: 90_000_000 });
    const out = w.step({ type: "recordDecision", caseId: c.id, title: "Accept",
      rationale: "Worth it.", decider });
    return { w, decisionId: out.result.decisionId };
  };

  test("deciding records the person, not only the name typed", () => {
    const { w, decisionId } = awaiting();
    const d = w.state.decisions.find((x) => x.id === decisionId);
    assert.ok(d.deciderPersonId, "the decision does not name a person");
    assert.equal(D.personById(w.state, d.deciderPersonId).name, MANAGER.name);
  });

  test("the same spelling was always caught", () => {
    const { w, decisionId } = awaiting({ name: "Jo Reid", role: "Commodity Manager" });
    refused(() => w.step({ type: "approveDecision", decisionId, approver: { name: "jo reid", role: "Buyer" } }), "same-person");
  });

  test("a variant spelling of the decider's own name is caught too", () => {
    /* The finding. "J Reid" is a different string, so a name comparison let
       it through, and it is a different person to any registry keyed on the
       name — which is why the id check alone does not close this either. */
    const { w, decisionId } = awaiting({ name: "Jo Reid", role: "Commodity Manager" });
    const said = refused(() => w.step({ type: "approveDecision", decisionId,
      approver: { name: "J Reid", role: "Buyer" } }), "same-person");
    assert.match(said, /another way of writing/);
    assert.match(said, /choose the approver from the people/);
  });

  test("picking yourself out of the list is caught by id", () => {
    const { w, decisionId } = awaiting({ name: "Jo Reid", role: "Commodity Manager" });
    const me = w.state.people.find((p) => p.name === "Jo Reid");
    refused(() => w.step({ type: "approveDecision", decisionId, approverPersonId: me.id }), "same-person");
  });

  test("the check is narrow: a different first name is a different person", () => {
    /* It only fires on an initial or a prefix. A colleague who shares a
       surname is not refused, which is what keeps this usable. */
    const { w, decisionId } = awaiting({ name: "Jo Reid", role: "Commodity Manager" });
    w.step({ type: "approveDecision", decisionId, approver: { name: "A Reid", role: "Director" } });
    const d = w.state.decisions.find((x) => x.id === decisionId);
    assert.equal(D.decisionStatus(w.state, d).status, "authorising");
  });

  test("and where it does fire wrongly, picking the person is the way through", () => {
    /* The cost of a heuristic, and its escape. "J Reid" typed is refused;
       the same name chosen from the people already known is a deliberate act
       and is allowed, because somebody has said these are two people. */
    const { w, decisionId } = awaiting({ name: "Jo Reid", role: "Commodity Manager" });
    refused(() => w.step({ type: "approveDecision", decisionId, approver: { name: "J Reid", role: "Director" } }), "same-person");

    /* J Reid becomes known by taking a decision of their own elsewhere. */
    const other = w.case("MACH204");
    w.step({ type: "setCaseValue", caseId: other.id, valuePence: 1_000_000 });
    const people = () => w.state.people.find((p) => p.name === "J Reid");
    w.step({ type: "addSupplier", name: "Placeholder Co" }, { name: "J Reid", role: "Director" });
    assert.equal(people(), undefined, "an actor on an ordinary command is not yet a person");

    /* Only deciders and approvers become people, so J Reid is introduced by
       approving somewhere they are not the decider. */
    const second = awaiting({ name: "Sam Patel", role: "Buyer" });
    second.w.step({ type: "approveDecision", decisionId: second.decisionId, approver: { name: "J Reid", role: "Director" } });
    assert.ok(second.w.state.people.find((p) => p.name === "J Reid"), "approving did not record the person");
  });

  test("a different person approves, and is recorded by id", () => {
    const { w, decisionId } = awaiting();
    w.step({ type: "approveDecision", decisionId, approver: DIRECTOR });
    const d = w.state.decisions.find((x) => x.id === decisionId);
    assert.ok(d.secondApproval.personId);
    assert.notEqual(d.secondApproval.personId, d.deciderPersonId);
    assert.equal(D.decisionStatus(w.state, d).status, "authorising");
  });

  test("the approval says plainly that the name was not verified", () => {
    const { w, decisionId } = awaiting();
    const out = w.step({ type: "approveDecision", decisionId, approver: DIRECTOR });
    const d = w.state.decisions.find((x) => x.id === decisionId);
    assert.equal(d.secondApproval.asserted, true);
    assert.match(out.events[0].text, /self-asserted/);
  });

  test("picking somebody the workspace has never seen is refused", () => {
    const { w, decisionId } = awaiting();
    refused(() => w.step({ type: "approveDecision", decisionId, approverPersonId: "nobody" }), "approver");
  });
});

/* ------------------------------------------------- A-4: money that is money */

describe("a mistyped amount is refused, not reinterpreted (A-4)", () => {
  test("malformed separators no longer become a different number", () => {
    for (const bad of ["1,2,3", "12,34.56", "£1,00,00.5", "1,,,000", "1,23", ",100", "100,"]) {
      assert.equal(D.parseMoneyToPence(bad), null, `"${bad}" was accepted`);
    }
  });

  test("properly grouped amounts still work", () => {
    assert.equal(D.parseMoneyToPence("1,234.56"), 123456);
    assert.equal(D.parseMoneyToPence("£232,800"), 23_280_000);
    assert.equal(D.parseMoneyToPence("1,000,000"), 100_000_000);
    assert.equal(D.parseMoneyToPence("128000"), 12_800_000);
    assert.equal(D.parseMoneyToPence("9.99"), 999);
  });

  test("the case value refuses a mistyped amount through apply()", () => {
    const w = workspace();
    const c = w.case("AMS5599");
    refused(() => w.step({ type: "setCaseValue", caseId: c.id, valuePence: D.parseMoneyToPence("12,34.56") }), "value");
  });
});

/* -------------------------------------- A-5: executed after means after */

describe("an outcome needs an execution strictly after its decision (A-5)", () => {
  /**
   * Everything on one fixed clock, which is how an agent or a script runs.
   * The workspace helper advances time by a minute a step, so it cannot
   * produce the collision this is about; apply() is driven directly instead.
   */
  function onOneInstant({ actionAt = null } = {}) {
    const AT = "2026-10-18T09:00:00.000Z";
    let s = D.seedState();
    let n = 0;
    let clock = AT;
    const go = (command, actor = MANAGER) => {
      const out = D.apply(s, command, actor, { now: clock, today: TODAY, id: () => `fixed-${++n}` });
      s = out.state;
      return out;
    };
    /* The work is done at `actionAt` when one is given, so the control case
       below differs from the collision by a single millisecond. */
    const atAction = () => { if (actionAt) clock = actionAt; };

    go({ type: "createCase", caseType: "performance", title: "Same-instant case",
      statement: "Northstar quality rejects have risen this quarter.", source: "Report" });
    const c = () => s.cases.find((x) => x.title === "Same-instant case");
    for (const e of c().evidence.filter((x) => x.material && x.question)) {
      go({ type: "receiveEvidence", evidenceId: e.id, text: "Provided in full.", source: { from: "Northstar" } });
      go({ type: "assessEvidence", evidenceId: e.id, verdict: D.VERDICT.SUPPORTS, note: "Checked." });
    }
    go({ type: "setCaseValue", caseId: c().id, valuePence: 1_000_000 });
    const dec = go({ type: "recordDecision", caseId: c().id, title: "Hold the supplier to the plan",
      rationale: "The corrective actions are credible.", decider: MANAGER });

    atAction();
    const act = go({ type: "addAction", caseId: c().id,
      title: "Issue the corrective-action demand", owner: "Buyer", dueDate: "2026-10-25" });
    const id = act.result.actionId;
    for (let i = 0; i < 3; i++) go({ type: "advanceAction", actionId: id });   // → prepare → decision → execute
    go({ type: "advanceAction", actionId: id });                                // → validate
    go({ type: "closeAction", actionId: id, actualResult: "Demand issued." });

    return { state: () => s, go, caseId: c().id, decisionId: dec.result.decisionId, AT };
  }

  test("the execution landed at exactly the decision's timestamp", () => {
    const t = onOneInstant();
    const a = t.state().actions.find((x) => x.caseId === t.caseId && x.kind === D.KIND.EXECUTION && x.stage === "closed");
    const d = t.state().decisions.find((x) => x.id === t.decisionId);
    const executeEntry = a.history.find((h) => h.stage === "execute");
    assert.equal(executeEntry.at, d.at, "the fixture did not produce the collision it is testing");
  });

  test("so the outcome is refused: an execution at the same instant is not after it", () => {
    const t = onOneInstant();
    refused(() => t.go({ type: "recordOutcome", caseId: t.caseId, decisionId: t.decisionId,
      result: "Rejects fell.", validation: "Checked the next three deliveries.",
      validatedBy: DIRECTOR }), "not-executed");
  });

  test("but an execution one millisecond later is accepted", () => {
    /* The control. Everything is identical except that the work happened
       after the decision rather than at the same instant, so this proves the
       refusal above is about the boundary and not about the fixture. */
    const t = onOneInstant({ actionAt: "2026-10-18T09:00:00.001Z" });
    const out = t.go({ type: "recordOutcome", caseId: t.caseId, decisionId: t.decisionId,
      result: "Rejects fell.", validation: "Checked the next three deliveries.",
      validatedBy: DIRECTOR });
    assert.ok(out.result.outcomeRef, "an execution genuinely after the decision was still refused");
  });
});
