#!/usr/bin/env node
/**
 * Post-build client-bundle scan. Fails the production build if secret
 * material, server-only text, OR any AI vendor/model name is present in the
 * CLIENT bundle (.next/static) or in a NEXT_PUBLIC_ env value.
 *
 * Secret patterns: hosted-LLM key prefix (sk-ant), Stripe live keys
 * (sk_live), the Supabase service-role marker, and a distinctive sentence
 * from the operator's server-only system prompt.
 *
 * Vendor sweep (spec §6): no AI vendor or model names may reach the client —
 * they live only in server config / env. The product refers to it only as
 * "the planner" or "the operator".
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = [
  { name: "hosted-llm key", re: /sk-ant/ },
  { name: "stripe live key", re: /sk_live/ },
  { name: "supabase service role", re: /service_role/ },
  { name: "system prompt text", re: /You are the cosigno operator/ },
  // AI vendor / model names — must never be user-facing or in the bundle.
  { name: "vendor/model name", re: /\b(anthropic|claude|haiku|sonnet|opus|openai|gpt-|gemini|mistral|llama)\b/i },
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
