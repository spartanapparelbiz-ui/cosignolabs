import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ApiError, errorResponse, safeMessage } from "../src/lib/api";
import { RateLimitError } from "../src/lib/ratelimit";

/**
 * A configuration key must never reach a browser.
 *
 * "Gmail can't be connected because this deployment has no Gmail credentials.
 * Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then redeploy." — a real
 * message a customer saw. They cannot set an environment variable, so the only
 * thing that sentence told them was that they were not the audience.
 *
 * Fixing the sentence fixes today. Components across this app render
 * `err.message` directly and errors are thrown from every layer, so the next
 * leak is always one commit away. The guarantee therefore lives at the last
 * gate before a response leaves the server, and these tests hold that gate.
 */

const SETTING_NAME = /\b[A-Z][A-Z0-9]{2,}(?:_[A-Z0-9]+)+\b/;

async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("safeMessage — the last gate", () => {
  it.each([
    "Gmail can't be connected because this deployment has no Gmail credentials. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then redeploy.",
    "INTEGRATIONS_ENCRYPTION_KEY is required in production",
    "CRON_SECRET is not set — background execution is off.",
    "missing PLANNER_API_KEY",
  ])("replaces a message naming a configuration key: %s", (message) => {
    const out = safeMessage(message, "test");
    expect(out).not.toMatch(SETTING_NAME);
    expect(out).toBe("This isn't available right now. Please try again later, or contact support.");
  });

  it("leaves ordinary messages exactly as written", () => {
    for (const ok of [
      "sign in to continue.",
      "Gmail sign-in isn't available right now. Please try again later, or contact support.",
      "that status change isn't allowed.",
      "You've reached the number of connected apps your plan includes.",
    ]) {
      expect(safeMessage(ok, "test")).toBe(ok);
    }
  });

  it("does not mistake ordinary capitals for a setting name", () => {
    for (const ok of ["AES-256-GCM keeps them safe", "Your PDF is ready", "OK"]) {
      expect(safeMessage(ok, "test")).toBe(ok);
    }
  });
});

describe("errorResponse — every path is gated", () => {
  it("an ApiError naming a key is scrubbed", async () => {
    const res = errorResponse(
      new ApiError(400, "not_configured", "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then redeploy.")
    );
    const body = await bodyOf(res);
    expect(String(body.message)).not.toMatch(SETTING_NAME);
    expect(body.error).toBe("not_configured");
  });

  it("a rate-limit error is scrubbed", async () => {
    const body = await bodyOf(errorResponse(new RateLimitError("transitionMinute", 30, "UPSTASH_REDIS_REST_URL missing")));
    expect(String(body.message)).not.toMatch(SETTING_NAME);
  });

  it("an unexpected error never returns its own text", async () => {
    const body = await bodyOf(errorResponse(new Error("GOOGLE_CLIENT_SECRET is undefined at line 42")));
    expect(String(body.message)).not.toMatch(SETTING_NAME);
    expect(body.error).toBe("internal");
  });

  /**
   * Setting names are useful to whoever operates the workspace. They ride in
   * `developer`, which is dropped outside a development build — so the same
   * throw is safe in production and helpful locally.
   */
  it("developer detail is withheld outside development", async () => {
    // Tests run with NODE_ENV=test — i.e. not development, i.e. the same
    // branch production takes. Nothing is disclosed.
    expect(process.env.NODE_ENV).not.toBe("development");
    const err = new ApiError(400, "not_configured", "Gmail sign-in isn't available right now.", [
      "GOOGLE_CLIENT_ID",
    ]);
    expect(await bodyOf(errorResponse(err))).not.toHaveProperty("developer");
  });

  it("the ONLY thing that unlocks developer detail is a development build", () => {
    const src = readFileSync("src/lib/api.ts", "utf8");
    const fn = src.slice(src.indexOf("export function developerDetail"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toMatch(/process\.env\.NODE_ENV !== "development"/);
    expect(body).toMatch(/return \{\};/);
    // No second door — no header, query flag, or user field can open it.
    expect(body).not.toMatch(/req|header|searchParams|role|admin/i);
  });
});

/**
 * Belt and braces: no API route should be WRITING a configuration key into a
 * message in the first place. The gate above catches it; this says so at the
 * source, where it is cheaper to fix.
 */
describe("no API route writes a configuration key into a message", () => {
  function routeFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) routeFiles(full, out);
      else if (entry === "route.ts") out.push(full);
    }
    return out;
  }

  const routes = routeFiles("src/app/api");

  it("finds routes to check (a broken glob would pass silently)", () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it("no message string names a configuration key", () => {
    const offenders: string[] = [];
    for (const file of routes) {
      const src = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        // Imports name modules and exported constants, not messages.
        .replace(/^\s*import[\s\S]*?from\s+"[^"]*";$/gm, "");
      // Prose only, and `${CONSTANT}` is a value being interpolated — the
      // rendered text is a number, not a key name. Strip those before testing.
      const prose = [
        ...(src.match(/"[^"\n]*\s[^"\n]*"/g) ?? []),
        ...(src.match(/`[^`\n]*\s[^`\n]*`/g) ?? []),
      ]
        .map((line) => line.replace(/\$\{[^}]*\}/g, "…"))
        // A real sentence, not two quote characters either side of an
        // expression. Requires actual prose before we call it a message.
        .filter((line) => (line.match(/[a-z]{3,}/g) ?? []).length >= 3);
      for (const line of prose) {
        if (SETTING_NAME.test(line)) offenders.push(`${file}: ${line}`);
      }
    }
    expect(offenders, `these routes put a configuration key in a message:\n${offenders.join("\n")}`).toEqual(
      []
    );
  });
});
