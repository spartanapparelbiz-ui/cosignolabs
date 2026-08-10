import { describe, expect, it } from "vitest";
import {
  buildGraph,
  criticalPath,
  describeShape,
  rankSteps,
  readyNow,
} from "../src/lib/missions/graph";
import type { MissionStepRecord } from "../src/lib/types";

/**
 * The operator graph is drawn from `depends_on`, which the planner already
 * records — so the picture is read, never inferred. What these tests protect
 * is the claim the picture makes: "this is when each step can happen."
 * Getting the rank wrong shows work starting before it possibly could, which
 * is worse than showing no graph at all.
 */

const ISO = "2026-08-10T09:00:00Z";

function step(
  idx: number,
  depends_on: number[] = [],
  over: Partial<MissionStepRecord> = {}
): MissionStepRecord {
  return {
    id: `s${idx}`,
    mission_id: "m1",
    user_id: "u",
    idx,
    purpose: `Step ${idx}`,
    operator: "research",
    tool: "browser.read",
    state: "ready",
    depends_on,
    input: {},
    output: null,
    sources: [],
    action_id: null,
    retry_count: 0,
    max_retries: 2,
    error: null,
    verification: null,
    started_at: null,
    completed_at: null,
    created_at: ISO,
    updated_at: ISO,
    ...over,
  };
}

describe("rank is the LONGEST dependency chain, never the shortest", () => {
  it("a step waiting on a long chain and a short one ranks after the long one", () => {
    //   0 → 1 → 2
    //   0 ─────→ 3   (3 also waits on 2)
    const ranks = rankSteps([
      step(0),
      step(1, [0]),
      step(2, [1]),
      step(3, [0, 2]),
    ]);
    // Via the short edge 3 looks like rank 1; it cannot start until 2 is done.
    expect(ranks.get(3)).toBe(3);
  });

  it("independent steps all start at rank 0", () => {
    const ranks = rankSteps([step(0), step(1), step(2)]);
    expect([ranks.get(0), ranks.get(1), ranks.get(2)]).toEqual([0, 0, 0]);
  });

  it("survives a malformed plan with a cycle instead of hanging", () => {
    const ranks = rankSteps([step(0, [1]), step(1, [0])]);
    expect(ranks.size).toBe(2);
    for (const r of ranks.values()) expect(Number.isFinite(r)).toBe(true);
  });

  it("ignores a dependency on a step that isn't in the plan", () => {
    const ranks = rankSteps([step(0, [99])]);
    expect(ranks.get(0)).toBe(0);
  });
});

describe("layout is stable so the graph can animate", () => {
  it("assigns lanes in idx order within each rank", () => {
    const g = buildGraph([step(0), step(1), step(2), step(3, [0, 1, 2])]);
    const rank0 = g.nodes.filter((n) => n.rank === 0).sort((a, b) => a.idx - b.idx);
    expect(rank0.map((n) => n.lane)).toEqual([0, 1, 2]);
  });

  it("produces the same layout twice for the same plan", () => {
    const steps = [step(0), step(1, [0]), step(2, [0]), step(3, [1, 2])];
    expect(buildGraph(steps)).toEqual(buildGraph(steps));
  });

  it("reports how wide the plan gets at its busiest", () => {
    const g = buildGraph([step(0), step(1), step(2), step(3, [0, 1, 2])]);
    expect(g.width).toBe(3);
    expect(g.ranks).toBe(2);
  });

  it("handles a mission with no steps at all", () => {
    const g = buildGraph([]);
    expect(g).toEqual({ nodes: [], edges: [], ranks: 0, width: 0 });
    expect(describeShape(g)).toBe("no steps yet.");
  });
});

describe("edges record whether work actually flowed", () => {
  it("marks an edge as flowed only once the upstream step finished", () => {
    const g = buildGraph([
      step(0, [], { state: "completed" }),
      step(1, [], { state: "running" }),
      step(2, [0, 1]),
    ]);
    const from0 = g.edges.find((e) => e.from === 0 && e.to === 2)!;
    const from1 = g.edges.find((e) => e.from === 1 && e.to === 2)!;
    expect(from0.flowed).toBe(true);
    expect(from1.flowed).toBe(false);
  });

  it("a skipped step still counts as finished — the work moved past it", () => {
    const g = buildGraph([step(0, [], { state: "skipped" }), step(1, [0])]);
    expect(g.edges[0].flowed).toBe(true);
    expect(g.nodes.find((n) => n.idx === 1)!.unblocked).toBe(true);
  });
});

describe("what can start right now", () => {
  it("is every unblocked, unstarted step — not just one", () => {
    const g = buildGraph([
      step(0, [], { state: "completed" }),
      step(1, [0]),
      step(2, [0]),
      step(3, [1]),
    ]);
    expect(readyNow(g).map((n) => n.idx)).toEqual([1, 2]);
  });

  it("excludes steps still waiting on unfinished work", () => {
    const g = buildGraph([step(0, [], { state: "running" }), step(1, [0])]);
    expect(readyNow(g)).toEqual([]);
  });

  it("excludes steps that are already running", () => {
    const g = buildGraph([step(0, [], { state: "running" })]);
    expect(readyNow(g)).toEqual([]);
  });
});

describe("the critical path is what actually sets the duration", () => {
  it("follows the longest chain, not the widest branch", () => {
    //  0 → 1 → 2 → 4
    //  3 ────────→ 4
    const g = buildGraph([step(0), step(1, [0]), step(2, [1]), step(3), step(4, [2, 3])]);
    expect(criticalPath(g)).toEqual([0, 1, 2, 4]);
  });

  it("is the single step when there is only one", () => {
    expect(criticalPath(buildGraph([step(0)]))).toEqual([0]);
  });
});

describe("the shape is described the way it would be said out loud", () => {
  it("distinguishes a sequence from a fan-out", () => {
    const serial = buildGraph([step(0), step(1, [0]), step(2, [1])]);
    expect(describeShape(serial)).toBe("3 steps, one after another.");

    const parallel = buildGraph([step(0), step(1), step(2), step(3, [0, 1, 2])]);
    expect(describeShape(parallel)).toMatch(/up to 3 at once/);
  });

  it("says 'one step' rather than '1 steps'", () => {
    expect(describeShape(buildGraph([step(0)]))).toBe("one step.");
  });
});
