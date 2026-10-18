/**
 * v0.9.1 daily work — simple on the surface, rigorous underneath.
 *
 * The native implementation in index.html / views.js / app.js. The guided
 * preview shell reached with ?simple=1 is a separate thing and has its own
 * file, tests/simple-ux.test.mjs.
 *
 * These check the surface: that the first screen is about a person's day,
 * that the detail is still present but no longer first, and that the
 * governed machinery is reachable rather than removed.
 *
 * What they cannot check is whether somebody understands it. That is the
 * manual walkthrough in RELEASE_A_V091.md, and it is the gate that matters.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as D from "../public/domain.js";
import * as V from "../public/views.js";
import { TODAY } from "./helpers.mjs";

const html = readFileSync("public/index.html", "utf8");
const css = readFileSync("public/style.css", "utf8");
const app = readFileSync("public/app.js", "utf8");

const ctx = (search = "", hash = "") => ({ today: TODAY, params: new URLSearchParams(search), hash });
const seed = () => D.seedState();

/* ------------------------------------------------------------ navigation */

describe("navigation has two primary destinations", () => {
  test("Today and My work are top level", () => {
    const nav = html.slice(html.indexOf('<nav class="side-section side-nav"'), html.indexOf("</nav>"));
    assert.match(nav, /data-nav="today"[^>]*>[\s\S]*?Today/);
    assert.match(nav, /data-nav="flow"[^>]*>[\s\S]*?My work/);
    assert.ok(nav.indexOf('data-nav="today"') < nav.indexOf("side-more"), "Today is not above More");
    assert.ok(nav.indexOf('data-nav="flow"') < nav.indexOf("side-more"), "My work is not above More");
  });

  test("Cases, Suppliers and Decision memory remain reachable, under More", () => {
    const more = html.slice(html.indexOf('<details class="side-more"'), html.indexOf("</details>"));
    for (const nav of ["cases", "suppliers", "decisions"]) {
      assert.match(more, new RegExp(`data-nav="${nav}"`), `${nav} is not reachable under More`);
    }
    assert.match(more, /Decision memory/);
  });

  test("the routes themselves did not move", () => {
    assert.match(app, /"\/": "today"/);
    assert.match(app, /"\/cases": "cases"/);
    assert.match(app, /"\/flow": "flow"/);
    assert.match(app, /"\/suppliers": "suppliers"/);
    assert.match(app, /"\/decisions": "decisions"/);
  });

  test("the domain is not renamed for presentation", () => {
    const domain = readFileSync("public/domain.js", "utf8");
    assert.match(domain, /KIND = Object\.freeze\(\{ EVIDENCE: "evidence", EXECUTION: "execution", WORKSPACE: "workspace" \}\)/);
    assert.match(domain, /investigate: "Investigate"/, "an internal stage label was renamed");
  });

  test("a secondary page opens the drawer that holds it", () => {
    assert.match(app, /\["cases", "suppliers", "decisions"\]\.includes\(page\)/);
  });
});

/* -------------------------------------------------------------- first use */

describe("first use", () => {
  test("the walkthrough explains three things and no more", () => {
    assert.match(app, /BuyrFlow in 30 seconds/);
    assert.match(app, /You do not need to learn the system first/);
    const list = app.slice(app.indexOf('class="guide-list"'), app.indexOf("</ol>"));
    assert.equal((list.match(/<li>/g) || []).length, 3, "the walkthrough is not three points");
    assert.match(list, /Add a task/);
    assert.match(list, /Describe a problem/);
    assert.match(list, /Open a Case only when needed/);
  });

  test("it is shown once and remembers that it was dismissed", () => {
    assert.match(app, /GUIDE_KEY = "buyrflow\.guide\.v1"/);
    assert.match(app, /localStorage\.getItem\(GUIDE_KEY\) === "done"/);
    assert.match(app, /localStorage\.setItem\(GUIDE_KEY, "done"\)/);
  });

  test("it can be reopened from a permanent help control", () => {
    assert.match(html, /id="help"[^>]*data-action="open-guide"/);
    assert.match(app, /"open-guide": \(\) => showGuide\(true\)/);
  });

  test("a blocked localStorage does not stop the page", () => {
    /* A private window throws on access. The walkthrough is allowed to show
       again; what must not happen is the boot failing. */
    const guide = app.slice(app.indexOf("function showGuide"), app.indexOf("function closeGuide"));
    assert.match(guide, /try \{[\s\S]*?\} catch/);
  });

  test("the guide traps focus and returns it, like every other dialog", () => {
    assert.match(app, /layer\._returnFocus = returnFocus/);
    assert.match(app, /if \(shell\) shell\.inert = true/);
    assert.match(app, /e\.key === "Escape" && \$\("#guide-layer"\)/);
  });
});

/* ------------------------------------------------------------ hints */

describe("hints appear, then get out of the way", () => {
  test("every screen with a slot has something to say", () => {
    const today = V.renderToday(seed(), ctx());
    const flow = V.renderFlow(seed(), ctx());
    const cases = V.renderCases(seed(), ctx("?id=C-AMS"));
    for (const [name, out] of [["today", today], ["flow", flow], ["cases", cases]]) {
      assert.match(out, new RegExp(`data-hint="${name}"`), `${name} has no hint slot`);
      assert.match(app, new RegExp(`${name}: "`), `${name} has no hint text`);
    }
  });

  test("a hint can be dismissed, and the dismissal is remembered", () => {
    assert.match(app, /HINT_KEY = "buyrflow\.hints\.v1"/);
    assert.match(app, /"dismiss-hint": \(b\) => dismissHint\(b\.dataset\.id\)/);
    assert.match(app, /set\.add\(id\)/);
  });

  test("an empty hint slot takes no space", () => {
    assert.match(css, /\.hint-slot:empty \{ display: none \}/);
  });
});

/* ------------------------------------------------------- the day, on Today */

describe("Today is about the person's day", () => {
  const out = () => V.renderToday(seed(), ctx());

  test("it opens with a greeting and one question", () => {
    assert.match(out(), /Good (morning|afternoon|evening)/);
    assert.match(out(), /What are you working on today\?/);
  });

  test("the two first moves are adding a task and describing a problem", () => {
    assert.match(out(), /data-action="add-task"[^>]*>\+ Add a task/);
    assert.match(out(), /Resolve a procurement problem/);
  });

  test("the counts are the four a person asks, not system KPIs", () => {
    const html2 = out();
    for (const label of ["due today", "overdue", "waiting", "needs a decision"]) {
      assert.match(html2, new RegExp(label), `the day does not count "${label}"`);
    }
    const counts = html2.slice(html2.indexOf('class="daycounts"'), html2.indexOf("</div>", html2.indexOf('class="daycounts"')));
    assert.doesNotMatch(counts, /awaiting assessment/, "a system metric is in the day counts");
  });

  test("the portfolio metrics still exist, one disclosure down", () => {
    const html2 = out();
    assert.match(html2, /Show workspace detail/);
    assert.ok(html2.indexOf("daycounts") < html2.indexOf("Show workspace detail"));
    assert.match(html2, /replies awaiting assessment/, "the workspace metrics were deleted rather than moved");
    assert.match(html2, /Export workspace/, "export disappeared");
  });

  test("an empty task list teaches rather than sitting blank", () => {
    assert.match(out(), /Nothing on your list yet/);
    assert.match(out(), /Add something you need to get done/);
  });

  test("and so does an empty waiting list", () => {
    /* The seed has three outstanding supplier requests, so the waiting panel
       is legitimately full. The empty state is reached with none of them. */
    const s = seed();
    s.requests = [];
    assert.match(V.renderToday(s, ctx()), /You are not waiting on anyone right now/);
  });

  test("tasks a person adds appear on it", () => {
    let s = seed();
    s = D.apply(s, { type: "setUser", user: { name: "Jo Buyer", role: "Buyer" } }, { name: "Jo Buyer", role: "Buyer" }, { today: TODAY }).state;
    s = D.apply(s, { type: "addPersonalTask", title: "Call TW about AMS5599", dueDate: TODAY },
      { name: "Jo Buyer", role: "Buyer" }, { today: TODAY }).state;
    const html2 = V.renderToday(s, ctx());
    assert.match(html2, /Call TW about AMS5599/);
    assert.match(html2, /data-action="task-status"[^>]*data-status="done"/);
  });

  test("the review notice is still there and no longer shouts", () => {
    assert.match(out(), /REVIEW DATA/);
    assert.match(css, /\.demo-strip \{ margin-top: 18px; opacity: \.78/);
  });
});

/* ----------------------------------------------------------- My work */

describe("My work is a list first", () => {
  const out = () => V.renderFlow(seed(), ctx());

  test("it is called My work, and leads with sections rather than a board", () => {
    assert.match(out(), /My work/);
    assert.ok(out().indexOf("Today") < out().indexOf("Show workflow board"));
  });

  test("the six-column board still exists, behind a disclosure", () => {
    const html2 = out();
    assert.match(html2, /Show workflow board/);
    assert.match(html2, /class="flow-board"/, "the board was deleted rather than disclosed");
    for (const stage of D.BOARD) assert.match(html2, new RegExp(`data-stage="${stage}"`));
  });

  test("case work is shown apart from personal work, and says it is governed", () => {
    const html2 = out();
    assert.match(html2, /Case work/);
    assert.match(html2, /Governed by evidence and approvals/);
  });

  test("internal stage names are translated for the reader", () => {
    const html2 = out();
    assert.match(html2, /Needs a decision|To do|In progress|Ready to act|Ready to finish/);
  });
});

/* ------------------------------------------------- Case disclosure */

describe("a Case leads with the next move", () => {
  const out = (hash = "") => V.renderCases(seed(), ctx("?id=C-AMS", hash));

  test("the next action comes before the evidence detail", () => {
    const html2 = out();
    assert.match(html2, /What should I do next\?/);
    assert.ok(html2.indexOf("What should I do next?") < html2.indexOf("Show evidence &amp; case detail"));
  });

  test("blockers are named above the fold", () => {
    const html2 = out();
    assert.match(html2, /Blocking the next step/);
    assert.ok(html2.indexOf("Blocking the next step") < html2.indexOf("Show evidence &amp; case detail"));
  });

  test("there is always a way back to daily work, not only when deep-linked", () => {
    /* A Case is somewhere you are sent. At phone width the sidebar is behind
       a menu button, so the way back has to be on the page. */
    assert.match(out(), /class="back-link" href="\/flow"/);
    assert.match(out(), /Back to my work/);
  });

  test("the ledger, decisions, requests and timeline are all still rendered", () => {
    const html2 = out();
    for (const part of ["What we know", "Case timeline", "Linked BuyrFlow work"]) {
      assert.match(html2, new RegExp(part), `${part} disappeared`);
    }
    assert.match(html2, /Mill allocation/, "evidence items are gone");
  });

  test("a case with nothing blocking says so rather than showing an empty box", () => {
    assert.match(V.renderCases(seed(), ctx("?id=C-MACH")), /Blocking the next step|has been reviewed/);
  });
});

/* -------------------------------------------------------------- deep link */

describe("an evidence deep link still lands", () => {
  const s = seed();
  const ev = s.cases.find((c) => c.ref === "AMS5599").evidence[0];

  test("the anchor still exists on the item", () => {
    const html2 = V.renderCases(s, ctx("?id=C-AMS"));
    assert.match(html2, new RegExp(`id="ev-${ev.id}"`));
  });

  test("arriving by hash opens the detail rather than hiding the item", () => {
    const closed = V.renderCases(s, ctx("?id=C-AMS"));
    const open = V.renderCases(s, ctx("?id=C-AMS", `#ev-${ev.id}`));
    assert.match(closed, /<details class="case-detail">/);
    assert.match(open, /<details class="case-detail" open>/);
  });

  test("and says why the reader is there, without showing them a UUID", () => {
    const open = V.renderCases(s, ctx("?id=C-AMS", `#ev-${ev.id}`));
    assert.match(open, /You are reviewing evidence for AMS5599/);
    assert.match(open, /Back to my work/);
    const callout = open.slice(open.indexOf("deep-link"), open.indexOf("</div>", open.indexOf("deep-link")));
    assert.doesNotMatch(callout, /[0-9a-f]{8}-[0-9a-f]{4}/, "the callout shows a UUID");
  });

  test("an in-page evidence link opens whatever it is nested inside", () => {
    assert.match(app, /for \(let d = target\.closest\("details"\); d; d = d\.parentElement\?\.closest\("details"\)\) d\.open = true/);
  });
});

/* ------------------------------------------------------------- mobile */

describe("mobile is an acceptance gate", () => {
  const phone = () => {
    const out = [];
    const marker = "@media(max-width:560px)";
    for (let at = css.indexOf(marker); at >= 0; at = css.indexOf(marker, at + 1)) {
      let depth = 0, i = css.indexOf("{", at);
      const start = i + 1;
      for (; i < css.length; i++) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}") { depth--; if (!depth) break; }
      }
      out.push(css.slice(start, i));
    }
    return out.join("\n").replace(/\s+/g, " ");
  };

  test("the day counts drop to two across, not four", () => {
    assert.match(phone(), /\.daycounts \{ grid-template-columns: repeat\(2, 1fr\) \}/);
  });

  test("the two first moves stack and stay 44px", () => {
    assert.match(phone(), /\.daystart-acts \{ flex-direction: column/);
    assert.match(phone(), /min-height: 44px/);
  });

  test("a task card is one column with its actions below", () => {
    assert.match(phone(), /\.task \{ grid-template-columns: auto 1fr/);
    assert.match(phone(), /\.task-acts \{ grid-column: 1 \/ -1/);
  });

  test("the help control is a 44px target", () => {
    assert.match(phone(), /\.help-button \{ min-height: 44px; min-width: 44px/);
  });

  test("a hint never floats over the content", () => {
    assert.match(phone(), /\.hint \{ position: static \}/);
    assert.doesNotMatch(css, /\.hint \{[^}]*position: (fixed|absolute)/);
  });
});

/* -------------------------------------------- the engine is still in there */

describe("nothing governed was simplified away", () => {
  test("the board, ledger, decisions and audit trail all still render", () => {
    const s = seed();
    const flow = V.renderFlow(s, ctx());
    const cse = V.renderCases(s, ctx("?id=C-AMS"));
    const dec = V.renderDecisions(s);
    assert.match(flow, /class="flow-board"/);
    assert.match(cse, /Case timeline/);
    assert.match(cse, /Why High|Why Medium|Why Critical|Why Low/);
    assert.match(dec, /DEC-/);
  });

  test("the evidence and authority rules are untouched in the domain", () => {
    const domain = readFileSync("public/domain.js", "utf8");
    assert.match(domain, /need\(!gaps\.length, "gaps"/);
    assert.match(domain, /need\(Number\.isInteger\(c\.valuePence\), "value"/);
    assert.match(domain, /need\(!decider \|\| approverPerson\.id !== decider\.id, "same-person"/);
    assert.match(domain, /need\(executedAfter\(s, c, d\), "not-executed"/);
    assert.match(domain, /mulDivRound/);
  });
});
