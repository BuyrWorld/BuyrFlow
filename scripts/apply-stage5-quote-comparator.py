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
if "runQuoteComparator(s, cmd, ctx)" not in domain:
    domain = replace_once(domain, 'export const VERSION = "0.11.0";', 'export const VERSION = "0.12.0";', "domain version")
    handler = r'''  runQuoteComparator(s, cmd, ctx) {
    const c = caseById(s, cmd.caseId);
    need(c, "case", "That case does not exist.");
    const rows = quoteComparison(s, c);
    const priced = rows.filter((r) => Number.isInteger(r.unitPricePence));
    need(priced.length >= 2, "quotes", "Quote Comparator needs at least two supplier prices before it can compare anything.");
    const units = new Set(priced.map((r) => r.unit).filter(Boolean));
    need(units.size === 1 && priced.every((r) => r.unit), "units", "The priced quotations do not use one comparable unit. Normalise the quote units before comparing them.");

    const sorted = [...priced].sort((a, b) => a.unitPricePence - b.unitPricePence || a.name.localeCompare(b.name));
    const lowest = sorted[0], highest = sorted[sorted.length - 1];
    const spreadPence = highest.unitPricePence - lowest.unitPricePence;
    const spreadBp = lowest.unitPricePence > 0 ? mulDivRound(spreadPence, 10000, lowest.unitPricePence) : null;
    const quantity = Number.isInteger(c.requirement?.quantity) && c.requirement.quantity > 0 ? c.requirement.quantity : null;
    const totalSpreadPence = quantity ? spreadPence * quantity : null;
    need(totalSpreadPence === null || Number.isSafeInteger(totalSpreadPence), "size", "The quote exposure is too large to calculate safely.");

    const leads = rows.filter((r) => Number.isInteger(r.leadDays)).sort((a, b) => a.leadDays - b.leadDays || a.name.localeCompare(b.name));
    const fastest = leads[0] || null, slowest = leads.length ? leads[leads.length - 1] : null;
    const capabilityId = "quote-comparator";
    const basis = rows.map((r) => `${r.name}: ${Number.isInteger(r.unitPricePence) ? `${formatPence(r.unitPricePence)}/${r.unit}` : "price not recorded"}, ${Number.isInteger(r.leadDays) ? `${r.leadDays} days` : "lead time not recorded"}, ${r.approval}`).join("; ");

    const price = upsertCapabilityDerivedEvidence(c, ctx, {
      capabilityId, measure: "price-comparison", title: "Quote price comparison — derived",
      textValue: `${lowest.name} is the lowest comparable recorded price at ${formatPence(lowest.unitPricePence)}/${lowest.unit}. ${highest.name} is ${formatPence(spreadPence)}/${lowest.unit}${spreadBp === null ? "" : ` (${formatBp(spreadBp)})`} above it${totalSpreadPence === null ? "." : `, equal to ${formatPence(totalSpreadPence)} across ${quantity} ${lowest.unit}.`}`,
      basis, material: true,
    });
    const lead = upsertCapabilityDerivedEvidence(c, ctx, {
      capabilityId, measure: "lead-time-comparison", title: "Quote lead-time comparison — derived",
      textValue: fastest && slowest
        ? `${fastest.name} has the shortest recorded lead time at ${fastest.leadDays} days; ${slowest.name} has the longest at ${slowest.leadDays} days. This is not a supplier award or weighted score.`
        : "Comparable lead time is not recorded for enough suppliers to rank delivery positions. No value was guessed.",
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

    let review = openActions(s, c.id).find((a) => a.capabilityId === capabilityId && a.kind === KIND.EXECUTION);
    if (!review) {
      review = newAction(s, ctx, { title: "Review quote trade-offs and record the sourcing decision", caseId: c.id, kind: KIND.EXECUTION,
        owner: ctx.actor.role, priority: "high", dueDate: addDays(ctx.today, 2),
        completionTest: "Price, lead time, approval status and evidence reviewed; a human sourcing decision recorded",
        expectedResult: "A defensible human sourcing decision with no hidden composite score", authority: "Human sourcing decision required", capabilityId });
    }

    ctx.emit(c.id, "Quote Comparator run",
      `${priced.length} priced quotations compared in ${lowest.unit}. Lowest ${lowest.name} at ${formatPence(lowest.unitPricePence)}/${lowest.unit}; `
      + `spread ${formatPence(spreadPence)}/${lowest.unit}${totalSpreadPence === null ? "" : `, ${formatPence(totalSpreadPence)} across recorded quantity`}. `
      + `Derived evidence ${price.changed || lead.changed ? "updated" : "unchanged"}. No supplier was scored, selected or awarded.`);
    return { lowestSupplierId: lowest.supplierId, lowestUnitPricePence: lowest.unitPricePence, highestSupplierId: highest.supplierId,
      spreadPence, spreadBp, quantity, totalSpreadPence, evidenceIds: [price.evidence.id, lead.evidence.id],
      createdGapActions: createdGapActions.length, reviewActionId: review.id };
  },

'''
    domain = replace_once(domain, "  addEvidence(s, cmd, ctx) {", handler + "  addEvidence(s, cmd, ctx) {", "Quote Comparator handler")
    write(p, domain)

# ---------------------------------------------------------------- views
p = "public/views.js"
views = read(p)
if "data-action=\"quote-comparator\"" not in views:
    replacement = r'''function quotesPanel(s, c) {
  const rows = D.quoteComparison(s, c);
  const priced = rows.filter((r) => Number.isInteger(r.unitPricePence));
  const comparableUnits = new Set(priced.map((r) => r.unit).filter(Boolean));
  const canRun = priced.length >= 2 && comparableUnits.size === 1 && priced.every((r) => r.unit);
  const recordedEvidence = c.evidence.find((e) => e.capabilityId === "quote-comparator" && e.measure === "price-comparison");
  const recorded = recordedEvidence ? D.current(recordedEvidence) : null;
  return `<div class="bw-panel"><div class="panel-head"><div><div class="eyebrow">Quote Comparator · deterministic</div><h2>Compared on what can actually be compared</h2></div><div class="toolbar"><button class="bw-action-primary" data-action="quote-comparator" data-case="${esc(c.id)}"${canRun ? "" : " disabled"}>${recorded ? "Refresh comparison" : "Run Quote Comparator"}</button><button class="bw-action-secondary" data-action="link-supplier" data-case="${esc(c.id)}">Link supplier</button></div></div>`
    + `<p class="small">No composite score and no automatic award. Price, lead time and approval status stay visible as separate commercial facts.${recorded ? ` Last frozen into Case evidence ${esc(D.formatStamp(recorded.recordedAt))}.` : ""}</p>`
    + (!canRun ? `<div class="callout">Add at least two prices in the same unit before running the comparator. BuyrWorld will not normalise unlike units by guessing.</div>` : "")
    + (rows.length ? `<div class="table-wrap"><table><caption class="sr-only">Supplier positions on ${esc(c.ref)}</caption><thead><tr><th scope="col">Supplier</th><th scope="col">Approval</th><th scope="col">Lead time</th><th scope="col">Unit price</th><th scope="col">Above lowest</th><th scope="col">OTD</th></tr></thead><tbody>`
      + rows.map((r) => `<tr><th scope="row">${esc(r.name)}${r.incumbent ? ' <span class="tag">incumbent</span>' : ""}</th><td>${esc(r.approval)}</td><td>${Number.isInteger(r.leadDays) ? `${r.leadDays} days` : "not quoted"}</td>`
        + `<td>${Number.isInteger(r.unitPricePence) ? `${esc(D.formatPence(r.unitPricePence))}${r.unit ? `/${esc(r.unit)}` : ""}` : "not quoted"}</td>`
        + `<td>${r.overLowestPence === null ? "—" : r.overLowestPence === 0 ? "lowest" : `+${esc(D.formatPence(r.overLowestPence))}`}</td>`
        + `<td>${Number.isInteger(r.otdPct) ? `${r.otdPct}%` : "not recorded"}</td></tr>`).join("")
      + `</tbody></table></div>` : `<div class="empty">No supplier is linked to this case yet. Link one to request evidence from it.</div>`)
    + `</div>`;
}

function decisionCard'''
    views = regex_once(views, r"function quotesPanel\(s, c\) \{.*?\n\}\n\nfunction decisionCard", replacement, "quotes panel")
    write(p, views)

# ---------------------------------------------------------------- app
p = "public/app.js"
app = read(p)
if '"quote-comparator"' not in app:
    app = replace_once(app,
        '  "price-defender": (b) => priceDefenderForm(b.dataset.case),\n',
        '  "price-defender": (b) => priceDefenderForm(b.dataset.case),\n  "quote-comparator": (b) => runAndShow({ type: "runQuoteComparator", caseId: b.dataset.case }, (r) => r.result.totalSpreadPence === null ? `Quote comparison frozen into Case evidence.` : `Quote comparison frozen. Recorded quantity exposure between lowest and highest is ${D.formatPence(r.result.totalSpreadPence)}.`),\n',
        "Quote Comparator action")
    write(p, app)

# ---------------------------------------------------------------- shell + package
p = "public/index.html"
html = read(p).replace("Flagship build · Release B v0.11.0", "Flagship build · Release B v0.12.0")
write(p, html)
p = "package.json"
pkg = read(p).replace('"version": "0.11.0"', '"version": "0.12.0"')
write(p, pkg)

# ---------------------------------------------------------------- tests
write("tests/quote-comparator.test.mjs", r'''import test from "node:test";
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
''')

# ---------------------------------------------------------------- programme + release note
p = "FLAGSHIP_IMPLEMENTATION_PROGRAM.md"
programme = read(p)
if "Release B implementation log — v0.12.0" not in programme:
    programme += r'''

## Release B implementation log — v0.12.0 (18 October 2026)

### Stage 5 second vertical slice — Quote Comparator

Implemented using the same Case capability contract as Price Increase Defender:
- compares at least two recorded supplier prices only when units are genuinely comparable;
- calculates unit-price spread and recorded-quantity exposure exactly in pence;
- calculates price spread in basis points without floating-point arithmetic;
- freezes price and lead-time comparison as versioned DERIVED evidence;
- creates missing evidence work without duplicating existing gap actions;
- creates one governed sourcing-review action;
- refuses unlike units rather than inventing a conversion;
- deliberately does not create a composite supplier score, select a winner or award business.

Stage 5 remains **IN PROGRESS**. The capability pattern is now proven across commercial-change and multi-quote cases; RFQ / Should-Cost / technical evidence remain to integrate before Stage 5 can be considered broadly complete.
'''
    write(p, programme)

write("RELEASE_B_V012.md", r'''# BuyrFlow Release B v0.12.0 — Quote Comparator

Status: **Stage 5 second vertical slice / audit candidate**

Quote Comparator now runs inside a Procurement Case rather than as a separate tool. It consumes the linked supplier quotations, performs exact deterministic comparison, freezes the result as DERIVED evidence, creates missing-evidence work, and creates one human sourcing-review action.

## Deliberate boundaries

- No composite supplier score.
- No automatic supplier selection.
- No automatic award.
- No guessed unit conversion.
- No hidden weighting of price, lead time, OTD or approval status.

The buyer sees the trade-offs and the human decision remains explicit.
''')

print("Stage 5 Quote Comparator transformation applied.")
