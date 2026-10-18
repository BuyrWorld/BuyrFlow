const GUIDE_KEY = "buyrflow.guide.v1.seen";
const TASK_KEY = "buyrflow.personal.v1";

const $ = (q, root = document) => root.querySelector(q);
const $$ = (q, root = document) => [...root.querySelectorAll(q)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

let enhancing = false;
let observer = null;

function readTasks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TASK_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTasks(tasks) {
  localStorage.setItem(TASK_KEY, JSON.stringify(tasks));
}

function uid() {
  return globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatDue(iso) {
  if (!iso) return "No due date";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(y, m - 1, d));
}

function openPersonalTaskDialog(existing = null) {
  closeSimpleDialog();
  const layer = document.createElement("div");
  layer.id = "simple-dialog-layer";
  layer.className = "simple-dialog-layer";
  layer.innerHTML = `
    <div class="simple-dialog-scrim" data-simple-close></div>
    <section class="simple-dialog" role="dialog" aria-modal="true" aria-labelledby="simple-task-title">
      <button class="simple-dialog-x" type="button" data-simple-close aria-label="Close">×</button>
      <div class="eyebrow">Personal task</div>
      <h2 id="simple-task-title">${existing ? "Edit task" : "Add something to your day"}</h2>
      <p class="simple-lead">Use this for ordinary work that does not need a Procurement Case.</p>
      <form id="simple-task-form">
        <label>What needs doing?<input name="title" required autocomplete="off" value="${esc(existing?.title || "")}" placeholder="e.g. Call TW about AMS5599"></label>
        <label>When?<input name="due" type="date" value="${esc(existing?.due || "")}"></label>
        <label>Note <span class="optional">optional</span><textarea name="note" placeholder="Anything useful to remember">${esc(existing?.note || "")}</textarea></label>
        <div class="simple-dialog-actions"><button type="button" class="bw-action-secondary" data-simple-close>Cancel</button><button class="bw-action-primary" type="submit">${existing ? "Save" : "Add task"}</button></div>
      </form>
    </section>`;
  document.body.appendChild(layer);
  layer.addEventListener("click", (e) => { if (e.target.closest("[data-simple-close]")) closeSimpleDialog(); });
  $("#simple-task-form", layer).addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") || "").trim();
    if (!title) return;
    const tasks = readTasks();
    if (existing) {
      const ix = tasks.findIndex((t) => t.id === existing.id);
      if (ix >= 0) tasks[ix] = { ...tasks[ix], title, due: String(fd.get("due") || ""), note: String(fd.get("note") || "").trim(), updatedAt: new Date().toISOString() };
    } else {
      tasks.unshift({ id: uid(), title, due: String(fd.get("due") || ""), note: String(fd.get("note") || "").trim(), status: "todo", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    writeTasks(tasks);
    closeSimpleDialog();
    enhancePage(true);
  });
  requestAnimationFrame(() => $("input[name=title]", layer)?.focus());
}

function closeSimpleDialog() {
  $("#simple-dialog-layer")?.remove();
}

function setTaskStatus(id, status) {
  const tasks = readTasks();
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  t.status = status;
  t.updatedAt = new Date().toISOString();
  writeTasks(tasks);
  enhancePage(true);
}

function deleteTask(id) {
  writeTasks(readTasks().filter((t) => t.id !== id));
  enhancePage(true);
}

function taskButtons(t) {
  if (t.status === "done") return `<button class="mini" data-personal-status="todo" data-task-id="${esc(t.id)}">Reopen</button>`;
  const out = [];
  if (t.status !== "doing") out.push(`<button class="mini" data-personal-status="doing" data-task-id="${esc(t.id)}">Start</button>`);
  if (t.status !== "waiting") out.push(`<button class="mini" data-personal-status="waiting" data-task-id="${esc(t.id)}">Waiting</button>`);
  out.push(`<button class="mini primary" data-personal-status="done" data-task-id="${esc(t.id)}">Done</button>`);
  return out.join("");
}

function taskCard(t) {
  const status = t.status === "doing" ? "In progress" : t.status === "waiting" ? "Waiting" : t.status === "done" ? "Done" : "To do";
  return `<article class="personal-task ${esc(t.status)}">
    <button class="personal-task-main" data-personal-edit="${esc(t.id)}">
      <span class="personal-check" aria-hidden="true">${t.status === "done" ? "✓" : ""}</span>
      <span><strong>${esc(t.title)}</strong><small>${esc(status)} · ${esc(formatDue(t.due))}${t.note ? ` · ${esc(t.note)}` : ""}</small></span>
    </button>
    <div class="personal-task-actions">${taskButtons(t)}<button class="mini quiet" data-personal-delete="${esc(t.id)}" aria-label="Delete ${esc(t.title)}">×</button></div>
  </article>`;
}

function personalTasksHTML({ includeDone = false } = {}) {
  const tasks = readTasks().filter((t) => includeDone || t.status !== "done");
  if (!tasks.length) return `<div class="simple-empty"><strong>Nothing here yet.</strong><span>Add an ordinary task, or describe a procurement problem below.</span></div>`;
  return `<div class="personal-task-list">${tasks.map(taskCard).join("")}</div>`;
}

function setupNavigation() {
  const nav = $(".side-nav");
  if (!nav || nav.dataset.simpleReady) return;
  nav.dataset.simpleReady = "1";
  const flow = $('a[href="/flow"]', nav);
  if (flow) flow.innerHTML = `<span class="icon" aria-hidden="true">→</span>My work`;
  for (const href of ["/cases", "/suppliers", "/decisions"]) {
    const a = $(`a[href="${href}"]`, nav);
    if (a) a.classList.add("advanced-nav-item");
  }
  const more = document.createElement("button");
  more.type = "button";
  more.className = "more-nav-button";
  more.innerHTML = `<span class="icon" aria-hidden="true">＋</span><span>More</span><span aria-hidden="true">⌄</span>`;
  more.addEventListener("click", () => {
    document.body.classList.toggle("advanced-nav-open");
    more.setAttribute("aria-expanded", document.body.classList.contains("advanced-nav-open") ? "true" : "false");
  });
  const firstAdvanced = $(".advanced-nav-item", nav);
  nav.insertBefore(more, firstAdvanced || null);

  const help = document.createElement("button");
  help.type = "button";
  help.id = "guide-help";
  help.className = "guide-help";
  help.setAttribute("aria-label", "How BuyrFlow works");
  help.textContent = "?";
  help.addEventListener("click", () => openGuide(false));
  $(".topbar")?.appendChild(help);
}

function openGuide(firstTime = false) {
  $("#simple-guide-layer")?.remove();
  const layer = document.createElement("div");
  layer.id = "simple-guide-layer";
  layer.className = "simple-guide-layer";
  layer.innerHTML = `<div class="simple-guide-scrim"></div><section class="simple-guide" role="dialog" aria-modal="true" aria-labelledby="guide-title">
    <button type="button" class="simple-dialog-x" data-guide-close aria-label="Close">×</button>
    <div class="eyebrow">${firstTime ? "Welcome" : "Quick guide"}</div>
    <h2 id="guide-title">BuyrFlow in 30 seconds</h2>
    <p class="simple-lead">You do not need to learn the system before you use it.</p>
    <div class="guide-steps">
      <div><b>1</b><strong>Add ordinary work</strong><span>Use <em>Add task</em> for calls, follow-ups, reviews and anything else you simply need to get done.</span></div>
      <div><b>2</b><strong>Describe a procurement problem</strong><span>For shortages, price increases, quotes or supplier issues, tell BuyrWorld what changed in normal language.</span></div>
      <div><b>3</b><strong>Go deeper only when needed</strong><span>A Procurement Case holds evidence, decisions and audit history. Most people can stay on Today and My work.</span></div>
    </div>
    <div class="simple-guide-actions"><button type="button" class="bw-action-primary" data-guide-close>${firstTime ? "Start with Today" : "Got it"}</button></div>
  </section>`;
  document.body.appendChild(layer);
  $$('[data-guide-close]', layer).forEach((b) => b.addEventListener("click", () => {
    if (firstTime) localStorage.setItem(GUIDE_KEY, "1");
    layer.remove();
  }));
}

function hint(text, title = "Tip") {
  const el = document.createElement("aside");
  el.className = "simple-hint";
  el.innerHTML = `<span class="simple-hint-icon" aria-hidden="true">i</span><div><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
  return el;
}

function addTodaySimpleLayer(app) {
  const solve = $(".signature-solve", app);
  if (!solve) return;
  const h1 = $("#solve-title", solve);
  if (h1) h1.textContent = "What are you working on today?";
  const lead = $(".lead", solve);
  if (lead) lead.textContent = "Add something simple to your day, or describe a procurement problem and BuyrWorld will help structure it.";

  const dashboard = document.createElement("section");
  dashboard.className = "simple-today-card";
  dashboard.innerHTML = `<div class="simple-section-head"><div><div class="eyebrow">My day</div><h2>Keep today moving</h2></div><button class="bw-action-primary" data-personal-add>+ Add task</button></div>
    <p class="simple-lead">For calls, follow-ups, reviews and other everyday work. No Case required.</p>
    <div data-personal-tasks>${personalTasksHTML()}</div>`;
  solve.parentNode.insertBefore(dashboard, solve);

  const starter = document.createElement("div");
  starter.className = "simple-choice-strip";
  starter.innerHTML = `<button class="simple-choice" data-personal-add><strong>+ Add a task</strong><span>Something I simply need to get done</span></button>
    <button class="simple-choice" data-focus-problem><strong>Resolve a procurement problem</strong><span>Shortage, quote, supplier issue or commercial change</span></button>`;
  solve.insertBefore(starter, solve.querySelector(".solve-row"));

  const contextual = hint("Start with an ordinary task if you just need a reminder. Use the problem box when the work needs evidence, suppliers or a decision.", "Where should I start?");
  dashboard.after(contextual);

  const detailTargets = [$(".metrics", app), $(".grid", app), $(".workspace-data", app)].filter(Boolean);
  detailTargets.forEach((x) => x.classList.add("simple-advanced-section"));
  if (detailTargets.length) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "bw-action-text simple-detail-toggle";
    toggle.dataset.toggleWorkspaceDetail = "1";
    toggle.textContent = "Show workspace detail";
    solve.after(toggle);
  }
}

function simpleProcurementCard(card) {
  const title = $("strong", card)?.textContent?.trim() || "Procurement action";
  const meta = $(".flow-meta", card)?.textContent?.replace(/\s+/g, " ").trim() || "";
  const actions = $(".flow-actions", card)?.innerHTML || "";
  return `<article class="simple-procurement-task"><div><strong>${esc(title)}</strong><small>${esc(meta)}</small></div><div class="simple-procurement-actions">${actions}</div></article>`;
}

function addFlowSimpleLayer(app) {
  const pageHead = $(".page-head", app);
  const title = pageHead?.querySelector("h1");
  const lead = pageHead?.querySelector(".lead");
  if (title) title.textContent = "My work";
  if (lead) lead.textContent = "A simple view of what needs your attention. Open the workflow board only when you need the full process.";

  const toolbar = $(".flow-toolbar", app);
  const board = $(".flow-board", app);
  if (!board) return;
  toolbar?.classList.add("simple-flow-advanced");
  board.classList.add("simple-flow-advanced");

  const cards = $$(".flow-card", board);
  const section = document.createElement("section");
  section.className = "simple-work-page";
  section.innerHTML = `<div class="simple-section-head"><div><div class="eyebrow">Personal</div><h2>My tasks</h2></div><button class="bw-action-primary" data-personal-add>+ Add task</button></div>
    <div data-personal-tasks>${personalTasksHTML({ includeDone: true })}</div>
    <div class="simple-section-divider"></div>
    <div class="simple-section-head"><div><div class="eyebrow">Procurement</div><h2>Case-linked work</h2></div><button class="bw-action-secondary" data-toggle-workflow-board>Show workflow board</button></div>
    <p class="simple-lead">These actions come from Procurement Cases, so their evidence and approval controls stay in place.</p>
    <div class="simple-procurement-list">${cards.length ? cards.map(simpleProcurementCard).join("") : '<div class="simple-empty"><strong>No case-linked work here.</strong><span>Your governed procurement actions will appear here.</span></div>'}</div>`;
  (toolbar || board).parentNode.insertBefore(section, toolbar || board);
  section.before(hint("Use My tasks for your own day. Case-linked work remains governed underneath — the simple view only removes the navigation burden.", "Two kinds of work"));
}

function addCaseGuidance(app) {
  const head = $(".page-head", app) || $(".demo-strip", app)?.nextElementSibling;
  const gate = $(".next-gate", app);
  if (gate) {
    const eyebrow = $(".eyebrow", gate);
    if (eyebrow) eyebrow.textContent = "What should I do next?";
    gate.parentNode.insertBefore(hint("You do not need to work through every section. Start with this next action; open the evidence and history only when you need to understand why.", "Start here"), gate);
  } else if (head) {
    head.after(hint("A Case is the deeper view for work that needs evidence, a supplier response or a recorded decision. Ordinary to-dos belong in My work.", "What is a Case?"));
  }
  $$('details', app).forEach((d) => { if (!location.hash) d.open = false; });
  $$('h2', app).forEach((h) => {
    if (h.textContent.trim() === "What do we actually know?") h.textContent = "What we know — and what is still missing";
    if (h.previousElementSibling?.textContent?.includes("Linked BuyrFlow work")) h.previousElementSibling.textContent = "Open work";
  });
  if (location.hash.startsWith("#ev-")) {
    const target = $(location.hash);
    if (target) {
      target.classList.add("simple-target-evidence");
      const direct = hint("You opened a specific evidence item. Review what arrived, then use the action on that item. You do not need to read the whole Case first.", "You are in the right place");
      const gateOrFirst = $(".next-gate", app) || app.firstElementChild;
      gateOrFirst?.parentNode?.insertBefore(direct, gateOrFirst);
    }
  }
}

function addGenericGuidance(app, page) {
  const head = $(".page-head", app);
  if (!head) return;
  const copy = page === "suppliers"
    ? ["Supplier pages are for context and evidence requests. Your day-to-day actions still live in My work.", "When should I use this?"]
    : ["Decision Memory is the record of what was decided and why. You normally arrive here from a Case rather than starting here.", "When should I use this?"];
  head.after(hint(copy[0], copy[1]));
}

function bindSimpleActions(root = document) {
  $$('[data-personal-add]', root).forEach((b) => { if (!b.dataset.bound) { b.dataset.bound = "1"; b.addEventListener("click", () => openPersonalTaskDialog()); } });
  $$('[data-personal-status]', root).forEach((b) => { if (!b.dataset.bound) { b.dataset.bound = "1"; b.addEventListener("click", () => setTaskStatus(b.dataset.taskId, b.dataset.personalStatus)); } });
  $$('[data-personal-edit]', root).forEach((b) => { if (!b.dataset.bound) { b.dataset.bound = "1"; b.addEventListener("click", () => { const t = readTasks().find((x) => x.id === b.dataset.personalEdit); if (t) openPersonalTaskDialog(t); }); } });
  $$('[data-personal-delete]', root).forEach((b) => { if (!b.dataset.bound) { b.dataset.bound = "1"; b.addEventListener("click", () => deleteTask(b.dataset.personalDelete)); } });
  $$('[data-focus-problem]', root).forEach((b) => { if (!b.dataset.bound) { b.dataset.bound = "1"; b.addEventListener("click", () => { const input = $("#solve-input"); input?.scrollIntoView({ behavior: "smooth", block: "center" }); input?.focus(); }); } });
  $$('[data-toggle-workspace-detail]', root).forEach((b) => { if (!b.dataset.bound) { b.dataset.bound = "1"; b.addEventListener("click", () => { document.body.classList.toggle("show-workspace-detail"); b.textContent = document.body.classList.contains("show-workspace-detail") ? "Hide workspace detail" : "Show workspace detail"; }); } });
  $$('[data-toggle-workflow-board]', root).forEach((b) => { if (!b.dataset.bound) { b.dataset.bound = "1"; b.addEventListener("click", () => { document.body.classList.toggle("show-workflow-board"); b.textContent = document.body.classList.contains("show-workflow-board") ? "Hide workflow board" : "Show workflow board"; }); } });
}

function enhancePage(force = false) {
  if (enhancing) return;
  const app = $("#app");
  if (!app) return;
  const page = document.body.dataset.page || "";
  const signature = `${page}:${location.search}:${location.hash}`;
  if (!force && app.dataset.simpleSignature === signature) { bindSimpleActions(app); return; }
  enhancing = true;
  try {
    app.dataset.simpleSignature = signature;
    $$(".simple-today-card,.simple-hint,.simple-work-page,.simple-detail-toggle", app).forEach((x) => x.remove());
    document.body.classList.remove("show-workspace-detail", "show-workflow-board");
    if (page === "today") addTodaySimpleLayer(app);
    if (page === "flow") addFlowSimpleLayer(app);
    if (page === "cases") addCaseGuidance(app);
    if (page === "suppliers" || page === "decisions") addGenericGuidance(app, page);
    bindSimpleActions(app);
  } finally {
    enhancing = false;
  }
}

function boot() {
  document.body.classList.add("simple-mode");
  setupNavigation();
  enhancePage(true);
  const app = $("#app");
  if (app) {
    observer = new MutationObserver(() => requestAnimationFrame(() => enhancePage(false)));
    observer.observe(app, { childList: true, subtree: false });
  }
  if (!localStorage.getItem(GUIDE_KEY)) openGuide(true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
