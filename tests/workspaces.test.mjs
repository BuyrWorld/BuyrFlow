/**
 * Two workspaces: the Demo, and real work.
 *
 * The risk this split creates is leakage in either direction — a real case
 * labelled as review data, or a reset of the demo taking real work with it.
 * Most of that lives in app.js, which owns storage and cannot be imported
 * here, so these tests cover the two halves that can be: the state the
 * domain hands out, and what each screen says about it.
 *
 * The storage keys themselves are read out of app.js as text. That is a
 * weaker test than exercising them, and it is here because the alternative
 * is no test at all on the one thing that must never be shared.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as D from "../public/domain.js";
import * as V from "../public/views.js";
import { workspace, BUYER, TODAY } from "./helpers.mjs";

const app = readFileSync("public/app.js", "utf8");
const ctx = (search = "") => ({ today: TODAY, params: new URLSearchParams(search), pendingIntake: null, intakeMessage: null });
const PAGES = [["today", V.renderToday], ["cases", V.renderCases], ["flow", V.renderFlow],
  ["suppliers", V.renderSuppliers], ["decisions", V.renderDecisions], ["tools", V.renderTools]];

/* ------------------------------------------------------------- the states */

describe("an empty workspace is the same product, with nothing in it", () => {
  test("it has every key the seeded one has", () => {
    assert.deepEqual(Object.keys(D.emptyState()).sort(), Object.keys(D.seedState()).sort());
  });

  test("it is genuinely empty — no sample anything to delete", () => {
    const s = D.emptyState();
    for (const k of ["cases", "suppliers", "actions", "decisions", "requests", "events", "personalTasks", "people"]) {
      assert.deepEqual(s[k], [], `${k} is not empty in a new workspace`);
    }
    for (const [k, n] of Object.entries(s.seq)) assert.equal(n, 0, `seq.${k} starts at ${n}`);
  });

  test("each one says which it is", () => {
    assert.equal(D.emptyState().mode, D.MODE.LIVE);
    assert.equal(D.seedState().mode, D.MODE.DEMO);
    assert.equal(D.newWorkspace(D.MODE.LIVE).mode, D.MODE.LIVE);
    assert.equal(D.newWorkspace(D.MODE.DEMO).mode, D.MODE.DEMO);
  });

  test("the approval threshold is carried, because zero and infinity are both wrong", () => {
    /* A default of zero means every decision needs two names; a default of
       none means no decision ever does. Neither is a safe thing to invent. */
    assert.equal(D.emptyState().settings.secondApprovalAbovePence,
      D.seedState().settings.secondApprovalAbovePence);
    assert.ok(Number.isInteger(D.emptyState().settings.secondApprovalAbovePence));
  });

  test("isMode accepts the two and nothing else", () => {
    assert.equal(D.isMode("demo"), true);
    assert.equal(D.isMode("live"), true);
    for (const x of ["DEMO", "", null, undefined, "test", 0]) assert.equal(D.isMode(x), false, `isMode(${JSON.stringify(x)})`);
  });
});

/* ----------------------------------------------- the gates are not relaxed */

describe("an empty workspace is governed exactly like a seeded one", () => {
  const w = () => workspace(D.emptyState());

  test("a case opened here carries the same evidence checklist", () => {
    const x = w();
    x.step({ type: "createCase", caseType: "claim", title: "Surcharge",
      statement: "The supplier wants considerably more money from January." });
    const c = x.state.cases[0];
    assert.ok(c.evidence.filter((e) => e.material && e.question).length >= 2,
      "a case in a fresh workspace started with no open questions");
    assert.ok(D.openGaps(c).length, "nothing blocks a decision on it");
  });

  test("it refuses a decision for the same reasons", () => {
    const x = w();
    const { result } = x.step({ type: "createCase", caseType: "claim", title: "Surcharge",
      statement: "The supplier wants considerably more money from January." });
    assert.throws(() => x.step({ type: "recordDecision", caseId: result.caseId, title: "Accept",
      rationale: "Looks fine.", decider: BUYER }), D.Refusal);
  });

  test("references start at one rather than continuing the demo's numbering", () => {
    const x = w();
    x.step({ type: "createCase", caseType: "shortage", title: "Short",
      statement: "We will run out of the coil before December." });
    assert.equal(x.state.cases[0].ref, "CASE-0001");
  });
});

/* ------------------------------------------------- what each screen says */

describe("a live workspace is never labelled as review data", () => {
  test("every page carries the strip in the demo and none in the live one", () => {
    for (const [name, render] of PAGES) {
      assert.match(render(D.seedState(), ctx()), /REVIEW DATA/, `${name} lost the strip in the demo`);
      assert.doesNotMatch(render(D.emptyState(), ctx()), /REVIEW DATA/, `${name} calls real work synthetic`);
    }
  });

  test("a live workspace with real cases in it still carries no strip", () => {
    /* The dangerous case: not the empty screen, but the one that looks
       exactly like the demo because it is full. */
    const x = workspace(D.emptyState());
    x.step({ type: "createCase", caseType: "claim", title: "Real supplier, real money",
      statement: "The supplier wants considerably more money from January." });
    for (const [name, render] of PAGES) {
      assert.doesNotMatch(render(x.state, ctx()), /REVIEW DATA/, `${name} labelled a real case as review data`);
    }
  });

  test("the strip offers the way out of the demo", () => {
    const html = V.renderToday(D.seedState(), ctx());
    assert.match(html, /data-action="workspace-live"/);
  });

  test("workspaceStrip decides on the state's own mode, not on what is in it", () => {
    /* A live workspace that happens to hold the seed data is still live. */
    assert.equal(V.workspaceStrip({ ...D.seedState(), mode: D.MODE.LIVE }), "");
    assert.match(V.workspaceStrip({ ...D.emptyState(), mode: D.MODE.DEMO }), /REVIEW DATA/);
    assert.match(V.workspaceStrip(undefined), /REVIEW DATA/, "an unknown workspace should err towards the warning");
  });
});

/* ----------------------------------------------------------- the first run */

describe("the empty live workspace explains itself", () => {
  test("it says the emptiness is correct and points at the demo", () => {
    const html = V.renderToday(D.emptyState(), ctx());
    assert.match(html, /Empty, and that is correct/);
    assert.match(html, /data-action="workspace-demo"/);
    assert.match(html, /Nothing you do there touches anything here/);
  });

  test("it goes as soon as there is anything, and does not need dismissing", () => {
    const x = workspace(D.emptyState());
    x.step({ type: "addPersonalTask", title: "Call the supplier" });
    assert.doesNotMatch(V.renderToday(x.state, ctx()), /Empty, and that is correct/);
  });

  test("the demo never shows it, even when something has emptied the demo", () => {
    /* The seeded demo has cases, so it would pass this on the wrong grounds.
       An emptied demo is the state that tells the two conditions apart. */
    const emptiedDemo = { ...D.emptyState(), mode: D.MODE.DEMO };
    assert.doesNotMatch(V.renderToday(emptiedDemo, ctx()), /Empty, and that is correct/,
      "the demo offered to open the demo");
    assert.doesNotMatch(V.renderToday(D.seedState(), ctx()), /Empty, and that is correct/);
  });

  test("the destructive control is named for what it destroys", () => {
    assert.match(V.renderToday(D.emptyState(), ctx()), /Clear my workspace/);
    assert.match(V.renderToday(D.seedState(), ctx()), /Reset the demo/);
    assert.doesNotMatch(V.renderToday(D.emptyState(), ctx()), /Reset to review data/);
  });
});

/* ------------------------------------------------------ the storage split */

describe("the two workspaces cannot reach each other", () => {
  test("they are separate keys, and neither is the pre-split one", () => {
    assert.match(app, /\[D\.MODE\.DEMO\]: "buyrflow\.workspace\.demo\.v3"/);
    assert.match(app, /\[D\.MODE\.LIVE\]: "buyrflow\.workspace\.live\.v3"/);
    assert.match(app, /SPLIT_KEY = "buyrflow\.workspace\.v3"/);
  });

  test("the pre-split workspace is read, never written", () => {
    /* It was seeded review data by construction, so it becomes the demo —
       and it stays where it is, as the backup, exactly as the v0.7 key did. */
    assert.match(app, /readKey\(SPLIT_KEY\)/);
    assert.doesNotMatch(app, /setItem\(SPLIT_KEY/);
    assert.doesNotMatch(app, /removeItem\(SPLIT_KEY/);
    assert.doesNotMatch(app, /removeItem\(LEGACY_KEY/);
  });

  test("one function writes a workspace, and it names which", () => {
    /* One unqualified write of a workspace is all it would take to put the
       demo over somebody's real cases, so there is exactly one place that
       can do it and it indexes KEYS by mode. The other setItem calls write
       preferences — the remembered mode, dismissed hints, the guide flag —
       which are deliberately shared by both workspaces. */
    const writers = [...app.matchAll(/localStorage\.setItem\(([^,]+), JSON\.stringify\((?:s|state)\)\)/g)];
    assert.equal(writers.length, 1, `${writers.length} places write a whole workspace; there should be one`);
    assert.equal(writers[0][1].trim(), "KEYS[m]");

    const raw = app.slice(app.indexOf("function writeRaw"), app.indexOf("/** Save, unless another tab"));
    assert.match(raw, /writeRaw\(s, m = mode\)/, "writeRaw cannot be told which workspace to write");
  });

  test("a conflict in one workspace is not a conflict in the other", () => {
    assert.match(app, /if \(e\.key === KEYS\[mode\]\) markConflict\(\)/);
  });

  test("switching reloads from the other key rather than copying anything", () => {
    const fn = app.slice(app.indexOf("function switchWorkspace"), app.indexOf("/* ================================================================ running */"));
    assert.match(fn, /state = load\(mode\)/);
    assert.match(fn, /conflict = false/, "a conflict followed the person into the other workspace");
    assert.doesNotMatch(fn, /\bmerge\b/i);
  });

  test("a reset builds the workspace for the mode it is in", () => {
    const fn = app.slice(app.indexOf("function resetWorkspace"), app.indexOf("/* ============================================================== navigation */"));
    assert.match(fn, /D\.newWorkspace\(mode\)/);
    assert.doesNotMatch(fn, /D\.seedState\(\)/, "reset seeds review data regardless of which workspace it is in");
  });

  test("clearing real work needs the word typed, and the demo does not", () => {
    /* Two halves, and both matter: a field that is not asked for leaves the
       check below it reading an undefined answer, and a demo that demands a
       typed confirmation to restore a fixture is just friction. */
    const fn = app.slice(app.indexOf("function resetWorkspace"), app.indexOf("/* ============================================================== navigation */"));
    assert.match(fn, /fields: live\s*\n(?:\s*\/\*[\s\S]*?\*\/\s*\n)?\s*\? \[\{ name: "confirm"[^\]]*required: true/,
      "the live reset does not ask for a typed confirmation");
    assert.match(fn, /: \[\]/, "the demo reset asks for one it does not need");
    assert.match(fn, /d\.confirm\.trim\(\)\.toUpperCase\(\) !== "DELETE"/, "nothing checks what was typed");
  });

  test("an import lands in the slot it was dropped into, and says when that differs", () => {
    const fn = app.slice(app.indexOf("function importWorkspace"), app.indexOf("function resetWorkspace"));
    assert.match(fn, /\{ \.\.\.next, mode \}/, "an imported file keeps a mode that contradicts its slot");
    assert.match(fn, /next\.mode !== mode/, "importing a demo file into real work passes without a word");
  });
});

/* ------------------------------------------------------------ loose ends */

describe("nothing escapes the rule by being an edge", () => {
  test("a page that does not exist is not branded review data either", () => {
    assert.doesNotMatch(V.renderNotFound(D.emptyState()), /REVIEW DATA/);
    assert.match(V.renderNotFound(D.seedState()), /REVIEW DATA/);
  });

  test("the walkthrough says where you are and that the two are separate", () => {
    const app = readFileSync("public/app.js", "utf8");
    const guide = app.slice(app.indexOf("function showGuide"), app.indexOf("function closeGuide"));
    assert.match(guide, /Demo/);
    assert.match(guide, /My workspace/);
    assert.match(guide, /nothing you do in one reaches the other/i);
  });

  test("the shell's switch names both workspaces and declares one pressed", () => {
    const html = readFileSync("public/index.html", "utf8");
    assert.match(html, /data-action="workspace-demo"[^>]*data-workspace="demo"[^>]*aria-pressed=/);
    assert.match(html, /data-action="workspace-live"[^>]*data-workspace="live"[^>]*aria-pressed=/);
    assert.match(html, /role="group" aria-label="Workspace"/);
    assert.doesNotMatch(html, /synthetic review workspace/, "the old static label is still in the shell");
  });
});
