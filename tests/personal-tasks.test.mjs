/**
 * Personal tasks, and the wall between them and governed work.
 *
 * v0.9.1 makes BuyrFlow usable for an individual's day. The risk it creates
 * is the opposite of the one v0.8.1 closed: that making work lightweight
 * quietly makes *governed* work lightweight too. So most of this file is
 * about what a personal task cannot do.
 *
 * The separation is structural — tasks live in their own array and never in
 * `s.actions` — and these tests exist to notice if that ever stops being
 * true.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as D from "../public/domain.js";
import { workspace, refused, BUYER, DIRECTOR, TODAY } from "./helpers.mjs";

/* ------------------------------------------------------- it is lightweight */

describe("a personal task asks for almost nothing", () => {
  test("a title alone is enough", () => {
    const w = workspace();
    const out = w.step({ type: "addPersonalTask", title: "Call TW about AMS5599" });
    const t = D.personalTaskById(w.state, out.result.taskId);
    assert.equal(t.title, "Call TW about AMS5599");
    assert.equal(t.status, D.TASK_STATUS.TODO);
    assert.equal(t.dueDate, null);
    assert.equal(t.caseId, null);
    assert.match(t.ref, /^P-\d+$/);
  });

  test("a title and a day is the common case", () => {
    const w = workspace();
    w.step({ type: "addPersonalTask", title: "Review RFQ pack", dueDate: "2026-10-19" });
    assert.equal(D.personalTasks(w.state)[0].dueDate, "2026-10-19");
  });

  test("it never asks for a completion test, a stage or an evidence state", () => {
    const w = workspace();
    const out = w.step({ type: "addPersonalTask", title: "Prepare the meeting" });
    const t = D.personalTaskById(w.state, out.result.taskId);
    for (const governed of ["completionTest", "expectedResult", "stage", "kind", "evidenceId", "history"]) {
      assert.equal(governed in t, false, `a personal task carries "${governed}", which belongs to governed work`);
    }
  });

  test("an empty title is refused; a bad date is refused rather than dropped", () => {
    const w = workspace();
    refused(() => w.step({ type: "addPersonalTask", title: "   " }), "title");
    refused(() => w.step({ type: "addPersonalTask", title: "Call someone", dueDate: "2026-02-30" }), "due");
    refused(() => w.step({ type: "addPersonalTask", title: "Call someone", dueDate: "tomorrow" }), "due");
  });

  test("one step moves it to any state, in any direction", () => {
    const w = workspace();
    const id = w.step({ type: "addPersonalTask", title: "Chase legal" }).result.taskId;
    for (const status of ["doing", "waiting", "done", "todo"]) {
      w.step({ type: "setTaskStatus", taskId: id, status });
      assert.equal(D.personalTaskById(w.state, id).status, status);
    }
  });

  test("finishing one records when, and un-finishing clears it", () => {
    const w = workspace();
    const id = w.step({ type: "addPersonalTask", title: "Send the order" }).result.taskId;
    w.step({ type: "setTaskStatus", taskId: id, status: D.TASK_STATUS.DONE });
    assert.ok(D.personalTaskById(w.state, id).completedAt);
    w.step({ type: "setTaskStatus", taskId: id, status: D.TASK_STATUS.TODO });
    assert.equal(D.personalTaskById(w.state, id).completedAt, null);
  });
});

/* ------------------------------------------- it cannot touch governed work */

describe("a personal task cannot reach the governed path", () => {
  test("it is not an action, so the action list never sees it", () => {
    const w = workspace();
    const before = w.state.actions.length;
    w.step({ type: "addPersonalTask", title: "Call Northstar" });
    assert.equal(w.state.actions.length, before, "a personal task was added to s.actions");
  });

  test("the commercial commands do not recognise its id", () => {
    const w = workspace();
    const taskId = w.step({ type: "addPersonalTask", title: "Call Northstar" }).result.taskId;
    refused(() => w.step({ type: "advanceAction", actionId: taskId }), "action");
    refused(() => w.step({ type: "closeAction", actionId: taskId, actualResult: "done" }), "action");
  });

  test("and an action id is not a task", () => {
    const w = workspace();
    refused(() => w.step({ type: "setTaskStatus", taskId: "T-101", status: "done" }), "task");
    refused(() => w.step({ type: "deletePersonalTask", taskId: "T-101" }), "task");
  });

  test("linking one to a Case does not make it Case work", () => {
    const w = workspace();
    const c = w.case("AMS5599");
    const open = D.openActions(w.state, c.id).length;
    const id = w.step({ type: "addPersonalTask", title: "Call them about it", caseId: c.id }).result.taskId;
    const t = D.personalTaskById(w.state, id);
    assert.equal(t.caseId, c.id, "the link was not recorded");
    assert.equal(D.openActions(w.state, c.id).length, open, "a linked task was counted as open Case work");
    assert.equal(w.state.actions.some((a) => a.id === id), false);
  });

  test("a task linked to a Case cannot hold up its outcome", () => {
    /* The sharpest version of the separation. recordOutcome refuses while
       any Case action is open; a personal reminder must not be one of them,
       or every Case would wait on somebody's to-do list. */
    const w = workspace();
    const c = w.case("MACH204");
    w.step({ type: "addPersonalTask", title: "Remember to tell the team", caseId: c.id });
    assert.equal(D.openActions(w.state, c.id).some((a) => a.title === "Remember to tell the team"), false);
  });

  test("marking one done invokes no approval and needs no decision", () => {
    const w = workspace();
    const c = w.case("NI718");
    const id = w.step({ type: "addPersonalTask", title: "Email the buyer", caseId: c.id }).result.taskId;
    const decisionsBefore = w.state.decisions.length;
    w.step({ type: "setTaskStatus", taskId: id, status: D.TASK_STATUS.DONE }, BUYER);
    assert.equal(w.state.decisions.length, decisionsBefore, "finishing a task touched the decision record");
    assert.equal(D.personalTaskById(w.state, id).status, "done");
  });

  test("a task is not in the Case's audit trail", () => {
    /* Case events are the Case's history. A personal reminder is not part of
       what was decided and why, so it is recorded against no case. */
    const w = workspace();
    const c = w.case("AMS5599");
    w.step({ type: "addPersonalTask", title: "Private reminder", caseId: c.id });
    const onCase = w.state.events.filter((e) => e.caseId === c.id && e.type === "Task added");
    assert.equal(onCase.length, 0, "a personal task wrote into a Case's timeline");
  });

  test("the governed lifecycles are untouched", () => {
    assert.deepEqual([...D.LIFECYCLE.evidence], ["investigate", "prepare", "waiting", "validate", "closed"]);
    assert.deepEqual([...D.LIFECYCLE.execution], ["investigate", "prepare", "decision", "execute", "validate", "closed"]);
    assert.deepEqual([...D.LIFECYCLE.workspace], ["investigate", "prepare", "waiting", "validate", "closed"]);
    assert.deepEqual(Object.keys(D.KIND).sort(), ["EVIDENCE", "EXECUTION", "WORKSPACE"]);
  });

  test("the personal and governed vocabularies are both present and disjoint", () => {
    const governed = ["advanceAction", "closeAction", "recordDecision", "approveDecision", "recordOutcome"];
    const personal = ["addPersonalTask", "setTaskStatus", "editPersonalTask", "deletePersonalTask"];
    for (const p of personal) assert.ok(D.COMMANDS.includes(p), `${p} is not a command`);
    for (const g of governed) assert.ok(D.COMMANDS.includes(g), `${g} disappeared`);
    assert.equal(personal.some((p) => governed.includes(p)), false);
  });
});

/* --------------------------------------------------------------- the day */

describe("what a day looks like", () => {
  test("the four counts are the ones the page leads with", () => {
    const w = workspace();
    w.step({ type: "addPersonalTask", title: "Due today", dueDate: TODAY });
    w.step({ type: "addPersonalTask", title: "Late", dueDate: "2026-10-01" });
    const parked = w.step({ type: "addPersonalTask", title: "Parked", dueDate: TODAY }).result.taskId;
    w.step({ type: "setTaskStatus", taskId: parked, status: D.TASK_STATUS.WAITING });

    const day = D.myDay(w.state, TODAY);
    assert.equal(day.dueToday, 1, "a waiting task should not also count as due today");
    assert.equal(day.overdue, 1);
    assert.equal(day.waiting, 1);
    assert.equal(typeof day.needsDecision, "number");
  });

  test("a finished task leaves the day", () => {
    const w = workspace();
    const id = w.step({ type: "addPersonalTask", title: "Done already", dueDate: TODAY }).result.taskId;
    assert.equal(D.myDay(w.state, TODAY).dueToday, 1);
    w.step({ type: "setTaskStatus", taskId: id, status: D.TASK_STATUS.DONE });
    assert.equal(D.myDay(w.state, TODAY).dueToday, 0);
    assert.equal(D.openPersonalTasks(w.state).length, 0);
  });

  test("tasks come back soonest first, and undated ones last", () => {
    const w = workspace();
    w.step({ type: "addPersonalTask", title: "No date" });
    w.step({ type: "addPersonalTask", title: "Later", dueDate: "2026-10-25" });
    w.step({ type: "addPersonalTask", title: "Sooner", dueDate: "2026-10-19" });
    assert.deepEqual(D.myTasks(w.state).map((t) => t.title), ["Sooner", "Later", "No date"]);
  });

  test("tasks belong to the person who added them", () => {
    const w = workspace();
    w.step({ type: "addPersonalTask", title: "Mine" }, BUYER);
    w.step({ type: "addPersonalTask", title: "Theirs" }, DIRECTOR);
    const me = w.state.people.find((p) => p.name === BUYER.name);
    assert.deepEqual(D.myTasks(w.state, me.id).map((t) => t.title), ["Mine"]);
  });

  test("a workspace saved before tasks existed still reads", () => {
    const old = D.seedState();
    delete old.personalTasks;
    assert.deepEqual(D.personalTasks(old), []);
    assert.deepEqual(D.myTasks(old), []);
    assert.equal(D.myDay(old, TODAY).dueToday, 0);
  });
});
