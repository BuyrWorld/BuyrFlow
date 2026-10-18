/**
 * What the server actually sends: routes, headers, and nothing inline.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, HEADERS } from "../server.mjs";

let server, base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));

const get = (p) => fetch(base + p);

describe("routes", () => {
  for (const p of ["/", "/cases", "/flow", "/suppliers", "/decisions", "/tools", "/cases/"]) {
    test(`${p} is the app shell`, async () => {
      const r = await get(p);
      assert.equal(r.status, 200);
      assert.match(r.headers.get("content-type"), /text\/html/);
      assert.match(await r.text(), /<script type="module" src="\/app\.js"><\/script>/);
    });
  }

  test("the modules, stylesheet and the logo are served with the right types", async () => {
    for (const [p, type] of [["/app.js", /javascript/], ["/domain.js", /javascript/], ["/views.js", /javascript/], ["/style.css", /text\/css/], ["/buyrworld-logo.png", /image\/png/]]) {
      const r = await get(p);
      assert.equal(r.status, 200, p);
      assert.match(r.headers.get("content-type"), type, p);
    }
  });

  test("the internal programme and audit are not published", async () => {
    for (const p of ["/FLAGSHIP_IMPLEMENTATION_PROGRAM.md", "/RELEASE_A_AUDIT.md", "/server.mjs", "/package.json", "/../package.json"]) {
      assert.equal((await get(p)).status, 404, p);
    }
  });

  test("health reports the release", async () => {
    assert.deepEqual(await (await get("/api/health")).json(), { ok: true, product: "BuyrWorld Flagship Foundation", release: "A", version: "0.8.0" });
  });

  test("only GET and HEAD", async () => {
    assert.equal((await fetch(base + "/", { method: "POST" })).status, 405);
  });
});

describe("headers and inline code", () => {
  test("every response carries the security headers", async () => {
    for (const p of ["/", "/app.js", "/nope"]) {
      const r = await get(p);
      for (const k of Object.keys(HEADERS)) assert.ok(r.headers.get(k), `${p} lacks ${k}`);
    }
  });

  test("the policy allows no inline script or style", () => {
    const csp = HEADERS["content-security-policy"];
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  });

  test("the shell has no inline script, style or handler, so the policy loses nothing", () => {
    const html = readFileSync("public/index.html", "utf8");
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
    assert.doesNotMatch(html, /<style/);
    assert.doesNotMatch(html, /\son[a-z]+=/i);
    assert.doesNotMatch(html, /style="/);
  });

  test("the logo is bundled, not hotlinked from the production site", () => {
    const html = readFileSync("public/index.html", "utf8");
    assert.doesNotMatch(html, /https:\/\/buyrworld\.com/);
    assert.match(html, /src="\/buyrworld-logo\.png"/);
  });

  test("vercel.json sends the same policy", () => {
    const v = JSON.parse(readFileSync("vercel.json", "utf8"));
    const csp = v.headers[0].headers.find((h) => h.key === "Content-Security-Policy").value;
    assert.equal(csp, HEADERS["content-security-policy"]);
  });
});
