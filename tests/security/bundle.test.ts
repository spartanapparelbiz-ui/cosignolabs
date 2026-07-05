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

const FORBIDDEN = [
  { name: "hosted-llm key", re: /sk-ant/ },
  { name: "stripe live key", re: /sk_live/ },
  { name: "supabase service role", re: /service_role/ },
  { name: "system prompt text", re: /You are the cosigno operator/ },
  { name: "vendor/model name", re: /\b(anthropic|claude|haiku|sonnet|opus|openai|gpt-|gemini|mistral|llama)\b/i },
];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

describe.skipIf(!existsSync(STATIC_DIR))("client bundle secret + vendor scan", () => {
  it("no secrets, system prompt, or vendor/model names in .next/static", () => {
    let scanned = 0;
    for (const file of walk(STATIC_DIR)) {
      const content = readFileSync(file, "utf8");
      scanned++;
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
  // Server-only files that legitimately touch the vendor SDK / integration.
  const EXEMPT = ["src/lib/agent/operator.ts"];

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
