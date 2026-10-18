import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../public/index-simple.html", import.meta.url), "utf8");
const js = await readFile(new URL("../public/simple-mode.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/simple-mode.css", import.meta.url), "utf8");

test("guided shell makes Today and My work primary", () => {
  assert.match(index, />Today</);
  assert.match(index, />My work</);
  assert.match(index, /<details class="simple-more-nav">/);
  assert.doesNotMatch(index, /id="global-search"/);
});

test("first-use guidance is present and reopenable", () => {
  assert.match(index, /id="simple-help"/);
  assert.match(js, /BuyrFlow in 30 seconds/);
  assert.match(js, /You do not need to learn the system first/);
});

test("personal daily actions are deliberately lightweight", () => {
  assert.match(js, /What are you working on today\?/);
  assert.match(js, /Add a task/);
  assert.match(js, /status:"todo"/);
  assert.match(js, /task-done/);
  assert.doesNotMatch(js, /completionTest/);
});

test("governed procurement workflow stays available behind disclosure", () => {
  assert.match(js, /Show governed workflow board/);
  assert.match(js, /Show procurement workspace details/);
  assert.match(css, /What should I do next\?/);
});

test("hidden preview navigation preserves simple=1", () => {
  assert.match(js, /SIMPLE_PREVIEW/);
  assert.match(js, /searchParams\.set\("simple","1"\)/);
  assert.match(css, /@media\(max-width:760px\)/);
});
