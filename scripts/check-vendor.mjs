#!/usr/bin/env node
/**
 * Vendor-name gate (spec §1). Greps SOURCE and the built CLIENT bundle for AI
 * vendor / model names and fails on any hit. The only sanctioned place the
 * vendor SDK (and thus its package name) may appear is the isolation layer
 * src/lib/agent/provider.ts — swapping providers touches exactly that file.
 *
 * Excluded from the source scan: package.json / lockfile (dependency name is
 * unavoidable), provider.ts (the isolation layer), and this script + the
 * detection tests (they necessarily contain the patterns).
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const BANNED = /\b(anthropic|claude|haiku|sonnet|opus)\b/i;

const ROOT = process.cwd();
const EXCLUDE_FILES = new Set([
  "src/lib/agent/provider.ts",
  "scripts/check-vendor.mjs",
  "scripts/check-bundle.mjs",
  // verify-deploy carries the same banned-word regex to scan the LIVE bundle,
  // exactly like this file does — so it's excluded for the same reason.
  "scripts/verify-deploy.mjs",
  "tests/security/bundle.test.ts",
  "tests/security/vendor.test.ts",
]);
const EXCLUDE_DIRS = new Set(["node_modules", ".next", ".git", "tests/visual"]);

let failed = false;

function scanTree(dir, exts) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const rel = relative(ROOT, p);
    if (EXCLUDE_DIRS.has(rel)) continue;
    const st = statSync(p);
    if (st.isDirectory()) {
      scanTree(p, exts);
    } else if (exts.some((e) => entry.endsWith(e))) {
      if (EXCLUDE_FILES.has(rel)) continue;
      const content = readFileSync(p, "utf8");
      const m = content.match(BANNED);
      if (m) {
        console.error(`FAIL: vendor/model name "${m[0]}" in ${rel}`);
        failed = true;
      }
    }
  }
}

// 1. Source: TS/TSX/JS/MJS + docs + env example.
scanTree(join(ROOT, "src"), [".ts", ".tsx"]);
scanTree(join(ROOT, "scripts"), [".mjs", ".ts"]);
for (const doc of ["README.md", "SECURITY.md", "BILLING.md", "BRAND.md", ".env.example"]) {
  const p = join(ROOT, doc);
  if (!existsSync(p)) continue;
  const m = readFileSync(p, "utf8").match(BANNED);
  if (m) {
    console.error(`FAIL: vendor/model name "${m[0]}" in ${doc}`);
    failed = true;
  }
}
if (existsSync(join(ROOT, "docs"))) scanTree(join(ROOT, "docs"), [".md"]);

// 2. Built client bundle (if present).
const staticDir = join(ROOT, ".next", "static");
if (existsSync(staticDir)) {
  scanTree(staticDir, [".js", ".css", ".json", ".txt", ".map"]);
}

if (failed) {
  console.error("Vendor-name gate FAILED — keep vendor/model names in provider.ts + env only.");
  process.exit(1);
}
console.log("Vendor-name gate passed (no vendor/model names outside provider.ts + package files).");
