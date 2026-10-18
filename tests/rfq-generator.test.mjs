import test from "node:test";
import assert from "node:assert/strict";
import * as D from "../public/domain.js";
import * as V from "../public/views.js";

const actor = { name: "Test Buyer", role: "Commodity Manager" };
function context(now = "2026-10-18T14:00:00.000Z") { let n = 0; return { now, today: "2026-10-18", id: () => `rfq-id-${++n}` }; }
const run = (state, caseId = "C-MACH", now) => D.apply(state, { type: "runRfqGenerator", caseId }, actor, context(now));

test("RFQ Generator creates a structured draft from Case requirement and linked suppliers", () => {
  const s = D.seedState(); s.settings.user = actor;
  const out = run(s);
  assert.equal(out.result.supplierCount, 2);
  const rfq = out.state.rfqs.find((x) => x.id === out.result.rfqId);
  assert.equal(rfq.status, "draft");
  assert.equal(rfq.versions.length, 1);
  assert.deepEqual(rfq.versions[0].snapshot.requirement, { quantity: 1400, unit: "ea", spec: "Rev F, first-article inspection required", needBy: null });
  assert.deepEqual(rfq.versions[0].snapshot.suppliers.map((x) => x.name), ["Kestrel CNC", "Vector Precision"]);
  assert.ok(rfq.versions[0].snapshot.responseFields.includes("unit price"));
});

test("RFQ Generator carries unresolved evidence into the draft as clarifications", () => {
  const s = D.seedState(); s.settings.user = actor;
  const out = run(s);
  const rfq = out.state.rfqs.find((x) => x.id === out.result.rfqId);
  assert.ok(rfq.versions[0].snapshot.openClarifications.some((x) => x.title === "Rate evidence"));
  const ev = D.caseById(out.state, "C-MACH").evidence.find((x) => x.capabilityId === "rfq-generator");
  assert.equal(D.current(ev).state, D.STATE.DERIVED);
  assert.match(D.current(ev).text, /clarification/i);
});

test("RFQ Generator is idempotent but versions the artefact when Case inputs change", () => {
  const s = D.seedState(); s.settings.user = actor;
  const first = run(s);
  const second = run(first.state);
  let rfq = second.state.rfqs.find((x) => x.id === first.result.rfqId);
  assert.equal(rfq.versions.length, 1);
  const changed = structuredClone(second.state);
  D.caseById(changed, "C-MACH").requirement.quantity = 1500;
  const third = run(changed, "C-MACH", "2026-10-18T15:00:00.000Z");
  rfq = third.state.rfqs.find((x) => x.id === first.result.rfqId);
  assert.equal(rfq.versions.length, 2);
  assert.equal(rfq.versions[1].snapshot.requirement.quantity, 1500);
});

test("RFQ Generator refuses incomplete requirements instead of inventing them", () => {
  const s = D.seedState(); s.settings.user = actor;
  D.caseById(s, "C-MACH").requirement.spec = null;
  assert.throws(() => run(s), (e) => e instanceof D.Refusal && e.code === "requirement" && /specification/.test(e.message));
});

test("RFQ Generator creates one human review action and never sends externally", () => {
  const s = D.seedState(); s.settings.user = actor;
  const first = run(s), second = run(first.state);
  const actions = D.openActions(second.state, "C-MACH").filter((a) => a.capabilityId === "rfq-generator" && a.kind === D.KIND.EXECUTION);
  assert.equal(actions.length, 1);
  assert.match(actions[0].authority, /Human external communication approval required/);
  assert.equal(second.state.rfqs[0].status, "draft");
  const event = second.events.find((e) => e.type === "RFQ draft prepared");
  assert.match(event.text, /No RFQ was sent/);
});

test("Case UI exposes RFQ Generator as a draft-only capability", () => {
  const s = D.seedState();
  const html = V.renderCases(s, { today: "2026-10-18", params: new URLSearchParams("id=C-MACH") });
  assert.match(html, /RFQ Generator/);
  assert.match(html, /data-action="rfq-generator"/);
  assert.match(html, /Draft only/);
});
