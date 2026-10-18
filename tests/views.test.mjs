/**
 * Every screen, rendered from state with no browser.
 *
 * views.js is pure, so each page can be drawn here exactly as the page draws
 * it. This cannot see layout, focus or touch — those still need a person on a
 * phone — but it does see what each screen says and what it escapes.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as D from "../public/domain.js";
import * as V from "../public/views.js";
import { workspace, BUYER, DIRECTOR, TODAY } from "./helpers.mjs";

const ctx = (search = "", extra = {}) => ({ today: TODAY, params: new URLSearchParams(search), pendingIntake: null, intakeMessage: null, ...extra });
const PAGES = [["today", V.renderToday], ["cases", V.renderCases], ["flow", V.renderFlow], ["suppliers", V.renderSuppliers], ["decisions", V.renderDecisions]];

describe("every page renders from the seed", () => {
  for (const [name, render] of PAGES) {
    test(name, () => {
      const html = render(D.seedState(), ctx());
      assert.ok(html.length > 500);
      assert.match(html, /REVIEW DATA/, "synthetic data is labelled");
      assert.doesNotMatch(html, /undefined|NaN|\[object Object\]/);
    });
  }
  for (const ref of ["C-AMS", "C-MACH", "C-NI"]) {
    test(`case ${ref}`, () => assert.doesNotMatch(V.renderCases(D.seedState(), ctx(`?id=${ref}`)), /undefined|NaN|\[object Object\]/));
  }
});

describe("what the screens say", () => {
  test("Today has one headline question, and it is about the person's day", () => {
    /* v0.9.1 moved the headline from the workspace's question to the user's.
       "What needs resolving today?" is still on the page, as the heading of
       the problem router further down — it stopped being the first thing. */
    const html = V.renderToday(D.seedState(), ctx());
    assert.equal((html.match(/<h1/g) || []).length, 1);
    assert.match(html, /What are you working on today\?/);
    assert.match(html, /Describe what changed/, "the problem router disappeared");
  });

  test("no composite score appears anywhere (BF-5)", () => {
    const s = D.seedState();
    for (const [, render] of PAGES) assert.doesNotMatch(render(s, ctx()), /\/100|illustrative leader/);
    for (const id of ["C-AMS", "C-MACH", "C-NI"]) assert.doesNotMatch(V.renderCases(s, ctx(`?id=${id}`)), /\/100/);
  });

  test("the shortage case shows arrival against the need date", () => {
    const html = V.renderCases(D.seedState(), ctx("?id=C-AMS"));
    assert.match(html, /18 days late/);
    assert.match(html, /15 days spare/);
    assert.match(html, /Need-by <strong>11 Dec 2026<\/strong>, 54 days from today/);
  });

  test("the claim case shows the excess in pounds a year", () => {
    assert.match(V.renderCases(D.seedState(), ctx("?id=C-NI")), /£8,846\.40 a year/);
  });

  test("a received reply is offered for assessment, not shown as closed", () => {
    const w = workspace();
    w.step({ type: "receiveEvidence", evidenceId: w.evidence("AMS5599", "Mill allocation").id, text: "Allocation letter NM-221.", source: { from: "Northstar Metals" } });
    const html = V.renderCases(w.state, ctx("?id=C-AMS"));
    assert.match(html, /Received — awaiting assessment/);
    assert.match(html, /data-action="assess"/);
    assert.match(V.renderFlow(w.state, ctx("?stage=validate")), /data-action="assess"/);
  });

  test("the decision card shows what the decider saw, word for word", () => {
    const w = workspace();
    w.step({ type: "receiveEvidence", evidenceId: w.evidence("NI718", "Cost bridge").id, text: "Bridge: alloy +2.1%, margin +4.8%.", source: { from: "Orion Alloy" } });
    w.step({ type: "assessEvidence", evidenceId: w.evidence("NI718", "Cost bridge").id, verdict: D.VERDICT.SUPPORTS, note: "Supports 2.1% only." });
    w.step({ type: "recordDecision", caseId: w.case("NI718").id, title: "Accept 2.1%", rationale: "Only alloy is evidenced.", decider: DIRECTOR }, DIRECTOR);
    const html = V.renderDecisions(w.state);
    assert.match(html, /Bridge: alloy \+2\.1%, margin \+4\.8%\./);
    assert.match(html, /Decided by <strong>Alex Morgan<\/strong> \(Procurement Director\)/);
    assert.match(html, /authorising/);
  });

  test("the intake confirm step lets the person change the guess", () => {
    const p = { ...D.classifyProblem("Supplier is late and also wants a price increase"), text: "x" };
    const html = V.renderIntake({ pendingIntake: p });
    assert.match(html, /<select id="in-type"/);
    assert.match(html, /Shortage or late delivery \(also matched\)/);
    assert.match(html, /recorded as a <em>claim<\/em>/);
  });

  test("dates always carry a year", () => {
    const html = V.renderFlow(D.seedState(), ctx());
    assert.match(html, /2026/);
    assert.doesNotMatch(html, /due (Today|TBC|48h)/);
  });
});

describe("whatever a person types is escaped", () => {
  test("a hostile statement, title and supplier name stay text", () => {
    const w = workspace();
    const evil = `<img src=x onerror=alert(1)>"'&`;
    const { result } = w.step({ type: "createCase", caseType: "claim", statement: `Price increase ${evil}`, title: evil });
    const add = w.step({ type: "addSupplier", name: `Evil ${evil}` });
    w.step({ type: "linkSupplier", caseId: result.caseId, supplierId: add.result.supplierId, quote: { approval: "Approved" } });
    const pages = [V.renderToday(w.state, ctx()), V.renderCases(w.state, ctx(`?id=${result.caseId}`)), V.renderFlow(w.state, ctx()), V.renderSuppliers(w.state, ctx()), V.renderDecisions(w.state)];
    for (const html of pages) {
      assert.doesNotMatch(html, /<img src=x/);
      assert.doesNotMatch(html, /onerror=alert\(1\)>/);
    }
    assert.match(pages[1], /&lt;img src=x onerror=alert\(1\)&gt;&quot;&#39;&amp;/);
  });

  test("an intake message is text, not markup", () => {
    const html = V.renderIntake({ intakeMessage: { title: "<b>x</b>", body: "<script>y</script>" } });
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  });
});
