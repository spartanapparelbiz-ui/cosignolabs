import type { CapabilityManifest } from "./capabilities";
import { operatorAllows } from "./operators";

/**
 * Plan validation — the gate every compiled plan passes before it can become
 * a real mission. It proves, against the capability manifest, that the plan
 * is executable and honest: real tools, permitted operators, an acyclic
 * dependency graph, an approval gate on every consequential step, a
 * verification method (or an explicit "unverified" label) on completion
 * claims, and no silent sandbox/live mixing. A plan that fails is never run.
 */

export interface CompiledStep {
  idx: number;
  purpose: string;
  operator: string;
  tool: string;
  dependsOn: number[];
}

export interface CompiledPlan {
  normalizedGoal: string;
  successCriteria: string[];
  assumptions: string[];
  questions: {
    question: string;
    why: string;
    options: string[];
    recommended?: string;
    blocking: boolean;
    affectsSteps: number[];
  }[];
  steps: CompiledStep[];
  expectedDeliverables: string[];
  approvalCheckpoints: string[];
  verificationRequirements: string[];
  riskSummary: string;
  unsupported: string[];
}

export interface ValidationIssue {
  code:
    | "unknown_tool"
    | "operator_forbidden"
    | "cycle"
    | "bad_dependency"
    | "missing_approval_gate"
    | "unverifiable_claim"
    | "connection_unavailable"
    | "mixed_data"
    | "empty_plan";
  detail: string;
  stepIdx?: number;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

function hasCycle(steps: CompiledStep[]): boolean {
  const byIdx = new Map(steps.map((s) => [s.idx, s]));
  const state = new Map<number, 0 | 1 | 2>(); // 0=unseen,1=visiting,2=done
  function visit(idx: number): boolean {
    const s = byIdx.get(idx);
    if (!s) return false;
    const st = state.get(idx) ?? 0;
    if (st === 1) return true; // back-edge → cycle
    if (st === 2) return false;
    state.set(idx, 1);
    for (const d of s.dependsOn) {
      if (visit(d)) return true;
    }
    state.set(idx, 2);
    return false;
  }
  return steps.some((s) => visit(s.idx));
}

export function validatePlan(plan: CompiledPlan, manifest: CapabilityManifest): ValidationResult {
  const issues: ValidationIssue[] = [];
  const toolById = new Map(manifest.tools.map((t) => [t.id, t]));

  if (plan.steps.length === 0) {
    issues.push({ code: "empty_plan", detail: "The plan has no executable steps." });
  }

  const idxs = new Set(plan.steps.map((s) => s.idx));
  let sawLive = false;
  let sawSandbox = false;

  for (const step of plan.steps) {
    const tool = toolById.get(step.tool);
    if (!tool) {
      issues.push({ code: "unknown_tool", detail: `step ${step.idx + 1} uses “${step.tool}”, which isn't a registered tool.`, stepIdx: step.idx });
      continue;
    }
    if (!operatorAllows(step.operator, step.tool)) {
      issues.push({ code: "operator_forbidden", detail: `the ${step.operator} operator can't run ${step.tool}.`, stepIdx: step.idx });
    }
    for (const d of step.dependsOn) {
      if (!idxs.has(d)) {
        issues.push({ code: "bad_dependency", detail: `step ${step.idx + 1} depends on step ${d + 1}, which doesn't exist.`, stepIdx: step.idx });
      }
    }
    // A consequential tool MUST be covered by an approval checkpoint.
    if (tool.consequential && plan.approvalCheckpoints.length === 0) {
      issues.push({ code: "missing_approval_gate", detail: `step ${step.idx + 1} (${step.tool}) is consequential but the plan declares no approval checkpoint.`, stepIdx: step.idx });
    }
    // A consequential tool that claims completion must be verifiable OR the
    // plan must list it as an unverified/uncertain outcome.
    if (tool.consequential && !tool.verifiable) {
      const labeled = plan.verificationRequirements.some((v) => v.toLowerCase().includes(step.tool)) ||
        plan.unsupported.some((u) => u.toLowerCase().includes(step.tool));
      if (!labeled) {
        issues.push({ code: "unverifiable_claim", detail: `step ${step.idx + 1} (${step.tool}) can't be verified and isn't labeled unverified.`, stepIdx: step.idx });
      }
    }
    // Data-source honesty: track whether the plan mixes live and sandbox.
    if (tool.live) sawLive = true;
    else sawSandbox = true;
  }

  if (hasCycle(plan.steps)) {
    issues.push({ code: "cycle", detail: "The plan's steps form a dependency cycle." });
  }

  // Live + sandbox in the same plan is allowed ONLY when the plan explicitly
  // acknowledges it (so the UI can label each step); otherwise it's a silent mix.
  if (sawLive && sawSandbox) {
    const acknowledged =
      plan.assumptions.some((a) => /sandbox/i.test(a)) || plan.unsupported.some((u) => /sandbox|live/i.test(u));
    if (!acknowledged) {
      issues.push({ code: "mixed_data", detail: "The plan mixes live and sandbox steps without labeling it." });
    }
  }

  return { ok: issues.length === 0, issues };
}
