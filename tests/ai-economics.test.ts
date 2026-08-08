import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { MemoryStore } from "../src/lib/store/memory";
import { getStore } from "../src/lib/store";
import { escalationFor, modelFor } from "../src/lib/ai/routing";
import { estimateCost, recordAiUsage, resetPriceTableForTests } from "../src/lib/ai/costs";

/**
 * The economics layer: cheapest model that completes the task, escalation on
 * evidence only, every AI call in the internal ledger, nothing exposed to
 * users. These tests are what keeps "95% margin" from quietly becoming
 * "quality cuts users can feel".
 */

const USER = "econ-user";

function freshStore(): MemoryStore {
  const store = new MemoryStore();
  (globalThis as unknown as { __cosignoStore?: unknown }).__cosignoStore = store;
  return store;
}

beforeEach(() => {
  freshStore();
  resetPriceTableForTests();
  vi.stubEnv("PLANNER_MODEL_DEFAULT", "model-cheap");
  vi.stubEnv("PLANNER_MODEL_PREMIUM", "model-premium");
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetPriceTableForTests();
});

/* ------------------------------------------------------------------ routing */

describe("routing: cheapest capable model, always", () => {
  it("every task kind starts on the default model", () => {
    for (const task of ["plan", "extract", "classify", "summarize", "generate"] as const) {
      expect(modelFor(task)).toBe("model-cheap");
    }
  });

  it("escalates to premium only for plans that carry it", () => {
    expect(escalationFor("plan", { strongerModel: true, userId: "u" }).model).toBe("model-premium");
    expect(escalationFor("plan", { strongerModel: true, userId: "u" }).escalated).toBe(true);
    // No premium entitlement → retry stays on the default model.
    expect(escalationFor("plan", { strongerModel: false, userId: "u" }).model).toBe("model-cheap");
    expect(escalationFor("plan", { strongerModel: false, userId: "u" }).escalated).toBe(false);
  });

  it("routing decides by declared task, never by command wording", () => {
    const routing = readFileSync("src/lib/ai/routing.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    // No text-matching machinery at all: nothing to feed a command into.
    expect(routing).not.toMatch(/command|\.test\(|\.match\(|includes\(/);
  });

  it("the old keyword heuristics are gone from enforcement", () => {
    const enforcement = readFileSync("src/lib/enforcement.ts", "utf8");
    expect(enforcement).not.toMatch(/TIER3_HINT/);
    expect(enforcement).not.toMatch(/\\band\\b/);
    expect(enforcement).not.toMatch(/command\.length/);
  });

  it("escalation in the pipeline happens only after a demonstrated failure", () => {
    const operator = readFileSync("src/lib/agent/operator.ts", "utf8");
    // The escalationFor call sits inside the !result.toolInput branch.
    const failBranch = operator.indexOf("if (!result.toolInput) {");
    const escalate = operator.indexOf("escalationFor(");
    expect(failBranch).toBeGreaterThan(-1);
    expect(escalate).toBeGreaterThan(failBranch);
  });
});

/* -------------------------------------------------------------- cost ledger */

describe("cost estimation: configured prices or an honest null", () => {
  it("computes from the configured table, per million tokens", () => {
    vi.stubEnv("COSIGNO_MODEL_COSTS", JSON.stringify({ "model-cheap": { input: 1, output: 5 } }));
    expect(estimateCost("model-cheap", 1_000_000, 200_000)).toBeCloseTo(2.0, 6);
  });

  it("returns null — never a guess — for a model not in the table", () => {
    vi.stubEnv("COSIGNO_MODEL_COSTS", JSON.stringify({ "model-cheap": { input: 1, output: 5 } }));
    expect(estimateCost("model-unknown", 1000, 1000)).toBeNull();
  });

  it("returns null when no table is configured at all", () => {
    expect(estimateCost("model-cheap", 1000, 1000)).toBeNull();
  });
});

describe("the ledger", () => {
  it("records every field pricing decisions need", async () => {
    vi.stubEnv("COSIGNO_MODEL_COSTS", JSON.stringify({ "model-cheap": { input: 1, output: 5 } }));
    await recordAiUsage({
      user_id: USER,
      mission_id: "m1",
      session_id: "s1",
      task: "plan",
      model: "model-cheap",
      input_tokens: 500_000,
      output_tokens: 100_000,
      est_cost_usd: estimateCost("model-cheap", 500_000, 100_000),
      plan: "pro",
    });
    const rows = await getStore().listAiUsageSince("1970-01-01");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: USER,
      mission_id: "m1",
      task: "plan",
      model: "model-cheap",
      plan: "pro",
    });
    expect(rows[0].est_cost_usd).toBeCloseTo(1.0, 6);
  });

  it("sums per mission and per user-month", async () => {
    const store = getStore();
    for (let i = 0; i < 3; i += 1) {
      await store.recordAiUsage({
        user_id: USER,
        mission_id: "m1",
        session_id: null,
        task: "plan",
        model: "m",
        input_tokens: 0,
        output_tokens: 0,
        est_cost_usd: 0.25,
        plan: "free",
      });
    }
    expect(await store.aiCostForMission(USER, "m1")).toBeCloseTo(0.75, 6);
    expect(await store.aiCostForUserMonth(USER)).toBeCloseTo(0.75, 6);
    expect(await store.aiCostForMission("someone-else", "m1")).toBe(0);
  });

  it("never throws into the caller's request path", async () => {
    (globalThis as Record<string, unknown>).__cosignoStore = {
      recordAiUsage: () => Promise.reject(new Error("db down")),
    };
    await expect(
      recordAiUsage({
        user_id: USER,
        mission_id: null,
        session_id: null,
        task: "plan",
        model: "m",
        input_tokens: 0,
        output_tokens: 0,
        est_cost_usd: null,
        plan: "free",
      })
    ).resolves.toBeUndefined();
  });
});

/* --------------------------------------------------------- never user-facing */

describe("costs stay internal", () => {
  it("the ledger table grants clients nothing", () => {
    const sql = readFileSync("supabase/migrations/0023_ai_usage.sql", "utf8");
    expect(sql).toMatch(/revoke all on ai_usage from authenticated, anon/);
    expect(sql).not.toMatch(/grant select on ai_usage to authenticated/);
  });

  it("the internal dashboard 404s without the admin key — it doesn't exist", async () => {
    const { GET } = await import("../src/app/api/internal/costs/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("http://localhost/api/internal/costs"));
    expect(res.status).toBe(404);
  });

  it("no client component renders tokens or provider cost", () => {
    // Sweep the client bundle sources for cost vocabulary. "action budget"
    // vocabulary is fine; token counts and USD costs of models are not.
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const out = execSync(
      `grep -rlE "input_tokens|output_tokens|est_cost_usd" src/components src/app --include='*.tsx' || true`
    ).toString().trim();
    expect(out).toBe("");
  });
});

/* ------------------------------------------------------------------- naming */

describe("usage is named for what it counts", () => {
  it("plan bullets and limit copy say AI operations, not bare actions", () => {
    const plans = readFileSync("src/lib/plans.ts", "utf8");
    expect(plans).toMatch(/AI operations \/ month/);
    const enforcement = readFileSync("src/lib/enforcement.ts", "utf8");
    expect(enforcement).toMatch(/AI operations/);
  });

  it("the usage panel explains what an operation is, where usage is shown", () => {
    const account = readFileSync("src/components/account/AccountCenter.tsx", "utf8");
    expect(account).toMatch(/Planning and every executed action count as one/);
  });
});
