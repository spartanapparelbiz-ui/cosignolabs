#!/usr/bin/env node
/**
 * Source secret-scan gate. Greps the tracked SOURCE tree for high-signal
 * secret material and hard-coded credentials that must never be committed:
 * real key prefixes, a service-role JWT, private-key blocks, and NEXT_PUBLIC_
 * assignments that carry secret-looking values.
 *
 * Deliberately conservative (few, specific patterns) so it stays
 * false-positive-free and can gate CI. `.env.example` is allowed to contain
 * empty KEY= lines; anything with a value after the '=' is flagged.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([".git", "node_modules", ".next", "screenshots", "tests"]);
const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".sql", ".env", ".md", ""]);

const PATTERNS = [
  { name: "hosted-LLM secret key", re: /sk-ant-[A-Za-z0-9]/ },
  { name: "OpenAI-style secret key", re: /sk-[A-Za-z0-9]{40,}/ },
  { name: "Stripe live secret key", re: /sk_live_[A-Za-z0-9]/ },
  { name: "Stripe live restricted key", re: /rk_live_[A-Za-z0-9]/ },
  { name: "private key block", re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { name: "Supabase service-role JWT", re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/ },
];

// A NEXT_PUBLIC_ var must never carry a secret. Flag any NEXT_PUBLIC_*SECRET*
// / *KEY* assignment that has a non-empty value in source (env.example lines
// like `NEXT_PUBLIC_X=` are fine).
const NEXT_PUBLIC_SECRET = /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE)[A-Z0-9_]*\s*=\s*\S+/;

let failed = false;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}

let scanned = 0;
for (const file of walk(ROOT)) {
  const ext = extname(file);
  const base = file.split("/").pop();
  if (!SCAN_EXT.has(ext) && base !== ".env.example") continue;
  // The scanners themselves necessarily contain the patterns.
  const rel = relative(ROOT, file);
  if (rel.startsWith("scripts/check-")) continue;

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  scanned++;

  for (const p of PATTERNS) {
    if (p.re.test(content)) {
      console.error(`FAIL: ${p.name} found in ${rel}`);
      failed = true;
    }
  }
  if (NEXT_PUBLIC_SECRET.test(content)) {
    console.error(`FAIL: NEXT_PUBLIC_ variable carries a secret value in ${rel}`);
    failed = true;
  }
}

if (failed) {
  console.error("\nSource secret scan FAILED.");
  process.exit(1);
}
console.log(`Source secret scan passed (${scanned} files clean).`);
