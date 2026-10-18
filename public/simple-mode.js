const TASK_KEY = "buyrflow:personal-tasks:v1";
const GUIDE_KEY = "buyrflow:guide:v1";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const today = () => new Date().toISOString().slice(0, 10);

function loadTasks(){
  try { const v = JSON.parse(localStorage.getItem(TASK_KEY) || "[]"); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
function saveTasks(tasks){ localStorage.setItem(TASK_KEY, JSON.stringify(tasks)); }
function uid(){ return globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function fmtDate(v){ if(!v) return "No due date"; const d=new Date(`${v}T00:00:00`); return Number.isNaN(d.getTime())?v:d.toLocaleDateString(undefined,{day:"numeric",month:"short"}); }

function showGuide(force=false){
  if(!force && localStorage.getItem(GUIDE_KEY)==="done") return;
  $("#simple-guide")?.remove();
  const wrap=document.createElement("div");
  wrap.id="simple-guide"; wrap.className="simple-guide-backdrop";
  wrap.innerHTML=`<section class="simple-guide" role="dialog" aria-modal="true" aria-labelledby="simple-guide-title">
    <div class="eyebrow">BuyrFlow in 30 seconds</div><h2 id="simple-guide-title">You do not need to learn the system first.</h2>
    <p>Start with what you need to get done. BuyrFlow only brings in Cases, evidence and approvals when the work genuinely needs them.</p>
    <div class="simple-guide-grid">
      <div class="simple-guide-card"><b>1 · Add a task</b><span>For ordinary daily work: call a supplier, review a quote, finish an RFQ, chase an answer.</span></div>
      <div class="simple-guide-card"><b>2 · Describe a problem</b><span>For shortages, price changes, sourcing decisions or supplier issues that need evidence and judgement.</span></div>
      <div class="simple-guide-card"><b>3 · Open the detail when needed</b><span>Cases keep the evidence, approvals and audit trail underneath. You do not have to live there.</span></div>
    </div><div class="simple-guide-actions"><button class="bw-action-primary" data-simple="close-guide">Got it — show me Today</button></div>
  </section>`;
  document.body.appendChild(wrap);
  $("[data-simple='close-guide']",wrap)?.focus();
}
function closeGuide(){ localStorage.setItem(GUIDE_KEY,"done"); $("#simple-guide")?.remove(); }

function taskMarkup(task){
  const cls=task.status==="done"?"done":task.status==="waiting"?"waiting":"";
  const state=task.status==="done"?"Done":task.status==="waiting"?"Waiting":"To do";
  return `<div class="simple-task ${cls}" data-task-id="${esc(task.id)}"><span class="simple-task-state" aria-hidden="true"></span><div><strong>${esc(task.title)}</strong><small>${esc(state)} · ${esc(fmtDate(task.due))}</small></div><div class="simple-task-actions">${task.status!=="done"?`<button data-simple="task-wait" data-id="${esc(task.id)}">${task.status==="waiting"?"Back to do":"Waiting"}</button><button data-simple="task-done" data-id="${esc(task.id)}">Done</button>`:`<button data-simple="task-reopen" data-id="${esc(task.id)}">Reopen</button>`}<button data-simple="task-delete" data-id="${esc(task.id)}" aria-label="Delete ${esc(task.title)}">Delete</button></div></div>`;
}
function taskList(includeDone=false){
  const tasks=loadTasks().filter(t=>includeDone||t.status!=="done").sort((a,b)=>(a.status==="waiting")-(b.status==="waiting") || String(a.due||"9999").localeCompare(String(b.due||"9999")));
  return tasks.length?`<div class="simple-task-list">${tasks.map(taskMarkup).join("")}</div>`:`<div class="simple-empty">Nothing here yet. Add the next thing you need to do — it does not need to become a Procurement Case.</div>`;
}
function taskForm(){ return `<form class="simple-task-form" data-simple-form="task"><input name="title" required maxlength="180" placeholder="e.g. Call TW about AMS5599"><input name="due" type="date" value="${today()}"><button class="bw-action-primary" type="submit">Add task</button></form>`; }

function contextual(text,title="A quick guide"){
  return `<section class="simple-context"><span class="simple-context-icon">?</span><div><strong>${esc(title)}</strong><p>${esc(text)}</p></div></section>`;
}

function enhanceToday(app){
  if($(".simple-daily-start",app)) return;
  const who=$(".who",app); const solve=$(".signature-solve",app);
  const panel=document.createElement("section"); panel.className="simple-daily-start";
  panel.innerHTML=`<div class="eyebrow">Today</div><h1>What are you working on today?</h1><p class="lead">Keep ordinary work simple. Use a Procurement Case only when the work needs evidence, a decision or an audit trail.</p>
    <div class="simple-start-grid"><button class="simple-start-card primary" data-simple="show-task-form"><span class="simple-start-icon">＋</span><b>Add a task</b><span>Something you personally need to get done.</span></button><button class="simple-start-card" data-simple="focus-problem"><span class="simple-start-icon">→</span><b>Resolve a procurement problem</b><span>Shortage, supplier issue, quote, price change or sourcing decision.</span></button></div>
    <div data-simple-slot="task-form"></div><div class="simple-my-actions"><div class="simple-my-actions-head"><h2>My actions</h2><a href="/flow" class="bw-action-text">See all my work →</a></div><div data-simple-slot="today-tasks">${taskList(false)}</div></div>`;
  (who?.nextSibling || solve || app.firstChild) ? app.insertBefore(panel, who?.nextSibling || solve || app.firstChild) : app.appendChild(panel);
  if(solve){
    const h=$("h1",solve); if(h) h.textContent="Resolve a procurement problem";
    const lead=$(".lead",solve); if(lead) lead.textContent="Describe what changed in normal procurement language. BuyrWorld will confirm what it understood before creating a Case.";
    const input=$("#solve-input",solve); if(input) input.placeholder="e.g. Northstar will miss the 11 December need date";
  }
  const parts=[$(".metrics",app),$(".grid",app),$(".workspace-data",app)].filter(Boolean);
  if(parts.length){ const d=document.createElement("details"); d.className="simple-collapsed-workspace"; d.innerHTML="<summary>Show procurement workspace details</summary>"; parts[0].before(d); parts.forEach(p=>d.appendChild(p)); }
}

function enhanceFlow(app){
  if($(".simple-flow-zone",app)) return;
  const head=$(".page-head",app); if(head){ const h=$("h1",head); if(h) h.textContent="My work"; const lead=$(".lead",head); if(lead) lead.textContent="Your daily actions first. Open the governed workflow only when you need the full case process."; }
  const zone=document.createElement("section"); zone.className="bw-panel simple-flow-zone"; zone.innerHTML=`<div class="simple-flow-intro"><div><div class="eyebrow">My actions</div><h2>What do I need to do?</h2><p>Personal tasks stay lightweight. Case-linked work keeps its evidence and approval controls underneath.</p></div><button class="bw-action-primary" data-simple="show-task-form">Add task</button></div><div data-simple-slot="task-form"></div><div data-simple-slot="flow-tasks">${taskList(true)}</div>`;
  const toolbar=$(".flow-toolbar",app); if(toolbar) toolbar.before(zone); else app.prepend(zone);
  const board=$(".flow-board",app); if(toolbar&&board){ const d=document.createElement("details"); d.className="simple-governed-flow"; d.innerHTML="<summary>Show governed workflow board</summary>"; toolbar.before(d); d.append(toolbar,board); }
}

function enhanceCases(app){
  if($(".simple-context",app)) return;
  const head=$(".page-head",app); if(head){ const h=$("h1",head); if(h) h.textContent="Cases"; const lead=$(".lead",head); if(lead) lead.textContent="Use a Case when the work needs evidence, a commercial decision, supplier coordination or an audit trail."; head.after(document.createRange().createContextualFragment(contextual("Start with the box that says what to do next. Open evidence, risk and history only when you need to understand or defend the decision.","You are in the detailed view"))); }
  const why=$("details.why",app); if(why) why.open=false;
  if(location.hash.startsWith("#ev-")){ const target=$(location.hash); if(target){ target.insertAdjacentHTML("beforebegin",contextual("This item is part of the evidence behind the Case. Review what arrived, where it came from, and whether it actually answers the question before progressing the work.","Why am I looking at this?")); } }
}
function enhanceOther(app,page){
  if($(".simple-context",app)) return;
  const hints={suppliers:["Suppliers","Use this when you need supplier-specific context. Your day-to-day actions still live in My work."],decisions:["Decision memory","This is the record of what was decided, why, and what happened afterwards. You do not need it for ordinary tasks."]};
  if(hints[page]) app.insertAdjacentHTML("afterbegin",contextual(hints[page][1],hints[page][0]));
}

function enhance(){
  const app=$("#app"); if(!app) return; const page=document.body.dataset.page || ({"/":"today","/flow":"flow","/cases":"cases","/suppliers":"suppliers","/decisions":"decisions"}[location.pathname]||"");
  if(page==="today") enhanceToday(app); else if(page==="flow") enhanceFlow(app); else if(page==="cases") enhanceCases(app); else enhanceOther(app,page);
}
function refreshTasks(){
  const a=$("[data-simple-slot='today-tasks']"); if(a) a.innerHTML=taskList(false);
  const b=$("[data-simple-slot='flow-tasks']"); if(b) b.innerHTML=taskList(true);
}
function showTaskForm(){ $$('[data-simple-slot="task-form"]').forEach(slot=>{slot.innerHTML=taskForm(); $("input[name='title']",slot)?.focus();}); }
function mutateTask(id,fn){ const tasks=loadTasks(); const t=tasks.find(x=>x.id===id); if(!t)return; fn(t); saveTasks(tasks); refreshTasks(); }

document.addEventListener("click",(e)=>{
  const b=e.target.closest("[data-simple]"); if(!b)return; const a=b.dataset.simple;
  if(a==="close-guide") closeGuide();
  if(a==="show-task-form") showTaskForm();
  if(a==="focus-problem"){ $("#solve-input")?.scrollIntoView({behavior:"smooth",block:"center"}); setTimeout(()=>$("#solve-input")?.focus(),250); }
  if(a==="task-wait") mutateTask(b.dataset.id,t=>t.status=t.status==="waiting"?"todo":"waiting");
  if(a==="task-done") mutateTask(b.dataset.id,t=>t.status="done");
  if(a==="task-reopen") mutateTask(b.dataset.id,t=>t.status="todo");
  if(a==="task-delete"){ saveTasks(loadTasks().filter(t=>t.id!==b.dataset.id)); refreshTasks(); }
});
document.addEventListener("submit",(e)=>{
  const f=e.target.closest("[data-simple-form='task']"); if(!f)return; e.preventDefault(); const fd=new FormData(f); const title=String(fd.get("title")||"").trim(); if(!title)return; const tasks=loadTasks(); tasks.push({id:uid(),title,due:String(fd.get("due")||""),status:"todo",createdAt:new Date().toISOString()}); saveTasks(tasks); $$('[data-simple-slot="task-form"]').forEach(s=>s.innerHTML=""); refreshTasks();
});
$("#simple-help")?.addEventListener("click",()=>showGuide(true));

const app=$("#app"); let pending=false;
const observer=new MutationObserver(()=>{ if(pending)return; pending=true; queueMicrotask(()=>{pending=false; enhance();}); });
if(app) observer.observe(app,{childList:true});
enhance(); showGuide(false);
