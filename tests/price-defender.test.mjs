import test from "node:test";
import assert from "node:assert/strict";
import * as D from "../public/domain.js";
import * as V from "../public/views.js";

const actor = { name: "Test Buyer", role: "Commodity Manager" };
function context() {
  let n = 0;
  return { now: "2026-10-18T12:00:00.000Z", today: "2026-10-18", id: () => `test-id-${++n}` };
}

function runDefender(state, caseId, overrides = {}) {
  return D.apply(state, {
    type: "runPriceIncreaseDefender", caseId,
    askBp: 780, capBp: 400, annualSpendPence: 23_280_000, effectiveDate: "2027-01-01",
    ...overrides,
  }, actor, context());
}

test("Price Increase Defender calculates exact annual exposure and freezes DERIVED evidence", () => {
  const s = D.seedState();
  s.settings.user = actor;
  const out = runDefender(s, "C-NI");
  assert.equal(out.result.askPence, 1_815_840);
  assert.equal(out.result.capPence, 931_200);
  assert.equal(out.result.excessPence, 884_640);
  const c = D.caseById(out.state, "C-NI");
  const derived = c.evidence.filter((e) => e.capabilityId === "price-increase-defender");
  assert.equal(derived.length, 2);
  assert.ok(derived.every((e) => D.current(e).state === D.STATE.DERIVED));
  assert.ok(derived.every((e) => D.current(e).source.kind === "calculation"));
  assert.match(D.current(derived.find((e) => e.measure === "above-contract-cap")).text, /£8,846\.40/);
});

test("Defender feeds BuyrFlow without duplicating work when rerun", () => {
  const s = D.seedState();
  s.settings.user = actor;
  const first = runDefender(s, "C-NI");
  const second = runDefender(first.state, "C-NI");
  const open = D.openActions(second.state, "C-NI");
  assert.equal(open.filter((a) => a.capabilityId === "price-increase-defender" && a.kind === D.KIND.EXECUTION).length, 1);
  assert.equal(D.caseById(second.state, "C-NI").evidence.filter((e) => e.capabilityId === "price-increase-defender").length, 2);
});

test("changed commercial inputs create a new derived evidence version rather than rewriting history", () => {
  const s = D.seedState();
  s.settings.user = actor;
  const first = runDefender(s, "C-NI");
  const before = D.caseById(first.state, "C-NI").evidence.find((e) => e.measure === "above-contract-cap");
  const second = runDefender(first.state, "C-NI", { askBp: 900 });
  const after = D.caseById(second.state, "C-NI").evidence.find((e) => e.measure === "above-contract-cap");
  assert.equal(before.versions.length, 1);
  assert.equal(after.versions.length, 2);
  assert.notEqual(D.current(after).text, before.versions[0].text);
});

test("new claim cases get missing-evidence work plus one governed negotiation action", () => {
  let s = D.seedState();
  s.settings.user = actor;
  const created = D.apply(s, { type: "createCase", caseType: "claim", statement: "Supplier requests an 8% increase" }, actor, context());
  const caseId = created.result.caseId;
  const out = runDefender(created.state, caseId, { askBp: 800, capBp: 400, annualSpendPence: 50_000_000 });
  const gaps = D.openGaps(D.caseById(out.state, caseId));
  const actions = D.openActions(out.state, caseId);
  for (const gap of gaps) assert.ok(actions.some((a) => a.evidenceId === gap.id), `missing action for ${gap.title}`);
  assert.equal(actions.filter((a) => a.capabilityId === "price-increase-defender" && a.kind === D.KIND.EXECUTION).length, 1);
});

test("the Case UI exposes Price Increase Defender without accepting the supplier request", () => {
  const s = D.seedState();
  const html = V.renderCases(s, { today: "2026-10-18", params: new URLSearchParams("id=C-NI") });
  assert.match(html, /Price Increase Defender/);
  assert.match(html, /data-action="price-defender"/);
  assert.match(html, /needs exceptional evidence before a human accepts it/i);
});
