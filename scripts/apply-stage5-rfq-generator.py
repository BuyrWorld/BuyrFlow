from pathlib import Path
import re


def read(path): return Path(path).read_text(encoding="utf-8")
def write(path, text): Path(path).write_text(text, encoding="utf-8")
def replace_once(source, needle, replacement, label):
    count = source.count(needle)
    if count != 1: raise RuntimeError(f"{label}: expected one anchor, found {count}")
    return source.replace(needle, replacement, 1)
def regex_once(source, pattern, replacement, label):
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1: raise RuntimeError(f"{label}: expected one match, found {count}")
    return updated

# ---------------------------------------------------------------- domain
p = "public/domain.js"
domain = read(p)
if "runRfqGenerator(s, cmd, ctx)" not in domain:
    domain = replace_once(domain, 'export const VERSION = "0.12.0";', 'export const VERSION = "0.13.0";', "domain version")
    handler = r'''  runRfqGenerator(s, cmd, ctx) {
    const c = caseById(s, cmd.caseId);
    need(c, "case", "That case does not exist.");
    need(["sourcing", "quote", "shortage"].includes(c.type), "case-type", "RFQ Generator is for sourcing, quote-comparison or supply-recovery cases.");
    const missing = [];
    if (!Number.isInteger(c.requirement?.quantity) || c.requirement.quantity <= 0) missing.push("quantity");
    if (!text(c.requirement?.unit)) missing.push("unit");
    if (!text(c.requirement?.spec)) missing.push("requirement / specification");
    need(!missing.length, "requirement", `RFQ draft needs ${missing.join(", ")} before it can be prepared.`);
    need(c.quotes.length, "suppliers", "Link at least one supplier to the case before preparing an RFQ draft.");

    if (!Array.isArray(s.rfqs)) s.rfqs = [];
    if (!s.seq.rfq) s.seq.rfq = 0;
    const capabilityId = "rfq-generator";
    const supplierSnapshot = c.quotes.map((q) => {
      const sp = supplierById(s, q.supplierId);
      return { supplierId: q.supplierId, name: sp?.name || "Unknown supplier", approval: q.approval };
    });
    const gaps = openGaps(c);
    const snapshot = {
      requirement: { quantity: c.requirement.quantity, unit: c.requirement.unit, spec: c.requirement.spec, needBy: c.requirement.needBy || null },
      suppliers: supplierSnapshot,
      openClarifications: gaps.map((e) => ({ evidenceId: e.id, title: e.title, status: evidenceStatus(e) })),
      responseFields: ["unit price", "lead time", "commercial terms", "capacity confirmation", "exceptions / deviations"],
    };
    const fingerprint = JSON.stringify(snapshot);
    let rfq = s.rfqs.find((x) => x.caseId === c.id && x.capabilityId === capabilityId);
    let versionChanged = false;
    if (!rfq) {
      s.seq.rfq += 1;
      rfq = { id: ctx.id(), ref: `RFQ-${String(s.seq.rfq).padStart(4, "0")}`, caseId: c.id, capabilityId,
        status: "draft", createdAt: ctx.now, createdBy: ctx.actor, versions: [] };
      s.rfqs.unshift(rfq);
    }
    const currentVersion = rfq.versions[rfq.versions.length - 1];
    if (!currentVersion || currentVersion.fingerprint !== fingerprint) {
      rfq.versions.push({ version: rfq.versions.length + 1, at: ctx.now, by: ctx.actor, fingerprint, snapshot });
      versionChanged = true;
    }

    const v = rfq.versions[rfq.versions.length - 1];
    const evidence = upsertCapabilityDerivedEvidence(c, ctx, {
      capabilityId, measure: "rfq-draft", title: "RFQ draft prepared — derived",
      textValue: `${rfq.ref} v${v.version} prepared for ${supplierSnapshot.length} linked supplier${supplierSnapshot.length === 1 ? "" : "s"}: ${c.requirement.quantity} ${c.requirement.unit}, ${c.requirement.spec}.${gaps.length ? ` ${gaps.length} material clarification${gaps.length === 1 ? " remains" : "s remain"} open and are listed in the draft.` : " No material evidence gaps remain open."}`,
      basis: `Structured from ${c.ref} requirement, linked suppliers and current evidence state. Draft only; no external message was sent.`,
      material: true,
    });

    let review = openActions(s, c.id).find((a) => a.capabilityId === capabilityId && a.kind === KIND.EXECUTION);
    if (!review) {
      review = newAction(s, ctx, { title: `Review ${rfq.ref} before external issue`, caseId: c.id, kind: KIND.EXECUTION,
        owner: ctx.actor.role, priority: gaps.length ? "high" : "normal", stage: "prepare", dueDate: addDays(ctx.today, 2),
        completionTest: "RFQ requirement, supplier list, clarifications and commercial response fields reviewed by a human",
        expectedResult: "Approved RFQ content ready for an authorised external issue step", authority: "Human external communication approval required", capabilityId });
    } else {
      review.title = `Review ${rfq.ref} before external issue`;
      review.priority = gaps.length ? "high" : "normal";
    }

    ctx.emit(c.id, "RFQ draft prepared",
      `${rfq.ref} v${v.version} prepared for ${supplierSnapshot.length} supplier${supplierSnapshot.length === 1 ? "" : "s"}. `
      + `${gaps.length} open material clarification${gaps.length === 1 ? "" : "s"} carried into the draft. `
      + `No RFQ was sent and no supplier commitment was made.`);
    return { rfqId: rfq.id, rfqRef: rfq.ref, version: v.version, versionChanged, evidenceId: evidence.evidence.id,
      supplierCount: supplierSnapshot.length, clarificationCount: gaps.length, reviewActionId: review.id };
  },

'''
    domain = replace_once(domain, "  addEvidence(s, cmd, ctx) {", handler + "  addEvidence(s, cmd, ctx) {", "RFQ handler")
    write(p, domain)

# ---------------------------------------------------------------- views
p = "public/views.js"
views = read(p)
if "RFQ Generator" not in views:
    panel = r'''function rfqPanel(s, c) {
  if (!["sourcing", "quote", "shortage"].includes(c.type)) return "";
  const rfq = (s.rfqs || []).find((x) => x.caseId === c.id && x.capabilityId === "rfq-generator");
  const v = rfq?.versions?.[rfq.versions.length - 1];
  const requirementReady = Number.isInteger(c.requirement?.quantity) && c.requirement.quantity > 0 && c.requirement.unit && c.requirement.spec;
  const canRun = requirementReady && c.quotes.length > 0;
  const gaps = D.openGaps(c);
  return `<section class="bw-panel"><div class="panel-head"><div><div class="eyebrow">RFQ Generator · structured draft</div><h2>${rfq ? `${esc(rfq.ref)} · v${v.version}` : "Prepare an RFQ from this Case"}</h2></div><button class="bw-action-primary" data-action="rfq-generator" data-case="${esc(c.id)}"${canRun ? "" : " disabled"}>${rfq ? "Refresh RFQ draft" : "Prepare RFQ draft"}</button></div>`
    + `<p class="lead">Builds the RFQ from the Case requirement, supplier list and current evidence. Draft only — BuyrWorld does not send it.</p>`
    + (!canRun ? `<div class="callout">Before a draft can be prepared, record quantity, unit and specification/requirement, and link at least one supplier.</div>` : "")
    + (v ? `<div class="rfq-summary"><div><small>REQUIREMENT</small><strong>${esc(v.snapshot.requirement.quantity)} ${esc(v.snapshot.requirement.unit)} · ${esc(v.snapshot.requirement.spec)}</strong></div><div><small>SUPPLIERS</small><strong>${v.snapshot.suppliers.map((x) => esc(x.name)).join(", ")}</strong></div><div><small>OPEN CLARIFICATIONS</small><strong>${v.snapshot.openClarifications.length ? v.snapshot.openClarifications.map((x) => esc(x.title)).join(", ") : "None"}</strong></div></div>` : "")
    + (gaps.length ? `<p class="small">${gaps.length} material evidence gap${gaps.length === 1 ? " remains" : "s remain"}. They are carried into the draft as clarifications rather than silently treated as facts.</p>` : "")
    + `</section>`;
}

function decisionCard'''
    views = replace_once(views, "function decisionCard", panel, "RFQ panel function")
    # Insert RFQ panel after quotes panel on case page.
    anchor = '    + quotesPanel(s, c)\n'
    if anchor not in views:
        # Some case layouts concatenate conditional panels differently; use exact existing return fragment.
        m = re.search(r"(\+ quotesPanel\(s, c\)[^\n]*\n)", views)
        if not m: raise RuntimeError("RFQ view insertion: quotesPanel call not found")
        views = views[:m.end()] + '    + rfqPanel(s, c)\n' + views[m.end():]
    else:
        views = views.replace(anchor, anchor + '    + rfqPanel(s, c)\n', 1)
    write(p, views)

# ---------------------------------------------------------------- app
p = "public/app.js"
app = read(p)
if '"rfq-generator"' not in app:
    app = replace_once(app,
        '  "quote-comparator": (b) => runAndShow({ type: "runQuoteComparator", caseId: b.dataset.case }, (r) => r.result.totalSpreadPence === null ? `Quote comparison frozen into Case evidence.` : `Quote comparison frozen. Recorded quantity exposure between lowest and highest is ${D.formatPence(r.result.totalSpreadPence)}.`),\n',
        '  "quote-comparator": (b) => runAndShow({ type: "runQuoteComparator", caseId: b.dataset.case }, (r) => r.result.totalSpreadPence === null ? `Quote comparison frozen into Case evidence.` : `Quote comparison frozen. Recorded quantity exposure between lowest and highest is ${D.formatPence(r.result.totalSpreadPence)}.`),\n  "rfq-generator": (b) => runAndShow({ type: "runRfqGenerator", caseId: b.dataset.case }, (r) => `${r.result.rfqRef} v${r.result.version} prepared as a draft for ${r.result.supplierCount} supplier${r.result.supplierCount === 1 ? "" : "s"}. Nothing was sent.`),\n',
        "RFQ action")
    write(p, app)

# ---------------------------------------------------------------- styles
p = "public/style.css"
style = read(p)
if ".rfq-summary" not in style:
    style += r'''
.rfq-summary{display:grid;grid-template-columns:1.1fr 1fr 1.2fr;gap:8px;margin:12px 0}.rfq-summary>div{padding:11px;border:1px solid var(--bw-border);border-radius:var(--bw-r);background:var(--bw-surface-2)}.rfq-summary small{display:block;color:var(--bw-subtle);font-size:9px;font-weight:700;letter-spacing:.1em;margin-bottom:5px}.rfq-summary strong{display:block;color:var(--bw-text);line-height:1.4}@media(max-width:720px){.rfq-summary{grid-template-columns:1fr}}
'''
    write(p, style)

# workflow commit list needs style.css too; handled by workflow rewrite separately if necessary.

# ---------------------------------------------------------------- shell + package
p = "public/index.html"
write(p, read(p).replace("Flagship build · Release B v0.12.0", "Flagship build · Release B v0.13.0"))
p = "package.json"
write(p, read(p).replace('"version": "0.12.0"', '"version": "0.13.0"'))

# ---------------------------------------------------------------- tests
write("tests/rfq-generator.test.mjs", r'''import test from "node:test";
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
''')

# ---------------------------------------------------------------- programme + note
p = "FLAGSHIP_IMPLEMENTATION_PROGRAM.md"
programme = read(p)
if "Release B implementation log — v0.13.0" not in programme:
    programme += r'''

## Release B implementation log — v0.13.0 (18 October 2026)

### Stage 5 third vertical slice — RFQ Generator

Implemented as a versioned structured Case artefact rather than generated prose:
- consumes quantity, unit, specification/requirement, linked suppliers and current evidence gaps;
- refuses to invent missing requirement data;
- creates/refreshes one versioned RFQ draft per Case;
- carries unresolved material evidence into the RFQ as explicit clarifications;
- freezes an RFQ-prepared DERIVED evidence item with provenance;
- creates one human RFQ-review action before any external issue step;
- never sends the RFQ or commits the organisation to a supplier;
- unchanged reruns are idempotent, while changed Case inputs create a new RFQ version.

Stage 5 remains **IN PROGRESS**. Price Increase Defender, Quote Comparator and RFQ Generator now demonstrate the shared capability contract across three workflows. Should-Cost and technical/document evidence remain the next depth targets.
'''
    write(p, programme)
write("RELEASE_B_V013.md", r'''# BuyrFlow Release B v0.13.0 — RFQ Generator

Status: **Stage 5 third vertical slice / audit candidate**

RFQ Generator now prepares a structured, versioned draft directly from a Procurement Case. It snapshots the requirement and intended suppliers, carries open evidence gaps as explicit clarifications, and creates a governed human review action.

## Deliberate boundaries

- Draft only: BuyrWorld does not send the RFQ.
- Missing quantity/unit/specification are refused, not guessed.
- Open evidence is exposed as a clarification, not silently converted into a fact.
- Re-running unchanged inputs does not create duplicate artefacts or work.
- Any eventual external issue step remains a separate authorised human-controlled action.
''')

print("Stage 5 RFQ Generator transformation applied.")
