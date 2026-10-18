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

/** "Good morning" / "Good afternoon" / "Good evening", from the local clock. */
function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** One personal task, with the three things you can do to it in one click. */
function taskRow(s, t, today) {
  const late = D.isIsoDate(t.dueDate) && t.dueDate < today;
  const due = !D.isIsoDate(t.dueDate) ? "No date"
    : t.dueDate === today ? "Today"
    : t.dueDate === D.addDays(today, 1) ? "Tomorrow"
    : D.formatDate(t.dueDate);
  const linked = t.caseId ? D.caseById(s, t.caseId) : null;
  const act = (status, label) => t.status === status ? ""
    : `<button class="mini" data-action="task-status" data-id="${esc(t.id)}" data-status="${esc(status)}">${label}</button>`;
  return `<div class="task" data-task="${esc(t.id)}">`
    + `<button class="task-tick" data-action="task-status" data-id="${esc(t.id)}" data-status="done" aria-label="Mark ${esc(t.title)} done"></button>`
    + `<div class="task-body"><strong>${esc(t.title)}</strong>`
    + `<p class="task-meta"><span class="${late ? "danger" : ""}">${esc(due)}${late ? " · overdue" : ""}</span>`
    + (t.status !== "todo" ? ` · ${esc(D.TASK_SAID[t.status])}` : "")
    + (t.priority === "high" ? ` · <span class="danger">High</span>` : "")
    + (linked ? ` · <a href="/cases?id=${encodeURIComponent(linked.id)}">${esc(linked.ref)}</a>` : "")
    + `</p></div>`
    + `<div class="task-acts">${act("doing", "Start")}${act("waiting", "Waiting")}`
    + `<button class="mini" data-action="task-edit" data-id="${esc(t.id)}">Edit</button></div></div>`;
}

/**
 * Today — one person's day, not the workspace's metrics.
 *
 * The four questions this has to answer before anything else: what should I
 * do next, what is due, what am I waiting for, and is a decision needed. The
 * case engine's figures are all still here, one disclosure down, because they
 * are the right content for a different question.
 */
export function renderToday(s, ctx) {
  const today = ctx.today;
  const m = D.workspaceMetrics(s, today);
  const user = s.settings.user;
  const me = user ? (s.people || []).find((p) => p.name === user.name) : null;
  const day = D.myDay(s, today, me?.id || null);
  const mine = D.myTasks(s, me?.id || null);

  const next = mine.filter((t) => t.status !== D.TASK_STATUS.WAITING).slice(0, 5);
  const waitingTasks = mine.filter((t) => t.status === D.TASK_STATUS.WAITING);
  const waitingOn = s.requests.filter((r) => r.status !== "answered");
  const attention = s.cases
    .map((c) => ({ c, phase: D.casePhase(s, c), rec: D.recommendation(s, c, today) }))
    .filter(({ phase }) => phase.id !== "learned")
    .slice(0, 4);

  const count = (n, label, href) =>
    `<a class="daycount${n ? "" : " zero"}" href="${href}"><b>${n}</b><small>${label}</small></a>`;

  return `<section class="daystart">`
    + `<div class="eyebrow">${esc(greeting())}${user ? `, ${esc(user.name.split(" ")[0])}` : ""}</div>`
    + `<h1 id="solve-title">What are you working on today?</h1>`
    + `<div class="daystart-acts">`
    + `<button class="bw-action-primary" data-action="add-task">+ Add a task</button>`
    + `<button class="bw-action-secondary" data-action="focus-problem">Resolve a procurement problem</button>`
    + `</div>`
    + (user ? "" : `<p class="small who-note">Set your name and role before changing anything — every decision and approval is recorded against a person. <button class="bw-action-text" data-action="set-user">Set name and role</button></p>`)
    + `</section>`

    + `<div class="hint-slot" data-hint="today"></div>`

    + `<div class="daycounts" aria-label="My day">`
    + count(day.dueToday, "due today", "/flow")
    + count(day.overdue, "overdue", "/flow")
    + count(day.waiting, "waiting", "/flow")
    + count(day.needsDecision, "needs a decision", "/cases")
    + `</div>`

    + `<div class="grid">`
    + `<section class="bw-panel span-7"><div class="panel-head"><div><div class="eyebrow">Next up</div><h2>Your tasks</h2></div><a class="bw-action-text" href="/flow">All my work →</a></div>`
    + `<div class="task-list">${next.map((t) => taskRow(s, t, today)).join("")
      || `<div class="empty">Nothing on your list yet. <button class="bw-action-text" data-action="add-task">Add something you need to get done</button>, or describe a procurement problem above.</div>`}</div>`
    + `</section>`

    + `<section class="bw-panel span-5"><div class="panel-head"><div><div class="eyebrow">Waiting on others</div><h2>Not with you</h2></div></div>`
    + (waitingTasks.map((t) => `<div class="row"><span class="dot" aria-hidden="true"></span><div><strong>${esc(t.title)}</strong><p>Waiting${t.dueDate ? ` · due ${esc(D.formatDate(t.dueDate))}` : ""}</p></div><button class="mini" data-action="task-status" data-id="${esc(t.id)}" data-status="todo">Resume</button></div>`).join("")
      + waitingOn.map((r) => {
        const sup = D.supplierById(s, r.supplierId);
        const c = D.caseById(s, r.caseId);
        return `<div class="row"><span class="dot" aria-hidden="true"></span><div><strong>${esc(sup?.name || "A supplier")}</strong><p>${esc(c?.ref || "")} · ${esc(r.question)}</p></div><a class="bw-action-secondary" href="/cases?id=${encodeURIComponent(r.caseId)}">Open</a></div>`;
      }).join("")
      || `<div class="empty">You are not waiting on anyone right now.</div>`)
    + `</section></div>`

    + `<section class="bw-panel"><div class="panel-head"><div><div class="eyebrow">Needs your attention</div><h2>Cases with a next move</h2></div><a class="bw-action-text" href="/cases">All cases →</a></div>`
    + (attention.map(({ c, rec }) => `<div class="row"><span class="dot ${esc(D.caseRisk(s, c, today).level.toLowerCase())}" aria-hidden="true"></span><div><strong>${esc(c.title)}</strong><p>${esc(rec.headline)}</p></div><a class="bw-action-secondary" href="/cases?id=${encodeURIComponent(c.id)}">Open</a></div>`).join("")
      || `<div class="empty">No case needs a move from you.</div>`)
    + `</section>`

    /* Everything the workspace knows about itself, one disclosure down. It is
       the right content for "how is the portfolio doing", which is not the
       question somebody opens this page with. */
    + `<details class="workspace-detail"><summary>Show workspace detail</summary>`
    + `<div class="metrics">`
    + `<div class="metric"><b>${m.critical + m.high}</b><small>cases at High or Critical</small></div>`
    + `<div class="metric"><b>${m.overdue}</b><small>overdue actions</small></div>`
    + `<div class="metric"><b>${m.awaitingAssessment}</b><small>replies awaiting assessment</small></div>`
    + `<div class="metric"><b>${m.readyToDecide}</b><small>cases ready to decide</small></div>`
    + `</div>`
    + `<section class="bw-panel workspace-data"><div class="panel-head"><div><div class="eyebrow">Workspace data</div><h2>Kept in this browser only</h2></div></div>`
    + `<p class="small">Nothing leaves this device. Export a copy before clearing browser data or switching machines.</p>`
    + `<div class="toolbar"><button class="bw-action-secondary" data-action="export">Export workspace (JSON)</button><button class="bw-action-secondary" data-action="import">Import workspace</button><button class="bw-action-text" data-action="reset">Reset to review data</button>${user ? `<button class="bw-action-text" data-action="set-user">Change name or role</button>` : ""}</div></section>`
    + `</details>`

    /* The problem router, below the day rather than instead of it. Still the
       way a Case begins, and still refusing to create anything unconfirmed. */
    + `<section class="solve" id="problem-router" aria-labelledby="problem-title">`
    + `<div class="eyebrow">Resolve a procurement problem</div>`
    + `<h2 id="problem-title">Describe what changed</h2>`
    + `<p class="lead">Normal procurement language. BuyrWorld shows what it understood and asks you to confirm before it creates anything.</p>`
    + `<div class="solve-row"><label class="sr-only" for="solve-input">Describe the problem</label><input id="solve-input" class="input" placeholder="Northstar is late and production needs the coil by 11 December" autocomplete="off"><button class="bw-action-primary" data-action="route-work">Understand →</button></div>`
    + `<div class="example-chips"><span class="small">Try an example:</span>${EXAMPLES.map(([label, t]) => `<button class="example-chip" data-action="example-problem" data-example="${esc(t)}">${esc(label)}</button>`).join("")}</div>`
    + `<div id="solve-result">${renderIntake(ctx)}</div>`
    + `<div class="secondary-links"><button class="bw-action-text" data-action="paste-evidence">Add evidence to a case</button></div>`
    + `</section>`

    + `<div class="demo-strip"><strong>REVIEW DATA</strong> Synthetic standalone workspace — not live organisational or supplier performance.</div>`;
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
  if (x.withheld) return `<div class="calc"><div class="eyebrow">Ask against the contract — derived</div><p>${esc(x.withheld)}</p></div>`;
  return `<div class="calc"><div class="eyebrow">Ask against the contract — derived</div>`
    + `<p>The supplier asks <strong>${esc(D.formatBp(x.askBp))}</strong> (${esc(D.formatPence(x.askPence))} a year); the contract caps movement at <strong>${esc(D.formatBp(x.capBp))}</strong> (${esc(D.formatPence(x.capPence))}). `
    + (x.excessBp > 0 ? `The ask exceeds the cap by <strong>${esc(D.formatPoints(x.excessBp))}</strong>: <strong>${esc(D.formatPence(x.excessPence))} a year</strong> that needs exceptional evidence.` : "The ask is within the cap.")
    + `</p><p class="small">On annual spend of ${esc(D.formatPence(x.spendPence))}. Integer arithmetic in pence and basis points.</p></div>`;
}

function quotesPanel(s, c) {
  const rows = D.quoteComparison(s, c);
  return `<div class="bw-panel"><div class="panel-head"><div><div class="eyebrow">Supplier positions</div><h2>Compared on what can be compared</h2></div><button class="bw-action-secondary" data-action="link-supplier" data-case="${esc(c.id)}">Link supplier</button></div>`
    + `<p class="small">No composite score. Weighting price, lead time and delivery into one number is a policy choice this build does not make for you.</p>`
    + (rows.length ? `<div class="table-wrap"><table><caption class="sr-only">Supplier positions on ${esc(c.ref)}</caption><thead><tr><th scope="col">Supplier</th><th scope="col">Approval</th><th scope="col">Lead time</th><th scope="col">Unit price</th><th scope="col">Above lowest</th><th scope="col">OTD</th></tr></thead><tbody>`
      + rows.map((r) => `<tr><th scope="row">${esc(r.name)}${r.incumbent ? ' <span class="tag">incumbent</span>' : ""}</th><td>${esc(r.approval)}</td><td>${Number.isInteger(r.leadDays) ? `${r.leadDays} days` : "not quoted"}</td>`
        + `<td>${Number.isInteger(r.unitPricePence) ? `${esc(D.formatPence(r.unitPricePence))}${r.unit ? `/${esc(r.unit)}` : ""}` : "not quoted"}</td>`
        + `<td>${r.overLowestPence === null ? "—" : r.overLowestPence === 0 ? "lowest" : `+${esc(D.formatPence(r.overLowestPence))}`}</td>`
        + `<td>${Number.isInteger(r.otdPct) ? `${r.otdPct}%` : "not recorded"}</td></tr>`).join("")
      + `</tbody></table></div>` : `<div class="empty">No supplier is linked to this case yet. Link one to request evidence from it.</div>`)
    + `</div>`;
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

  /* Arrived from an evidence link. The item is inside the detail disclosure,
     so the disclosure opens — a deep link that lands on something collapsed
     is a deep link that failed — and a line explains why they are here. */
  const viaEvidence = String(ctx.hash || "").startsWith("#ev-");

  return pageHead("Procurement cases", "Evidence → decision → execution → outcome", "")
    /* Always, not only when deep-linked. A Case is somewhere you are sent —
       from Today, from My work, from a link in an email — and at phone width
       the sidebar is behind a menu button, so without this the way back is a
       thing you have to know rather than see. */
    + `<a class="back-link" href="/flow">← Back to my work</a>`
    + `<nav class="case-tabs" aria-label="Cases">${s.cases.map((x) => `<a class="case-tab ${x.id === c.id ? "active" : ""}" href="/cases?id=${encodeURIComponent(x.id)}"${x.id === c.id ? ' aria-current="page"' : ""}>${esc(x.ref)}</a>`).join("")}</nav>`
    + `<div class="hint-slot" data-hint="cases"></div>`
    + (viaEvidence
      ? `<div class="callout deep-link"><strong>You are reviewing evidence for ${esc(c.ref)} — ${esc(c.title)}.</strong> `
        + `Check what arrived, decide whether it supports the requirement, and BuyrFlow will update the next step. `
        + `<a class="bw-action-text" href="/flow">Back to my work</a></div>`
      : "")
    + journeyStrip(phase)
    + `<section class="bw-panel raised next-gate" aria-labelledby="gate-title"><div><div class="eyebrow">What should I do next?</div><h2 id="gate-title">${esc(rec.headline)}</h2><div class="next-action"><small>NEXT ACTION</small><strong>${esc(rec.next)}</strong></div><div class="toolbar">${buttons.join("")}</div></div><div class="callout">${esc(rec.reason)}</div></section>`
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
    /* What is blocking the next move, above the fold. The full ledger is one
       disclosure down; this is the part somebody has to act on. */
    + (uncovered.length
      ? `<div class="blockers"><div class="eyebrow">Blocking the next step</div><ul>`
        + uncovered.map((e) => `<li><strong>${esc(e.title)}</strong> — ${esc(D.STATUS_SAID[D.evidenceStatus(e)])}`
          + ` <a class="bw-action-text" href="#ev-${encodeURIComponent(e.id)}">Go to it</a></li>`).join("")
        + `</ul></div>`
      : `<div class="blockers ok"><div class="eyebrow">Blocking the next step</div>`
        + `<p>The material evidence needed for the current decision has been reviewed.</p></div>`)
    + (c.type === "shortage" ? timingPanel(s, c, today) : "")
    + (c.type === "claim" ? claimPanel(c) : "")
    + `</div>`
    + quotesPanel(s, c)

    /* Everything that makes the case defensible rather than actionable. It is
       all still here, unchanged — it stopped competing with the next move. */
    + `<details class="case-detail"${viaEvidence ? " open" : ""}><summary>Show evidence &amp; case detail</summary>`
    + `<div class="bw-panel"><details class="why" open><summary>Why ${esc(risk.level)}</summary><ul>${risk.drivers.map((r) => `<li>${riskChip(r.level)} ${esc(r.said)}${r.inputs.length ? `<br><span class="small">Looked at: ${r.inputs.map(esc).join("; ")}</span>` : ""}</li>`).join("") || "<li>No risk rule fired.</li>"}</ul>`
    + (c.intakeAssessment ? `<p class="small">Assessed ${esc(c.intakeAssessment)} at intake; shown for context, not used in the calculation.</p>` : "") + `</details>`
    + `<div class="panel-head"><div><div class="eyebrow">Evidence</div><h2>What we know</h2></div><button class="bw-action-secondary" data-action="add-evidence" data-case="${esc(c.id)}">Add evidence</button></div>`
    + `<p class="small why-matters">A decision cannot rest on missing or unreviewed evidence — BuyrWorld blocks it.</p>`
    + c.evidence.map((e) => evidenceItem(s, c, e)).join("")
    + `</div>`
    + (decisions.length ? `<div class="bw-panel"><div class="panel-head"><div><div class="eyebrow">Decisions</div><h2>${decisions.length} on this case</h2></div></div><p class="small why-matters">BuyrWorld keeps exactly what was known when each decision was made.</p>${decisions.map((d) => decisionCard(s, d)).join("")}</div>` : "")
    + `</details>`
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

/**
 * My work — a list first, the board behind a disclosure.
 *
 * Two kinds of thing live here and the page says which is which. Personal
 * tasks are yours and move in one click. Case work carries evidence and
 * authority rules, so it keeps its own controls and its own page; here it
 * appears only so the day is in one place.
 *
 * The six-column board is unchanged underneath. It is the right view for
 * somebody running a process and the wrong one for somebody opening their
 * work at nine in the morning.
 */
export function renderFlow(s, ctx) {
  const today = ctx.today;
  const user = s.settings.user;
  const me = user ? (s.people || []).find((p) => p.name === user.name) : null;
  const mine = D.myTasks(s, me?.id || null);

  const dated = (t) => D.isIsoDate(t.dueDate);
  const todayTasks = mine.filter((t) => t.status !== D.TASK_STATUS.WAITING && dated(t) && t.dueDate <= today);
  const upcoming = mine.filter((t) => t.status !== D.TASK_STATUS.WAITING && (!dated(t) || t.dueDate > today));
  const waitingTasks = mine.filter((t) => t.status === D.TASK_STATUS.WAITING);
  const caseWork = s.actions.filter((a) => a.stage !== "closed" && a.caseId);

  const section = (title, items, empty) =>
    `<section class="bw-panel"><div class="panel-head"><div class="eyebrow">${esc(title)}</div></div>`
    + `<div class="task-list">${items.length ? items.map((t) => taskRow(s, t, today)).join("") : `<div class="empty">${empty}</div>`}</div></section>`;

  return pageHead("My work", "Everything on your plate", "Your own tasks and the case work assigned to you. Case work keeps its evidence and approval rules in the background.")
    + `<div class="hint-slot" data-hint="flow"></div>`
    + `<div class="toolbar"><button class="bw-action-primary" data-action="add-task">+ Add task</button></div>`
    + section("Today", todayTasks, "Nothing due today.")
    + section("Upcoming", upcoming, "Nothing scheduled.")
    + section("Waiting", waitingTasks, "You are not waiting on anyone.")
    + `<section class="bw-panel"><div class="panel-head"><div><div class="eyebrow">Case work</div><h2>Governed by evidence and approvals</h2></div><a class="bw-action-text" href="/cases">All cases →</a></div>`
    + (caseWork.length ? caseWork.map((a) => {
      const c = D.caseById(s, a.caseId);
      const ev = a.evidenceId ? D.evidenceById(s, a.evidenceId).e : null;
      return `<div class="row"><span class="dot ${a.stage === "decision" ? "critical" : ""}" aria-hidden="true"></span>`
        + `<div><strong>${esc(c?.ref || "")} · ${esc(a.title)}</strong>`
        + `<p>${esc(plainStage(a.stage))}${ev ? ` · ${esc(D.STATUS_SAID[D.evidenceStatus(ev)])}` : ""} · ${dueText(a, today)}</p></div>`
        + `<a class="bw-action-secondary" href="/cases?id=${encodeURIComponent(a.caseId)}${ev ? `#ev-${encodeURIComponent(ev.id)}` : ""}">Open</a></div>`;
    }).join("") : `<div class="empty">No case work is open.</div>`)
    + `</section>`
    + `<details class="workflow-board"><summary>Show workflow board</summary>${flowBoard(s, ctx)}</details>`;
}

/** The internal stage, in the words a buyer would use for it. */
function plainStage(stage) {
  return ({
    investigate: "To do", prepare: "In progress", waiting: "Waiting",
    decision: "Needs a decision", execute: "Ready to act",
    validate: "Ready to finish", closed: "Done",
  })[stage] || D.STAGE_LABEL[stage] || stage;
}

/** The six-column board, unchanged. Reached from the disclosure above. */
function flowBoard(s, ctx) {
  const today = ctx.today;
  const focus = ctx.params.get("focus");
  const focusAction = focus ? D.actionById(s, focus) : null;
  const active = ctx.params.get("stage") || (focusAction && focusAction.stage !== "closed" ? focusAction.stage : "investigate");
  const open = s.actions.filter((a) => a.stage !== "closed");
  const closed = s.actions.filter((a) => a.stage === "closed");
  return `<p class="small board-note">Each kind of action has one path. Evidence work moves when evidence arrives and is judged; execution waits for an authorising decision; nothing closes except from Validate.</p>`
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
