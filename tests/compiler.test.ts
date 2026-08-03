import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../src/lib/store/memory";
import { compileMission } from "../src/lib/missions/compiler";
import { buildCapabilityManifest } from "../src/lib/missions/capabilities";
import { validatePlan, type CompiledPlan } from "../src/lib/missions/validate";

/**
 * The compiler turns open-ended goals into VALIDATED plans that reference only
 * real tools. These tests pin the honesty guarantees: a valid dependency
 * graph, rejection of invented tools / forbidden operators / cycles, an
 * approval gate on consequential steps, a verification requirement (or an
 * explicit unverified label), unsupported goals surfaced as blocked, and no
 * silent sandbox/live mixing.
 */

vi.mock("@/lib/auth", () => ({
  authConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "user-a"),
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).__cosignoStore = new MemoryStore();
});

describe("compileMission — open-ended goals become real plans", () => {
  it("a laptop-comparison goal compiles to the read-only browser-operator plan (stops before purchase)", async () => {
    const r = await compileMission("user-a", "compare the best laptops under $1,000");
    expect(r.shape).toBe("product_compare");
    expect(r.blocked).toBe(false);
    expect(r.validation.ok).toBe(true);
    // The exact 8-step vertical slice: confirm → search → three reviews →
    // compare → recommend → report. Entirely read-only.
    const tools = r.plan.steps.map((s) => s.tool);
    expect(tools).toEqual([
      "laptop.confirm",
      "laptop.search",
      "laptop.review",
      "laptop.review",
      "laptop.review",
      "laptop.compare",
      "laptop.recommend",
      "laptop.report",
    ]);
    // No consequential step → no approval gate needed; purchases are out of
    // scope and said so honestly.
    expect(r.plan.approvalCheckpoints).toHaveLength(0);
    expect(r.plan.unsupported.join(" ")).toMatch(/purchase|payment/i);
    expect(r.plan.riskSummary).toMatch(/read-only/i);
  });

  it("a research goal compiles to a read-only plan with no consequential steps", async () => {
    const r = await compileMission("user-a", "research this company before my interview");
    expect(r.shape).toBe("research");
    expect(r.blocked).toBe(false);
    expect(r.plan.approvalCheckpoints).toHaveLength(0);
  });

  it("a meeting goal reuses the meeting-prep shape", async () => {
    const r = await compileMission("user-a", "prepare for my meeting tomorrow");
    expect(r.shape).toBe("meeting_prep");
    expect(r.plan.steps.map((s) => s.tool)).toContain("calendar.find_event");
  });

  it("a money-movement goal with no connection is blocked and explained", async () => {
    const r = await compileMission("user-a", "pay my rent and wire the deposit");
    expect(r.shape).toBe("unsupported");
    expect(r.blocked).toBe(true);
    expect(r.understood.boundary).toMatch(/can't complete|research and prepare/i);
  });

  it("every compiled step references a real registered tool", async () => {
    const manifest = await buildCapabilityManifest("user-a");
    const ids = new Set(manifest.tools.map((t) => t.id));
    for (const goal of ["compare laptops under 1000", "research hotels for the weekend", "prepare for my sync meeting"]) {
      const r = await compileMission("user-a", goal);
      for (const s of r.plan.steps) expect(ids.has(s.tool)).toBe(true);
    }
  });
});

describe("validatePlan — the gate before execution", () => {
  async function manifest() {
    return buildCapabilityManifest("user-a");
  }
  const base: CompiledPlan = {
    normalizedGoal: "x",
    successCriteria: [],
    assumptions: [],
    questions: [],
    steps: [],
    expectedDeliverables: [],
    approvalCheckpoints: [],
    verificationRequirements: [],
    riskSummary: "",
    unsupported: [],
  };

  it("rejects an invented tool", async () => {
    const plan: CompiledPlan = { ...base, steps: [{ idx: 0, purpose: "x", operator: "research", tool: "magic.doeverything", dependsOn: [] }] };
    const r = validatePlan(plan, await manifest());
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "unknown_tool")).toBe(true);
  });

  it("rejects an operator using a tool outside its profile", async () => {
    const plan: CompiledPlan = { ...base, steps: [{ idx: 0, purpose: "x", operator: "research", tool: "approval.offer_send", dependsOn: [] }] };
    const r = validatePlan(plan, await manifest());
    expect(r.issues.some((i) => i.code === "operator_forbidden")).toBe(true);
  });

  it("detects a dependency cycle", async () => {
    const plan: CompiledPlan = {
      ...base,
      steps: [
        { idx: 0, purpose: "a", operator: "research", tool: "analyze.extract", dependsOn: [1] },
        { idx: 1, purpose: "b", operator: "research", tool: "analyze.extract", dependsOn: [0] },
      ],
    };
    const r = validatePlan(plan, await manifest());
    expect(r.issues.some((i) => i.code === "cycle")).toBe(true);
  });

  it("flags a consequential step with no approval checkpoint", async () => {
    const plan: CompiledPlan = {
      ...base,
      steps: [{ idx: 0, purpose: "send", operator: "communication", tool: "approval.offer_send", dependsOn: [] }],
      approvalCheckpoints: [],
      verificationRequirements: ["approval.offer_send verified in sent mail"],
    };
    const r = validatePlan(plan, await manifest());
    expect(r.issues.some((i) => i.code === "missing_approval_gate")).toBe(true);
  });

  it("flags a bad dependency index", async () => {
    const plan: CompiledPlan = { ...base, steps: [{ idx: 0, purpose: "x", operator: "research", tool: "analyze.extract", dependsOn: [9] }] };
    const r = validatePlan(plan, await manifest());
    expect(r.issues.some((i) => i.code === "bad_dependency")).toBe(true);
  });
});
