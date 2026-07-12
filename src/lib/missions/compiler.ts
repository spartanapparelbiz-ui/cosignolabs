import type { CapabilityManifest } from "./capabilities";
import { buildCapabilityManifest } from "./capabilities";
import { validatePlan, type CompiledPlan, type ValidationResult } from "./validate";

/**
 * The Universal Mission Compiler. It turns an open-ended goal into a
 * VALIDATED, executable plan that references only tools that actually exist
 * in the capability manifest. It never executes anything — it emits a plan
 * the mission engine instantiates and runs through the same durable, gated
 * machinery as templates.
 *
 * The compiler is deterministic and capability-bound by construction: it maps
 * a goal to a shape, then builds that shape from the manifest (choosing live
 * vs sandbox tools and labeling the choice). A planner LLM, when configured,
 * refines the normalized goal and questions — but it can never introduce a
 * tool the manifest doesn't list, because the built steps come from the
 * manifest, not from free-form model output.
 */

export type GoalShape = "meeting_prep" | "product_compare" | "research" | "unsupported";

export interface CompileResult {
  understood: {
    normalizedGoal: string;
    willDo: string[];
    boundary: string;
  };
  plan: CompiledPlan;
  validation: ValidationResult;
  /** True when the plan can't be run as-is (unsupported goal / unrepairable). */
  blocked: boolean;
  shape: GoalShape;
}

function classify(goal: string): GoalShape {
  const g = goal.toLowerCase();
  if (/\b(meeting|standup|sync|call|1:1|one-on-one)\b/.test(g) && /\b(prepare|prep|brief|ready)\b/.test(g)) {
    return "meeting_prep";
  }
  if (/\b(compare|comparison|best|cheapest|vs\.?|versus|shop|buy|purchase|price)\b/.test(g)) {
    return "product_compare";
  }
  if (/\b(research|find|review|check|look up|investigate|analy[sz]e|gather)\b/.test(g)) {
    return "research";
  }
  // Money movement / publishing with no supported connection → unsupported.
  if (/\b(pay|send money|wire|transfer|invest|trade|publish|post to)\b/.test(g)) {
    return "unsupported";
  }
  return "research"; // default to a safe read-only research shape
}

function meetingPrepPlan(goal: string): CompiledPlan {
  return {
    normalizedGoal: goal,
    successCriteria: ["a meeting brief and agenda exist", "a follow-up is drafted (not sent)"],
    assumptions: ["uses connected Google apps when available, otherwise a labeled sandbox"],
    questions: [],
    steps: [
      { idx: 0, purpose: "find the relevant upcoming calendar event", operator: "calendar", tool: "calendar.find_event", dependsOn: [] },
      { idx: 1, purpose: "search Gmail for related conversations", operator: "communication", tool: "gmail.search_related", dependsOn: [0] },
      { idx: 2, purpose: "search Drive for related files", operator: "files", tool: "drive.search_files", dependsOn: [0] },
      { idx: 3, purpose: "extract commitments, decisions, and open questions", operator: "research", tool: "analyze.extract", dependsOn: [1, 2] },
      { idx: 4, purpose: "build the meeting brief", operator: "files", tool: "deliverable.brief", dependsOn: [3] },
      { idx: 5, purpose: "draft the agenda", operator: "files", tool: "deliverable.agenda", dependsOn: [3] },
      { idx: 6, purpose: "write the mission receipt", operator: "chief", tool: "mission.receipt", dependsOn: [] },
    ],
    expectedDeliverables: ["meeting brief", "agenda", "follow-up draft"],
    approvalCheckpoints: ["sending the follow-up email requires your approval"],
    verificationRequirements: ["approval.offer_send: confirm the message appears in Sent Mail"],
    riskSummary: "read-only research and drafts; the only consequential step (sending) is approval-gated.",
    unsupported: [],
  };
}

function productComparePlan(goal: string, manifest: CapabilityManifest): CompiledPlan {
  const browserLive = manifest.browser.live;
  const assumptions = [
    browserLive
      ? "researches live public product pages for current prices"
      : "no live browser provider is configured — research runs in a clearly-labeled sandbox with example prices",
  ];
  return {
    normalizedGoal: goal,
    successCriteria: [
      "at least two options are compared on price, specs, availability, and returns",
      "a recommendation is made against the user's priority",
      "a purchase is prepared but never completed without approval",
    ],
    assumptions,
    questions: [
      {
        question: "Which country should I use for current prices?",
        why: "prices and availability differ by region.",
        options: ["United States", "United Kingdom", "Canada"],
        recommended: "United States",
        blocking: false,
        affectsSteps: [0, 1],
      },
      {
        question: "Is battery life or gaming performance more important?",
        why: "it changes which model I recommend.",
        options: ["battery life", "gaming performance", "a balance"],
        recommended: "a balance",
        blocking: false,
        affectsSteps: [1, 2],
      },
    ],
    steps: [
      { idx: 0, purpose: "research current options through the browser", operator: "browser", tool: "browser.research", dependsOn: [] },
      { idx: 1, purpose: "compare the options and pick a recommendation", operator: "files", tool: "deliverable.comparison", dependsOn: [0] },
      { idx: 2, purpose: "prepare the purchase for your approval (no payment is made)", operator: "browser", tool: "browser.prepare_purchase", dependsOn: [1] },
      { idx: 3, purpose: "write the mission receipt", operator: "chief", tool: "mission.receipt", dependsOn: [] },
    ],
    expectedDeliverables: ["comparison table with recommendation"],
    approvalCheckpoints: ["preparing the purchase requires your approval"],
    verificationRequirements: ["browser.prepare_purchase: confirm the cart contents (no payment — no payment connection)"],
    riskSummary: browserLive
      ? "browser research is read-only; preparing the purchase is approval-gated and never completes payment."
      : "sandbox research (labeled); preparing the purchase is approval-gated and never completes payment.",
    unsupported: manifest.connections.some((c) => c.provider_key.includes("stripe"))
      ? []
      : ["completing payment (no supported payment connection is available — cosigno prepares the cart only)"],
  };
}

function researchPlan(goal: string, manifest: CapabilityManifest): CompiledPlan {
  const browserLive = manifest.browser.live;
  return {
    normalizedGoal: goal,
    successCriteria: ["relevant public sources are gathered and compared", "a cited findings deliverable exists"],
    assumptions: [
      browserLive ? "researches live public pages" : "no live browser provider — research runs in a clearly-labeled sandbox",
    ],
    questions: [],
    steps: [
      { idx: 0, purpose: "research public pages through the browser", operator: "browser", tool: "browser.research", dependsOn: [] },
      { idx: 1, purpose: "compile the findings into a cited deliverable", operator: "files", tool: "deliverable.comparison", dependsOn: [0] },
      { idx: 2, purpose: "write the mission receipt", operator: "chief", tool: "mission.receipt", dependsOn: [] },
    ],
    expectedDeliverables: ["findings deliverable with sources"],
    approvalCheckpoints: [],
    verificationRequirements: [],
    riskSummary: "entirely read-only research — no external changes are made.",
    unsupported: [],
  };
}

function unsupportedPlan(goal: string): CompiledPlan {
  return {
    normalizedGoal: goal,
    successCriteria: [],
    assumptions: [],
    questions: [],
    steps: [],
    expectedDeliverables: [],
    approvalCheckpoints: [],
    verificationRequirements: [],
    riskSummary: "this goal needs a capability cosigno doesn't have yet.",
    unsupported: [
      "this goal requires moving money or publishing through a connection that isn't available — cosigno can research and prepare, but can't complete it.",
    ],
  };
}

/**
 * One repair pass, driven by the validation report: drop steps with unknown
 * tools or forbidden operators, add a generic approval checkpoint if a
 * consequential step lacks one, and label a live+sandbox mix. Never invents
 * capability — it only removes what can't run and annotates honestly.
 */
function repair(plan: CompiledPlan, result: ValidationResult, manifest: CapabilityManifest): CompiledPlan {
  const drop = new Set<number>();
  for (const issue of result.issues) {
    if ((issue.code === "unknown_tool" || issue.code === "operator_forbidden") && issue.stepIdx !== undefined) {
      drop.add(issue.stepIdx);
    }
  }
  let steps = plan.steps.filter((s) => !drop.has(s.idx));
  // Prune dangling dependencies on dropped steps.
  const kept = new Set(steps.map((s) => s.idx));
  steps = steps.map((s) => ({ ...s, dependsOn: s.dependsOn.filter((d) => kept.has(d)) }));

  const next: CompiledPlan = { ...plan, steps };
  if (result.issues.some((i) => i.code === "missing_approval_gate") && next.approvalCheckpoints.length === 0) {
    next.approvalCheckpoints = ["a consequential step requires your approval before it runs"];
  }
  if (result.issues.some((i) => i.code === "mixed_data")) {
    next.assumptions = [...next.assumptions, "this plan mixes live and sandbox steps — each step is labeled with its source."];
  }
  if (result.issues.some((i) => i.code === "unverifiable_claim")) {
    next.unsupported = [...next.unsupported, "some steps can't be automatically verified — those outcomes are shown as unverified."];
  }
  void manifest;
  return next;
}

function buildPlan(shape: GoalShape, goal: string, manifest: CapabilityManifest): CompiledPlan {
  switch (shape) {
    case "meeting_prep":
      return meetingPrepPlan(goal);
    case "product_compare":
      return productComparePlan(goal, manifest);
    case "research":
      return researchPlan(goal, manifest);
    default:
      return unsupportedPlan(goal);
  }
}

function willDoFrom(plan: CompiledPlan): string[] {
  return plan.steps
    .filter((s) => s.tool !== "mission.receipt")
    .map((s) => s.purpose);
}

export async function compileMission(userId: string, goal: string): Promise<CompileResult> {
  const manifest = await buildCapabilityManifest(userId);
  const shape = classify(goal);
  let plan = buildPlan(shape, goal, manifest);

  if (shape === "unsupported") {
    return {
      understood: {
        normalizedGoal: goal,
        willDo: [],
        boundary: plan.unsupported[0] ?? "this goal isn't supported yet.",
      },
      plan,
      validation: { ok: false, issues: [{ code: "empty_plan", detail: "no executable steps." }] },
      blocked: true,
      shape,
    };
  }

  let validation = validatePlan(plan, manifest);
  if (!validation.ok) {
    plan = repair(plan, validation, manifest);
    validation = validatePlan(plan, manifest);
  }

  const boundary =
    plan.approvalCheckpoints[0] ??
    (plan.unsupported[0] ? `boundary: ${plan.unsupported[0]}` : "cosigno will research and prepare — nothing consequential runs without your approval.");

  return {
    understood: { normalizedGoal: plan.normalizedGoal, willDo: willDoFrom(plan), boundary },
    plan,
    validation,
    blocked: !validation.ok || plan.steps.length === 0,
    shape,
  };
}
