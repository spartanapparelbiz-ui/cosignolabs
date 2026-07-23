import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { buildForks, budgetForFork, compileFork } from "../../src/lib/missions/forks";

/**
 * Mission Forks: selecting a fork prepares a plan for approval — it never
 * executes. Each fork is a re-validated plan with a REAL, engine-enforced
 * budget (which caps tool calls), so the alternatives genuinely differ.
 */

vi.mock("@/lib/auth", () => ({
  clerkConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "user-a"),
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).__cosignoStore = new MemoryStore();
});

describe("mission forks", () => {
  it("offers the four labelled approaches with distinct budgets", async () => {
    const forks = await buildForks("user-a", "research the best laptops under $1200");
    expect(forks.blocked).toBe(false);
    const keys = forks.options.map((o) => o.key);
    expect(keys).toEqual(["recommended", "fastest", "cheapest", "safest"]);
    // Budgets are genuinely different (they cap tool calls in the engine).
    expect(budgetForFork("cheapest")).toBeLessThan(budgetForFork("recommended"));
    expect(budgetForFork("safest")).toBeGreaterThan(budgetForFork("recommended"));
    // Every fork states its tradeoffs.
    for (const o of forks.options) expect(o.tradeoffs.length).toBeGreaterThan(0);
  });

  it("compiles a chosen fork into a runnable (non-blocked) plan", async () => {
    const plan = await compileFork("user-a", "research the best laptops under $1200", "fastest");
    expect(plan).not.toBeNull();
    expect(plan!.steps.length).toBeGreaterThan(0);
  });

  it("blocks honestly on an unsupported goal (no broken fork)", async () => {
    const forks = await buildForks("user-a", "wire $5000 to my landlord");
    expect(forks.blocked).toBe(true);
    expect(forks.options).toHaveLength(0);
  });
});
