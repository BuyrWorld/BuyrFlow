/**
 * The switch itself, driven through app.js.
 *
 * tests/workspaces.test.mjs reads app.js as text, which can say the right
 * key is named but not that the right thing lands in it. This boots the
 * application against a stubbed browser and drives it the way a person
 * would: press Demo, press My workspace, add something, press back.
 *
 * What it cannot see: layout, focus, a real click reaching a real button,
 * or anything about how any of this looks. See tests/dom-stub.mjs.
 *
 * app.js is a module with top-level boot code, so Node caches it after the
 * first import and it cannot be re-booted. Everything here therefore runs
 * against one instance, in order, as one session — which is also how a
 * person uses it.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { installDOM } from "./dom-stub.mjs";

const DEMO_KEY = "buyrflow.workspace.demo.v3";
const LIVE_KEY = "buyrflow.workspace.live.v3";
const MODE_KEY = "buyrflow.mode.v1";

let dom;
const read = (k) => { const v = dom.store.get(k); return v ? JSON.parse(v) : null; };

before(async () => {
  dom = installDOM();
  await import("../public/app.js");
});

describe("a first visit lands in the Demo", () => {
  test("it opens the demo, and says so in three places", () => {
    assert.equal(dom.workspace(), "demo");
    assert.deepEqual(dom.pressed(), { demo: "true", live: "false" });
    assert.match(globalThis.document.title, /· Demo ·/);
  });

  test("the demo is written to its own key, with the review cases in it", () => {
    const demo = read(DEMO_KEY);
    assert.ok(demo, "the demo was not saved");
    assert.equal(demo.mode, "demo");
    assert.equal(demo.cases.length, 3);
  });

  test("nothing has been written to the live workspace", () => {
    assert.equal(read(LIVE_KEY), null, "an empty workspace was created before anyone asked for one");
  });

  test("the page is labelled review data", () => {
    assert.match(dom.html(), /REVIEW DATA/);
  });
});

describe("switching to my workspace", () => {
  before(() => { dom.clearSaid(); dom.click("workspace-live"); });

  test("the whole shell follows, not just the content", () => {
    assert.equal(dom.workspace(), "live");
    assert.deepEqual(dom.pressed(), { demo: "false", live: "true" });
    assert.match(globalThis.document.title, /· My workspace ·/);
    assert.ok(dom.said().some((t) => /Now in My workspace/.test(t)), `said: ${dom.said().join(" | ")}`);
  });

  test("it is empty, and it is not labelled review data", () => {
    assert.doesNotMatch(dom.html(), /REVIEW DATA/);
    assert.match(dom.html(), /Empty, and that is correct/);
    assert.equal(read(LIVE_KEY).cases.length, 0);
    assert.equal(read(LIVE_KEY).mode, "live");
  });

  test("the demo is untouched on disk", () => {
    assert.equal(read(DEMO_KEY).cases.length, 3);
  });

  test("the choice is remembered, so a reload comes back here", () => {
    assert.equal(dom.store.get(MODE_KEY), "live");
  });
});

describe("work done in one workspace stays there", () => {
  before(() => {
    /* A name is recorded against every change, so set one first — exactly
       what the screen asks a person to do. */
    dom.clearSaid();
  });

  test("a task added here is saved to the live key and nowhere else", async () => {
    const D = await import("../public/domain.js");
    const before = read(DEMO_KEY).personalTasks.length;

    /* Drive the domain the way app.js does, then save through the same
       door the page uses: the switch is what is under test, not the form. */
    const who = { name: "Sam Patel", role: "Buyer" };
    let s = read(LIVE_KEY);
    /* Every change is recorded against a person, so name one first — the
       same thing the screen asks for before it will accept anything. */
    s = D.apply(s, { type: "setUser", user: who }, who, { today: "2026-10-25" }).state;
    s = D.apply(s, { type: "addPersonalTask", title: "Ring Orion about the surcharge" }, who, { today: "2026-10-25" }).state;
    dom.store.set(LIVE_KEY, JSON.stringify(s));

    assert.equal(read(LIVE_KEY).personalTasks.length, 1);
    assert.equal(read(DEMO_KEY).personalTasks.length, before,
      "a task added to the live workspace appeared in the demo");
  });

  test("switching back shows the demo, not the task", () => {
    dom.click("workspace-demo");
    assert.equal(dom.workspace(), "demo");
    assert.match(dom.html(), /REVIEW DATA/);
    assert.doesNotMatch(dom.html(), /Ring Orion about the surcharge/);
  });

  test("and switching forward again still has it", () => {
    dom.click("workspace-live");
    assert.equal(dom.workspace(), "live");
    assert.match(dom.html(), /Ring Orion about the surcharge/);
    assert.doesNotMatch(dom.html(), /Empty, and that is correct/, "the first-run panel came back over real work");
  });
});

describe("a conflict belongs to one workspace", () => {
  test("another tab changing the demo does not freeze the live workspace", () => {
    assert.equal(dom.workspace(), "live");
    dom.storage(DEMO_KEY);
    assert.equal(dom.banner(), "", "a change to the demo blocked work in the live workspace");
  });

  test("another tab changing this workspace does say so", () => {
    dom.storage(LIVE_KEY);
    assert.match(dom.banner(), /changed in another tab/);
    assert.match(dom.banner(), /My workspace/, "the banner does not name which workspace");
  });

  test("switching away clears it, because the other workspace is not in conflict", () => {
    dom.click("workspace-demo");
    assert.equal(dom.banner(), "", "the conflict followed the person into the other workspace");
  });

  test("and commands work again — a hidden banner is not the same as a cleared block", () => {
    /* The banner going away proves only that a banner went away. A conflict
       that is still set refuses every command with no sign on the page,
       which is worse than the banner: the person presses things and nothing
       happens. So this presses something and checks it was not refused. */
    dom.click("workspace-live");
    const task = read(LIVE_KEY).personalTasks[0];
    assert.ok(task, "no task to press; the fixture above did not survive");
    dom.clearSaid();
    dom.click("task-status", { id: task.id, status: "doing" });
    assert.ok(!dom.said().some((t) => /another tab/i.test(t)),
      `the command was refused after switching: ${dom.said().join(" | ")}`);
    assert.equal(read(LIVE_KEY).personalTasks[0].status, "doing",
      "the command did not reach storage, so the workspace is still blocked");
  });
});

describe("the strip's own link works", () => {
  /* One session, in order, so each group says where it starts rather than
     inheriting wherever the last one finished. */
  before(() => dom.click("workspace-demo"));

  test("switch to my workspace, from inside the demo page", () => {
    assert.equal(dom.workspace(), "demo");
    assert.match(dom.html(), /data-action="workspace-live"/);
    dom.click("workspace-live");
    assert.equal(dom.workspace(), "live");
  });

  test("and the first-run panel's button goes the other way", () => {
    dom.click("workspace-demo");
    assert.equal(dom.workspace(), "demo");
  });

  test("pressing the workspace you are already in does nothing", () => {
    const before = dom.html();
    dom.clearSaid();
    dom.click("workspace-demo");
    assert.equal(dom.workspace(), "demo");
    assert.equal(dom.html(), before);
    assert.deepEqual(dom.said(), [], "it announced a switch that did not happen");
  });
});
