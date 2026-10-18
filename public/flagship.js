const TASK_KEY = "buyrflow.personal.v1";

const $ = (q, root = document) => root.querySelector(q);
const $$ = (q, root = document) => [...root.querySelectorAll(q)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

let scheduled = false;
let enhancing = false;
let observer = null;
const app = $("#app");

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readPersonalTasks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TASK_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function personalCandidate(task) {
  if (!task || task.status === "done") return null;
  const now = todayIso();
  let score = 10;
  const reasons = [];
  if (task.due && task.due < now) { score += 90; reasons.push("Overdue"); }
  else if (task.due === now) { score += 50; reasons.push("Due today"); }
  if (task.status === "doing") { score += 25; reasons.push("In progress"); }
  if (task.status === "waiting") { score += 8; reasons.push("Waiting"); }
  if (!reasons.length) reasons.push("Personal task");
  return {
    id: `personal-${task.id}`,
    kind: "personal",
    title: task.title || "Personal task",
    detail: task.note || (task.due ? `Due ${task.due}` : "No due date"),
    href: "/flow",
    score,
    reasons,
  };
}

function procurementCandidate(row, index) {
  const text = row.textContent.replace(/\s+/g, " ").trim();
  const title = $("strong", row)?.textContent?.trim() || "Procurement action";
  const detail = $("p", row)?.textContent?.replace(/\s+/g, " ").trim() || "";
  const href = $("a", row)?.getAttribute("href") || "/flow";
  let score = 20;
  const reasons = [];
  const dot = $(".dot", row);
  if (dot?.classList.contains("critical")) { score += 100; reasons.push("Critical"); }
  else if (dot?.classList.contains("high")) { score += 65; reasons.push("High priority"); }
  if (/overdue/i.test(text)) { score += 85; reasons.push("Overdue"); }
  if (/due today/i.test(text)) { score += 45; reasons.push("Due today"); }
  if (/decision required|decision/i.test(text)) { score += 35; reasons.push("Decision needed"); }
  if (/waiting externally/i.test(text)) { score -= 8; reasons.push("Waiting externally"); }
  if (!reasons.length) reasons.push("Open case work");
  return { id: `proc-${index}`, kind: "procurement", title, detail, href, score, reasons };
}

function focusCandidates() {
  const personal = readPersonalTasks().map(personalCandidate).filter(Boolean);
  const procurement = $$(".attention-list .row").map(procurementCandidate);
  return [...personal, ...procurement].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

function focusCard(item, rank) {
  const chips = item.reasons.slice(0, 2).map((r) => `<span class="flagship-reason">${esc(r)}</span>`).join("");
  return `<article class="flagship-focus-card ${esc(item.kind)}">
    <span class="flagship-rank" aria-hidden="true">${rank}</span>
    <div class="flagship-focus-copy"><div class="flagship-reasons">${chips}</div><strong>${esc(item.title)}</strong><p>${esc(item.detail)}</p></div>
    <a class="bw-action-secondary" href="${esc(item.href)}">Open</a>
  </article>`;
}

function metricSnapshot() {
  const values = [];
  for (const metric of $$(".metrics .metric")) {
    const value = $("b", metric)?.textContent?.trim();
    const label = $("small", metric)?.textContent?.trim();
    if (value && label) values.push({ value, label });
  }
  return values.slice(0, 4);
}

function enhanceToday() {
  if (location.pathname !== "/" && location.pathname !== "") return;
  const host = $(".simple-today-card");
  if (!host) return;
  $("#flagship-focus-now")?.remove();

  const candidates = focusCandidates().slice(0, 3);
  const metrics = metricSnapshot();
  const section = document.createElement("section");
  section.id = "flagship-focus-now";
  section.className = "flagship-focus";
  section.innerHTML = `<div class="flagship-focus-head"><div><div class="eyebrow">Focus now</div><h2>What deserves your attention first</h2><p>Ranked from the work already in BuyrFlow — overdue and critical items rise automatically.</p></div><a class="bw-action-text" href="/flow">See all work →</a></div>
    <div class="flagship-focus-list">${candidates.length ? candidates.map((x, i) => focusCard(x, i + 1)).join("") : '<div class="simple-empty"><strong>No urgent work right now.</strong><span>Add a task or describe a procurement problem when something changes.</span></div>'}</div>
    ${metrics.length ? `<div class="flagship-signals" aria-label="Workspace signals">${metrics.map((m) => `<div><strong>${esc(m.value)}</strong><span>${esc(m.label)}</span></div>`).join("")}</div>` : ""}`;
  host.after(section);
}

function activeJourney() {
  const active = $(".journey-step.active");
  if (!active) return null;
  const label = $("strong", active)?.textContent?.trim() || "Current step";
  const stepText = $("small", active)?.textContent?.trim() || "";
  const match = stepText.match(/(\d+)/);
  return { label, step: match ? Number(match[1]) : null };
}

function evidenceBlockers() {
  const blockers = $$(".evidence-row").filter((row) => {
    const chip = $(".status", row);
    return chip && [...chip.classList].some((c) => ["s-ev-gap", "s-ev-awaiting", "s-ev-insufficient"].includes(c));
  });
  return blockers.map((row) => $("strong", row)?.textContent?.trim()).filter(Boolean);
}

function enhanceCase() {
  if (location.pathname !== "/cases") return;
  const tabs = $(".case-tabs");
  const journey = $(".journey");
  const gate = $(".next-gate");
  if (!tabs || !journey || !gate) return;
  $("#flagship-case-cockpit")?.remove();

  const current = activeJourney();
  const next = $(".next-action strong", gate)?.textContent?.trim() || $("#gate-title", gate)?.textContent?.trim() || "Review the case";
  const why = $(".callout", gate)?.textContent?.replace(/\s+/g, " ").trim() || "The next step is derived from the current evidence and workflow state.";
  const blockers = evidenceBlockers();
  const blockerText = blockers.length ? `${blockers.length} evidence blocker${blockers.length > 1 ? "s" : ""}: ${blockers.slice(0, 2).join(", ")}${blockers.length > 2 ? "…" : ""}` : "No material evidence blocker detected";
  const riskChip = $(".grid .status[class*='s-risk-']");
  const risk = riskChip?.textContent?.trim() || "Risk not shown";

  const section = document.createElement("section");
  section.id = "flagship-case-cockpit";
  section.className = "flagship-case-cockpit";
  section.innerHTML = `<div class="flagship-cockpit-head"><div><div class="eyebrow">Case cockpit</div><h2>${esc(current?.label || "Case progression")}${current?.step ? ` · step ${current.step} of 4` : ""}</h2></div><span class="flagship-risk">${esc(risk)}</span></div>
    <div class="flagship-cockpit-grid">
      <div><small>BLOCKING</small><strong>${esc(blockerText)}</strong></div>
      <div><small>NEXT</small><strong>${esc(next)}</strong></div>
      <div><small>WHY</small><span>${esc(why)}</span></div>
    </div>`;
  tabs.after(section);
}

function observeApp() {
  if (!app || !observer) return;
  observer.observe(app, { childList: true, subtree: true });
}

function enhance() {
  scheduled = false;
  if (enhancing) return;
  enhancing = true;
  observer?.disconnect();
  try {
    enhanceToday();
    enhanceCase();
  } finally {
    enhancing = false;
    observeApp();
  }
}

function scheduleEnhance() {
  if (scheduled || enhancing) return;
  scheduled = true;
  requestAnimationFrame(enhance);
}

if (app) {
  observer = new MutationObserver(scheduleEnhance);
  observeApp();
}
window.addEventListener("storage", scheduleEnhance);
window.addEventListener("popstate", scheduleEnhance);
setTimeout(scheduleEnhance, 0);
