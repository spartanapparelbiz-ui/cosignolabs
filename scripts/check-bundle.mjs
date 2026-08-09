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


/**
 * A leaked Supabase service-role key, detected by SHAPE rather than by the
 * phrase "service_role".
 *
 * The old check matched that bare string, which is documentation prose — it
 * fires on any dependency whose comments warn you not to expose the key, and
 * it fires only in development, where comments survive minification. Worse, it
 * could never catch a real leak: service-role keys are JWTs or `sb_secret_`
 * strings, and neither contains the words.
 *
 * A gate that cries wolf on a library comment while missing the actual secret
 * is worse than no gate, because people learn to wave it through.
 */
function findsServiceRoleKey(content) {
  // Current-format secret keys are unambiguous.
  if (/\bsb_secret_[A-Za-z0-9_-]{16,}/.test(content)) return true;

  // Legacy keys are JWTs. Decode the payload and look at the actual claim —
  // exact, and impossible to trip on prose.
  for (const m of content.matchAll(/\beyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{16,})\.[A-Za-z0-9_-]{8,}/g)) {
    try {
      const payload = Buffer.from(m[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
      if (/"role"\s*:\s*"service_role"/.test(payload)) return true;
    } catch {
      // Not decodable — not a JWT we can judge, so not a finding.
    }
  }
  return false;
}

const FORBIDDEN = [
  { name: "hosted-llm key", re: /sk-ant/ },
  { name: "stripe live key", re: /sk_live/ },
  { name: "system prompt text", re: /You are the cosigno operator/ },
  { name: "vendor/model name", re: /\b(anthropic|claude|haiku|sonnet|opus|openai|gpt-|gemini|mistral|llama)\b/i },
  // AI vendor / model names — must never be user-facing or in the bundle.
  // The owner allowlist is a server-side authorization input. Seeing its name
  // in a client chunk means someone moved the check to the browser or renamed
  // it into the NEXT_PUBLIC_ namespace; either way the override stopped being
  // server-only. See src/lib/owner.ts.
  { name: "owner allowlist", re: /OWNER_IDS/ },
  // The internal owner tier's own copy. plans.ts is imported by client
  // components, so anything added to that catalog ships to the browser —
  // which is why the owner plan lives in the server-only lib/owner.ts. This
  // sentinel catches it being moved back. Matching the tagline rather than
  // the word "owner" avoids the workspace membership role, which is a
  // legitimate client-side string.
  { name: "owner plan metadata", re: /not a purchasable plan/ },
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

// 1b. The owner allowlist is an authorization input and must stay server-side.
// A NEXT_PUBLIC_ name is the one way it could be inlined into the bundle by
// the framework itself, so the NAME is what gets checked here, not the value.
for (const key of Object.keys(process.env)) {
  if (key.startsWith("NEXT_PUBLIC_") && /OWNER/.test(key)) {
    console.error(`FAIL: ${key} would ship the owner allowlist to the browser`);
    failed = true;
  }
}

// 2. Client bundle must be clean.
const staticDir = join(process.cwd(), ".next", "static");
let scanned = 0;
try {
  for (const file of walk(staticDir)) {
    const content = readFileSync(file, "utf8");
    scanned++;
    if (findsServiceRoleKey(content)) {
      console.error(`FAIL: supabase service role key found in client bundle: ${file}`);
      failed = true;
    }
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
