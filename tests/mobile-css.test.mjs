/**
 * Phone-width rules that are checkable without a phone.
 *
 * This reads the stylesheet, so it proves the rules exist, not that the page
 * looks right on an iPhone. That still needs a person on one; the release notes
 * list it as not done.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("public/style.css", "utf8");
/** The bodies of every @media(max-width:560px) block, matched by brace depth. */
function phoneRules() {
  const out = [];
  const marker = "@media(max-width:560px){";
  for (let at = css.indexOf(marker); at >= 0; at = css.indexOf(marker, at + 1)) {
    let depth = 1, i = at + marker.length;
    for (; i < css.length && depth; i++) depth += css[i] === "{" ? 1 : css[i] === "}" ? -1 : 0;
    out.push(css.slice(at + marker.length, i - 1));
  }
  return out.join("\n").replace(/\s+/g, " ");
}
const phoneBlocks = phoneRules();

test("form fields are 16px at phone width, so iPhone Safari does not zoom on focus", () => {
  assert.match(phoneBlocks, /input,select,textarea[^{]*\{ ?font-size:16px ?\}/);
});

test("buttons, chips and tabs are at least 44px tall at phone width", () => {
  const rule = phoneBlocks.match(/([^{}]*)\{ ?min-height:44px ?\}/);
  assert.ok(rule, "no 44px rule");
  for (const sel of [".bw-action-primary", ".mini", ".example-chip", ".case-tab", ".workbench-close"]) assert.ok(rule[1].includes(sel), `${sel} is not 44px`);
});

test("the page behind a dialog does not scroll", () => {
  assert.match(css, /body\.dialog-open[^{]*\{overflow:hidden\}/);
});

test("status chips carry a dot as well as a colour", () => {
  assert.match(css, /\.status i\{[^}]*border-radius:50%/);
});

/* --------------------------------------------------------------- A-6 */

/**
 * An alert sat over the page at top:70px, covering the case title it was
 * talking about — worst at 390px, where it hid the case identity. It is in
 * the flow now and pushes the content down.
 */
test("an alert is in the flow, not pinned over the content (A-6)", () => {
  const html = readFileSync("public/index.html", "utf8");
  assert.match(html, /<div id="alert-region" class="alert-region"/,
    "the alert region is not the in-flow one");
  assert.ok(html.indexOf('id="alert-region"') < html.indexOf('id="app"'),
    "the alert region is not above the content it would otherwise cover");
  assert.doesNotMatch(css, /#alert-region\{[^}]*top:\s*70px/,
    "the alert region is pinned over the page again");
  assert.match(css, /\.alert-region\{[^}]*margin:/, "the alert region has no in-flow box");
  assert.match(css, /\.alert-region:empty\{display:none\}/,
    "an empty alert region would leave a gap under the topbar");
});

test("a transient toast may still float, because it asks for nothing (A-6)", () => {
  assert.match(css, /\.toast-region\{[^}]*position:fixed/,
    "confirmations should stay out of the layout");
});
