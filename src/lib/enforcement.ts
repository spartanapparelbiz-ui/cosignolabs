import { getUserPlan } from "./billing";
import { plannerModel, type PlannerTier } from "./agent/provider";
import { PLANS, priceLabel } from "./plans";
import { logInfo, logSecurity } from "./log";
import { ApiError } from "./api";
import { getStore } from "./store";

/** Effective action limit for a user, resolved from their plan (fail-closed). */
export async function effectiveActionLimit(userId: string): Promise<number> {
  const { plan } = await getUserPlan(userId);
  return plan.actionLimit;
}

/** Plan-aware copy shown when the action limit is reached — derived from plans.ts. */
export function usageLimitMessage(planId: string): string {
  const free = PLANS.free.actionLimit.toLocaleString();
  const pro = PLANS.pro.actionLimit.toLocaleString();
  const max = PLANS.max.actionLimit.toLocaleString();
  const proPrice = priceLabel(PLANS.pro, "monthly");
  if (planId === "free") {
    return `you've used your ${free} actions this month. pro is ${proPrice} for ${pro}.`;
  }
  if (planId === "pro") {
    return `you've hit this month's ${pro} actions. max raises the ceiling to ${max}.`;
  }
  return `you've hit this month's ${max} actions. reach out and we'll raise your ceiling.`;
}

/**
 * Gate adding an integration, server-side. Custom MCP is a pro+ power feature;
 * the connection count is capped by plan (free = 1). Throws a 402 with an
 * upgrade prompt — the single place both the app-connect and MCP-register
 * routes consult, so the limit can't be bypassed by hitting a different route.
 */
export async function assertIntegrationCapacity(
  userId: string,
  opts: { customMcp?: boolean; custom?: boolean } = {}
): Promise<void> {
  const { plan, planId } = await getUserPlan(userId);
  // Any user-defined connector (custom MCP server OR generic API/OAuth tool) is
  // a pro+ feature — free stays on built-ins only. Reuses the plan.customMcp flag.
  if ((opts.customMcp || opts.custom) && !plan.customMcp) {
    logSecurity("upgrade_required", { userId, at: "custom_integration", plan: planId });
    throw new ApiError(
      402,
      "upgrade_required",
      "custom integrations are a pro feature. upgrade to connect your own tools."
    );
  }
  const existing = await getStore().listConnections(userId);
  if (existing.length >= plan.integrationLimit) {
    logSecurity("usage_limit_hit", { userId, at: "integration_connect", plan: planId });
    throw new ApiError(
      402,
      "upgrade_required",
      planId === "free"
        ? `free connects one integration. pro is ${priceLabel(PLANS.pro, "monthly")} for unlimited.`
        : "you've reached your plan's connection limit."
    );
  }
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
