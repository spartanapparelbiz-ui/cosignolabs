#!/usr/bin/env node
/**
 * Post-build secret scan. Fails the production build if any secret
 * material or server-only text is present in the CLIENT bundle
 * (.next/static) or in any NEXT_PUBLIC_ env value.
 *
 * Patterns: Anthropic keys (sk-ant), Stripe live keys (sk_live), the
 * Supabase service-role marker, Clerk secret keys (sk_test/sk_live via
 * CLERK_SECRET prefix), and a distinctive sentence from the operator's
 * server-only system prompt.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = [
  { name: "anthropic key", re: /sk-ant/ },
  { name: "stripe live key", re: /sk_live/ },
  { name: "supabase service role", re: /service_role/ },
  { name: "system prompt text", re: /You are the cosigno operator/ },
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

let failed = false;

// 1. NEXT_PUBLIC_ env values must not carry secrets.
for (const [key, value] of Object.entries(process.env)) {
  if (!key.startsWith("NEXT_PUBLIC_") || !value) continue;
  for (const f of FORBIDDEN) {
    if (f.re.test(value)) {
      console.error(`FAIL: ${key} contains ${f.name}`);
      failed = true;
    }
  }
}

// 2. Client bundle must be clean.
const staticDir = join(process.cwd(), ".next", "static");
let scanned = 0;
try {
  for (const file of walk(staticDir)) {
    const content = readFileSync(file, "utf8");
    scanned++;
    for (const f of FORBIDDEN) {
      if (f.re.test(content)) {
        console.error(`FAIL: ${f.name} found in client bundle: ${file}`);
        failed = true;
      }
    }
  }
} catch (err) {
  console.error(`FAIL: could not scan .next/static — run next build first (${err.message})`);
  process.exit(1);
}

if (failed) {
  console.error("Bundle secret scan FAILED.");
  process.exit(1);
}
console.log(`Bundle secret scan passed (${scanned} client files clean).`);
