import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * §2/§8 test 9 — the client bundle contains no secrets and no system
 * prompt text. Runs against .next/static (present after `npm run build`,
 * which is how CI orders the steps); the same scan also gates the build
 * itself via scripts/check-bundle.mjs.
 */

const STATIC_DIR = join(process.cwd(), ".next", "static");

const FORBIDDEN = [
  { name: "anthropic key", re: /sk-ant/ },
  { name: "stripe live key", re: /sk_live/ },
  { name: "supabase service role", re: /service_role/ },
  { name: "system prompt text", re: /You are the cosigno operator/ },
];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

describe.skipIf(!existsSync(STATIC_DIR))("client bundle secret scan", () => {
  it("no secret material or system prompt in .next/static", () => {
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
