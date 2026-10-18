from pathlib import Path
import re


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, text):
    Path(path).write_text(text, encoding="utf-8")


def replace_once(source, needle, replacement, label):
    count = source.count(needle)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one anchor, found {count}")
    return source.replace(needle, replacement, 1)


def regex_once(source, pattern, replacement, label):
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return updated


# ---------------------------------------------------------------- domain
path = "public/domain.js"
domain = read(path)
if "runPriceIncreaseDefender(s, cmd, ctx)" not in domain:
    domain = replace_once(domain, 'export const VERSION = "0.8.0";', 'export const VERSION = "0.11.0";', "domain version")

    helper = r'''function upsertCapabilityDerivedEvidence(c, ctx, { capabilityId, measure, title, textValue, basis, material = true }) {
  let e = c.evidence.find((x) => x.capabilityId === capabilityId && x.measure === measure);
  const source = { kind: "calculation", document: "Price Increase Defender", from: "BuyrWorld deterministic commercial engine", date: ctx.today };
  if (!e) {
    e = newEvidence(ctx, { title, state: STATE.DERIVED, textValue, source, basis, material, question: false });
    e.capabilityId = capabilityId;
    e.measure = measure;
    c.evidence.push(e);
    return { evidence: e, changed: true };
  }
  const prev = current(e);
  if (prev.text === textValue && prev.basis === basis) return { evidence: e, changed: false };
  e.versions.push({ v: prev.v + 1, state: STATE.DERIVED, text: textValue, source, basis,
    recordedAt: ctx.now, recordedBy: ctx.actor, assessment: null });
  return { evidence: e, changed: true };
}

'''
    domain = replace_once(domain, "const HANDLERS = {", helper + "const HANDLERS = {", "domain helper insertion")

    handler = r'''  runPriceIncreaseDefender(s, cmd, ctx) {
    const c = caseById(s, cmd.caseId);
    need(c, "case", "That case does not exist.");
    need(c.type === "claim", "case-type", "Price Increase Defender only runs on a supplier price or terms-change case.");
    need(Number.isInteger(cmd.askBp), "ask", "Record the supplier increase being asked for.");
    need(Number.isInteger(cmd.capBp), "cap", "Record the contractual cap or comparison threshold.");
    need(Number.isInteger(cmd.annualSpendPence) && cmd.annualSpendPence >= 0, "spend", "Record the annual spend in pounds.");
    if (cmd.effectiveDate) need(isIsoDate(cmd.effectiveDate), "effective-date", "The effective date is not a real date.");

    c.claim = c.claim || { askBp: null, capBp: null, annualSpendPence: null, effectiveDate: null };
    c.claim.askBp = cmd.askBp;
    c.claim.capBp = cmd.capBp;
    c.claim.annualSpendPence = cmd.annualSpendPence;
    c.claim.effectiveDate = cmd.effectiveDate || c.claim.effectiveDate || null;

    const x = claimExcess(c);
    need(!x.withheld, "inputs", x.withheld || "The commercial inputs are incomplete.");
    const capabilityId = "price-increase-defender";
    const basis = `Supplier ask ${formatBp(x.askBp)}; contract cap ${formatBp(x.capBp)}; annual spend ${formatPence(x.spendPence)}. Exact integer arithmetic in basis points and pence.`;

    const exposure = upsertCapabilityDerivedEvidence(c, ctx, {
      capabilityId, measure: "annual-exposure", title: "Price increase exposure — derived",
      textValue: `A ${formatBp(x.askBp)} supplier increase on ${formatPence(x.spendPence)} annual spend equals ${formatPence(x.askPence)} a year.`,
      basis, material: true,
    });
    const aboveCap = upsertCapabilityDerivedEvidence(c, ctx, {
      capabilityId, measure: "above-contract-cap", title: "Movement above contract cap — derived",
      textValue: x.excessBp > 0
        ? `The ask is ${formatPoints(x.excessBp)} above the ${formatBp(x.capBp)} cap: ${formatPence(x.excessPence)} a year requires exceptional evidence before acceptance.`
        : `The ${formatBp(x.askBp)} ask does not exceed the ${formatBp(x.capBp)} contract cap.`,
      basis, material: true,
    });

    const covered = new Set(openActions(s, c.id).map((a) => a.evidenceId).filter(Boolean));
    const createdGapActions = [];
    for (const e of openGaps(c)) {
      if (covered.has(e.id)) continue;
      const a = newAction(s, ctx, { title: `Close evidence gap: ${e.title}`, caseId: c.id, kind: KIND.EVIDENCE,
        evidenceId: e.id, owner: ctx.actor.role, priority: "high", dueDate: addDays(ctx.today, 2),
        completionTest: `${e.title} received and assessed`, expectedResult: `${e.title} received and assessed`, capabilityId });
      createdGapActions.push(a.ref);
    }

    let negotiation = openActions(s, c.id).find((a) => a.capabilityId === capabilityId && a.kind === KIND.EXECUTION);
    const challengeTitle = x.excessPence > 0
      ? `Prepare challenge position for ${formatPence(x.excessPence)} annual exposure above cap`
      : "Prepare evidence-backed response to supplier price change";
    const expected = x.excessPence > 0
      ? `Human decision supported by evidence on the ${formatPence(x.excessPence)} annual exposure above the contractual cap`
      : "Human decision supported by the contract and supplier cost evidence";
    if (!negotiation) {
      negotiation = newAction(s, ctx, { title: challengeTitle, caseId: c.id, kind: KIND.EXECUTION,
        owner: ctx.actor.role, priority: x.excessPence > 0 ? "high" : "normal", dueDate: addDays(ctx.today, 2),
        completionTest: "Negotiation position reviewed against evidence and a human decision recorded",
        expectedResult: expected, authority: "Human commercial decision required", capabilityId });
    } else {
      negotiation.title = challengeTitle;
      negotiation.expectedResult = expected;
      negotiation.priority = x.excessPence > 0 ? "high" : "normal";
    }

    ctx.emit(c.id, "Price Increase Defender run",
      `${formatBp(x.askBp)} ask on ${formatPence(x.spendPence)} annual spend = ${formatPence(x.askPence)} a year; `
      + `${formatPence(x.excessPence)} a year sits above the ${formatBp(x.capBp)} cap. `
      + `Derived evidence ${exposure.changed || aboveCap.changed ? "updated" : "unchanged"}; `
      + `${createdGapActions.length} missing-evidence action${createdGapActions.length === 1 ? "" : "s"} created. `
      + "No supplier commitment was made.");
    return { ...x, evidenceIds: [exposure.evidence.id, aboveCap.evidence.id],
      createdGapActions: createdGapActions.length, negotiationActionId: negotiation.id };
  },

'''
    domain = replace_once(domain, "  addEvidence(s, cmd, ctx) {", handler + "  addEvidence(s, cmd, ctx) {", "Price Defender handler")
    write(path, domain)

# ---------------------------------------------------------------- views
path = "public/views.js"
views = read(path)
if "Run Price Increase Defender" not in views:
    claim_panel = r'''function claimPanel(c) {
  const x = D.claimExcess(c);
  const recordedEvidence = c.evidence.find((e) => e.capabilityId === "price-increase-defender" && e.measure === "annual-exposure");
  const recorded = recordedEvidence ? D.current(recordedEvidence) : null;
  const button = `<button class="bw-action-primary" data-action="price-defender" data-case="${esc(c.id)}">${recorded ? "Refresh Defender" : "Run Price Increase Defender"}</button>`;
  if (x.withheld) return `<div class="calc"><div class="eyebrow">Price Increase Defender</div><h2>Build the commercial position</h2><p>${esc(x.withheld)}</p><p class="small">The calculation is withheld rather than guessed. Enter the supplier ask, contract cap and annual spend to continue.</p><div class="toolbar">${button}</div></div>`;
  return `<div class="calc"><div class="eyebrow">Price Increase Defender · deterministic</div><h2>Ask, contract and annual exposure</h2>`
    + `<div class="metrics"><div class="metric"><b>${esc(D.formatBp(x.askBp))}</b><small>supplier ask</small></div><div class="metric"><b>${esc(D.formatPence(x.askPence))}</b><small>annual cost of ask</small></div><div class="metric"><b>${esc(D.formatBp(x.capBp))}</b><small>contract cap</small></div><div class="metric"><b>${esc(D.formatPence(x.excessPence))}</b><small>annual exposure above cap</small></div></div>`
    + `<div class="callout">${x.excessBp > 0 ? `The ask is ${esc(D.formatPoints(x.excessBp))} above the cap. ${esc(D.formatPence(x.excessPence))} a year therefore needs exceptional evidence before a human accepts it.` : "The ask is within the recorded cap. Evidence is still needed to support the commercial change before a human decision."}</div>`
    + `<p class="small">${recorded ? `Last frozen into Case evidence ${esc(D.formatStamp(recorded.recordedAt))}. Re-running only creates a new evidence version when an input changes.` : "This is a live calculation. Run Defender to freeze it into the evidence ledger and create the missing-evidence / negotiation work."}</p>`
    + `<div class="toolbar">${button}</div></div>`;
}

function quotesPanel'''
    views = regex_once(views, r"function claimPanel\(c\) \{.*?\n\}\n\nfunction quotesPanel", claim_panel, "claim panel")
    write(path, views)

# ---------------------------------------------------------------- app
path = "public/app.js"
app = read(path)
if "function priceDefenderForm(caseId)" not in app:
    form = r'''function priceDefenderForm(caseId) {
  const c = D.caseById(state, caseId);
  if (!c || c.type !== "claim") return;
  const claim = c.claim || {};
  openWorkbench({
    title: `Price Increase Defender · ${c.ref}`,
    lede: "Exact arithmetic first. Running this freezes the calculation into Case evidence and creates the work needed to support a human commercial decision. It never accepts the increase or contacts the supplier.",
    submit: "Run Defender",
    fields: [
      { name: "ask", label: "Supplier increase asked for (%)", required: true, value: Number.isInteger(claim.askBp) ? D.formatBp(claim.askBp) : "", placeholder: "e.g. 7.8" },
      { name: "cap", label: "Contract cap / comparison threshold (%)", required: true, value: Number.isInteger(claim.capBp) ? D.formatBp(claim.capBp) : "", placeholder: "e.g. 4" },
      { name: "spend", label: "Annual spend (£)", required: true, value: Number.isInteger(claim.annualSpendPence) ? D.formatPence(claim.annualSpendPence) : "", placeholder: "e.g. 232,800" },
      { name: "effectiveDate", label: "Requested effective date", type: "date", value: claim.effectiveDate || "" },
    ],
    onSubmit: (d) => {
      const askBp = D.parsePercentToBp(d.ask);
      const capBp = D.parsePercentToBp(d.cap);
      const annualSpendPence = D.parseMoneyToPence(d.spend);
      if (askBp === null) return { ok: false, refusal: "The supplier ask must be a percentage, like 7.8." };
      if (capBp === null) return { ok: false, refusal: "The contract cap must be a percentage, like 4." };
      if (annualSpendPence === null) return { ok: false, refusal: "Annual spend must be an amount in pounds." };
      const r = run({ type: "runPriceIncreaseDefender", caseId: c.id, askBp, capBp, annualSpendPence, effectiveDate: d.effectiveDate || null });
      if (r.ok) {
        render();
        toast(`Defender recorded ${D.formatPence(r.result.excessPence)} a year above the cap and created ${r.result.createdGapActions} missing-evidence action${r.result.createdGapActions === 1 ? "" : "s"}.`);
      }
      return r;
    },
  });
}

'''
    app = replace_once(app, "/* =========================================================== intake (Today) */", form + "/* =========================================================== intake (Today) */", "app Price Defender form")
    app = replace_once(app,
        '  "close-action": (b) => closeActionForm(b.dataset.id),\n',
        '  "close-action": (b) => closeActionForm(b.dataset.id),\n  "price-defender": (b) => priceDefenderForm(b.dataset.case),\n',
        "app action map")
    write(path, app)

# ---------------------------------------------------------------- shell + package
path = "public/index.html"
html = read(path)
html = html.replace("Flagship foundation · Release A v0.8.1", "Flagship build · Release B v0.11.0")
write(path, html)

path = "package.json"
pkg = read(path)
pkg = pkg.replace('"version": "0.10.0"', '"version": "0.11.0"')
write(path, pkg)

# ---------------------------------------------------------------- tests
write("tests/price-defender.test.mjs", r'''import test from "node:test";
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
''')

# ---------------------------------------------------------------- programme + release note
path = "FLAGSHIP_IMPLEMENTATION_PROGRAM.md"
programme = read(path)
if "Release B implementation log — v0.11.0" not in programme:
    programme += r'''

## Release B implementation log — v0.11.0 (18 October 2026)

### Stage 5 vertical slice — Price Increase Defender

Implemented as a real Case capability rather than a separate mini-app:
- consumes a supplier commercial-change Procurement Case;
- validates supplier ask, contract cap and annual spend;
- calculates ask/cap/excess using integer basis points and pence only;
- freezes the calculation as versioned DERIVED evidence with explicit basis/provenance;
- creates missing evidence actions without duplication;
- creates one governed negotiation-preparation action;
- re-running with unchanged inputs is idempotent; changed inputs create a new evidence version;
- never accepts the increase, contacts the supplier or bypasses the existing human decision/approval gate.

Stage 5 remains **IN PROGRESS** until the capability is exercised through the deployed browser workflow and the next capabilities (Quote Comparator / RFQ / Should-Cost) use the same Case contract.
'''
    write(path, programme)

write("RELEASE_B_V011.md", r'''# BuyrFlow Release B v0.11.0 — Price Increase Defender

Status: **Stage 5 vertical slice / audit candidate**

This release integrates the first BuyrWorld procurement-intelligence capability into the Procurement Case spine.

## Contract

Price Increase Defender now follows:

`Case → deterministic calculation → DERIVED evidence → BuyrFlow evidence work → human decision gate → execution → outcome`

It does not accept supplier terms or send external communication.

## Exact commercial measures

All commercial arithmetic remains integer pence and basis points. The capability records supplier ask, contract cap, annual requested cost, contractual-cap cost and annual exposure above cap.

## Evidence + workflow

Running Defender freezes the commercial calculation into versioned DERIVED evidence. Missing material evidence receives linked BuyrFlow actions; one execution action prepares the eventual negotiation position. Re-running identical inputs is idempotent. Changed inputs create new evidence versions so earlier decisions can become stale rather than history being rewritten.

## Release gate

This is not a Stage 5 PASS by itself. It must pass the full repository suite, Vercel build, browser review, and remain understandable in the simplified Today / My work / Case experience.
''')

print("Stage 5 Price Increase Defender transformation applied.")
