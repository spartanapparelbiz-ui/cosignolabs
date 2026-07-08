import { describe, it, expect } from "vitest";
import {
  callPlanner,
  plannerErrorMessage,
  PlannerError,
} from "@/lib/agent/provider";

/**
 * When the hosted planner call fails, the operator must see the REAL,
 * actionable reason (bad key, missing runtime env, unknown model, no credit),
 * not a generic "something went wrong." These tests pin the plain-language
 * mapping and the missing-key fast-path, and confirm the raw provider detail
 * never leaks into the auth-failure message.
 */
describe("planner error surfacing", () => {
  it("maps provider statuses to actionable, env-var-specific messages", () => {
    expect(plannerErrorMessage(401, "invalid x-api-key")).toMatch(/PLANNER_API_KEY/);
    expect(plannerErrorMessage(403, "forbidden")).toMatch(/denied access/i);
    expect(plannerErrorMessage(404, "unknown model foo")).toMatch(/PLANNER_MODEL_DEFAULT/);
    expect(plannerErrorMessage(400, "Your credit balance is too low")).toMatch(/credit/i);
    expect(plannerErrorMessage(429, "")).toMatch(/rate-limit/i);
    expect(plannerErrorMessage(500, "")).toMatch(/server error/i);
  });

  it("does not echo the raw provider detail into the 401 message", () => {
    const msg = plannerErrorMessage(401, "invalid x-api-key: sk-super-secret-value");
    expect(msg).not.toContain("sk-super-secret-value");
  });

  it("throws a PlannerError with a runtime-scope hint when the key is missing", async () => {
    const prevKey = process.env.PLANNER_API_KEY;
    const prevLegacy = process.env.ANTHROPIC_API_KEY;
    delete process.env.PLANNER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const call = callPlanner({
        model: "test-model",
        maxTokens: 16,
        system: "system",
        userContent: "hello",
        tool: { name: "t", description: "d", input_schema: { type: "object" } },
      });
      await expect(call).rejects.toBeInstanceOf(PlannerError);
      await expect(call).rejects.toThrow(/PLANNER_API_KEY/);
    } finally {
      if (prevKey !== undefined) process.env.PLANNER_API_KEY = prevKey;
      if (prevLegacy !== undefined) process.env.ANTHROPIC_API_KEY = prevLegacy;
    }
  });

  it("throws a PlannerError when no model is configured", async () => {
    const prevKey = process.env.PLANNER_API_KEY;
    process.env.PLANNER_API_KEY = "test-key";
    try {
      const call = callPlanner({
        model: "",
        maxTokens: 16,
        system: "system",
        userContent: "hello",
        tool: { name: "t", description: "d", input_schema: { type: "object" } },
      });
      await expect(call).rejects.toBeInstanceOf(PlannerError);
      await expect(call).rejects.toThrow(/PLANNER_MODEL_DEFAULT/);
    } finally {
      if (prevKey !== undefined) process.env.PLANNER_API_KEY = prevKey;
      else delete process.env.PLANNER_API_KEY;
    }
  });
});
