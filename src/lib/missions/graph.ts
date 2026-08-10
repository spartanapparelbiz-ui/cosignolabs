import type { MissionStepRecord } from "../types";

/**
 * The operator graph — a mission's plan, laid out as the dependency graph it
 * actually is.
 *
 * Every step already records `depends_on`, so the structure is real: this
 * module does not infer or invent edges, it reads them. A step with no
 * dependencies starts immediately; a step that depends on two others cannot
 * begin until both finish; two steps in the same rank genuinely run in
 * parallel. That is why the picture is worth drawing at all — a numbered list
 * flattens "these three happen at once" and "these three happen in order"
 * into the same shape, and those are completely different plans.
 *
 * Pure and total. Layout is deterministic (same plan → same picture, every
 * render), which is what lets the graph animate between states instead of
 * reshuffling itself every time a step completes.
 */

export type StepState = MissionStepRecord["state"];

export interface GraphNode {
  idx: number;
  purpose: string;
  operator: string;
  tool: string;
  state: StepState;
  /** Column: how many dependency hops from the start. */
  rank: number;
  /** Row within the rank. */
  lane: number;
  /** Indices this step waits on. */
  dependsOn: number[];
  /** True when every dependency is finished and this can run now. */
  unblocked: boolean;
  /** This step's approval, when it has one. */
  actionId: string | null;
}

export interface GraphEdge {
  from: number;
  to: number;
  /** True when the upstream step is done, so work has actually flowed here. */
  flowed: boolean;
}

export interface OperatorGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Number of columns. */
  ranks: number;
  /** Widest rank — how many steps run in parallel at the busiest moment. */
  width: number;
}

const FINISHED: ReadonlySet<StepState> = new Set(["completed", "skipped"]);

/**
 * Rank every step by its longest dependency chain.
 *
 * Longest, not shortest: a step that waits on both a one-hop and a three-hop
 * dependency cannot start until the three-hop chain finishes, so drawing it at
 * rank 1 would show it starting earlier than it can. The graph's whole claim
 * is "this is when things can happen", and the shortest path quietly breaks it.
 *
 * Cycles cannot come from a validated plan, but a malformed one must not hang
 * the page — the walk is depth-bounded and a step whose chain exceeds the
 * bound is placed at the deepest rank reached rather than recursed forever.
 */
export function rankSteps(steps: MissionStepRecord[]): Map<number, number> {
  const byIdx = new Map(steps.map((s) => [s.idx, s]));
  const ranks = new Map<number, number>();
  const visiting = new Set<number>();

  function rankOf(idx: number, depth: number): number {
    const cached = ranks.get(idx);
    if (cached !== undefined) return cached;
    // Depth bound: a plan with a cycle (or one deeper than any real mission)
    // resolves to a finite rank instead of blowing the stack.
    if (depth > steps.length || visiting.has(idx)) return 0;

    const step = byIdx.get(idx);
    if (!step || step.depends_on.length === 0) {
      ranks.set(idx, 0);
      return 0;
    }

    visiting.add(idx);
    let max = 0;
    for (const dep of step.depends_on) {
      if (!byIdx.has(dep)) continue; // a dependency on a step that isn't there
      max = Math.max(max, rankOf(dep, depth + 1) + 1);
    }
    visiting.delete(idx);
    ranks.set(idx, max);
    return max;
  }

  for (const s of steps) rankOf(s.idx, 0);
  return ranks;
}

/** Build the whole graph, laid out. */
export function buildGraph(steps: MissionStepRecord[]): OperatorGraph {
  const ordered = [...steps].sort((a, b) => a.idx - b.idx);
  if (ordered.length === 0) return { nodes: [], edges: [], ranks: 0, width: 0 };

  const ranks = rankSteps(ordered);
  const doneByIdx = new Map(ordered.map((s) => [s.idx, FINISHED.has(s.state)]));

  // Lanes are assigned in idx order within each rank, so a step never jumps
  // rows between renders — the layout has to be stable for the graph to
  // animate rather than reshuffle.
  const laneCounter = new Map<number, number>();
  const nodes: GraphNode[] = ordered.map((s) => {
    const rank = ranks.get(s.idx) ?? 0;
    const lane = laneCounter.get(rank) ?? 0;
    laneCounter.set(rank, lane + 1);
    const known = s.depends_on.filter((d) => doneByIdx.has(d));
    return {
      idx: s.idx,
      purpose: s.purpose,
      operator: s.operator,
      tool: s.tool,
      state: s.state,
      rank,
      lane,
      dependsOn: s.depends_on,
      unblocked: known.every((d) => doneByIdx.get(d) === true),
      actionId: s.action_id,
    };
  });

  const edges: GraphEdge[] = [];
  for (const s of ordered) {
    for (const dep of s.depends_on) {
      if (!doneByIdx.has(dep)) continue;
      edges.push({ from: dep, to: s.idx, flowed: doneByIdx.get(dep) === true });
    }
  }

  const rankCount = Math.max(...nodes.map((n) => n.rank)) + 1;
  const width = Math.max(...[...laneCounter.values()]);
  return { nodes, edges, ranks: rankCount, width };
}

/**
 * The plan in one sentence — how many steps, and how much of it is parallel.
 *
 * Worth saying out loud because the shape of a plan is the part people
 * misjudge: "9 steps" sounds long, "9 steps, 4 of them at once" sounds fast,
 * and only one of those is what the graph actually shows.
 */
export function describeShape(graph: OperatorGraph): string {
  const n = graph.nodes.length;
  if (n === 0) return "no steps yet.";
  if (n === 1) return "one step.";
  if (graph.width <= 1) return `${n} steps, one after another.`;
  return `${n} steps in ${graph.ranks} stage${graph.ranks === 1 ? "" : "s"} — up to ${graph.width} at once.`;
}

/**
 * What can start right now: unblocked, not yet finished, not already running.
 *
 * This is the answer to "what happens next", and it is a set rather than a
 * single step precisely because the graph is not a list.
 */
export function readyNow(graph: OperatorGraph): GraphNode[] {
  return graph.nodes.filter(
    (n) => n.state === "ready" && n.unblocked
  );
}

/**
 * The critical path: the longest chain of dependencies through the plan.
 *
 * This is what actually determines how long a mission takes — parallel work
 * off to the side is free, and a delay anywhere on this chain delays
 * everything. Returned as step indices in order.
 */
export function criticalPath(graph: OperatorGraph): number[] {
  const byIdx = new Map(graph.nodes.map((n) => [n.idx, n]));
  const best = new Map<number, number[]>();

  function chain(idx: number, depth: number): number[] {
    const cached = best.get(idx);
    if (cached) return cached;
    if (depth > graph.nodes.length) return [idx];
    const node = byIdx.get(idx);
    if (!node || node.dependsOn.length === 0) {
      best.set(idx, [idx]);
      return [idx];
    }
    let longest: number[] = [];
    for (const dep of node.dependsOn) {
      if (!byIdx.has(dep)) continue;
      const c = chain(dep, depth + 1);
      if (c.length > longest.length) longest = c;
    }
    const path = [...longest, idx];
    best.set(idx, path);
    return path;
  }

  let winner: number[] = [];
  for (const n of graph.nodes) {
    const c = chain(n.idx, 0);
    if (c.length > winner.length) winner = c;
  }
  return winner;
}
