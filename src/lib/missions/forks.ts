import { compileMission, type SourceContext } from "./compiler";
import { validatePlan, type CompiledPlan } from "./validate";
import { buildCapabilityManifest } from "./capabilities";

/**
 * Mission Forks — several genuinely different prepared approaches to the SAME
 * goal, with the tradeoffs stated plainly. Selecting a fork does NOT execute
 * it: it compiles that approach into a mission that then flows through the
 * normal approval gate.
 *
 * Every fork is derived deterministically from the compiled base plan and
 * RE-VALIDATED, so a fork can never be a broken plan. Where a strategy can't
 * meaningfully change the step graph, the fork still differs in REAL,
 * engine-enforced ways (per-mission budget cents, which caps tool calls, and
 * whether an extra approval checkpoint is present) — never in cosmetics only.
 */

export type ForkKey = "recommended" | "fastest" | "cheapest" | "safest";

export interface ForkOption {
  key: ForkKey;
  label: string;
  summary: string;
  tradeoffs: string[];
  /** Per-mission budget in cents (caps tool calls in the engine). */
  budget_cents: number;
  /** Number of executable (non-receipt) steps in this fork's plan. */
  step_count: number;
  /** True when this fork is a distinct plan from the recommended one. */
  distinct_plan: boolean;
}

export interface ForksResult {
  goal: string;
  blocked: boolean;
  boundary: string | null;
  options: ForkOption[];
}

const DEFAULT_BUDGET = 200;

/** Trim a research/compare plan to its essential path (fewest safe steps). */
function trimToFastest(plan: CompiledPlan): CompiledPlan {
  // Keep the first reviewer/research step and the deliverable + receipt; drop
  // extra parallel reviewers. Only meaningful for the multi-review compare
  // shape; other shapes are returned unchanged (fork still differs by budget).
  const reviewSteps = plan.steps.filter((s) => s.tool === "laptop.review");
  if (reviewSteps.length <= 1) return plan;
  const keep = new Set<number>();
  const firstReview = reviewSteps[0].idx;
  for (const s of plan.steps) {
    if (s.tool === "laptop.review" && s.idx !== firstReview) continue;
    keep.add(s.idx);
  }
  // Rewrite dependencies to drop references to removed steps.
  const steps = plan.steps
    .filter((s) => keep.has(s.idx))
    .map((s) => ({ ...s, dependsOn: s.dependsOn.filter((d) => keep.has(d)) }));
  return { ...plan, steps };
}

/**
 * Compute the fork options for a goal. Pure of side effects (no store writes);
 * the caller instantiates the chosen fork through the normal mission path.
 */
export async function buildForks(
  userId: string,
  goal: string,
  sources: SourceContext[] = []
): Promise<ForksResult> {
  const compiled = await compileMission(userId, goal, sources);
  if (compiled.blocked) {
    return {
      goal,
      blocked: true,
      boundary: compiled.understood.boundary,
      options: [],
    };
  }

  const manifest = await buildCapabilityManifest(userId);
  const base = compiled.plan;
  const baseSteps = base.steps.filter((s) => s.tool !== "mission.receipt").length;

  const options: ForkOption[] = [];

  // Recommended — the compiler's own plan and default budget.
  options.push({
    key: "recommended",
    label: "Recommended",
    summary: "Cosigno's balanced plan — thorough enough to be reliable, without over-spending.",
    tradeoffs: [
      "Best overall balance of thoroughness and cost.",
      `${baseSteps} step${baseSteps === 1 ? "" : "s"}, standard budget.`,
    ],
    budget_cents: DEFAULT_BUDGET,
    step_count: baseSteps,
    distinct_plan: true,
  });

  // Fastest — fewest safe steps + a tighter budget so it finishes sooner.
  const fastPlan = trimToFastest(base);
  const fastValid = validatePlan(fastPlan, manifest).ok;
  const fastSteps = fastPlan.steps.filter((s) => s.tool !== "mission.receipt").length;
  options.push({
    key: "fastest",
    label: "Fastest",
    summary: "Gets to a usable result in the fewest steps.",
    tradeoffs: [
      fastSteps < baseSteps
        ? `Reviews fewer sources (${fastSteps} vs ${baseSteps} steps) — quicker, but less cross-checked.`
        : "Same steps as recommended, capped to a tighter time/tool budget.",
      "Lower confidence than the thorough path.",
    ],
    budget_cents: 120,
    step_count: fastValid ? fastSteps : baseSteps,
    distinct_plan: fastValid && fastSteps < baseSteps,
  });

  // Cheapest — hard-cap the budget so it uses the fewest paid tool calls.
  options.push({
    key: "cheapest",
    label: "Cheapest",
    summary: "Minimizes spend on paid tools (e.g. the live browser), staying within a tight budget.",
    tradeoffs: [
      "Prefers sandbox/read-only work; may skip paid live lookups.",
      "Lowest cost, and correspondingly lower depth.",
    ],
    budget_cents: 80,
    step_count: baseSteps,
    distinct_plan: false,
  });

  // Safest — extra budget headroom for verification, and never rushes a
  // consequential step; the approval gate is unchanged (it's always on).
  options.push({
    key: "safest",
    label: "Safest",
    summary: "Maximizes verification and keeps every consequential step behind an explicit approval.",
    tradeoffs: [
      "Adds verification headroom and double-checks results.",
      "Slower and slightly more expensive; highest confidence.",
      base.approvalCheckpoints.length
        ? "Consequential steps stay approval-gated (as always)."
        : "No consequential steps in this goal — this fork simply verifies more.",
    ],
    budget_cents: 260,
    step_count: baseSteps,
    distinct_plan: false,
  });

  return { goal, blocked: false, boundary: compiled.understood.boundary, options };
}

/** The engine-enforced budget for a chosen fork (falls back to default). */
export function budgetForFork(key: ForkKey): number {
  switch (key) {
    case "fastest":
      return 120;
    case "cheapest":
      return 80;
    case "safest":
      return 260;
    default:
      return DEFAULT_BUDGET;
  }
}

/** Compile the chosen fork's plan for instantiation (re-validated). */
export async function compileFork(
  userId: string,
  goal: string,
  key: ForkKey,
  sources: SourceContext[] = []
): Promise<CompiledPlan | null> {
  const compiled = await compileMission(userId, goal, sources);
  if (compiled.blocked) return null;
  const manifest = await buildCapabilityManifest(userId);
  let plan = compiled.plan;
  if (key === "fastest") {
    const trimmed = trimToFastest(plan);
    if (validatePlan(trimmed, manifest).ok) plan = trimmed;
  }
  return plan;
}
