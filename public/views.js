/**
 * BuyrFlow views — state in, HTML out.
 *
 * Pure: no DOM, no storage, no clock. app.js owns the page and the events;
 * this file only says what each screen shows, so every screen can be rendered
 * and checked in a test without a browser. Everything that came from a person
 * or a stored record goes through esc() before it reaches markup.
 */

import * as D from "./domain.js";

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

const slug = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** A status never signals by colour alone: it carries a dot and its word. */
export const chip = (word, tone = slug(word)) => `<span class="status s-${esc(tone)}"><i aria-hidden="true"></i>${esc(word)}</span>`;

const riskChip = (level) => chip(level, `risk-${slug(level)}`);
const evidenceChip = (status) => chip(D.STATUS_SAID[status], `ev-${status}`);

const money = (p) => (Number.isInteger(p) ? D.formatPence(p) : "not recorded");

function dueText(a, today) {
  if (!D.isIsoDate(a.dueDate)) return a.legacyDue ? `due “${esc(a.legacyDue)}” (no date recorded)` : "no due date";
  const days = D.daysBetween(today, a.dueDate);
  if (a.stage !== "closed" && days < 0) return `<strong class="overdue">overdue by ${-days} day${days === -1 ? "" : "s"}</strong> (${esc(D.formatDate(a.dueDate))})`;
  if (days === 0) return "due today";
  return `due ${esc(D.formatDate(a.dueDate))}`;
}

function pageHead(eyebrow, title, lead) {
  return `<div class="demo-strip"><strong>REVIEW DATA</strong> Synthetic standalone workspace — not live organisational or supplier performance.</div>`
    + `<div class="page-head"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1>${lead ? `<p class="lead">${esc(lead)}</p>` : ""}</div></div>`;
}

function actionRow(s, a, today) {
  const c = a.caseId ? D.caseById(s, a.caseId) : null;
  const sup = a.supplierId ? D.supplierById(s, a.supplierId) : null;
  const dot = a.priority === "critical" ? "critical" : a.priority === "high" ? "high" : "normal";
  return `<div class="row"><span class="dot ${dot}" aria-hidden="true"></span><div><strong>${esc(a.ref)} · ${esc(a.title)}</strong>`
    + `<p>${c ? `${esc(c.ref)} · ` : "Workspace · "}${esc(D.STAGE_LABEL[a.stage])} · ${esc(a.owner)} · ${dueText(a, today)}${sup ? ` · ${esc(sup.name)}` : ""}</p></div>`
    + `<a class="bw-action-secondary" href="/flow?focus=${encodeURIComponent(a.id)}">Open</a></div>`;
}

/* ===================================================================== today */

const EXAMPLES = [
  ["Price increase", "Supplier wants an 8% price increase from January"],
  ["Shortage", "Critical material shortage could stop production next month"],
  ["Quotes", "Compare the supplier quotations we received"],
  ["Supplier performance", "Supplier OTD and quality performance has deteriorated"],
];

export function renderIntake(ctx) {
  const p = ctx.pendingIntake;
  if (ctx.intakeMessage) return `<div class="route-result" role="status"><strong>${esc(ctx.intakeMessage.title)}</strong><br>${esc(ctx.intakeMessage.body)}</div>`;
  if (!p) return `<div class="route-result" role="status">Nothing is created until you confirm what BuyrWorld understood.</div>`;
  const all = Object.keys(D.CASE_TYPES);
  /* Nothing matched: the person picks the kind themselves rather than being
     sent away to rephrase. The words they wrote are kept either way. */
  const order = p.unclassified
    ? all
    : [p.type, ...p.alternatives, ...all.filter((k) => k !== p.type && !p.alternatives.includes(k))];
  const chosen = p.chosenType || (p.unclassified ? "" : p.type);
  const placeholder = p.unclassified
    ? `<option value=""${chosen ? "" : " selected"} disabled>Choose the kind of problem…</option>`
    : "";
  const opts = placeholder + order.map((k) => `<option value="${esc(k)}"${k === chosen ? " selected" : ""}>${esc(D.CASE_TYPES[k].label)}${p.unclassified ? "" : k === p.type ? " (best match)" : p.alternatives.includes(k) ? " (also matched)" : ""}</option>`).join("");
  const def = chosen ? D.CASE_TYPES[chosen] : null;
  const lead = p.unclassified
    ? `<p><strong>I couldn't tell what kind of problem this is.</strong> Your description is kept — choose the kind that fits and nothing else changes.</p>`
    : `<p><strong>Understood as:</strong> ${esc(D.CASE_TYPES[p.type].label)} — from the words ${p.matched.map((m) => `“${esc(m)}”`).join(", ")}.${p.confidence === "weak" ? " That is one word out of a short description, so check it." : ""}</p>`;

  const extra = chosen === "shortage"
    ? `<div class="field-row"><label>Quantity needed<input id="in-qty" inputmode="numeric" autocomplete="off"></label><label>Unit<input id="in-unit" placeholder="ft, ea, kg" autocomplete="off"></label><label>Need-by date<input id="in-needby" type="date"></label></div>`
    : chosen === "claim"
      ? `<div class="field-row"><label>Increase asked for (%)<input id="in-ask" inputmode="decimal" placeholder="7.8"></label><label>Contract cap (%)<input id="in-cap" inputmode="decimal" placeholder="4"></label><label>Annual spend (£)<input id="in-spend" inputmode="decimal" placeholder="232,800"></label></div>`
      : "";
  return `<div class="route-result confirm" role="status">`
    + lead
    + `<label class="field">${p.unclassified ? "What kind of problem is it?" : "Is that right? Change it if not"}<select id="in-type" data-change="intake-type">${opts}</select></label>`
    + (def
      ? `<p class="small">The case will start with your description recorded as a <em>claim</em> — something you said, not yet evidence — and these ${def.checklist.length} questions as open gaps: ${def.checklist.map(esc).join("; ")}.</p>`
      : `<p class="small">Pick a kind to see the questions the case will start with.</p>`)
    + extra
    /* Not optional any more: the approval threshold is applied to this, so a
       case without it cannot say whether its decision needs a second name. */
    + `<div class="field-row"><label>Value at stake (£)<input id="in-value" inputmode="decimal" autocomplete="off" placeholder="128,000"></label></div>`
    + `<p class="small">You can leave this for now and record it on the case, but a decision cannot be taken until it is known.</p>`
    + `<div class="toolbar"><button class="bw-action-primary" data-action="confirm-intake">Create ${p.example ? "example " : ""}case</button><button class="bw-action-secondary" data-action="cancel-intake">Not now</button></div>`
    + `</div>`;
}

export function renderToday(s, ctx) {
  const today = ctx.today;
  const m = D.workspaceMetrics(s, today);
  const user = s.settings.user;
  const prio = { critical: 0, high: 1, normal: 2 };
  const attention = s.actions.filter((a) => a.stage !== "closed")
    .sort((a, b) => {
      const ao = D.isIsoDate(a.dueDate) && a.dueDate < today ? 0 : 1, bo = D.isIsoDate(b.dueDate) && b.dueDate < today ? 0 : 1;
      return ao - bo || (prio[a.priority] ?? 9) - (prio[b.priority] ?? 9) || String(a.dueDate).localeCompare(String(b.dueDate));
    }).slice(0, 5);
  const gaps = s.cases.flatMap((c) => c.evidence.filter((e) => e.material && ["gap", "awaiting", "insufficient"].includes(D.evidenceStatus(e))).map((e) => ({ c, e })));

  return `<div class="demo-strip"><strong>REVIEW DATA</strong> Synthetic standalone workspace — not live organisational or supplier performance.</div>`
    + (user ? "" : `<section class="bw-panel who"><div><strong>Who is working?</strong><p>Your name and role are recorded against every change, decision and approval.</p></div><button class="bw-action-primary" data-action="set-user">Set name and role</button></section>`)
    + `<section class="solve signature-solve" aria-labelledby="solve-title"><div class="eyebrow">BuyrWorld workspace${user ? ` · ${esc(user.name)}, ${esc(user.role)}` : ""}</div>`
    + `<h1 id="solve-title">What needs resolving today?</h1>`
    + `<p class="lead">Describe what changed in normal procurement language. BuyrWorld shows what it understood and asks you to confirm before it creates anything.</p>`
    + `<div class="solve-row"><label class="sr-only" for="solve-input">Describe the problem</label><input id="solve-input" class="input" placeholder="Northstar is late and production needs the coil by 11 December" autocomplete="off"><button class="bw-action-primary" data-action="route-work">Understand →</button></div>`
    + `<div class="example-chips"><span class="small">Try an example:</span>${EXAMPLES.map(([label, t]) => `<button class="example-chip" data-action="example-problem" data-example="${esc(t)}">${esc(label)}</button>`).join("")}</div>`
    + `<div id="solve-result">${renderIntake(ctx)}</div>`
    + `<div class="secondary-links"><button class="bw-action-text" data-action="paste-evidence">Add evidence to a case</button><a class="bw-action-text" href="/flow">Continue my work →</a></div>`
    + `</section>`
    + `<div class="metrics">`
    + `<div class="metric"><b>${m.critical + m.high}</b><small>cases at High or Critical</small></div>`
    + `<div class="metric"><b>${m.overdue}</b><small>overdue actions</small></div>`
    + `<div class="metric"><b>${m.awaitingAssessment}</b><small>replies awaiting assessment</small></div>`
    + `<div class="metric"><b>${m.readyToDecide}</b><small>cases ready to decide</small></div>`
    + `</div>`
    + `<div class="grid"><section class="bw-panel span-7"><div class="panel-head"><div><div class="eyebrow">Buyr inbox</div><h2>What deserves attention first</h2></div><a class="bw-action-text" href="/flow">All work →</a></div>`
    + `<div class="attention-list">${attention.map((a) => actionRow(s, a, today)).join("") || '<div class="empty">No open actions.</div>'}</div></section>`
    + `<section class="bw-panel span-5"><div class="panel-head"><div><div class="eyebrow">Evidence</div><h2>Open gaps and unjudged replies</h2></div></div>`
    + (gaps.map(({ c, e }) => `<div class="row"><span class="dot ${D.evidenceStatus(e) === "awaiting" ? "high" : "critical"}" aria-hidden="true"></span><div><strong>${esc(c.ref)} · ${esc(e.title)}</strong><p>${esc(D.STATUS_SAID[D.evidenceStatus(e)])}</p></div><a class="bw-action-secondary" href="/cases?id=${encodeURIComponent(c.id)}#ev-${encodeURIComponent(e.id)}">Review</a></div>`).join("") || '<div class="empty">No material evidence gaps.</div>')
    + `</section></div>`
    + `<section class="bw-panel workspace-data"><div class="panel-head"><div><div class="eyebrow">Workspace data</div><h2>Kept in this browser only</h2></div></div>`
    + `<p class="small">Nothing leaves this device. Export a copy before clearing browser data or switching machines.</p>`
    + `<div class="toolbar"><button class="bw-action-secondary" data-action="export">Export workspace (JSON)</button><button class="bw-action-secondary" data-action="import">Import workspace</button><button class="bw-action-text" data-action="reset">Reset to review data</button>${user ? `<button class="bw-action-text" data-action="set-user">Change name or role</button>` : ""}</div></section>`;
}

/* ===================================================================== cases */

function journeyStrip(phase) {
  const steps = [["Evidence", 1], ["Decision", 2], ["Execution", 3], ["Outcome", 4]];
  return `<ol class="journey" aria-label="Case journey">${steps.map(([label, n]) => {
    const st = n < phase.step ? "done" : n === phase.step ? "active" : "";
    return `<li class="journey-step ${st}"${n === phase.step ? ' aria-current="step"' : ""}><span aria-hidden="true">${n < phase.step ? "✓" : n}</span><div><small>STEP ${n}</small><strong>${label}</strong></div></li>`;
  }).join("")}</ol>`;
}

function sourceLine(src) {
  if (!src) return "Source not recorded";
  const bits = [src.document, src.from, src.date ? D.formatDate(src.date) : null].filter(Boolean);
  return bits.length ? bits.map(esc).join(" · ") : "Source not recorded";
}

function evidenceItem(s, c, e) {
  const st = D.evidenceStatus(e);
  const v = D.current(e);
  const req = s.requests.find((r) => r.evidenceId === e.id && r.status !== "answered");
  const linkedSuppliers = c.quotes.length;
  const buttons = [];
  if (["gap", "insufficient"].includes(st)) {
    buttons.push(`<button class="mini" data-action="receive" data-id="${esc(e.id)}">Record what arrived</button>`);
    if (!req && linkedSuppliers) buttons.push(`<button class="mini" data-action="request" data-case="${esc(c.id)}" data-evidence="${esc(e.id)}">Ask a supplier</button>`);
  }
  if (st === "awaiting") buttons.push(`<button class="mini primary" data-action="assess" data-id="${esc(e.id)}">Assess</button>`);
  const older = e.versions.slice(0, -1).reverse();
  return `<article class="evidence-row" id="ev-${esc(e.id)}"><div class="evidence-state">${evidenceChip(st)}${e.material ? '<span class="tag">material</span>' : '<span class="tag quiet">minor</span>'}</div>`
    + `<div><strong>${esc(e.title)}</strong><div class="evidence-detail">${esc(v.text)}</div>`
    + (v.basis ? `<div class="evidence-basis"><small>BASIS</small> ${esc(v.basis)}</div>` : "")
    + (v.assessment ? `<div class="assessment"><small>ASSESSED</small> ${esc(D.VERDICT_SAID[v.assessment.verdict])} — ${esc(v.assessment.note)}<br><span class="small">${esc(v.assessment.by.name)} (${esc(v.assessment.by.role)}), ${esc(D.formatStamp(v.assessment.at))}</span></div>` : "")
    + (req ? `<div class="small">Requested from ${esc(D.supplierById(s, req.supplierId)?.name)} (${esc(req.ref)}, ${req.status === "draft" ? "not sent yet" : `sent ${esc(D.formatStamp(req.sentAt))}`}), due ${esc(D.formatDate(req.dueDate))}.</div>` : "")
    + (buttons.length ? `<div class="flow-actions">${buttons.join("")}</div>` : "")
    + (older.length ? `<details class="versions"><summary>${older.length} earlier version${older.length > 1 ? "s" : ""}</summary>${older.map((o) => `<div class="version"><small>v${o.v} · ${esc(o.state)} · ${o.legacyDate ? `“${esc(o.legacyDate)}” (no year recorded)` : esc(D.formatStamp(o.recordedAt))} · ${esc(o.recordedBy?.name)}</small><p>${esc(o.text)}</p></div>`).join("")}</details>` : "")
    + `</div><div class="evidence-source"><span class="provenance-kind">${esc(v.state)}</span><br>${sourceLine(v.source)}<br><span class="small">v${v.v} · ${v.legacyDate ? `“${esc(v.legacyDate)}” (no year)` : esc(D.formatStamp(v.recordedAt))}<br>${esc(v.recordedBy?.name)}</span></div></article>`;
}

function timingPanel(s, c, today) {
  const t = D.shortageTiming(s, c, today);
  if (t.withheld) return `<div class="calc"><div class="eyebrow">Can supply arrive in time?</div><p>${esc(t.withheld)}</p></div>`;
  if (!t.rows.length) return `<div class="calc"><div class="eyebrow">Can supply arrive in time?</div><p>Need-by ${esc(D.formatDate(t.needBy))}. No supplier is linked yet, so nothing can be compared.</p></div>`;
  const route = D.plannedRoute(s, c);
  return `<div class="calc"><div class="eyebrow">Can supply arrive in time? — derived</div>`
    + `<p>Need-by <strong>${esc(D.formatDate(t.needBy))}</strong>, ${t.daysToNeed} days from today (${esc(D.formatDate(today))}). Arrival assumes an order placed today and the quoted lead time in calendar days.</p>`
    + `<div class="table-wrap"><table><caption class="sr-only">Arrival against the need date</caption><thead><tr><th scope="col">Supplier</th><th scope="col">Approval</th><th scope="col">Lead time</th><th scope="col">Arrives</th><th scope="col">Against need date</th></tr></thead><tbody>`
    + t.rows.map((r) => `<tr${r.supplierId === route ? ' class="route"' : ""}><th scope="row">${esc(r.name)}${r.supplierId === route ? ' <span class="tag">planned</span>' : ""}</th><td>${esc(r.approval)}</td>`
      + (r.withheld ? `<td colspan="3">${esc(r.withheld)}</td>` : `<td>${r.leadDays} days</td><td>${esc(D.formatDate(r.arrives))}</td><td>${r.meets ? chip(`${r.slackDays} days spare`, "ok") : chip(`${-r.slackDays} days late`, "late")}</td>`)
      + `</tr>`).join("")
    + `</tbody></table></div></div>`;
}

function claimPanel(c) {
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

function quotesPanel(s, c) {
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

function rfqPanel(s, c) {
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

function decisionCard(s, d, { compact = false } = {}) {
  const st = D.decisionStatus(s, d);
  const c = D.caseById(s, d.caseId);
  const outcome = c?.outcomes.find((o) => o.decisionId === d.id);
  const route = d.routeSupplierId ? D.supplierById(s, d.routeSupplierId)?.name : null;
  const tone = { authorising: "ok", stale: "late", "awaiting-approval": "risk-medium", legacy: "quiet", orphaned: "quiet" }[st.status];
  const snap = d.snapshot;
  return `<article class="decision"><div class="decision-head"><div><div class="eyebrow">${esc(d.ref)} · ${esc(c?.ref || d.caseId)} · ${esc(d.legacyDate ? `“${d.legacyDate}” (no year recorded)` : D.formatStamp(d.at))}</div><h3>${esc(d.title)}</h3></div>${chip(st.status.replace("-", " "), tone)}</div>`
    + `<p class="small">${esc(st.said)}</p>`
    + `<p>${esc(d.rationale)}</p>`
    + `<p class="small">Decided by <strong>${esc(d.decider.name)}</strong> (${esc(d.decider.role)})${d.secondApproval ? `; approved by <strong>${esc(d.secondApproval.by.name)}</strong> (${esc(d.secondApproval.by.role)}), ${esc(D.formatStamp(d.secondApproval.at))}` : ""}${route ? `. Route: ${esc(route)}` : ""}.</p>`
    + (d.acknowledged?.length && c ? `<p class="small">Acknowledged as not evidence: ${d.acknowledged.map((id) => esc(c.evidence.find((e) => e.id === id)?.title || id)).join(", ")}.</p>` : "")
    + (st.status === "awaiting-approval" ? `<div class="toolbar"><button class="bw-action-primary" data-action="approve" data-id="${esc(d.id)}">Approve as a second person</button></div>` : "")
    + (snap && !compact ? `<details><summary>What the decider saw (${snap.evidence.length} items, risk ${esc(snap.risk.level)})</summary><div class="snapshot-list">`
      + snap.evidence.map((e) => `<div><strong>${esc(e.title)}</strong> · ${esc(D.STATUS_SAID[e.status])} · v${e.version}<br>${esc(e.text)}<br><small>${sourceLine(e.source)}</small></div>`).join("")
      + `<div><strong>Risk then</strong><ul>${snap.risk.drivers.map((r) => `<li>${esc(r.level)}: ${esc(r.said)}</li>`).join("") || "<li>No risk rule fired.</li>"}</ul></div>`
      + `<div><strong>Open work then</strong><ul>${snap.openActions.map((a) => `<li>${esc(a.ref)} · ${esc(a.title)} (${esc(D.STAGE_LABEL[a.stage])}, ${esc(a.owner)})</li>`).join("") || "<li>None.</li>"}</ul></div>`
      + `</div></details>` : "")
    + (!snap ? `<div class="legacy-note">No evidence snapshot was captured, so this decision cannot authorise execution.</div>` : "")
    + (outcome ? `<div class="decision-outcome"><small>VALIDATED OUTCOME · ${esc(outcome.ref)}</small><strong>${esc(outcome.result)}</strong><span>${esc(outcome.validation)} — ${esc(outcome.validatedBy.name)} (${esc(outcome.validatedBy.role)})</span></div>`
      : `<div class="decision-outcome pending"><small>OUTCOME</small><span>None recorded against this decision.</span></div>`)
    + (compact || !c ? "" : `<div class="toolbar"><a class="bw-action-secondary" href="/cases?id=${encodeURIComponent(c.id)}">Open ${esc(c.ref)} →</a></div>`)
    + `</article>`;
}

export function renderCases(s, ctx) {
  const today = ctx.today;
  if (!s.cases.length) return pageHead("Procurement cases", "No cases yet", "Describe a problem on Today to open one.");
  const id = ctx.params.get("id");
  const c = D.caseById(s, id) || s.cases[0];
  const risk = D.caseRisk(s, c, today);
  const phase = D.casePhase(s, c);
  const rec = D.recommendation(s, c, today);
  const acts = D.openActions(s, c.id);
  const closed = D.caseActions(s, c.id).filter((a) => a.stage === "closed");
  const gaps = D.openGaps(c);
  const covered = new Set(acts.map((a) => a.evidenceId).filter(Boolean));
  const uncovered = gaps.filter((e) => !covered.has(e.id));
  const decisions = s.decisions.filter((d) => d.caseId === c.id);
  const requests = s.requests.filter((r) => r.caseId === c.id);
  const events = s.events.filter((e) => e.caseId === c.id).slice(0, 12);
  const def = D.CASE_TYPES[c.type];

  const buttons = [];
  if (uncovered.length) buttons.push(`<button class="bw-action-primary" data-action="create-work" data-case="${esc(c.id)}">Create work for ${uncovered.length} open gap${uncovered.length > 1 ? "s" : ""}</button>`);
  if (phase.id === "decision") buttons.push(`<button class="bw-action-primary" data-action="record-decision" data-case="${esc(c.id)}">Record decision</button>`);
  if (phase.id === "outcome") buttons.push(`<button class="bw-action-primary" data-action="record-outcome" data-case="${esc(c.id)}">Record outcome</button>`);
  buttons.push(`<button class="bw-action-secondary" data-action="add-action" data-case="${esc(c.id)}">Add action</button>`);
  if (c.quotes.length) buttons.push(`<button class="bw-action-secondary" data-action="request" data-case="${esc(c.id)}">Ask a supplier</button>`);

  return pageHead("Procurement cases", "Evidence → decision → execution → outcome", "")
    + `<nav class="case-tabs" aria-label="Cases">${s.cases.map((x) => `<a class="case-tab ${x.id === c.id ? "active" : ""}" href="/cases?id=${encodeURIComponent(x.id)}"${x.id === c.id ? ' aria-current="page"' : ""}>${esc(x.ref)}</a>`).join("")}</nav>`
    + journeyStrip(phase)
    + `<section class="bw-panel raised next-gate" aria-labelledby="gate-title"><div><div class="eyebrow">Recommended next gate</div><h2 id="gate-title">${esc(rec.headline)}</h2><div class="next-action"><small>NEXT ACTION</small><strong>${esc(rec.next)}</strong></div><div class="toolbar">${buttons.join("")}</div></div><div class="callout">${esc(rec.reason)}</div></section>`
    + `<div class="grid"><section class="span-8"><div class="bw-panel"><div class="panel-head"><div><div class="eyebrow">${esc(c.ref)} · ${esc(def?.label || c.type)} · ${esc(phase.label)}</div><h2>${esc(c.title)}</h2></div>${riskChip(risk.level)}</div>`
    + `<p class="lead">${esc(c.objective)}</p>`
    /* The value is a control, not only a figure: the approval threshold is
       applied to it, and a case without one cannot be decided. Unrecorded, it
       says so and offers the way to fix it rather than showing a dash. */
    + `<div class="metrics"><div class="metric">`
    + (Number.isInteger(c.valuePence)
      ? `<b>${esc(money(c.valuePence))}</b><small>value at stake</small>`
      : `<b class="unset">Not recorded</b><small>value at stake · <button class="linklike" data-action="case-value" data-case="${esc(c.id)}">record it</button></small>`)
    + `</div><div class="metric"><b>${esc(risk.level)}</b><small>current risk</small></div><div class="metric"><b>${gaps.length}</b><small>open material gaps</small></div><div class="metric"><b>${acts.length}</b><small>open actions</small></div></div>`
    + `<details class="why" open><summary>Why ${esc(risk.level)}</summary><ul>${risk.drivers.map((r) => `<li>${riskChip(r.level)} ${esc(r.said)}${r.inputs.length ? `<br><span class="small">Looked at: ${r.inputs.map(esc).join("; ")}</span>` : ""}</li>`).join("") || "<li>No risk rule fired.</li>"}</ul>`
    + (c.intakeAssessment ? `<p class="small">Assessed ${esc(c.intakeAssessment)} at intake; shown for context, not used in the calculation.</p>` : "") + `</details>`
    + (c.type === "shortage" ? timingPanel(s, c, today) : "")
    + (c.type === "claim" ? claimPanel(c) : "")
    + `<div class="panel-head"><div><div class="eyebrow">Evidence ledger</div><h2>What do we actually know?</h2></div><button class="bw-action-secondary" data-action="add-evidence" data-case="${esc(c.id)}">Add evidence</button></div>`
    + c.evidence.map((e) => evidenceItem(s, c, e)).join("")
    + `</div>`
    + quotesPanel(s, c)
    + rfqPanel(s, c)
    + (decisions.length ? `<div class="bw-panel"><div class="panel-head"><div><div class="eyebrow">Decisions</div><h2>${decisions.length} on this case</h2></div></div>${decisions.map((d) => decisionCard(s, d)).join("")}</div>` : "")
    + `</section><aside class="span-4">`
    + `<div class="bw-panel"><div class="panel-head"><div><div class="eyebrow">Linked BuyrFlow work</div><h2>${acts.length} open</h2></div></div>${acts.map((a) => actionRow(s, a, today)).join("") || '<div class="empty">No open actions.</div>'}`
    + (closed.length ? `<details><summary>${closed.length} closed</summary>${closed.map((a) => `<div class="row"><span class="dot" aria-hidden="true"></span><div><strong>${esc(a.ref)} · ${esc(a.title)}</strong><p>Actual: ${esc(a.actualResult)}</p></div></div>`).join("")}</details>` : "") + `</div>`
    + (requests.length ? `<div class="bw-panel"><div class="panel-head"><div><div class="eyebrow">Supplier requests</div><h2>${requests.length} on this case</h2></div></div>${requests.map((r) => `<div class="row"><span class="dot ${r.status === "answered" ? "" : "high"}" aria-hidden="true"></span><div><strong>${esc(r.ref)} · ${esc(D.supplierById(s, r.supplierId)?.name)}</strong><p>${esc(r.question)}</p><p class="small">${r.status === "draft" ? "Not sent yet" : r.status === "sent" ? `Sent ${esc(D.formatStamp(r.sentAt))} by ${esc(r.sentVia)}; due ${esc(D.formatDate(r.dueDate))}` : `Answered ${esc(D.formatStamp(r.reply.receivedAt))}`}</p></div>${r.status === "draft" ? `<button class="bw-action-secondary" data-action="mark-sent" data-id="${esc(r.id)}">Mark sent</button>` : ""}</div>`).join("")}</div>` : "")
    + (c.outcomes.length ? `<div class="bw-panel"><div class="panel-head"><div><div class="eyebrow">Validated outcome</div><h2>What actually happened</h2></div></div>${c.outcomes.map((o) => `<div class="outcome"><strong>${esc(o.result)}</strong><p>${esc(o.ref)} validates ${esc(o.decisionRef)} · ${esc(o.validation)} · ${esc(o.validatedBy.name)} (${esc(o.validatedBy.role)})</p>${o.lessons ? `<small>Lesson: ${esc(o.lessons)}</small>` : ""}</div>`).join("")}</div>` : "")
    + `<div class="bw-panel"><div class="panel-head"><div><div class="eyebrow">Case timeline</div><h2>Why the case changed</h2></div></div><ol class="event-list">${events.map((e) => `<li class="event"><strong>${esc(e.type)}</strong><p>${esc(e.text)}</p><span class="small">${esc(e.actor.name)} (${esc(e.actor.role)}) · <time datetime="${esc(e.at)}">${e.legacyDate ? `“${esc(e.legacyDate)}” (no year recorded)` : esc(D.formatStamp(e.at))}</time></span></li>`).join("") || '<li class="empty">No events yet.</li>'}</ol></div>`
    + `</aside></div>`;
}

/* ====================================================================== flow */

function flowButtons(s, a, today) {
  const b = [];
  if (a.kind === D.KIND.EVIDENCE) {
    const { e } = D.evidenceById(s, a.evidenceId);
    const st = e ? D.evidenceStatus(e) : null;
    const r = a.requestId ? D.requestById(s, a.requestId) : null;
    if (r && r.status === "draft") b.push(`<button class="mini" data-action="mark-sent" data-id="${esc(r.id)}">Mark request sent</button>`);
    if (st === "gap" || st === "insufficient") b.push(`<button class="mini" data-action="receive" data-id="${esc(e.id)}">Evidence received</button>`);
    if (st === "awaiting") b.push(`<button class="mini primary" data-action="assess" data-id="${esc(e.id)}">Assess</button>`);
    if (["investigate", "prepare"].includes(a.stage)) b.push(`<button class="mini" data-action="advance" data-id="${esc(a.id)}">Advance →</button>`);
  } else if (a.stage !== "validate") {
    b.push(`<button class="mini" data-action="advance" data-id="${esc(a.id)}">Advance →</button>`);
  }
  if (a.stage === "validate") b.push(`<button class="mini primary" data-action="close-action" data-id="${esc(a.id)}">Validate &amp; close</button>`);
  return b.join("");
}

export function renderFlow(s, ctx) {
  const today = ctx.today;
  const focus = ctx.params.get("focus");
  const focusAction = focus ? D.actionById(s, focus) : null;
  const active = ctx.params.get("stage") || (focusAction && focusAction.stage !== "closed" ? focusAction.stage : "investigate");
  const open = s.actions.filter((a) => a.stage !== "closed");
  const closed = s.actions.filter((a) => a.stage === "closed");
  return pageHead("BuyrFlow", "Execute the case, not another tracker", "Each kind of action has one path. Evidence work moves when evidence arrives and is judged; execution waits for an authorising decision; nothing closes except from Validate.")
    + `<div class="toolbar flow-toolbar"><button class="bw-action-primary" data-action="add-action">Add action</button><label class="flow-stage-picker">Stage <select id="flow-stage-filter" data-change="flow-stage">${D.BOARD.map((id) => `<option value="${id}"${id === active ? " selected" : ""}>${esc(D.STAGE_LABEL[id])} · ${open.filter((a) => a.stage === id).length}</option>`).join("")}</select></label></div>`
    + `<div class="flow-board">${D.BOARD.map((stage) => {
      const items = open.filter((a) => a.stage === stage);
      return `<section class="column ${stage === active ? "mobile-active" : ""}" data-stage="${stage}" aria-label="${esc(D.STAGE_LABEL[stage])}"><div class="column-head"><b>${esc(D.STAGE_LABEL[stage])}</b><span>${items.length}</span></div>`
        + (items.map((a) => {
          const c = a.caseId ? D.caseById(s, a.caseId) : null;
          const sup = a.supplierId ? D.supplierById(s, a.supplierId) : null;
          const ev = a.evidenceId ? D.evidenceById(s, a.evidenceId).e : null;
          const deps = a.dependencies.map((id) => D.actionById(s, id)?.ref || id);
          return `<article class="flow-card ${focus === a.id ? "focus" : ""}" id="a-${esc(a.id)}" tabindex="-1"><div class="flow-card-head"><strong>${esc(a.ref)} · ${esc(a.title)}</strong>${chip(c ? c.ref : "WORKSPACE", c ? "case" : "workspace")}</div>`
            + `<div class="flow-meta">${esc(a.kind)} action · ${esc(a.owner)} · ${dueText(a, today)}`
            + (ev ? `<br>Evidence: ${esc(ev.title)} — ${esc(D.STATUS_SAID[D.evidenceStatus(ev)])}` : "")
            + (sup ? `<br>Party: ${esc(sup.name)}` : "")
            + (deps.length ? `<br>Depends on: ${deps.map(esc).join(", ")}` : "")
            + `<br>Expected: ${esc(a.expectedResult)}${a.actualResult ? `<br>Actual: ${esc(a.actualResult)}` : ""}</div>`
            + `<div class="flow-actions">${flowButtons(s, a, today)}</div></article>`;
        }).join("") || '<div class="empty">Nothing at this stage.</div>')
        + `</section>`;
    }).join("")}</div>`
    + (closed.length ? `<details class="bw-panel"><summary>${closed.length} closed action${closed.length > 1 ? "s" : ""}</summary>${closed.map((a) => `<div class="row"><span class="dot" aria-hidden="true"></span><div><strong>${esc(a.ref)} · ${esc(a.title)}</strong><p>Actual: ${esc(a.actualResult)}</p></div></div>`).join("")}</details>` : "");
}

/* ================================================================= suppliers */

export function renderSuppliers(s, ctx) {
  const wanted = (ctx.params.get("name") || "").toLowerCase();
  return pageHead("Supplier intelligence", "Every request belongs to a case", "Suppliers are linked to cases by id, so a renamed supplier keeps its history. Requests record what was asked, when it was sent and what came back.")
    + `<div class="toolbar"><button class="bw-action-secondary" data-action="add-supplier">Add supplier</button></div>`
    + `<div class="supplier-grid">${s.suppliers.map((sp) => {
      const cases = s.cases.filter((c) => c.quotes.some((q) => q.supplierId === sp.id));
      const reqs = s.requests.filter((r) => r.supplierId === sp.id && r.status !== "answered");
      const acts = s.actions.filter((a) => a.supplierId === sp.id && a.stage !== "closed");
      const focused = wanted && sp.name.toLowerCase() === wanted;
      return `<section class="supplier ${focused ? "focus" : ""}" id="sup-${esc(sp.id)}"><div class="supplier-top"><div><div class="eyebrow">${esc(sp.category)}</div><h2>${esc(sp.name)}</h2><div class="small">${esc(sp.relationship)} relationship</div></div>${chip(`Risk: ${sp.risk}`, `risk-${slug(sp.risk)}`)}</div>`
        + `<div class="supplier-stats"><div><b>${Number.isInteger(sp.otdPct) ? `${sp.otdPct}%` : "—"}</b><small>OTD${Number.isInteger(sp.otdPct) ? "" : " not recorded"}</small></div><div><b>${Number.isInteger(sp.qualityPct) ? `${sp.qualityPct}%` : "—"}</b><small>quality${Number.isInteger(sp.qualityPct) ? "" : " not recorded"}</small></div><div><b>${reqs.length}</b><small>open requests</small></div></div>`
        + `<p class="small">${cases.length ? `On ${cases.map((c) => `<a href="/cases?id=${encodeURIComponent(c.id)}">${esc(c.ref)}</a>`).join(", ")}` : "Not linked to any case."}</p>`
        + (acts.slice(0, 3).map((a) => actionRow(s, a, ctx.today)).join(""))
        + `<div class="toolbar"><button class="bw-action-secondary" data-action="request" data-supplier="${esc(sp.id)}"${cases.length ? "" : " disabled"}>Create evidence request</button></div>`
        + (cases.length ? "" : `<p class="small">Link this supplier to a case first: a request must belong to a Procurement Case.</p>`)
        + `</section>`;
    }).join("")}</div>`;
}

/* ================================================================ decisions */

export function renderDecisions(s) {
  const threshold = s.settings.secondApprovalAbovePence;
  return pageHead("Decision memory", "Remember why, and what happened next", "A decision keeps the evidence its decider saw, word for word. It goes stale when material evidence changes, and only an authorising decision can be executed.")
    + `<section class="bw-panel"><div class="panel-head"><div><div class="eyebrow">Authority</div><h2>Second approval above ${esc(D.formatPence(threshold))}</h2></div><button class="bw-action-secondary" data-action="threshold">Change</button></div><p class="small">A review-build default. Set it to your delegation of authority; a decision on a case worth more than this needs a second, different person to approve it before execution.</p></section>`
    + `<section class="bw-panel">${s.decisions.map((d) => decisionCard(s, d)).join("") || '<div class="empty">No decisions yet.</div>'}</section>`;
}

/* ===================================================================== tools */

export function renderTools() {
  return pageHead("Capabilities", "Exact engines feed cases — they do not become mini-app silos", "Release B reconnects the live BuyrWorld engines as case capabilities.")
    + `<div class="grid"><section class="bw-panel span-6"><div class="eyebrow">Release B</div><h2>Commercial evidence capabilities</h2>`
    + ["Price Increase Defender — supported against unsupported movement, contract ceiling and negotiating position.",
      "Quote Comparator — like-for-like scope, landed cost, lead time and evidence lineage.",
      "Should-Cost — material and process assumptions with an auditable range."].map((t) => `<div class="row"><span class="dot normal" aria-hidden="true"></span><div><p>${esc(t)}</p></div>${chip("planned", "quiet")}</div>`).join("")
    + `</section><section class="bw-panel span-6"><div class="eyebrow">In this build</div><h2>Two calculations, done exactly</h2><p class="lead">Shortage cases compare each supplier's arrival with the need date. Claim cases compare the ask with the contract cap in pence a year. Both withhold the figure when an input is missing rather than guessing.</p></section></div>`;
}

export function renderNotFound() {
  return pageHead("Not found", "That page does not exist", "Use the navigation to get back to your work.");
}
