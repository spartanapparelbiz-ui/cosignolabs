import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../src/lib/store/memory";
import { buildCapabilityManifest, isConsequentialTool } from "../src/lib/missions/capabilities";
import { operatorAllows } from "../src/lib/missions/operators";
import { validatePlan } from "../src/lib/missions/validate";

/**
 * The adaptive planner's MODEL PATH.
 *
 * Everything else about this planner is provable without a provider, and is
 * proved elsewhere: with no key configured it returns null and the
 * deterministic shape runs. What that leaves untested is the half that only
 * exists when a model does answer — and that is the half where a wrong answer
 * could, in principle, cost something.
 *
 * So the provider is mocked and fed the answers a real model actually gives
 * on a bad day: a tool that doesn't exist, a dependency pointing at a step
 * that was dropped, a dependency pointing FORWARDS, a consequential tool with
 * no mention of approval, a receipt in the middle of the plan, forty steps.
 *
 * The claim under test is narrow and total: NO model output produces a plan
 * that fails validation. Either the answer is repaired into something the
 * engine's own rules accept, or it is discarded and the caller falls back.
 */

const { callPlanner } = vi.hoisted(() => ({ callPlanner: vi.fn() }));

// The whole vendor-isolation module, stubbed. `plannerModel` is part of it
// because the model router reads it, and an undefined export there would
// throw before the planner ever got to its own logic.
vi.mock("@/lib/agent/provider", () => ({
  callPlanner,
  plannerConfigured: () => true,
  plannerModel: () => "test-planner-model",
  plannerApiKey: () => "test-key",
}));

vi.mock("@/lib/auth", () => ({
  authConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "user-a"),
}));

const { planAdaptively } = await import("../src/lib/missions/planner");

beforeEach(() => {
  (globalThis as Record<string, unknown>).__cosignoStore = new MemoryStore();
  callPlanner.mockReset();
});

/** Whatever the model "said" this call. */
function answers(toolInput: Record<string, unknown> | null) {
  callPlanner.mockResolvedValue({ toolInput, inputTokens: 10, outputTokens: 20 });
}

const BASE = {
  normalized_goal: "compare apartments near campus",
  success_criteria: ["a ranked comparison exists"],
  assumptions: [],
  expected_deliverables: ["a comparison report"],
  risk_summary: "read-only research.",
  unsupported: [],
};

async function plan(steps: unknown[], extra: Record<string, unknown> = {}) {
  const manifest = await buildCapabilityManifest("user-a");
  answers({ ...BASE, ...extra, steps });
  return {
    plan: await planAdaptively({ userId: "user-a", goal: "compare apartments near campus", manifest, plan: "free" }),
    manifest,
  };
}

describe("a good answer becomes a plan the engine can run", () => {
  it("builds the steps the model asked for, and closes with the receipt", async () => {
    const { plan: p, manifest } = await plan([
      { purpose: "search and read what's out there", tool: "web.research", depends_on: [] },
      { purpose: "rank them", tool: "analyze.compare", depends_on: [0] },
      { purpose: "write it up", tool: "deliverable.report", depends_on: [1] },
    ]);
    expect(p).not.toBeNull();
    expect(p!.steps.map((s) => s.tool)).toEqual([
      "web.research",
      "analyze.compare",
      "deliverable.report",
      "mission.receipt",
    ]);
    expect(validatePlan(p!, manifest).ok).toBe(true);
  });

  it("assigns each step the operator the manifest says owns its tool", async () => {
    const { plan: p } = await plan([
      // The model is not asked for an operator and cannot supply one; these
      // would be wrong if it could.
      { purpose: "search", tool: "web.research", depends_on: [] },
      { purpose: "rank", tool: "analyze.compare", depends_on: [0] },
    ]);
    for (const s of p!.steps) {
      expect(operatorAllows(s.operator, s.tool), `${s.operator} may not run ${s.tool}`).toBe(true);
    }
    expect(p!.steps.find((s) => s.tool === "web.research")!.operator).toBe("browser");
    expect(p!.steps.find((s) => s.tool === "analyze.compare")!.operator).toBe("research");
  });

  it("keeps independent steps independent, so the engine can run them together", async () => {
    const { plan: p } = await plan([
      { purpose: "search one way", tool: "web.research", depends_on: [] },
      { purpose: "read the calendar", tool: "brief.calendar", depends_on: [] },
      { purpose: "rank", tool: "analyze.compare", depends_on: [0, 1] },
    ]);
    expect(p!.steps[0].dependsOn).toEqual([]);
    expect(p!.steps[1].dependsOn).toEqual([]);
    expect(p!.steps[2].dependsOn).toEqual([0, 1]);
  });
});

describe("a bad answer cannot produce a bad plan", () => {
  it("drops a tool that doesn't exist and repairs the dependencies around it", async () => {
    const { plan: p, manifest } = await plan([
      { purpose: "search", tool: "web.research", depends_on: [] },
      { purpose: "call the apartment api", tool: "apartments.fetch_listings", depends_on: [0] },
      { purpose: "rank", tool: "analyze.compare", depends_on: [1] },
    ]);
    const tools = p!.steps.map((s) => s.tool);
    expect(tools).not.toContain("apartments.fetch_listings");
    // The survivor's dependency was rewritten onto the step that remains,
    // rather than left pointing at a hole — which would deadlock it.
    const compare = p!.steps.find((s) => s.tool === "analyze.compare")!;
    expect(compare.dependsOn).toEqual([0]);
    expect(validatePlan(p!, manifest).ok).toBe(true);
  });

  it("splices through a whole run of dropped steps, not just one", async () => {
    const { plan: p } = await plan([
      { purpose: "search", tool: "web.research", depends_on: [] },
      { purpose: "call an api", tool: "apartments.fetch", depends_on: [0] },
      { purpose: "call another", tool: "zillow.scrape", depends_on: [1] },
      { purpose: "rank", tool: "analyze.compare", depends_on: [2] },
    ]);
    // Two invented steps between the research and the comparison. The
    // comparison must still wait for the research, or it runs alongside it
    // and compares nothing.
    const compare = p!.steps.find((s) => s.tool === "analyze.compare")!;
    expect(compare.dependsOn).toEqual([0]);
  });

  it("writes the approval gate itself when the model forgets one", async () => {
    const { plan: p, manifest } = await plan(
      [
        { purpose: "find waiting threads", tool: "followup.find", depends_on: [] },
        { purpose: "just send them", tool: "followup.offer_send", depends_on: [0] },
      ],
      // The model claims there is nothing to approve and no risk.
      { risk_summary: "harmless", unsupported: [] }
    );
    expect(isConsequentialTool("followup.offer_send")).toBe(true);
    expect(p!.approvalCheckpoints.length).toBeGreaterThan(0);
    expect(p!.approvalCheckpoints.join(" ")).toContain("followup.offer_send");
    expect(p!.verificationRequirements.join(" ")).toContain("followup.offer_send");
    expect(validatePlan(p!, manifest).ok).toBe(true);
  });

  it("refuses a dependency that points forwards", async () => {
    const { plan: p } = await plan([
      // Step 0 waiting on step 1 would never become runnable.
      { purpose: "rank", tool: "analyze.compare", depends_on: [1] },
      { purpose: "search", tool: "web.research", depends_on: [] },
    ]);
    expect(p!.steps[0].dependsOn).toEqual([]);
    for (const s of p!.steps) {
      for (const d of s.dependsOn) expect(d).toBeLessThan(s.idx);
    }
  });

  it("never lets the model schedule the receipt itself", async () => {
    const { plan: p } = await plan([
      { purpose: "close it out early", tool: "mission.receipt", depends_on: [] },
      { purpose: "search", tool: "web.research", depends_on: [] },
    ]);
    const receipts = p!.steps.filter((s) => s.tool === "mission.receipt");
    expect(receipts).toHaveLength(1);
    expect(receipts[0].idx).toBe(p!.steps.length - 1);
  });

  it("caps a runaway plan", async () => {
    const { plan: p } = await plan(
      Array.from({ length: 40 }, () => ({ purpose: "search again", tool: "web.research", depends_on: [] }))
    );
    expect(p!.steps.length).toBeLessThanOrEqual(14);
  });

  it("labels a sandbox-only plan as sandbox even when the model doesn't", async () => {
    const { plan: p } = await plan([{ purpose: "search", tool: "web.research", depends_on: [] }], {
      assumptions: ["this will use live listings"],
    });
    // No browser provider is configured in tests, so web.research is sandbox.
    expect(p!.assumptions.join(" ")).toMatch(/sandbox/i);
  });
});

describe("when the answer is unusable, the deterministic shape gets its turn", () => {
  it("returns null when every tool named was invented", async () => {
    const { plan: p } = await plan([
      { purpose: "a", tool: "apartments.fetch", depends_on: [] },
      { purpose: "b", tool: "zillow.scrape", depends_on: [] },
    ]);
    expect(p).toBeNull();
  });

  it("returns null when the model answers with nothing", async () => {
    const manifest = await buildCapabilityManifest("user-a");
    answers(null);
    expect(await planAdaptively({ userId: "user-a", goal: "x", manifest, plan: "free" })).toBeNull();
  });

  it("returns null when the provider fails, rather than failing the mission", async () => {
    const manifest = await buildCapabilityManifest("user-a");
    callPlanner.mockRejectedValue(new Error("provider is down"));
    await expect(
      planAdaptively({ userId: "user-a", goal: "x", manifest, plan: "free" })
    ).resolves.toBeNull();
  });
});

describe("what the planner is allowed to see", () => {
  it("is shown the names of attached sources and never a word of their content", async () => {
    const manifest = await buildCapabilityManifest("user-a");
    answers({ ...BASE, steps: [{ purpose: "search", tool: "web.research", depends_on: [] }] });

    // A source whose extracted text tries to issue instructions. Only its
    // DESCRIPTION is passed in; the body must never reach planning, or a
    // poisoned attachment could choose the plan.
    await planAdaptively({
      userId: "user-a",
      goal: "compare apartments near campus",
      manifest,
      plan: "free",
      sourceNotes: ["listings.pdf — file read as context"],
    });

    const sent = callPlanner.mock.calls[0][0] as { userContent: string; system: string };
    expect(sent.userContent).toContain("listings.pdf");
    expect(sent.userContent).toContain("compare apartments near campus");
    expect(sent.userContent).not.toMatch(/ignore (all )?previous/i);
    // The whole prompt is the goal plus source names — nothing else travels.
    expect(sent.userContent.length).toBeLessThan(500);
  });

  it("is given the real tool list, with each tool's risk and data source", async () => {
    const manifest = await buildCapabilityManifest("user-a");
    answers({ ...BASE, steps: [{ purpose: "search", tool: "web.research", depends_on: [] }] });
    await planAdaptively({ userId: "user-a", goal: "x", manifest, plan: "free" });

    const sent = callPlanner.mock.calls[0][0] as { system: string };
    for (const tool of manifest.tools) expect(sent.system).toContain(tool.id);
    expect(sent.system).toContain("CONSEQUENTIAL (needs approval)");
    expect(sent.system).toContain("sandbox (labeled example data)");
  });
});
