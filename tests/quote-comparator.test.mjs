import test from "node:test";
import assert from "node:assert/strict";
import * as D from "../public/domain.js";
import * as V from "../public/views.js";

const actor = { name: "Test Buyer", role: "Commodity Manager" };
function context() { let n = 0; return { now: "2026-10-18T13:00:00.000Z", today: "2026-10-18", id: () => `quote-id-${++n}` }; }

function run(state, caseId = "C-MACH") {
  return D.apply(state, { type: "runQuoteComparator", caseId }, actor, context());
}

test("Quote Comparator calculates exact spread and quantity exposure", () => {
  const s = D.seedState(); s.settings.user = actor;
  const out = run(s);
  assert.equal(out.result.lowestUnitPricePence, 24_540);
  assert.equal(out.result.spreadPence, 980);
  assert.equal(out.result.spreadBp, 399);
  assert.equal(out.result.totalSpreadPence, 1_372_000);
  const c = D.caseById(out.state, "C-MACH");
  const derived = c.evidence.filter((e) => e.capabilityId === "quote-comparator");
  assert.equal(derived.length, 2);
  assert.ok(derived.every((e) => D.current(e).state === D.STATE.DERIVED));
});

test("Quote Comparator is idempotent and creates one governed sourcing action", () => {
  const s = D.seedState(); s.settings.user = actor;
  const first = run(s), second = run(first.state);
  const actions = D.openActions(second.state, "C-MACH");
  assert.equal(actions.filter((a) => a.capabilityId === "quote-comparator" && a.kind === D.KIND.EXECUTION).length, 1);
  assert.equal(D.caseById(second.state, "C-MACH").evidence.filter((e) => e.capabilityId === "quote-comparator").length, 2);
});

test("unlike quote units are refused rather than silently normalised", () => {
  const s = D.seedState(); s.settings.user = actor;
  const c = D.caseById(s, "C-MACH");
  c.quotes[1].unit = "kg";
  assert.throws(() => run(s), (e) => e instanceof D.Refusal && e.code === "units");
});

test("Quote Comparator does not create a composite score or supplier award", () => {
  const s = D.seedState(); s.settings.user = actor;
  const out = run(s);
  const actions = D.openActions(out.state, "C-MACH").filter((a) => a.capabilityId === "quote-comparator");
  assert.ok(actions.every((a) => !/award|winner|score/i.test(a.title)));
  const event = out.events.find((e) => e.type === "Quote Comparator run");
  assert.match(event.text, /No supplier was scored, selected or awarded/);
});

test("Case UI exposes Quote Comparator with the no-composite-score rule", () => {
  const s = D.seedState();
  const html = V.renderCases(s, { today: "2026-10-18", params: new URLSearchParams("id=C-MACH") });
  assert.match(html, /Quote Comparator/);
  assert.match(html, /data-action="quote-comparator"/);
  assert.match(html, /No composite score and no automatic award/);
});
