import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const js = fs.readFileSync(new URL("../public/flagship.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../public/flagship.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("flagship layer is loaded by the application shell", () => {
  assert.match(html, /flagship\.css/);
  assert.match(html, /flagship\.js/);
});

test("focus now ranks real work with deterministic operational rules", () => {
  assert.match(js, /Focus now/);
  assert.match(js, /Overdue/);
  assert.match(js, /Critical/);
  assert.match(js, /Due today/);
  assert.match(js, /Decision needed/);
});

test("case cockpit exposes progression blocker next action and rationale", () => {
  assert.match(js, /Case cockpit/);
  assert.match(js, /BLOCKING/);
  assert.match(js, /NEXT/);
  assert.match(js, /WHY/);
  assert.match(js, /step \$\{current\.step\} of 4/);
});

test("flagship styles inherit BuyrWorld tokens and do not introduce a light theme", () => {
  assert.match(css, /var\(--bw-surface\)/);
  assert.match(css, /var\(--bw-text\)/);
  assert.match(css, /var\(--bw-accent\)/);
  assert.doesNotMatch(css, /background\s*:\s*#fff/i);
  assert.doesNotMatch(css, /color\s*:\s*#111/i);
});

test("flagship layer does not claim AI or autonomous judgement", () => {
  assert.doesNotMatch(js, /AI-powered|autonomous agent|AI recommendation/i);
});
