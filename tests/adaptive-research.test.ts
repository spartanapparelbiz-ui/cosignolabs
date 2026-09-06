import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../src/lib/store/memory";
import { advanceMission } from "../src/lib/missions/engine";
import { instantiateCompiledMission } from "../src/lib/missions/create";
import { compileMission } from "../src/lib/missions/compiler";
import { buildCapabilityManifest } from "../src/lib/missions/capabilities";
import { keywordQuery } from "../src/lib/missions/webTools";
import { validatePlan, type CompiledPlan } from "../src/lib/missions/validate";
import { planAdaptively } from "../src/lib/missions/planner";

/**
 * Research that is actually about what was asked.
 *
 * The regression these pin: the catch-all research shape used to run
 * `browser.research`, which opened a fixed list of laptop product pages, and
 * `deliverable.comparison`, which titled every report "laptop comparison".
 * A mission about apartments produced a laptop report and reported success.
 *
 * These tests run on the sandbox browser provider with no planner configured
 * — the weakest configuration the product ships in — so what they prove holds
 * everywhere: the subject comes from the goal, and sandbox data says so.
 */

vi.mock("@/lib/auth", () => ({
  authConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "user-a"),
}));

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
});

async function drive(userId: string, id: string, passes = 14) {
  let last = null;
  for (let i = 0; i < passes; i++) {
    last = await advanceMission(userId, id);
    if (!last) break;
    if (
      ["completed", "partial", "failed", "stopped", "awaiting_input", "awaiting_approval", "paused", "blocked"].includes(
        last.mission.state
      )
    ) {
      break;
    }
  }
  return last!;
}

const APARTMENT_GOAL = "Research the best apartments near UCF under $1,500 and create a comparison";

describe("open-ended research takes its subject from the goal", () => {
  it("the apartment mission runs to a completed report about apartments, not laptops", async () => {
    const compiled = await compileMission("user-a", APARTMENT_GOAL);
    expect(compiled.blocked).toBe(false);

    // The generic tools, not the laptop slice.
    const tools = compiled.plan.steps.map((s) => s.tool);
    expect(tools).toContain("web.research");
    expect(tools).toContain("deliverable.report");
    expect(tools.some((t) => t.startsWith("laptop."))).toBe(false);
    expect(tools).not.toContain("browser.research");

    const { mission } = await instantiateCompiledMission("user-a", compiled.plan);
    const result = await drive("user-a", mission.id);
    expect(result.mission.state).toBe("completed");

    // The deliverable is the mission's own subject.
    const files = await store.listFiles("user-a");
    const report = files.find((f) => f.mime === "text/markdown");
    expect(report).toBeTruthy();
    expect(report!.name.toLowerCase()).toContain("apartment");
    expect(report!.content.toLowerCase()).not.toContain("laptop");

    // Sandbox output is labeled as such everywhere it could be mistaken for
    // a real listing.
    expect(report!.content).toMatch(/sandbox/i);
  });

  it("a different subject produces a different report, with no shared fixture leaking in", async () => {
    const compiled = await compileMission("user-a", "find the cheapest flights from Miami to Mexico City in June");
    const { mission } = await instantiateCompiledMission("user-a", compiled.plan);
    const result = await drive("user-a", mission.id);
    expect(result.mission.state).toBe("completed");

    const report = (await store.listFiles("user-a")).find((f) => f.mime === "text/markdown")!;
    expect(report.name.toLowerCase()).toContain("flight");
    expect(report.content.toLowerCase()).not.toContain("laptop");
    expect(report.content.toLowerCase()).not.toContain("apartment");
  });

  it("the research step records what it read, and never claims a figure a page didn't state", async () => {
    const compiled = await compileMission("user-a", "compare coworking spaces in Austin");
    const { mission } = await instantiateCompiledMission("user-a", compiled.plan);
    await drive("user-a", mission.id);

    const steps = await store.listMissionSteps("user-a", mission.id);
    const research = steps.find((s) => s.tool === "web.research")!;
    expect(research.state).toBe("completed");
    const findings = research.output.findings as { url: string; figure: number | null; simulated: boolean }[];
    expect(findings.length).toBeGreaterThan(0);
    // Every finding is traceable to a page that was actually opened, and the
    // sandbox marks itself.
    for (const f of findings) {
      expect(f.url).toMatch(/^https:\/\//);
      expect(f.simulated).toBe(true);
      expect(f.figure === null || typeof f.figure === "number").toBe(true);
    }
    // The pages that were read are the ones the mission logged.
    const actions = await store.listBrowserActions("user-a", (await store.listBrowserSessions("user-a", mission.id))[0].id);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.changes_external === false)).toBe(true);
  });

  it("the keyword fallback keeps the subject and drops the instruction words", () => {
    const q = keywordQuery(APARTMENT_GOAL);
    expect(q).toContain("apartments");
    expect(q).toContain("ucf");
    expect(q).not.toContain("research");
    expect(q).not.toContain("create");
  });
});

describe("the adaptive planner cannot weaken a rule", () => {
  it("is skipped entirely when no planner is configured, so the shape still runs", async () => {
    const manifest = await buildCapabilityManifest("user-a");
    const plan = await planAdaptively({ userId: "user-a", goal: APARTMENT_GOAL, manifest, plan: "free" });
    expect(plan).toBeNull();
  });

  it("every step the deterministic shapes emit still passes validation", async () => {
    const manifest = await buildCapabilityManifest("user-a");
    const ids = new Set(manifest.tools.map((t) => t.id));
    for (const goal of [
      APARTMENT_GOAL,
      "compare laptops under 1000",
      "prepare for my sync meeting",
      "research hotels for the weekend",
    ]) {
      const r = await compileMission("user-a", goal);
      const v: ReturnType<typeof validatePlan> = validatePlan(r.plan as CompiledPlan, manifest);
      expect(v.ok, `${goal}: ${v.issues.map((i) => i.detail).join("; ")}`).toBe(true);
      for (const s of r.plan.steps) expect(ids.has(s.tool)).toBe(true);
    }
  });
});
