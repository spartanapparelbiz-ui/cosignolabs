import { describe, it, expect } from "vitest";
import {
  callPlanner,
  plannerErrorMessage,
  PlannerError,
} from "@/lib/agent/provider";
import { errorResponse } from "@/lib/api";

/**
 * Launch-safety: a planner/provider failure must produce CLEAN, generic
 * user-facing copy — never the real cause (bad key, no credit, unknown model),
 * never an env var name, an api key, a model id, infra hints, or a stack
 * trace. The specifics live in the server logs only.
 */
// Precise leak markers: secret prefixes, env-var NAMES, model ids, infra
// hints, stack traces, and runtime env-state strings. (The benign error CODE
// "planner_failed" must NOT trip this — hence targeting "_API_KEY" etc., not
// the bare word "planner".)
const LEAKY =
  /sk-ant|_API_KEY|_SERVICE_ROLE|_MODEL_|SUPABASE_URL|CLERK_|ANTHROPIC|\bclaude\b|\bsonnet\b|\bopus\b|\bhaiku\b|x-api-key|\bstack\b|process\.env|netlify|=present|MISSING-at-runtime/i;

describe("planner error messages are user-safe", () => {
  it("returns clean, generic copy per status", () => {
    expect(plannerErrorMessage(429)).toMatch(/moment|try again/i);
    expect(plannerErrorMessage(500)).toMatch(/unavailable|try again/i);
    expect(plannerErrorMessage(401)).toMatch(/unavailable|try again/i);
    expect(plannerErrorMessage(400)).toMatch(/unavailable|try again/i);
    expect(plannerErrorMessage(null)).toMatch(/unavailable|try again/i);
  });

  it("never leaks keys, env vars, model ids, infra, or raw provider detail", () => {
    for (const s of [400, 401, 403, 404, 429, 500, null]) {
      const msg = plannerErrorMessage(
        s as number | null,
        "invalid x-api-key: sk-ant-secret model claude-sonnet-5, credit balance too low, at provider.ts:1"
      );
      expect(msg).not.toMatch(LEAKY);
    }
  });

  it("missing key → PlannerError with generic copy only (no env var / infra names)", async () => {
    const prevKey = process.env.PLANNER_API_KEY;
    const prevLegacy = process.env.ANTHROPIC_API_KEY;
    delete process.env.PLANNER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const call = callPlanner({
        model: "test-model",
        maxTokens: 16,
        system: "s",
        userContent: "u",
        tool: { name: "t", description: "d", input_schema: { type: "object" } },
      });
      await expect(call).rejects.toBeInstanceOf(PlannerError);
      await expect(call).rejects.toThrow(/unavailable|try again/i);
      await call.catch((e) => expect(String(e.message)).not.toMatch(LEAKY));
    } finally {
      if (prevKey !== undefined) process.env.PLANNER_API_KEY = prevKey;
      if (prevLegacy !== undefined) process.env.ANTHROPIC_API_KEY = prevLegacy;
    }
  });
});

describe("HTTP error responses never leak internals", () => {
  it("an unexpected error → generic 500 body: no message, stack, sk-ant, or env state", async () => {
    const res = errorResponse(
      new Error("boom sk-ant-secret-leak\n    at provider.ts:42\n PLANNER_API_KEY=present")
    );
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/sk-ant/);
    expect(text).not.toMatch(/at provider\.ts|\bstack\b/i);
    expect(text).not.toMatch(/=present|MISSING-at-runtime|PLANNER_API_KEY/);
    expect(text).toMatch(/requestId/); // correlatable to server logs instead
  });

  it("a PlannerError → 502 body carries only the clean, generic message", async () => {
    const res = errorResponse(new PlannerError(401, plannerErrorMessage(401)));
    expect(res.status).toBe(502);
    const text = JSON.stringify(await res.json());
    expect(text).toMatch(/unavailable|try again/i);
    expect(text).not.toMatch(LEAKY);
  });
});
