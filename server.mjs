/**
 * Local server for the BuyrFlow review build.
 *
 * Serves files, nothing else: every page is the same static shell, and the
 * application is three external modules. No inline script or style, so the
 * Content-Security-Policy below can forbid both — the same posture as
 * buyrworld.com, which removed 'unsafe-inline' in September 2026.
 *
 * The internal programme and audit documents are not served. They describe
 * gates and scores for the team, not the product for its users.
 *
 * The same files deploy as a static site: vercel.json carries the same
 * headers and maps the page routes to index.html.
 */

import http from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "public");
/* One source of truth. The health endpoint, the footer and package.json
   had drifted to three different versions by v0.9.1. */
const VERSION = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "package.json"), "utf8")).version;
const RELEASE = "B";

export const HEADERS = Object.freeze({
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self'",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; "),
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "x-frame-options": "DENY",
});

const PAGES = new Set(["/", "/cases", "/flow", "/suppliers", "/decisions", "/tools"]);
const JS = "text/javascript; charset=utf-8";

/* The vendored calculation engine, read from the record of what was carried
   over rather than listed again here. Re-vendoring updates PROVENANCE.json,
   so the allow-list cannot fall behind the files it is meant to describe.
   Still an allow-list: nothing outside it is served, and a file that is not
   in the provenance record is a file nobody recorded vendoring. */
const ENGINE = Object.fromEntries(
  Object.keys(JSON.parse(readFileSync(join(ROOT, "engine/PROVENANCE.json"), "utf8")).sha256)
    .map((f) => [`/engine/${f}`, JS]),
);

const FILES = Object.freeze({
  "/app.js": JS,
  "/domain.js": JS,
  "/views.js": JS,
  "/capabilities.js": JS,
  ...ENGINE,
  "/style.css": "text/css; charset=utf-8",
  "/buyrworld-logo.png": "image/png",
});

function send(res, status, type, body, extra = {}) {
  res.writeHead(status, { ...HEADERS, "content-type": type, "cache-control": "no-cache", ...extra });
  res.end(body);
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "text/plain; charset=utf-8", "GET only", { allow: "GET, HEAD" });
      if (path === "/api/health") {
        return send(res, 200, "application/json", JSON.stringify({ ok: true, product: "BuyrWorld Flagship Foundation", release: RELEASE, version: VERSION }), { "cache-control": "no-store" });
      }
      if (PAGES.has(path)) return send(res, 200, "text/html; charset=utf-8", await readFile(join(ROOT, "index.html")));
      if (FILES[path]) return send(res, 200, FILES[path], await readFile(join(ROOT, path.slice(1))));
      return send(res, 404, "text/html; charset=utf-8",
        '<!doctype html><html lang="en"><meta charset="utf-8"><title>Not found · BuyrWorld</title><p>Not found. <a href="/">Back to BuyrWorld</a></p></html>');
    } catch {
      return send(res, 500, "text/plain; charset=utf-8", "Something went wrong reading a file.");
    }
  });
}

/* Started directly (npm start), not imported by a test. Case-insensitive for Windows paths. */
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  const port = Number(process.env.PORT || 4173);
  createServer().listen(port, () => console.log(`BuyrFlow ${VERSION} on http://localhost:${port}`));
}
