import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const guide = fs.readFileSync(new URL("../public/guide.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../public/simple-mode.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("simple mode is loaded by the application shell", () => {
  assert.match(html, /simple-mode\.css/);
  assert.match(html, /guide\.js/);
});

test("daily tasks are genuinely lightweight and separate from governed case actions", () => {
  assert.match(guide, /buyrflow\.personal\.v1/);
  assert.match(guide, /Add something to your day/);
  assert.match(guide, /No Case required/);
  assert.match(guide, /Case-linked work/);
});

test("first-run guidance explains the product without procurement-system jargon", () => {
  assert.match(guide, /BuyrFlow in 30 seconds/);
  assert.match(guide, /Add ordinary work/);
  assert.match(guide, /Describe a procurement problem/);
  assert.match(guide, /Go deeper only when needed/);
});

test("advanced navigation and workflow complexity are progressively disclosed", () => {
  assert.match(css, /advanced-nav-item/);
  assert.match(css, /show-workflow-board/);
  assert.match(css, /show-workspace-detail/);
  assert.match(guide, /Show workflow board/);
  assert.match(guide, /Show workspace detail/);
});

test("a direct evidence link gets contextual guidance", () => {
  assert.match(guide, /location\.hash\.startsWith\("#ev-"\)/);
  assert.match(guide, /You opened a specific evidence item/);
});

test("simple mode preserves the original BuyrWorld dark design tokens", () => {
  assert.match(css, /background:var\(--bw-surface\)/);
  assert.match(css, /background:var\(--bw-surface-2\)/);
  assert.match(css, /color:var\(--bw-text\)/);
  assert.match(css, /var\(--bw-accent\)/);
  assert.doesNotMatch(css, /background:\s*#fff\b/i);
  assert.doesNotMatch(css, /color:\s*#111\b/i);
});
