import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * §2/§8 test 9 + §6 vendor sweep — the client bundle contains no secrets,
 * no system prompt text, and NO AI vendor/model names. Runs against
 * .next/static (present after `npm run build`); the same scan gates the
 * build via scripts/check-bundle.mjs.
 */

const STATIC_DIR = join(process.cwd(), ".next", "static");

/**
 * A development build is not valid input for this scan, and reading one
 * produces confident nonsense.
 *
 * Dev keeps comments and inlines dependencies into chunks named after OUR
 * source, so supabase-js's own warning never to expose a service-role key, and
 * an example index called "documents-openai", both land in a file that looks
 * like ours. Neither is a leak; neither is fixable here. A gate that fails on
 * them whenever somebody ran `npm run dev` first is a gate people learn to
 * wave through — which costs more than the check is worth.
 *
 * Production output is what actually ships and what this is for.
 */
function isDevBuild(): boolean {
  return (
    existsSync(join(STATIC_DIR, "development")) ||
    existsSync(join(STATIC_DIR, "chunks", "_app-pages-browser_src_lib_supabaseAuth_client_ts.js"))
  );
}

const FORBIDDEN = [
  { name: "hosted-llm key", re: /sk-ant/ },
  { name: "stripe live key", re: /sk_live/ },
  { name: "system prompt text", re: /You are the cosigno operator/ },
  { name: "vendor/model name", re: /\b(anthropic|claude|haiku|sonnet|opus|openai|gpt-|gemini|mistral|llama)\b/i },
  // Server-side authorization input — see src/lib/owner.ts. Its name in a
  // client chunk means the owner check left the server.
  { name: "owner allowlist", re: /OWNER_IDS/ },
  // The internal tier's own copy — it must stay in the server-only
  // lib/owner.ts and out of the client-bundled PLANS catalog. The tagline is
  // the sentinel; the bare word "owner" is a legitimate workspace role.
  { name: "owner plan metadata", re: /not a purchasable plan/ },
];


/**
 * A leaked Supabase service-role key, detected by SHAPE rather than by the
 * phrase "service_role".
 *
 * The old check matched that bare string — which is documentation prose. It
 * fired on supabase-js's own comment telling you never to expose the key, and
 * only in development, where comments survive minification. It could also
 * never catch a real leak: service-role keys are JWTs or `sb_secret_` strings,
 * and neither contains the words.
 *
 * A gate that cries wolf on a library comment while missing the actual secret
 * is worse than no gate, because people learn to wave it through.
 */
function findsServiceRoleKey(content: string): boolean {
  if (/\bsb_secret_[A-Za-z0-9_-]{16,}/.test(content)) return true;
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

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

describe.skipIf(!existsSync(STATIC_DIR) || isDevBuild())("client bundle secret + vendor scan", () => {
  it("no secrets, system prompt, or vendor/model names in .next/static", () => {
    let scanned = 0;
    for (const file of walk(STATIC_DIR)) {
      const content = readFileSync(file, "utf8");
      scanned++;
      expect(findsServiceRoleKey(content), `supabase service role key in ${file}`).toBe(false);
      for (const f of FORBIDDEN) {
        expect(f.re.test(content), `${f.name} in ${file}`).toBe(false);
      }
    }
    expect(scanned).toBeGreaterThan(0);
  });
});

/**
 * Source-level vendor sweep: user-facing source (components, pages, and
 * user-facing strings) must not name any AI vendor/model. Server-only
 * integration code (the SDK import) and .env.example comments are exempt.
 */
describe("no vendor/model names in user-facing source", () => {
  const VENDOR = /\b(anthropic|claude|haiku|sonnet|opus|openai|gpt-|gemini|mistral|llama)\b/i;
  const SRC = join(process.cwd(), "src");
  // The isolation layer is the ONLY file allowed to touch the vendor SDK.
  const EXEMPT = ["src/lib/agent/provider.ts"];

  function walkTs(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) out.push(...walkTs(p));
      else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
    }
    return out;
  }

  it("components and pages never name a vendor/model", () => {
    for (const file of walkTs(SRC)) {
      const rel = file.slice(file.indexOf("src/"));
      if (EXEMPT.includes(rel)) continue;
      const content = readFileSync(file, "utf8");
      expect(VENDOR.test(content), `vendor/model name in ${rel}`).toBe(false);
    }
  });
});
