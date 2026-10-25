/**
 * What the server actually sends: routes, headers, and nothing inline.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, HEADERS } from "../server.mjs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

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
    assert.deepEqual(await (await get("/api/health")).json(), { ok: true, product: "BuyrWorld Flagship Foundation", release: "B", version: pkg.version });
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

  test("the version is one number, not three", () => {
    /* By v0.9.1 the health endpoint said 0.8.0, package.json said 0.9.1 and
       the footer said something else again. The server now reads one, and
       this holds the footer to it. */
    const html = readFileSync("public/index.html", "utf8");
    assert.match(html, new RegExp(`Release B v${pkg.version.replace(/\./g, "\\.")}`),
      `the shell footer does not say v${pkg.version}`);
  });

  test("vercel.json sends the same policy", () => {
    const v = JSON.parse(readFileSync("vercel.json", "utf8"));
    const csp = v.headers[0].headers.find((h) => h.key === "Content-Security-Policy").value;
    assert.equal(csp, HEADERS["content-security-policy"]);
  });
});

/**
 * The module graph the browser will actually walk.
 *
 * The server serves an allow-list, so a module that imports a file nobody
 * added to it 404s — and a 404 in an ES module graph takes down the whole
 * application, not just the feature that needed it. Vendoring the engine
 * added five files to that graph in one commit, which is exactly the kind of
 * change that gets one of them missed.
 */
describe("every module the page loads can be fetched", () => {
  /** Follow the imports from the page's entry module, breadth first. */
  async function walk(entry) {
    const seen = new Map();
    const queue = [entry];
    while (queue.length) {
      const path = queue.shift();
      if (seen.has(path)) continue;
      const r = await get(path);
      seen.set(path, r.status);
      if (r.status !== 200) continue;
      const body = await r.text();
      const dir = path.slice(0, path.lastIndexOf("/"));
      for (const m of body.matchAll(/(?:^|\n)\s*(?:import|export)[^;\n]*?from\s+"([^"]+)"/g)) {
        const spec = m[1];
        if (!spec.startsWith(".")) continue;             // bare specifiers are not ours
        queue.push(new URL(spec, `http://x${dir}/`).pathname);
      }
    }
    return seen;
  }

  test("the whole graph from the entry module resolves", async () => {
    const html = readFileSync("public/index.html", "utf8");
    const entry = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)?.[1];
    assert.ok(entry, "the shell loads no module");
    const seen = await walk(entry);
    const broken = [...seen].filter(([, status]) => status !== 200);
    assert.deepEqual(broken, [], `these imports are not served: ${broken.map(([p, s]) => `${p} (${s})`).join(", ")}`);
    assert.ok(seen.size >= 7, `only ${seen.size} modules walked — the graph was not followed`);
  });

  test("the vendored engine is reachable, and its provenance record is not", async () => {
    const files = Object.keys(JSON.parse(readFileSync("public/engine/PROVENANCE.json", "utf8")).sha256);
    for (const f of files) {
      const r = await get(`/engine/${f}`);
      assert.equal(r.status, 200, `/engine/${f} is not served`);
      assert.match(r.headers.get("content-type"), /javascript/, `/engine/${f} is served as the wrong type`);
    }
    /* An internal record of where code came from. The product does not need
       it, so it is not on the allow-list. */
    assert.equal((await get("/engine/PROVENANCE.json")).status, 404);
  });

  test("nothing outside the allow-list is served, including by traversal", async () => {
    for (const p of ["/server.mjs", "/package.json", "/CLAUDE.md", "/engine/../../server.mjs", "/tests/helpers.mjs"]) {
      const r = await get(p);
      assert.notEqual(r.status, 200, `${p} should not be served`);
    }
  });
});
