#!/usr/bin/env node
/**
 * Rewrite public/engine/PROVENANCE.json from the files on disk.
 *
 * Run this after re-vendoring, never to make a failing drift test pass — a
 * failing drift test means a file was edited here, and the fix belongs in
 * buyrworld.com.
 *
 * Hashes are of the bytes as they sit in the repository. .gitattributes
 * marks public/engine/** as -text so git never rewrites a line ending in
 * them; without that, a Windows checkout would change every hash and the
 * drift test would fail on files nobody had touched. That happened once.
 *
 *   node tools/engine-hashes.mjs            # rewrite the record
 *   node tools/engine-hashes.mjs --check    # exit 1 if anything has drifted
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const DIR = "public/engine";
const RECORD = join(DIR, "PROVENANCE.json");

const sha = (f) => createHash("sha256").update(readFileSync(join(DIR, f))).digest("hex");
const files = readdirSync(DIR).filter((f) => f.endsWith(".mjs")).sort();

const record = JSON.parse(readFileSync(RECORD, "utf8"));
const actual = Object.fromEntries(files.map((f) => [f, sha(f)]));

if (process.argv.includes("--check")) {
  const drifted = files.filter((f) => record.sha256[f] !== actual[f]);
  const unrecorded = files.filter((f) => !(f in record.sha256));
  const vanished = Object.keys(record.sha256).filter((f) => !files.includes(f));
  for (const f of drifted) console.error(`drifted: ${f}`);
  for (const f of unrecorded) console.error(`not in the provenance record: ${f}`);
  for (const f of vanished) console.error(`recorded but missing: ${f}`);
  if (drifted.length || unrecorded.length || vanished.length) {
    console.error("\nThe engine in this repository is not the engine that was vendored.");
    console.error("If you changed one of these files, undo it: the fix belongs in buyrworld.com.");
    process.exit(1);
  }
  console.log(`${files.length} engine files match the record.`);
  process.exit(0);
}

record.sha256 = actual;
writeFileSync(RECORD, JSON.stringify(record, null, 2) + "\n");
console.log(`Recorded ${files.length} hashes in ${RECORD}.`);
for (const f of files) console.log(`  ${f}  ${actual[f]}`);
