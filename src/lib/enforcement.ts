import { getUserPlan } from "./billing";
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

/** Default = Haiku; stronger = Sonnet. Env-overridable. */
export function defaultModel(): string {
  return process.env.COSIGNO_MODEL_DEFAULT || "claude-haiku-4-5-20251001";
}
export function strongModel(): string {
  return process.env.COSIGNO_MODEL_STRONG || process.env.COSIGNO_OPERATOR_MODEL || "claude-sonnet-5";
}

/**
 * Server-side model routing. Only the max plan may reach the stronger model,
 * and only for commands that look complex (tier-3 categories or plausibly
 * multi-step). free/pro always use the default (Haiku). The decision is
 * logged per call.
 */
export function chooseModel(planId: string, command: string, userId: string): string {
  const plan = PLANS[planId as keyof typeof PLANS] ?? PLANS.free;
  const complex = TIER3_HINT.test(command) || command.length > 240 || /\band\b/i.test(command);
  const useStrong = plan.strongerModel && complex;
  const model = useStrong ? strongModel() : defaultModel();
  logInfo("model_routing", { userId, plan: plan.id, complex, model });
  return model;
}
