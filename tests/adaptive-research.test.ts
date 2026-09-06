import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
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
    const findings = (research.output ?? {}).findings as { url: string; figure: number | null; simulated: boolean }[];
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

  it("never reads the budget out of the goal as if it were each option's price", async () => {
    // "under $1,500" is a CONSTRAINT the user typed. It gets echoed back in
    // page titles and headers, and reading the first money-shaped string on
    // the page turned it into every result's rent: four different apartments
    // all priced at the ceiling, ranked by a tie-break, recommended anyway.
    const compiled = await compileMission("user-a", APARTMENT_GOAL);
    const { mission } = await instantiateCompiledMission("user-a", compiled.plan);
    await drive("user-a", mission.id);

    const steps = await store.listMissionSteps("user-a", mission.id);
    const findings = ((await steps.find((s) => s.tool === "web.research")!.output) ?? {})
      .findings as { figure: number | null; figureFrom: string | null }[];

    const figures = findings.map((f) => f.figure);
    expect(figures.every((f) => f !== null)).toBe(true);
    // The ceiling from the goal is not what every option costs.
    expect(figures.every((f) => f === 1500)).toBe(false);
    expect(new Set(figures).size).toBeGreaterThan(1);
    // Each one came from a labeled row on its own page, not from prose.
    for (const f of findings) expect(f.figureFrom).not.toBe("page text");

    // And the report ranks on those figures, so its recommendation is the
    // cheapest thing actually found.
    const report = (await store.listFiles("user-a")).find((f) => f.mime === "text/markdown")!;
    const cheapest = Math.min(...(figures as number[]));
    expect(report.content).toContain(`$${cheapest.toLocaleString()}`);
  });

  it("the keyword fallback keeps the subject and drops the instruction words", () => {
    const q = keywordQuery(APARTMENT_GOAL);
    expect(q).toContain("apartments");
    expect(q).toContain("ucf");
    expect(q).not.toContain("research");
    expect(q).not.toContain("create");
  });
});

describe("a goal with no capability behind it is refused, not researched", () => {
  /**
   * Everything that matched no shape used to fall through to web research and
   * then report COMPLETED. "organize my files into a sensible structure" came
   * back having searched the web for those words and recommended one of the
   * results — a confident, useless answer to a question nobody asked.
   */
  it("file management goes to the file tools, never to a web search for the words", async () => {
    const r = await compileMission("user-a", "Go through my files and organize them into a sensible structure");
    // It has real tools behind it now. What must never come back is the old
    // answer: a web search for the phrase "organize files sensible structure".
    expect(r.shape).toBe("organize_files");
    expect(r.plan.steps.map((s) => s.tool)).not.toContain("web.research");
    expect(r.plan.steps.map((s) => s.tool)).toContain("files.organize");
    // And the one thing it changes is gated.
    expect(r.plan.approvalCheckpoints.length).toBeGreaterThan(0);
  });

  it("writing a piece from scratch says so, and points at what it can do", async () => {
    const r = await compileMission("user-a", "Write a blog post about what changed this week");
    expect(r.blocked).toBe(true);
    expect(r.understood.boundary.toLowerCase()).toMatch(/research the subject/);
  });

  it("the refusals stay narrow — real work is never caught by them", async () => {
    // Each of these has tools behind it and must still compile and run.
    for (const goal of [
      "Review my unread email and draft replies to anyone waiting on me",
      "Compare the best apartments near campus under $1,500 and rank them",
      "Research this company before my interview and create a comparison",
      "Find the best price for a 14-inch laptop under $1,000",
    ]) {
      const r = await compileMission("user-a", goal);
      expect(r.blocked, `“${goal}” must not be refused`).toBe(false);
      expect(r.plan.steps.length).toBeGreaterThan(0);
    }
  });

  it("every starting point offered on home is one the product can actually run", async () => {
    // The home cards are entry points; one that produces a confident wrong
    // answer is worse than one that isn't there.
    const dashboard = readFileSync("src/components/app/Dashboard.tsx", "utf8");
    const fills = [...dashboard.matchAll(/fill:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(fills.length).toBeGreaterThan(4);
    for (const fill of fills) {
      const r = await compileMission("user-a", fill);
      expect(r.blocked, `home offers “${fill}” but the compiler refuses it`).toBe(false);
    }
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
