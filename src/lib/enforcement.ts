import { getUserPlan } from "./billing";
import { plannerModel, type PlannerTier } from "./agent/provider";
import { PLANS } from "./plans";
import { logInfo } from "./log";

/** Effective action limit for a user, resolved from their plan (fail-closed). */
export async function effectiveActionLimit(userId: string): Promise<number> {
  const { plan } = await getUserPlan(userId);
  return plan.actionLimit;
}

/** Plan-aware copy shown when the action limit is reached. */
export function usageLimitMessage(planId: string): string {
  if (planId === "free") {
    return "you've used your 25 actions this month. pro is $29/mo for 1,000.";
  }
  if (planId === "pro") {
    return "you've hit this month's 1,000 actions. max raises the ceiling to 10,000.";
  }
  return "you've hit this month's 10,000 actions. reach out and we'll raise your ceiling.";
}

const TIER3_HINT = /(delete|remove permanently|refund|payment|\bpay\b|wire|transfer)/i;

/**
 * Server-side routing. Only the max plan may reach the premium planner, and
 * only for commands that look complex (tier-3 categories or plausibly
 * multi-step). free/pro always use the default fast planner. Model ids are
 * config (resolved in ./agent/provider); the decision is logged per call by
 * tier label, never the raw model id.
 */
export function chooseModel(planId: string, command: string, userId: string): string {
  const plan = PLANS[planId as keyof typeof PLANS] ?? PLANS.free;
  const complex = TIER3_HINT.test(command) || command.length > 240 || /\band\b/i.test(command);
  const tier: PlannerTier = plan.strongerModel && complex ? "premium" : "default";
  logInfo("model_routing", { userId, plan: plan.id, complex, tier });
  return plannerModel(tier);
}
