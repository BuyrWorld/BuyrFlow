/**
 * BuyrFlow page wiring — Release A v0.8.0.
 *
 * This file owns the page: storage, routing, dialogs and events. It never
 * changes a case itself. Every change goes through domain.apply(), which
 * either returns the new state or refuses with a sentence; a refusal is shown
 * where the person is looking and nothing is saved.
 */

import * as D from "./domain.js";
import * as V from "./views.js";
import { capabilityById } from "./capabilities.js";

const KEY = "buyrflow.workspace.v3";
const LEGACY_KEY = "buyrworld_flagship_release_a_v1";

let state = null;
let loadedRev = 0;
let conflict = false;
const ui = { pendingIntake: null, intakeMessage: null };

const $ = (q, root = document) => root.querySelector(q);
const esc = V.esc;

/* ================================================================ storage */

function readKey(k) {
  try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
}

function load() {
  const current = readKey(KEY);
  if (current && current.schema === D.SCHEMA) return current;
  const legacy = readKey(LEGACY_KEY);
  const { state: s, from } = D.migrate(legacy);
  // The v0.7 data stays under its own key, untouched, as the backup.
  writeRaw(s);
  if (from === 2) queueToast("Your v0.7 workspace was carried over. Its dates had no year, so they are shown as originally written.");
  return s;
}

function writeRaw(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    loadedRev = s.rev;
    return true;
  } catch {
    showBanner("This browser would not save the workspace (storage may be full or blocked). Export a copy now.");
    return false;
  }
}

/** Save, unless another tab has saved since this one loaded. */
function persist(s) {
  const stored = readKey(KEY);
  if (stored && stored.rev !== loadedRev) {
    markConflict();
    return false;
  }
  return writeRaw(s);
}

function markConflict() {
  conflict = true;
  showBanner("This workspace was changed in another tab. Reload before changing anything here, or one tab's work would overwrite the other's.", true);
}

window.addEventListener("storage", (e) => { if (e.key === KEY) markConflict(); });

/* ================================================================ running */

const user = () => state.settings.user;

/**
 * Apply one command as the current user. Returns { ok, result } or
 * { ok: false, refusal } — the caller decides where the sentence goes.
 */
function run(command) {
  if (conflict) return { ok: false, refusal: "This workspace changed in another tab. Reload the page first." };
  const who = command.type === "setUser" ? command.user : user();
  if (!who) return { ok: false, needsUser: true, refusal: "Set your name and role first: they are recorded against every change." };
  try {
    const out = D.apply(state, command, who, { today: D.localToday() });
    if (!persist(out.state)) return { ok: false, refusal: "Not saved." };
    state = out.state;
    return { ok: true, result: out.result, events: out.events };
  } catch (e) {
    if (e instanceof D.Refusal) return { ok: false, refusal: e.message, code: e.code };
    throw e;
  }
}

/** Run from a button outside a dialog: refusals become an alert toast. */
function runAndShow(command, success) {
  const r = run(command);
  if (r.needsUser) { askUser(() => runAndShow(command, success)); return r; }
  if (!r.ok) { toast(r.refusal, true); return r; }
  render();
  if (success) toast(typeof success === "function" ? success(r) : success);
  return r;
}

/* ================================================================== toasts */

function toast(message, alert = false) {
  const region = $(alert ? "#alert-region" : "#toast-region");
  if (!region) return;
  const x = document.createElement("div");
  x.className = `toast${alert ? " alert" : ""}`;
  x.textContent = message;
  region.appendChild(x);
  setTimeout(() => x.remove(), alert ? 7000 : 3500);
}

const queued = [];
const queueToast = (m) => queued.push(m);

function showBanner(message, withReload = false) {
  const b = $("#banner");
  if (!b) return;
  b.hidden = false;
  b.innerHTML = `<span>${esc(message)}</span>${withReload ? '<button class="bw-action-primary" data-action="reload">Reload</button>' : ""}`;
}

/* ================================================================= dialogs */

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function closeWorkbench() {
  const layer = $("#workbench-layer");
  if (!layer) return;
  const back = layer._returnFocus;
  layer.remove();
  const shell = $(".app-shell");
  if (shell) shell.inert = false;
  document.body.classList.remove("dialog-open");
  if (back && document.contains(back)) back.focus();
}

function fieldHTML(f) {
  const id = `wb-${f.name}`;
  const req = f.required ? " required" : "";
  const help = f.help ? `<small id="${id}-help">${esc(f.help)}</small>` : "";
  const described = f.help ? ` aria-describedby="${id}-help"` : "";
  const label = `<label for="${id}">${esc(f.label)}${f.required ? "" : ' <span class="optional">optional</span>'}</label>`;
  switch (f.type) {
    case "info":
      return `<div class="workbench-info">${f.html}</div>`;
    case "select":
      return `<div class="workbench-field">${label}<select id="${id}" name="${esc(f.name)}"${req}${described}>`
        + (f.placeholder ? `<option value="">${esc(f.placeholder)}</option>` : "")
        + (f.options || []).map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(f.value ?? "") ? " selected" : ""}>${esc(o.label)}</option>`).join("")
        + `</select>${help}</div>`;
    case "textarea":
      return `<div class="workbench-field">${label}<textarea id="${id}" name="${esc(f.name)}" placeholder="${esc(f.placeholder || "")}"${req}${described}>${esc(f.value || "")}</textarea>${help}</div>`;
    case "checkbox":
      return `<div class="workbench-check"><input type="checkbox" id="${id}" name="${esc(f.name)}" value="${esc(f.value ?? "on")}"${f.checked ? " checked" : ""}${described}><label for="${id}">${esc(f.label)}</label>${help}</div>`;
    case "checks":
      return `<fieldset class="workbench-checks"><legend>${esc(f.label)}</legend>${help}${(f.options || []).map((o, i) =>
        `<div class="workbench-check"><input type="checkbox" id="${id}-${i}" name="${esc(f.name)}" value="${esc(o.value)}"><label for="${id}-${i}">${esc(o.label)}</label></div>`).join("")}</fieldset>`;
    default:
      return `<div class="workbench-field">${label}<input type="${esc(f.type || "text")}" id="${id}" name="${esc(f.name)}" value="${esc(f.value || "")}" placeholder="${esc(f.placeholder || "")}"${f.inputmode ? ` inputmode="${esc(f.inputmode)}"` : ""} autocomplete="off"${req}${described}>${help}</div>`;
  }
}

/**
 * One dialog for every form. onSubmit(data) returns { ok } or { refusal }:
 * a refusal is shown inside the dialog and the dialog stays open, so nothing
 * typed is lost.
 */
function openWorkbench({ title, lede = "", fields = [], submit = "Save", onSubmit }) {
  const returnFocus = document.activeElement;
  closeWorkbench();
  const layer = document.createElement("div");
  layer.id = "workbench-layer";
  layer.className = "workbench-layer";
  layer._returnFocus = returnFocus;
  layer.innerHTML = `<div class="workbench-scrim" data-close></div>`
    + `<section class="workbench" role="dialog" aria-modal="true" aria-labelledby="workbench-title">`
    + `<div class="workbench-head"><div><div class="eyebrow">BuyrWorld action</div><h2 id="workbench-title">${esc(title)}</h2>${lede ? `<div class="workbench-lede">${lede}</div>` : ""}</div>`
    + `<button class="workbench-close" type="button" aria-label="Close" data-close>×</button></div>`
    + `<form class="workbench-form" novalidate>${fields.map(fieldHTML).join("")}`
    + `<div class="workbench-error" role="alert" hidden></div>`
    + `<div class="workbench-actions"><button class="bw-action-secondary" type="button" data-close>Cancel</button><button class="bw-action-primary" type="submit">${esc(submit)}</button></div></form></section>`;
  document.body.appendChild(layer);
  const shell = $(".app-shell");
  if (shell) shell.inert = true;
  document.body.classList.add("dialog-open");

  layer.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeWorkbench(); });
  layer.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeWorkbench(); return; }
    if (e.key !== "Tab") return;
    const items = [...layer.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  const form = $("form", layer);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const data = {};
    for (const f of fields) {
      if (!f.name || f.type === "info") continue;
      data[f.name] = f.type === "checks" ? fd.getAll(f.name) : f.type === "checkbox" ? fd.has(f.name) : String(fd.get(f.name) ?? "").trim();
    }
    const missing = fields.filter((f) => f.required && f.type !== "checks" && f.type !== "checkbox" && !data[f.name]);
    const err = $(".workbench-error", layer);
    if (missing.length) {
      err.hidden = false;
      err.textContent = `Needed: ${missing.map((f) => f.label).join(", ")}.`;
      $(`#wb-${missing[0].name}`, layer)?.focus();
      return;
    }
    const out = onSubmit?.(data) || { ok: true };
    if (out.ok === false) {
      if (out.needsUser) { closeWorkbench(); askUser(); return; }
      err.hidden = false;
      err.textContent = out.refusal || "That could not be saved.";
      err.focus?.();
      return;
    }
    closeWorkbench();
  });
  requestAnimationFrame(() => (layer.querySelector("input:not([type=checkbox]),textarea,select") || layer.querySelector(FOCUSABLE))?.focus());
}

/* ============================================================== the forms */

let afterUser = null;

function askUser(then) {
  afterUser = then || null;
  const u = user();
  openWorkbench({
    title: "Who is working?",
    lede: "Your name and role are recorded against every change, decision and approval in this browser.",
    submit: "Save",
    fields: [
      { name: "name", label: "Your name", required: true, value: u?.name || "" },
      { name: "role", label: "Your role", required: true, value: u?.role || "", placeholder: "e.g. Buyer, Commodity Manager", help: "Used to decide who may approve what." },
    ],
    onSubmit: (d) => {
      const r = run({ type: "setUser", user: { name: d.name, role: d.role } });
      if (!r.ok) return r;
      render();
      toast(`Working as ${d.name} (${d.role}).`);
      const next = afterUser; afterUser = null;
      if (next) setTimeout(next, 0);
      return r;
    },
  });
}

const caseOptions = (cases = state.cases) => cases.map((c) => ({ value: c.id, label: `${c.ref} · ${c.title}` }));
const today = () => D.localToday();

function addEvidenceForm(caseId) {
  const c = caseId ? D.caseById(state, caseId) : null;
  openWorkbench({
    title: c ? `Add evidence to ${c.ref}` : "Add evidence to a case",
    lede: "Record a fact, an interpretation, an assumption or a gap. If this answers an open question on the case, use “Record what arrived” on that question instead, so the gap changes rather than gaining a duplicate.",
    submit: "Add evidence",
    fields: [
      ...(c ? [] : [{ name: "caseId", label: "Procurement Case", type: "select", required: true, placeholder: "Choose a case…", options: caseOptions() }]),
      { name: "title", label: "Title", required: true, placeholder: "e.g. Written delivery confirmation" },
      { name: "state", label: "What kind of evidence is it?", type: "select", required: true, placeholder: "Choose…", options: [
        { value: D.STATE.SUPPLIED, label: D.STATE_SAID.SUPPLIED },
        { value: D.STATE.INFERRED, label: D.STATE_SAID.INFERRED },
        { value: D.STATE.ASSUMED, label: D.STATE_SAID.ASSUMED },
        { value: D.STATE.CLAIM, label: D.STATE_SAID.CLAIM },
        { value: D.STATE.UNKNOWN, label: D.STATE_SAID.UNKNOWN },
      ] },
      { name: "text", label: "What does it say?", type: "textarea", placeholder: "In its own words." },
      { name: "basis", label: "Basis", placeholder: "Only for Assumed: what the assumption rests on", help: "An assumption without a basis is refused." },
      { name: "document", label: "Source document", placeholder: "e.g. Supplier email, 17 Oct 2026" },
      { name: "from", label: "From", placeholder: "Who it came from" },
      { name: "date", label: "Date of the source", type: "date" },
      { name: "material", label: "Material — a decision would depend on it", type: "checkbox", checked: true },
    ],
    onSubmit: (d) => {
      const r = run({ type: "addEvidence", caseId: c?.id || d.caseId, title: d.title, state: d.state, text: d.text, basis: d.basis,
        material: d.material, source: { kind: "document", document: d.document, from: d.from, date: d.date } });
      if (r.ok) { render(); toast(d.state === D.STATE.UNKNOWN ? "Gap added with a linked action." : "Evidence added with its source."); }
      return r;
    },
  });
}

function receiveForm(evidenceId) {
  const { c, e } = D.evidenceById(state, evidenceId);
  if (!e) return;
  const req = state.requests.find((r) => r.evidenceId === e.id && r.status !== "answered");
  const sup = req ? D.supplierById(state, req.supplierId) : null;
  openWorkbench({
    title: "Record what arrived",
    lede: `${esc(c.ref)} · <strong>${esc(e.title)}</strong>${req ? `<br>Asked of ${esc(sup?.name)}: “${esc(req.question)}”` : ""}<br>You will judge it in the next step; recording it does not close the gap.`,
    submit: "Record, then assess",
    fields: [
      { name: "text", label: "What was received?", type: "textarea", required: true, placeholder: "What the document actually says, in its own words.",
        help: "Not the conclusion you hoped to reach. If it says no, write no." },
      { name: "document", label: "Document", placeholder: "e.g. Allocation letter NM-221" },
      { name: "from", label: "From", value: sup?.name || "" },
      { name: "date", label: "Date received", type: "date", value: today() },
    ],
    onSubmit: (d) => {
      const r = run({ type: "receiveEvidence", evidenceId: e.id, text: d.text, source: { kind: "document", document: d.document, from: d.from, date: d.date } });
      if (r.ok) { render(); setTimeout(() => assessForm(e.id), 0); }
      return r;
    },
  });
}

function assessForm(evidenceId) {
  const { c, e } = D.evidenceById(state, evidenceId);
  if (!e) return;
  const v = D.current(e);
  openWorkbench({
    title: `Assess: ${e.title}`,
    lede: `${esc(c.ref)} · received from ${esc(v.source?.from || v.source?.document || "an unrecorded source")}:<blockquote>${esc(v.text)}</blockquote>Does this give the case what it needs?`,
    submit: "Record assessment",
    fields: [
      { name: "verdict", label: "Your judgement", type: "select", required: true, placeholder: "Choose…", options: [
        { value: D.VERDICT.SUPPORTS, label: D.VERDICT_SAID.supports },
        { value: D.VERDICT.CONTRADICTS, label: D.VERDICT_SAID.contradicts },
        { value: D.VERDICT.INSUFFICIENT, label: D.VERDICT_SAID.insufficient },
      ] },
      { name: "note", label: "Why, in a sentence", type: "textarea", required: true, help: "It is what the next person, and the decider, will read." },
    ],
    onSubmit: (d) => {
      const r = run({ type: "assessEvidence", evidenceId: e.id, verdict: d.verdict, note: d.note });
      if (r.ok) { render(); toast(r.result.before === r.result.after ? `Assessed. Risk unchanged at ${r.result.after}; see “Why” for what still drives it.` : `Assessed. Risk ${r.result.before} → ${r.result.after}.`); }
      return r;
    },
  });
}

function requestForm({ caseId, evidenceId, supplierId }) {
  if (!caseId && supplierId) {
    const cases = state.cases.filter((c) => c.quotes.some((q) => q.supplierId === supplierId));
    if (cases.length === 1) caseId = cases[0].id;
    else {
      openWorkbench({
        title: "Which case is this request for?",
        lede: "A request to a supplier always belongs to a Procurement Case.",
        submit: "Continue",
        fields: [{ name: "caseId", label: "Procurement Case", type: "select", required: true, placeholder: "Choose…", options: caseOptions(cases) }],
        onSubmit: (d) => { setTimeout(() => requestForm({ caseId: d.caseId, supplierId }), 0); return { ok: true }; },
      });
      return;
    }
  }
  const c = D.caseById(state, caseId);
  if (!c) return;
  const pending = new Set(state.requests.filter((r) => r.status !== "answered").map((r) => r.evidenceId));
  const gaps = D.openGaps(c).filter((e) => !pending.has(e.id));
  openWorkbench({
    title: `Ask a supplier · ${c.ref}`,
    lede: "This records the request against the case. BuyrWorld does not send anything: send it the way you normally would, then mark it sent.",
    submit: "Create request",
    fields: [
      supplierId
        ? { name: "supplierId", type: "info", html: `To <strong>${esc(D.supplierById(state, supplierId)?.name)}</strong>` }
        : { name: "supplierId", label: "Supplier", type: "select", required: true, placeholder: "Choose…", options: c.quotes.map((q) => ({ value: q.supplierId, label: D.supplierById(state, q.supplierId)?.name || q.supplierId })) },
      { name: "evidenceId", label: "Which question does it answer?", type: "select", value: evidenceId || "", options: [{ value: "", label: "A new question" }, ...gaps.map((e) => ({ value: e.id, label: `Open gap: ${e.title}` }))] },
      { name: "question", label: "What are you asking for?", required: true, placeholder: "e.g. Written confirmation of the recovery date for 8,200 ft" },
      { name: "dueDate", label: "Reply needed by", type: "date", required: true, value: D.addDays(today(), 5) },
      { name: "material", label: "Material — a decision would depend on the answer", type: "checkbox", checked: true },
    ],
    onSubmit: (d) => {
      const r = run({ type: "requestEvidence", caseId: c.id, supplierId: supplierId || d.supplierId, evidenceId: d.evidenceId || null,
        question: d.question, dueDate: d.dueDate, material: d.material });
      if (r.ok) { render(); toast("Request recorded, not sent. Send it, then mark it sent."); }
      return r;
    },
  });
}

function markSentForm(requestId) {
  const r0 = D.requestById(state, requestId);
  if (!r0) return;
  openWorkbench({
    title: `Mark ${r0.ref} as sent`,
    lede: `To ${esc(D.supplierById(state, r0.supplierId)?.name)}: “${esc(r0.question)}”`,
    submit: "Mark sent",
    fields: [{ name: "via", label: "Sent by", type: "select", required: true, value: "email", options: ["email", "supplier portal", "phone call", "meeting"].map((x) => ({ value: x, label: x })) }],
    onSubmit: (d) => {
      const r = run({ type: "markRequestSent", requestId, via: d.via });
      if (r.ok) { render(); toast(`${r0.ref} marked sent; its action is now waiting externally.`); }
      return r;
    },
  });
}

function linkSupplierForm(caseId) {
  const c = D.caseById(state, caseId);
  if (!c) return;
  const on = new Set(c.quotes.map((q) => q.supplierId));
  const available = state.suppliers.filter((x) => !on.has(x.id));
  openWorkbench({
    title: `Link a supplier to ${c.ref}`,
    lede: "Choose an existing supplier, or name a new one. Prices are per unit, in pounds.",
    submit: "Link supplier",
    fields: [
      { name: "supplierId", label: "Existing supplier", type: "select", placeholder: available.length ? "Choose…" : "None left — name a new one", options: available.map((x) => ({ value: x.id, label: x.name })) },
      { name: "newName", label: "Or a new supplier's name" },
      { name: "approval", label: "Approval status", type: "select", required: true, value: "Not approved", options: ["Approved", "Conditional", "Not approved"].map((x) => ({ value: x, label: x })) },
      { name: "leadDays", label: "Quoted lead time (calendar days)", inputmode: "numeric" },
      { name: "price", label: "Unit price (£)", inputmode: "decimal" },
      { name: "unit", label: "Unit", value: c.requirement?.unit || "" },
      { name: "incumbent", label: "This is the incumbent supplier", type: "checkbox" },
    ],
    onSubmit: (d) => {
      const lead = d.leadDays ? Number(d.leadDays) : null;
      if (d.leadDays && !(Number.isInteger(lead) && lead >= 0)) return { ok: false, refusal: "Lead time must be a whole number of days." };
      const price = d.price ? D.parseMoneyToPence(d.price) : null;
      if (d.price && price === null) return { ok: false, refusal: "Unit price must be an amount in pounds, like 9.53." };
      let supplierId = d.supplierId;
      if (!supplierId) {
        if (!d.newName) return { ok: false, refusal: "Choose a supplier or name a new one." };
        const add = run({ type: "addSupplier", name: d.newName });
        if (!add.ok) return add;
        supplierId = add.result.supplierId;
      }
      const r = run({ type: "linkSupplier", caseId: c.id, supplierId, incumbent: d.incumbent,
        quote: { approval: d.approval, leadDays: lead, unitPricePence: price, unit: d.unit } });
      if (r.ok) { render(); toast("Supplier linked to the case."); }
      return r;
    },
  });
}

function addActionForm(caseId) {
  const c = caseId ? D.caseById(state, caseId) : null;
  openWorkbench({
    title: "Add a BuyrFlow action",
    lede: "Link it to a Procurement Case where possible. Work with no case is kept, and marked as workspace work.",
    submit: "Create action",
    fields: [
      { name: "title", label: "What needs doing?", required: true, placeholder: "e.g. Place the order with Aven" },
      { name: "caseId", label: "Case", type: "select", value: c?.id || "", options: [{ value: "", label: "Workspace — no Procurement Case" }, ...caseOptions()] },
      { name: "owner", label: "Owner", required: true, value: user()?.role || "Buyer" },
      { name: "dueDate", label: "Due", type: "date", required: true, value: D.addDays(today(), 2) },
      { name: "completionTest", label: "How will you know it is done?", required: true, placeholder: "e.g. PO acknowledged by the supplier" },
    ],
    onSubmit: (d) => {
      const r = run({ type: "addAction", title: d.title, caseId: d.caseId || null, owner: d.owner, dueDate: d.dueDate, completionTest: d.completionTest });
      if (r.ok) { render(); toast(d.caseId ? "Action linked to the case." : "Workspace action created."); }
      return r;
    },
  });
}

function closeActionForm(actionId) {
  const a = D.actionById(state, actionId);
  if (!a) return;
  openWorkbench({
    title: `Validate & close ${a.ref}`,
    lede: `${esc(a.title)}<br>Completion test: ${esc(a.completionTest || a.expectedResult)}`,
    submit: "Close action",
    fields: [{ name: "result", label: "What actually happened?", type: "textarea", required: true, value: a.actualResult || "" }],
    onSubmit: (d) => {
      const r = run({ type: "closeAction", actionId, actualResult: d.result });
      if (r.ok) { render(); toast(`${a.ref} closed.`); }
      return r;
    },
  });
}

/**
 * Record what is at stake, after intake.
 *
 * The threshold that decides whether a second person must approve is applied
 * to this figure, so a case without it cannot be decided. It is often not
 * known when somebody first describes the problem, which is why it is here
 * and not only on the intake form.
 */
/* ========================================================= personal tasks */

/**
 * Add something you need to do. Two fields, and the second is optional.
 *
 * Everything else lives behind More options, because a phone call does not
 * need a priority, a case and a note before it can be written down.
 */
function addTaskForm(preset = {}) {
  const t = D.localToday();
  openWorkbench({
    title: "Add a task",
    lede: "Something you need to get done. Not a Procurement Case — no evidence, approvals or audit trail.",
    submit: "Add task",
    fields: [
      { name: "title", label: "What needs doing?", required: true, placeholder: "Call TW about AMS5599" },
      { name: "due", label: "When?", type: "select", value: preset.due ?? t,
        options: [
          { value: t, label: "Today" },
          { value: D.addDays(t, 1), label: "Tomorrow" },
          { value: D.addDays(t, 7), label: "Next week" },
          { value: "", label: "No date" },
        ] },
      { type: "info", html: `<details class="more-options"><summary>More options</summary>`
        + `<p class="small">A task can point at a Case or a supplier. It stays a task either way — linking one does not give it evidence rules or approvals.</p></details>` },
      { name: "priority", label: "Priority", type: "select", value: "normal",
        options: [{ value: "normal", label: "Normal" }, { value: "high", label: "High" }] },
      { name: "caseId", label: "Related Case", type: "select", value: preset.caseId || "",
        placeholder: "Not related to a Case",
        options: state.cases.map((c) => ({ value: c.id, label: `${c.ref} · ${c.title}` })) },
      { name: "note", label: "Note", type: "textarea", placeholder: "Anything you want to remember" },
    ],
    onSubmit: (d) => {
      const r = run({
        type: "addPersonalTask", title: d.title, dueDate: d.due || null,
        priority: d.priority, caseId: d.caseId || null, note: d.note || null,
      });
      if (r.ok) { render(); toast(`${r.result.ref} added.`); }
      return r;
    },
  });
}

/** Change the wording, the day or the link. Still not a lifecycle. */
function editTaskForm(taskId) {
  const t = D.personalTaskById(state, taskId);
  if (!t) return;
  openWorkbench({
    title: `Edit ${t.ref}`,
    lede: "",
    submit: "Save",
    fields: [
      { name: "title", label: "What needs doing?", required: true, value: t.title },
      { name: "due", label: "Due", type: "date", value: t.dueDate || "" },
      { name: "priority", label: "Priority", type: "select", value: t.priority,
        options: [{ value: "normal", label: "Normal" }, { value: "high", label: "High" }] },
      { name: "note", label: "Note", type: "textarea", value: t.note || "" },
      { type: "info", html: `<p class="small">Finished with it? <button type="button" class="bw-action-text" data-action="task-delete" data-id="${esc(t.id)}">Remove this task</button></p>` },
    ],
    onSubmit: (d) => {
      const r = run({ type: "editPersonalTask", taskId, title: d.title, dueDate: d.due || null, priority: d.priority, note: d.note });
      if (r.ok) { render(); toast("Saved."); }
      return r;
    },
  });
}

function caseValueForm(caseId) {
  const c = D.caseById(state, caseId);
  if (!c) return;
  const threshold = state.settings.secondApprovalAbovePence;
  openWorkbench({
    title: `What is at stake · ${c.ref}`,
    lede: `A decision on this case needs a second approver when it is worth more than `
      + `${esc(D.formatPence(threshold))}. Until the figure is recorded, that question has no answer, `
      + `so a decision cannot be taken.`,
    submit: c.valuePence === null ? "Record value" : "Change value",
    fields: [
      { name: "value", label: "Value at stake (£)", required: true, inputmode: "decimal",
        value: c.valuePence === null ? "" : String(c.valuePence / 100), placeholder: "128,000" },
    ],
    onSubmit: (d) => {
      const pence = D.parseMoneyToPence(d.value);
      if (pence === null || pence <= 0) return { ok: false, refusal: "Enter an amount in pounds, like 128,000." };
      const r = run({ type: "setCaseValue", caseId: c.id, valuePence: pence });
      if (r.ok) { render(); toast("Value recorded."); }
      return r;
    },
  });
}

/* ============================================================ capabilities */

/**
 * The baseline a decomposition rests on: what one unit costs today and how
 * many are bought a year. Two numbers, asked for together, because neither
 * is useful without the other.
 */
function claimBaselineForm(caseId) {
  const c = D.caseById(state, caseId);
  if (!c) return;
  const k = c.claim || {};
  openWorkbench({
    title: `Baseline · ${c.ref}`,
    lede: `The price the increase would be applied to, and the volume it would be applied across. `
      + `Nothing is estimated from these: they are the figures the decomposition is measured against.`,
    submit: Number.isInteger(k.unitPricePence) ? "Change baseline" : "Record baseline",
    fields: [
      { name: "price", label: "Current unit price (£)", required: true, inputmode: "decimal",
        value: Number.isInteger(k.unitPricePence) ? D.formatPence(k.unitPricePence).replace(/^£/, "") : "",
        placeholder: "1,000.00" },
      { name: "volume", label: "Annual volume (units)", required: true, inputmode: "numeric",
        value: Number.isInteger(k.annualVolume) ? String(k.annualVolume) : "", placeholder: "5000" },
    ],
    onSubmit: (d) => {
      const pence = D.parseMoneyToPence(d.price);
      if (pence === null || pence <= 0) return { ok: false, refusal: "Enter a unit price in pounds, like 1,000.00." };
      const volume = /^\d+$/.test(d.volume.replace(/,/g, "")) ? Number(d.volume.replace(/,/g, "")) : null;
      if (!volume) return { ok: false, refusal: "Enter a whole number of units a year, like 5000." };
      const r = run({ type: "setClaimBaseline", caseId: c.id, unitPricePence: pence, annualVolume: volume });
      if (r.ok) { render(); toast("Baseline recorded."); }
      return r;
    },
  });
}

/**
 * One cost driver: a share of the price, and how far that input moved.
 *
 * The share is the part buyers get wrong, so the form says what is still
 * unaccounted for rather than waiting for the engine to mention it.
 */
function claimDriverForm(caseId) {
  const c = D.caseById(state, caseId);
  if (!c) return;
  const used = (c.claim?.drivers || []).reduce((n, d) => n + d.weightBp, 0);
  openWorkbench({
    title: `Add a cost driver · ${c.ref}`,
    lede: `What share of the current price this input is, and how far it has moved. `
      + (used
        ? `Drivers so far cover ${esc(D.formatBp(used))}, leaving ${esc(D.formatBp(10_000 - used))} unaccounted for.`
        : `Nothing is recorded yet, so the whole price is unaccounted for.`),
    fields: [
      { name: "label", label: "Driver", required: true, placeholder: "Nickel, energy, labour" },
      { name: "weight", label: "Share of the unit price (%)", required: true, inputmode: "decimal", placeholder: "50",
        help: "How much of what you pay today is this input." },
      { name: "movement", label: "How far it moved (%)", required: true, inputmode: "decimal", placeholder: "10",
        help: "A fall is negative, and lowers what the increase can be justified by." },
      { name: "source", label: "Source", placeholder: "LME cash settlement, Oct 2026",
        help: "Where the movement figure came from. Recorded with the driver, so the finding can be argued from." },
    ],
    onSubmit: (d) => {
      const weightBp = D.parsePercentToBp(d.weight);
      if (weightBp === null) return { ok: false, refusal: "Enter the share as a percentage, like 50." };
      const movementBp = D.parsePercentToBp(d.movement);
      if (movementBp === null) return { ok: false, refusal: "Enter the movement as a percentage, like 10, or -2 for a fall." };
      const r = run({ type: "addClaimDriver", caseId: c.id, label: d.label, weightBp, movementBp, source: d.source });
      if (r.ok) { render(); toast("Cost driver recorded."); }
      return r;
    },
  });
}

/**
 * Run a capability and record what it found.
 *
 * Two steps on purpose. The result is shown first, with what it rests on and
 * what it leaves open, and recording it is a separate press — because what
 * goes into the ledger is evidence somebody chose to put there.
 */
function runCapabilityForm(caseId, capabilityId) {
  const c = D.caseById(state, caseId);
  const cap = capabilityById(capabilityId);
  if (!c || !cap) return;
  const result = cap.run(c);

  if (!result.ok) {
    openWorkbench({
      title: `${cap.label} · ${c.ref}`,
      lede: `It did not produce a figure, and nothing has been recorded.`,
      submit: "Close",
      fields: [{ type: "info", html: `<p>${esc(result.withheld)}</p>`
        + `<p class="small">A missing input is not an input of zero. Record what is missing and run it again.</p>` }],
      onSubmit: () => ({ ok: true }),
    });
    return;
  }

  const assumptions = (result.assumptions || []).filter((a) => a.text);
  openWorkbench({
    title: `${cap.label} · ${c.ref}`,
    lede: `Calculated from what is recorded on this case. Recording it puts the finding in the evidence ledger as `
      + `derived. It does not decide anything, and every gate on this case is unchanged.`,
    submit: "Record this finding",
    fields: [
      { type: "info", html: `<div class="calc"><div class="eyebrow">What it found</div>`
        + `<p>${esc(result.evidence.text)}</p><p class="small">${esc(result.evidence.basis)}</p></div>` },
      ...(assumptions.length
        ? [{ type: "info", html: `<div class="callout"><strong>What it had to assume</strong><ul>`
            + assumptions.map((a) => `<li>${esc(a.text)}</li>`).join("") + `</ul></div>` }]
        : []),
      ...(result.work.length
        ? [{ type: "info", html: `<div class="callout"><strong>What it suggests next</strong><ul>`
            + result.work.map((wk) => `<li>${esc(wk.title)} — ${esc(wk.why)}</li>`).join("") + `</ul>`
            + `<p class="small">Suggested only. Nothing is created until you add it as work yourself.</p></div>` }]
        : []),
    ],
    onSubmit: () => {
      const r = run({ type: "runCapability", caseId: c.id, capabilityId: cap.id, capabilityLabel: cap.label, result });
      if (r.ok) { render(); toast(`${cap.label}: finding recorded as derived evidence.`); }
      return r;
    },
  });
}

function decisionForm(caseId) {
  const c = D.caseById(state, caseId);
  if (!c) return;
  const risk = D.caseRisk(state, c, today());
  const ack = D.toAcknowledge(c);
  const threshold = state.settings.secondApprovalAbovePence;
  const second = Number.isInteger(c.valuePence) && c.valuePence > threshold;
  const u = user();
  openWorkbench({
    title: `Record a decision · ${c.ref}`,
    lede: `Current risk <strong>${esc(risk.level)}</strong>. Everything in the evidence ledger is frozen with the decision, word for word.`
      + (second ? `<br>This case is worth ${esc(D.formatPence(c.valuePence))}, above ${esc(D.formatPence(threshold))}: a second person must approve before anything is executed.` : ""),
    submit: "Record decision",
    fields: [
      { name: "title", label: "What was decided?", required: true, placeholder: "e.g. Move the December requirement to Aven" },
      { name: "rationale", label: "Why", type: "textarea", required: true },
      { name: "deciderName", label: "Decided by", required: true, value: u?.name || "" },
      { name: "deciderRole", label: "Their role", required: true, value: u?.role || "" },
      ...(c.quotes.length ? [{ name: "route", label: "Supplier this decision commits to", type: "select", value: "", options: [{ value: "", label: "No change of supplier" }, ...c.quotes.map((q) => ({ value: q.supplierId, label: D.supplierById(state, q.supplierId)?.name || q.supplierId }))] }] : []),
      ...(ack.length ? [{ name: "ack", label: "This decision would rest on items that are not evidence. Tick each one you are knowingly relying on:", type: "checks",
        options: ack.map((e) => ({ value: e.id, label: `${e.title} — ${D.STATUS_SAID[D.evidenceStatus(e)]}: ${D.current(e).text}` })) }] : []),
    ],
    onSubmit: (d) => {
      const r = run({ type: "recordDecision", caseId: c.id, title: d.title, rationale: d.rationale,
        decider: { name: d.deciderName, role: d.deciderRole }, routeSupplierId: d.route || null, acknowledged: d.ack || [] });
      if (r.ok) { render(); toast(second ? "Decision recorded; it needs a second approver before execution." : "Decision recorded with its evidence."); }
      return r;
    },
  });
}

function approveForm(decisionId) {
  const d0 = D.decisionById(state, decisionId);
  if (!d0) return;
  /* Pick from the people this workspace already knows, so the same person
     cannot approve their own decision by spelling their name differently.
     The decider is not in the list. Typing a new name is still allowed —
     somebody has to be first — and is recorded as self-asserted. */
  const known = (state.people || []).filter((p) => p.id !== d0.deciderPersonId);
  openWorkbench({
    title: `Approve ${d0.ref}`,
    lede: `“${esc(d0.title)}”, decided by ${esc(d0.decider.name)} (${esc(d0.decider.role)}). The approver must be a different person.`
      + `<br><span class="small">Names are not verified in this build: there are no accounts, so this records who said they approved it, not who did.</span>`,
    submit: "Approve",
    fields: [
      ...(known.length
        ? [{ name: "who", label: "Approver", type: "select", value: known[0].id,
            options: [...known.map((p) => ({ value: p.id, label: `${p.name} — ${p.role}` })),
                      { value: "", label: "Someone else…" }] }]
        : []),
      { name: "name", label: known.length ? "If someone else: their name" : "Approver's name", required: !known.length },
      { name: "role", label: known.length ? "Their role" : "Approver's role", required: !known.length },
    ],
    onSubmit: (d) => {
      const picked = known.length ? d.who : "";
      if (!picked && (!d.name?.trim() || !d.role?.trim())) {
        return { ok: false, refusal: "Choose who approved it, or give the name and role of someone else." };
      }
      const r = run(picked
        ? { type: "approveDecision", decisionId, approverPersonId: picked }
        : { type: "approveDecision", decisionId, approver: { name: d.name, role: d.role } });
      if (r.ok) { render(); toast(`${d0.ref} approved; it now authorises execution.`); }
      return r;
    },
  });
}

function outcomeForm(caseId) {
  const c = D.caseById(state, caseId);
  if (!c) return;
  const decisions = state.decisions.filter((d) => d.caseId === c.id && D.decisionStatus(state, d).status === "authorising");
  const u = user();
  openWorkbench({
    title: `Record the outcome · ${c.ref}`,
    lede: "What actually happened, how it was checked, and against which decision. Savings are not typed here: they are worked out from evidence in Release B.",
    submit: "Record outcome",
    fields: [
      { name: "decisionId", label: "Which decision does this validate?", type: "select", required: true, value: decisions[0]?.id || "", options: decisions.map((d) => ({ value: d.id, label: `${d.ref} · ${d.title}` })) },
      { name: "result", label: "What actually happened?", type: "textarea", required: true },
      { name: "validation", label: "How was it checked?", required: true, placeholder: "e.g. PO acknowledgement and goods-in record" },
      { name: "byName", label: "Validated by", required: true, value: u?.name || "" },
      { name: "byRole", label: "Their role", required: true, value: u?.role || "" },
      { name: "lessons", label: "Lesson for the next case", type: "textarea" },
    ],
    onSubmit: (d) => {
      const r = run({ type: "recordOutcome", caseId: c.id, decisionId: d.decisionId, result: d.result, validation: d.validation,
        validatedBy: { name: d.byName, role: d.byRole }, lessons: d.lessons });
      if (r.ok) { render(); toast("Outcome recorded against the decision."); }
      return r;
    },
  });
}

function thresholdForm() {
  openWorkbench({
    title: "Second-approval threshold",
    lede: "Decisions on cases worth more than this need a second, different person to approve them.",
    submit: "Save",
    fields: [{ name: "amount", label: "Amount (£)", required: true, inputmode: "decimal", value: String(state.settings.secondApprovalAbovePence / 100) }],
    onSubmit: (d) => {
      const pence = D.parseMoneyToPence(d.amount);
      if (pence === null) return { ok: false, refusal: "Enter an amount in pounds, like 250000." };
      const r = run({ type: "setSecondApprovalThreshold", pence });
      if (r.ok) { render(); toast("Threshold saved."); }
      return r;
    },
  });
}

function addSupplierForm() {
  openWorkbench({
    title: "Add a supplier",
    submit: "Add supplier",
    fields: [
      { name: "name", label: "Name", required: true },
      { name: "category", label: "Category", placeholder: "e.g. Precision machining" },
    ],
    onSubmit: (d) => {
      const r = run({ type: "addSupplier", name: d.name, category: d.category });
      if (r.ok) { render(); toast("Supplier added. Link it to a case to request evidence from it."); }
      return r;
    },
  });
}

/* =========================================================== intake (Today) */

function redrawIntake() {
  const box = $("#solve-result");
  if (box) box.innerHTML = V.renderIntake({ pendingIntake: ui.pendingIntake, intakeMessage: ui.intakeMessage });
}

function routeWork(text, example = false) {
  const q = String(text || "").trim();
  if (!q) { ui.pendingIntake = null; ui.intakeMessage = { title: "Describe the problem first.", body: "One or two sentences is enough." }; redrawIntake(); return; }
  const match = D.classifyProblem(q);
  if (!match) {
    /* Not a dead end. The words are kept and the person chooses the kind
       themselves — being unable to name the problem is this build's gap, not
       theirs, and telling them to rephrase asks them to guess which verbs a
       table holds. Nothing is created until they confirm, as before. */
    ui.intakeMessage = null;
    ui.pendingIntake = { unclassified: true, type: null, matched: [], alternatives: [], text: q, example };
  } else {
    ui.intakeMessage = null;
    ui.pendingIntake = { ...match, text: q, example };
  }
  redrawIntake();
  $("#solve-result")?.querySelector("select,button")?.focus();
}

function confirmIntake() {
  const p = ui.pendingIntake;
  if (!p) return;
  const val = (id) => ($(`#${id}`)?.value || "").trim();
  const type = val("in-type") || p.type;
  const cmd = { type: "createCase", caseType: type, statement: p.text, example: p.example };
  const problems = [];
  /* Nothing matched and nothing picked: the one thing that cannot be guessed. */
  if (!type) problems.push("Choose the kind of problem before the case is created.");
  if (val("in-qty")) { const n = Number(val("in-qty").replace(/,/g, "")); if (Number.isInteger(n) && n > 0) cmd.quantity = n; else problems.push("Quantity must be a whole number."); }
  if (val("in-unit")) cmd.unit = val("in-unit");
  if (val("in-needby")) { if (D.isIsoDate(val("in-needby"))) cmd.needBy = val("in-needby"); else problems.push("The need-by date is not a date."); }
  if (val("in-ask")) { const b = D.parsePercentToBp(val("in-ask")); if (b === null) problems.push("The increase must be a percentage, like 7.8."); else cmd.askBp = b; }
  if (val("in-cap")) { const b = D.parsePercentToBp(val("in-cap")); if (b === null) problems.push("The cap must be a percentage, like 4."); else cmd.capBp = b; }
  if (val("in-spend")) { const p2 = D.parseMoneyToPence(val("in-spend")); if (p2 === null) problems.push("Annual spend must be an amount in pounds."); else cmd.annualSpendPence = p2; }
  if (val("in-value")) { const p3 = D.parseMoneyToPence(val("in-value")); if (p3 === null) problems.push("Value at stake must be an amount in pounds."); else cmd.valuePence = p3; }
  if (problems.length) { toast(problems.join(" "), true); return; }
  const r = run(cmd);
  if (r.needsUser) { askUser(confirmIntake); return; }
  if (!r.ok) { toast(r.refusal, true); return; }
  ui.pendingIntake = null;
  location.href = `/cases?id=${encodeURIComponent(r.result.caseId)}`;
}

/* ===================================================== workspace import/export */

function exportWorkspace() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `buyrflow-workspace-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Workspace exported.");
}

function importWorkspace() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    let obj;
    try { obj = JSON.parse(await file.text()); } catch { toast("That file is not JSON.", true); return; }
    const problems = D.validateImport(obj);
    if (problems.length) { toast(problems.join(" "), true); return; }
    const next = obj.schema === D.SCHEMA ? obj : D.migrate(obj).state;
    openWorkbench({
      title: "Replace this workspace?",
      lede: `The file holds ${next.cases.length} case${next.cases.length === 1 ? "" : "s"} and ${next.decisions.length} decision${next.decisions.length === 1 ? "" : "s"}. Everything in this browser is replaced. Export first if you need what is here.`,
      submit: "Replace",
      fields: [],
      onSubmit: () => { if (!writeRaw(next)) return { ok: false, refusal: "Not saved." }; state = next; render(); toast("Workspace imported."); return { ok: true }; },
    });
  });
  input.click();
}

function resetWorkspace() {
  openWorkbench({
    title: "Reset to the review data?",
    lede: "This replaces every case, action and decision in this browser with the three synthetic review cases. Export first if you need what is here.",
    submit: "Reset",
    fields: [],
    onSubmit: () => {
      const fresh = D.seedState();
      fresh.settings.user = user();
      fresh.rev = (state.rev || 0) + 1;
      if (!writeRaw(fresh)) return { ok: false, refusal: "Not saved." };
      state = fresh;
      ui.pendingIntake = null;
      render();
      toast("Review data restored.");
      return { ok: true };
    },
  });
}

/* ============================================================== navigation */

const ROUTES = { "/": "today", "/cases": "cases", "/flow": "flow", "/suppliers": "suppliers", "/decisions": "decisions", "/tools": "tools" };
const TITLES = { today: "Today", cases: "Cases", flow: "My work", suppliers: "Suppliers", decisions: "Decision memory", tools: "Capabilities", notfound: "Not found" };

const currentPage = () => ROUTES[location.pathname.replace(/\/+$/, "") || "/"] || "notfound";

function ensureNavOverlay() {
  let o = $("#nav-overlay");
  if (o) return o;
  o = document.createElement("button");
  o.id = "nav-overlay"; o.className = "nav-overlay"; o.type = "button";
  o.setAttribute("aria-label", "Close navigation");
  o.addEventListener("click", closeNav);
  document.body.appendChild(o);
  return o;
}
function openNav() { $("#sidebar")?.classList.add("open"); ensureNavOverlay().classList.add("open"); document.body.classList.add("nav-open"); $("#menu")?.setAttribute("aria-expanded", "true"); }
function closeNav() { $("#sidebar")?.classList.remove("open"); $("#nav-overlay")?.classList.remove("open"); document.body.classList.remove("nav-open"); $("#menu")?.setAttribute("aria-expanded", "false"); }

function globalSearch(q) {
  q = q.trim().toLowerCase();
  if (!q) return;
  const c = state.cases.find((x) => x.ref.toLowerCase().includes(q) || x.title.toLowerCase().includes(q));
  if (c) { location.href = `/cases?id=${encodeURIComponent(c.id)}`; return; }
  const sp = state.suppliers.find((x) => x.name.toLowerCase().includes(q));
  if (sp) { location.href = `/suppliers?name=${encodeURIComponent(sp.name)}`; return; }
  const a = state.actions.find((x) => x.ref.toLowerCase() === q || x.title.toLowerCase().includes(q));
  if (a) { location.href = `/flow?focus=${encodeURIComponent(a.id)}`; return; }
  toast("No match. Search finds a case, a supplier or an action by its name or reference.", true);
}

/* ================================================================== render */

function render() {
  const page = currentPage();
  /* The hash travels with the rest of the context: a Case arrived at through
     an evidence link opens its detail, rather than hiding the very item the
     link was for. */
  const ctx = { today: today(), params: new URLSearchParams(location.search), hash: location.hash,
    pendingIntake: ui.pendingIntake, intakeMessage: ui.intakeMessage };
  const views = { today: V.renderToday, cases: V.renderCases, flow: V.renderFlow, suppliers: V.renderSuppliers, decisions: V.renderDecisions, tools: V.renderTools, notfound: V.renderNotFound };
  const solveText = $("#solve-input")?.value || "";
  document.body.dataset.page = page;
  document.title = `${TITLES[page]} · BuyrWorld`;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const on = a.dataset.nav === page;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  $("#app").innerHTML = views[page](state, ctx);
  const solve = $("#solve-input");
  if (solve && solveText) solve.value = solveText;
  renderHints();
  /* A secondary screen is open, so the drawer that holds it should be too —
     otherwise the nav gives no sign of where you are. */
  const more = $("#workspace-more");
  if (more && ["cases", "suppliers", "decisions"].includes(page)) more.open = true;
}

/* =========================================== first run, and gentle hints

   Two separate ideas. The walkthrough is shown once and explains the three
   things somebody needs to know. Hints are per-screen, dismissible, and stop
   appearing once the person has done the thing they describe — a hint that
   never goes away is a manual nobody reads.

   Both remember their dismissal in localStorage, which is right for a review
   build with no accounts and is said as much in the release notes. */

const GUIDE_KEY = "buyrflow.guide.v1";
const HINT_KEY = "buyrflow.hints.v1";

const readSet = (key) => { try { return new Set(JSON.parse(localStorage.getItem(key)) || []); } catch { return new Set(); } };
const writeSet = (key, set) => { try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* private window */ } };

const HINTS = {
  today: "Add a task if you already know what needs doing. Describe a problem when you want BuyrWorld to structure the next steps.",
  flow: "This is your daily work list. Case-linked actions appear here too, but BuyrWorld keeps their evidence and approval rules in the background.",
  cases: "Use a Case when the work needs evidence, supplier responses, a decision or an audit trail. You do not need a Case for every task.",
};

/** Put the hint for this screen in its slot, unless it has been dismissed. */
function renderHints() {
  const dismissed = readSet(HINT_KEY);
  document.querySelectorAll(".hint-slot").forEach((slot) => {
    const id = slot.dataset.hint;
    const text = HINTS[id];
    if (!text || dismissed.has(id)) { slot.innerHTML = ""; return; }
    slot.innerHTML = `<div class="hint"><p><strong>Tip:</strong> ${esc(text)}</p>`
      + `<button class="hint-close" data-action="dismiss-hint" data-id="${esc(id)}" aria-label="Dismiss this tip">✕</button></div>`;
  });
}

function dismissHint(id) {
  const set = readSet(HINT_KEY);
  set.add(id);
  writeSet(HINT_KEY, set);
  renderHints();
}

/** The walkthrough. Three things, about thirty seconds. */
function showGuide(force = false) {
  try { if (!force && localStorage.getItem(GUIDE_KEY) === "done") return; } catch { /* private window: show it */ }
  if ($("#guide-layer")) return;
  const returnFocus = document.activeElement;
  const layer = document.createElement("div");
  layer.id = "guide-layer";
  layer.className = "guide-layer";
  layer._returnFocus = returnFocus;
  layer.innerHTML = `<div class="guide-scrim" data-close-guide></div>`
    + `<section class="guide" role="dialog" aria-modal="true" aria-labelledby="guide-title">`
    + `<div class="eyebrow">BuyrFlow in 30 seconds</div>`
    + `<h2 id="guide-title">You do not need to learn the system first.</h2>`
    + `<ol class="guide-list">`
    + `<li><strong>Add a task</strong> when you already know what needs doing.</li>`
    + `<li><strong>Describe a problem</strong> when a supplier, shortage, quote or commercial issue needs structuring.</li>`
    + `<li><strong>Open a Case only when needed</strong> — for evidence, approvals, decisions and history.</li>`
    + `</ol>`
    + `<div class="toolbar"><button class="bw-action-primary" data-action="guide-work">Show my work</button>`
    + `<button class="bw-action-secondary" data-action="guide-done">Got it</button></div>`
    + `</section>`;
  document.body.appendChild(layer);
  document.body.classList.add("dialog-open");
  const shell = $(".app-shell");
  if (shell) shell.inert = true;
  layer.querySelector(".bw-action-primary")?.focus();
}

function closeGuide() {
  const layer = $("#guide-layer");
  if (!layer) return;
  try { localStorage.setItem(GUIDE_KEY, "done"); } catch { /* private window */ }
  const back = layer._returnFocus;
  layer.remove();
  const shell = $(".app-shell");
  if (shell) shell.inert = false;
  document.body.classList.remove("dialog-open");
  if (back && document.contains(back)) back.focus();
}

function afterFirstRender() {
  const params = new URLSearchParams(location.search);
  const focus = params.get("focus");
  const target = focus ? $(`#a-${CSS.escape(focus)}`) : location.hash ? $(location.hash.replace(/^#(.+)$/, (m, id) => `#${CSS.escape(decodeURIComponent(id))}`)) : $(".supplier.focus");
  if (target) requestAnimationFrame(() => { target.scrollIntoView({ block: "center" }); if (target.tabIndex === -1) target.focus({ preventScroll: true }); });
}

/* ================================================================== events */

const ACTIONS = {
  "route-work": () => routeWork($("#solve-input")?.value),
  "example-problem": (b) => { const i = $("#solve-input"); if (i) i.value = b.dataset.example || ""; routeWork(b.dataset.example, true); },
  "confirm-intake": confirmIntake,
  "cancel-intake": () => { ui.pendingIntake = null; ui.intakeMessage = null; redrawIntake(); },
  "set-user": () => askUser(),
  "paste-evidence": () => addEvidenceForm(null),
  "add-evidence": (b) => addEvidenceForm(b.dataset.case),
  "receive": (b) => receiveForm(b.dataset.id),
  "assess": (b) => assessForm(b.dataset.id),
  "request": (b) => requestForm({ caseId: b.dataset.case, evidenceId: b.dataset.evidence, supplierId: b.dataset.supplier }),
  "mark-sent": (b) => markSentForm(b.dataset.id),
  "link-supplier": (b) => linkSupplierForm(b.dataset.case),
  "add-supplier": addSupplierForm,
  "create-work": (b) => runAndShow({ type: "createWorkForGaps", caseId: b.dataset.case }, (r) => `${r.result.created} action${r.result.created === 1 ? "" : "s"} created.`),
  "add-action": (b) => addActionForm(b.dataset.case),
  "advance": (b) => runAndShow({ type: "advanceAction", actionId: b.dataset.id }, "Action progressed."),
  "close-action": (b) => closeActionForm(b.dataset.id),
  "add-task": () => addTaskForm(),
  "task-status": (b) => runAndShow({ type: "setTaskStatus", taskId: b.dataset.id, status: b.dataset.status }, null),
  "task-edit": (b) => editTaskForm(b.dataset.id),
  "task-delete": (b) => { closeWorkbench(); runAndShow({ type: "deletePersonalTask", taskId: b.dataset.id }, "Task removed."); },
  "dismiss-hint": (b) => dismissHint(b.dataset.id),
  "open-guide": () => showGuide(true),
  "guide-done": () => closeGuide(),
  "guide-work": () => { closeGuide(); location.href = "/flow"; },
  "focus-problem": () => { const i = $("#solve-input"); if (i) { i.scrollIntoView({ block: "center" }); i.focus(); } },
  "case-value": (b) => caseValueForm(b.dataset.case),
  "claim-baseline": (b) => claimBaselineForm(b.dataset.case),
  "claim-driver": (b) => claimDriverForm(b.dataset.case),
  "run-capability": (b) => runCapabilityForm(b.dataset.case, b.dataset.cap),
  "record-decision": (b) => decisionForm(b.dataset.case),
  "approve": (b) => approveForm(b.dataset.id),
  "record-outcome": (b) => outcomeForm(b.dataset.case),
  "threshold": thresholdForm,
  "export": exportWorkspace,
  "import": importWorkspace,
  "reset": resetWorkspace,
  "reload": () => location.reload(),
};

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (!b || b.disabled) return;
  const fn = ACTIONS[b.dataset.action];
  if (fn) { e.preventDefault(); fn(b); }
});

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-close-guide]")) closeGuide();
  /* An evidence anchor inside a closed disclosure scrolls nowhere. Opening
     its ancestors first is what makes the link mean what it says. */
  const anchor = e.target.closest(`a[href^="#ev-"]`);
  if (anchor) {
    const target = document.getElementById(decodeURIComponent(anchor.getAttribute("href").slice(1)));
    if (target) {
      for (let d = target.closest("details"); d; d = d.parentElement?.closest("details")) d.open = true;
      requestAnimationFrame(() => { target.scrollIntoView({ block: "center" }); if (target.tabIndex === -1) target.focus({ preventScroll: true }); });
    }
  }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset?.change === "intake-type" && ui.pendingIntake) { ui.pendingIntake = { ...ui.pendingIntake, chosenType: t.value }; redrawIntake(); $("#in-type")?.focus(); }
  if (t.dataset?.change === "flow-stage") location.href = `/flow?stage=${encodeURIComponent(t.value)}`;
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#guide-layer")) { e.preventDefault(); closeGuide(); return; }
  if (e.key !== "Enter") return;
  if (e.target.id === "solve-input") { e.preventDefault(); routeWork(e.target.value); }
  if (e.target.id === "global-search") { e.preventDefault(); globalSearch(e.target.value); }
});

$("#menu")?.addEventListener("click", () => ($("#sidebar")?.classList.contains("open") ? closeNav() : openNav()));
document.querySelectorAll("#sidebar a").forEach((a) => a.addEventListener("click", closeNav));

/* ==================================================================== boot */

state = load();
loadedRev = state.rev;
render();
afterFirstRender();
showGuide();
for (const m of queued.splice(0)) toast(m);
if (!state.settings.user && currentPage() !== "today") toast("Set your name and role on Today before changing anything.");
