import { callPlanner, plannerConfigured } from "../agent/provider";
import { modelFor } from "../ai/routing";
import { logInfo } from "../log";
import type { CapabilityManifest, ToolCapability } from "./capabilities";
import { OPERATOR_PROFILES } from "./operators";
import { validatePlan, type CompiledPlan, type CompiledStep } from "./validate";

/**
 * THE ADAPTIVE PLANNER — how cosigno takes on work nobody wrote a recipe for.
 *
 * The deterministic compiler maps a goal to one of a handful of known shapes.
 * That is fast, free, and exactly right for the shapes it knows — and useless
 * for everything else, which is most of what a person actually asks for. A
 * request to compare apartments used to land in the shape built for laptops,
 * because a regex saw "compare" and stopped thinking.
 *
 * This module is the other half: it hands the goal AND the capability manifest
 * to the planner model and lets it assemble a plan out of the tools that
 * genuinely exist right now. That is the whole differentiator — no engineer
 * has to add a shape per domain or a skill per website.
 *
 * Adaptive does NOT mean unbounded. Every guarantee the deterministic path
 * gives is preserved here, structurally rather than by trusting the model:
 *
 *  · TOOLS ARE A CLOSED SET. The model may only name tool ids from the
 *    manifest; anything else is dropped before validation and rejected by it.
 *  · THE MODEL NEVER PICKS AN OPERATOR. It picks a tool; the operator is
 *    looked up from the manifest. A step therefore cannot be assigned an
 *    operator that isn't permitted to run its own tool.
 *  · APPROVAL GATES ARE NOT THE MODEL'S CALL. Whether a tool is consequential
 *    is read from the manifest, and the checkpoint + verification lines are
 *    written from that fact — a model that "forgets" the gate cannot remove it.
 *  · THE PLAN IS VALIDATED, THEN RE-VALIDATED. A plan that still doesn't pass
 *    is discarded entirely and the caller falls back to the deterministic
 *    shape. A bad model answer degrades the plan; it can never weaken a rule.
 *  · NOTHING EXECUTES HERE. The output is a plan. Every consequential step
 *    still goes through the one approval door at run time.
 *
 * Prompt-injection posture: the planner is shown the user's goal and the NAMES
 * and read-status of any attached sources — never their extracted content. A
 * poisoned web page or PDF therefore has no channel into planning at all. The
 * content still reaches the tools that read it at execution time, where it is
 * carried as data by the untrusted-content layer.
 */

/** Hard ceiling on plan size — a mission is bounded work, not an open loop. */
const MAX_STEPS = 14;
/** Below this, the model gave us nothing worth running. */
const MIN_STEPS = 1;

export interface AdaptivePlanRequest {
  userId: string;
  goal: string;
  manifest: CapabilityManifest;
  /** Billing plan id, for the AI cost ledger. */
  plan: string;
  /** Source descriptions only — names and read-status, never content. */
  sourceNotes?: string[];
  missionId?: string | null;
  sessionId?: string | null;
}

/** The tool ids a step may name, and what each one actually does. */
function toolCatalog(manifest: CapabilityManifest): string {
  const byOperator = new Map<string, ToolCapability[]>();
  for (const t of manifest.tools) {
    const list = byOperator.get(t.operator) ?? [];
    list.push(t);
    byOperator.set(t.operator, list);
  }
  const lines: string[] = [];
  for (const [operator, tools] of byOperator) {
    const profile = OPERATOR_PROFILES[operator];
    lines.push(`\n${profile ? profile.name : operator} — ${profile?.responsibility ?? ""}`);
    for (const t of tools) {
      const flags = [
        t.consequential ? "CONSEQUENTIAL (needs approval)" : "read-only",
        t.live ? "live" : "sandbox (labeled example data)",
      ].join(", ");
      lines.push(`  ${t.id} — ${t.summary} [${flags}]`);
    }
  }
  return lines.join("\n");
}

function plannerSystem(manifest: CapabilityManifest): string {
  const connected = manifest.connections.filter((c) => c.healthy).map((c) => c.name);
  return [
    "You plan missions for cosigno, an agent that completes real work on a person's behalf.",
    "You are given a goal and the EXACT set of tools that exist right now. Produce an ordered plan that reaches the goal using only those tools.",
    "",
    "TOOLS AVAILABLE — you may not name any tool outside this list:",
    toolCatalog(manifest),
    "",
    connected.length > 0
      ? `Connected accounts: ${connected.join(", ")}.`
      : "No accounts are connected. Tools marked sandbox will return clearly-labeled example data, not real data.",
    manifest.browser.live
      ? "The browser is live — browser tools open real public pages."
      : "The browser is NOT live — browser tools return clearly-labeled example pages.",
    "",
    "RULES",
    `1. Between ${MIN_STEPS} and ${MAX_STEPS - 1} steps, plus a final "mission.receipt" step. Fewer, better steps beat many shallow ones.`,
    "2. Every step names one tool id from the list above, verbatim.",
    "3. depends_on lists the step numbers whose output this step needs. Steps that do not depend on each other WILL RUN AT THE SAME TIME, so leave them independent when they genuinely are — that is how the work finishes faster.",
    "4. Gather before you judge: research steps first, then a step that compares or extracts, then a step that writes the deliverable.",
    "5. Prefer a tool backed by a connected account or a live browser over a sandbox tool when both could serve.",
    "6. A consequential tool changes something outside cosigno. Use one only when the goal genuinely requires that change, and never as a way to 'finish' a research task.",
    "7. Never claim the plan will do something no listed tool can do. Put it in `unsupported` instead, in plain words.",
    "8. `purpose` is shown to the user while the step runs. Write it as a short, concrete phrase in lowercase — 'compare total monthly cost', not 'Step 3: Analysis'.",
    "",
    "HONESTY",
    "Cosigno never reports work it did not do. If the goal cannot be fully reached with these tools, plan the part that can be, and say plainly in `unsupported` what is out of reach and why.",
  ].join("\n");
}

const PLAN_TOOL = {
  name: "emit_plan",
  description: "Emit the validated mission plan.",
  input_schema: {
    type: "object",
    properties: {
      normalized_goal: {
        type: "string",
        description: "The goal restated in one clear sentence, in the user's own terms.",
      },
      steps: {
        type: "array",
        description: "The ordered plan. Do not include the mission receipt — it is appended.",
        items: {
          type: "object",
          properties: {
            purpose: { type: "string", description: "Short lowercase phrase shown to the user while this step runs." },
            tool: { type: "string", description: "A tool id, verbatim from the available list." },
            depends_on: {
              type: "array",
              items: { type: "number" },
              description: "Step numbers (0-based) this step needs the output of. Empty when independent.",
            },
          },
          required: ["purpose", "tool", "depends_on"],
        },
      },
      success_criteria: {
        type: "array",
        items: { type: "string" },
        description: "What must be true for this mission to count as done.",
      },
      assumptions: {
        type: "array",
        items: { type: "string" },
        description: "What this plan assumes, including any sandbox/live caveat.",
      },
      expected_deliverables: {
        type: "array",
        items: { type: "string" },
        description: "What the user will have at the end.",
      },
      risk_summary: { type: "string", description: "One plain sentence on what this plan does and does not change." },
      unsupported: {
        type: "array",
        items: { type: "string" },
        description: "Parts of the goal no available tool can reach, in plain words.",
      },
    },
    required: [
      "normalized_goal",
      "steps",
      "success_criteria",
      "assumptions",
      "expected_deliverables",
      "risk_summary",
      "unsupported",
    ],
  },
} as const;

/* ------------------------------------------------------------------ parsing */

function asStringArray(v: unknown, max = 8): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

interface RawStep {
  purpose?: unknown;
  tool?: unknown;
  depends_on?: unknown;
}

/**
 * Turn the model's answer into a CompiledPlan, dropping anything that isn't
 * real. Every value that carries a permission consequence — the operator, the
 * consequential flag, the verification requirement — is derived from the
 * manifest here rather than read from the model's output.
 */
function toPlan(
  raw: Record<string, unknown>,
  goal: string,
  manifest: CapabilityManifest
): CompiledPlan | null {
  const toolById = new Map(manifest.tools.map((t) => [t.id, t]));

  const rawSteps = Array.isArray(raw.steps) ? (raw.steps as RawStep[]) : [];
  // Keep only steps naming a tool that actually exists, and never the receipt
  // (it is appended last so it can't be scheduled early or omitted).
  const kept: { purpose: string; tool: ToolCapability; dependsOn: number[] }[] = [];
  const oldToNew = new Map<number, number>();
  rawSteps.forEach((s, oldIdx) => {
    if (kept.length >= MAX_STEPS - 1) return;
    const id = typeof s.tool === "string" ? s.tool.trim() : "";
    const tool = toolById.get(id);
    if (!tool || id === "mission.receipt") return;
    const purpose = typeof s.purpose === "string" && s.purpose.trim() ? s.purpose.trim().slice(0, 120) : tool.summary;
    const dependsOn = Array.isArray(s.depends_on)
      ? s.depends_on.filter((d): d is number => typeof d === "number")
      : [];
    oldToNew.set(oldIdx, kept.length);
    kept.push({ purpose, tool, dependsOn });
  });

  if (kept.length < MIN_STEPS) return null;

  // Renumber densely and rewrite dependencies through the index map, dropping
  // any that pointed at a step we removed or that points forward (which would
  // deadlock — a step can only ever depend on earlier work).
  const steps: CompiledStep[] = kept.map((k, idx) => ({
    idx,
    purpose: k.purpose,
    // The operator is the manifest's, never the model's.
    operator: k.tool.operator,
    tool: k.tool.id,
    dependsOn: [
      ...new Set(
        k.dependsOn
          .map((d) => oldToNew.get(d))
          .filter((d): d is number => d !== undefined && d < idx)
      ),
    ],
  }));

  // The receipt closes every mission. The engine already holds it back until
  // everything else settles, so it carries no dependencies of its own.
  steps.push({
    idx: steps.length,
    purpose: "write the mission receipt",
    operator: "chief",
    tool: "mission.receipt",
    dependsOn: [],
  });

  const consequential = steps.filter((s) => toolById.get(s.tool)?.consequential);
  const verifiable = consequential.filter((s) => toolById.get(s.tool)?.verifiable);

  // Approval + verification lines are WRITTEN FROM THE MANIFEST, not copied
  // from the model. A plan cannot end up with a consequential step and no gate
  // because the model didn't mention one.
  const approvalCheckpoints = consequential.map(
    (s) => `${s.purpose} requires your approval before it runs (${s.tool})`
  );
  const verificationRequirements = verifiable.map(
    (s) => `${s.tool}: confirm the outcome after it executes`
  );
  const unverifiable = consequential
    .filter((s) => !toolById.get(s.tool)?.verifiable)
    .map((s) => `${s.tool}: the outcome can't be automatically verified — it is reported as unverified.`);

  const sawLive = steps.some((s) => toolById.get(s.tool)?.live);
  const sawSandbox = steps.some((s) => toolById.get(s.tool) && !toolById.get(s.tool)!.live);
  const assumptions = asStringArray(raw.assumptions);
  if (sawLive && sawSandbox && !assumptions.some((a) => /sandbox/i.test(a))) {
    assumptions.push("this plan mixes live and sandbox steps — each step is labeled with its source.");
  }
  if (!sawLive && sawSandbox && !assumptions.some((a) => /sandbox/i.test(a))) {
    assumptions.push("no live provider is configured for this work — it runs in a clearly-labeled sandbox.");
  }

  const normalizedGoal =
    typeof raw.normalized_goal === "string" && raw.normalized_goal.trim()
      ? raw.normalized_goal.trim().slice(0, 300)
      : goal;

  return {
    normalizedGoal,
    successCriteria: asStringArray(raw.success_criteria),
    assumptions,
    questions: [],
    steps,
    expectedDeliverables: asStringArray(raw.expected_deliverables),
    approvalCheckpoints,
    verificationRequirements,
    riskSummary:
      typeof raw.risk_summary === "string" && raw.risk_summary.trim()
        ? raw.risk_summary.trim().slice(0, 300)
        : consequential.length > 0
          ? "this plan changes something outside cosigno — every such step waits for your approval."
          : "entirely read-only — nothing outside cosigno is changed.",
    unsupported: [...asStringArray(raw.unsupported), ...unverifiable],
  };
}

/* -------------------------------------------------------------------- entry */

/**
 * Plan a goal against the live capability manifest. Returns null whenever the
 * adaptive path can't produce a plan that passes validation — the caller then
 * uses the deterministic shape, so a planner outage or a bad answer costs
 * plan quality and never correctness.
 */
export async function planAdaptively(req: AdaptivePlanRequest): Promise<CompiledPlan | null> {
  if (!plannerConfigured()) return null;

  const userContent = [
    `GOAL: ${req.goal.trim().slice(0, 2000)}`,
    ...(req.sourceNotes && req.sourceNotes.length > 0
      ? ["", "The user attached these sources (names and read-status only):", ...req.sourceNotes.map((s) => `- ${s}`)]
      : []),
  ].join("\n");

  let result;
  try {
    result = await callPlanner({
      model: modelFor("plan"),
      maxTokens: 2000,
      system: plannerSystem(req.manifest),
      userContent,
      tool: PLAN_TOOL as unknown as { name: string; description: string; input_schema: Record<string, unknown> },
      meta: {
        userId: req.userId,
        plan: req.plan,
        task: "mission_plan",
        missionId: req.missionId ?? null,
        sessionId: req.sessionId ?? null,
      },
    });
  } catch {
    // A planner failure is not a mission failure — the deterministic shape runs.
    return null;
  }

  if (!result.toolInput) return null;

  const plan = toPlan(result.toolInput, req.goal, req.manifest);
  if (!plan) return null;

  const validation = validatePlan(plan, req.manifest);
  if (!validation.ok) {
    logInfo("adaptive_plan_rejected", {
      codes: [...new Set(validation.issues.map((i) => i.code))],
      steps: plan.steps.length,
    });
    return null;
  }

  logInfo("adaptive_plan_built", { steps: plan.steps.length, tools: plan.steps.map((s) => s.tool) });
  return plan;
}
