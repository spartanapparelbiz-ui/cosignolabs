import { getUserPlan } from "./billing";
import { modelFor } from "./ai/routing";
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
    return `you've used your ${free} AI operations this month. ${PLANS.pro.name} includes ${pro} for ${proPrice}.`;
  }
  if (planId === "pro") {
    return `you've hit this month's ${pro} AI operations. ${PLANS.max.name} raises the ceiling to ${max}.`;
  }
  return `you've hit this month's ${max} AI operations. reach out and we'll raise your ceiling.`;
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
      `custom integrations come with ${PLANS.pro.name}. upgrade to connect your own tools.`
    );
  }
  const existing = await getStore().listConnections(userId);
  if (existing.length >= plan.integrationLimit) {
    logSecurity("usage_limit_hit", { userId, at: "integration_connect", plan: planId });
    throw new ApiError(
      402,
      "upgrade_required",
      planId === "free"
        ? `free connects one app. ${PLANS.pro.name} is ${priceLabel(PLANS.pro, "monthly")} for unlimited.`
        : "you've reached your plan's connection limit."
    );
  }
}

/**
 * Server-side routing: every command starts on the default model, full stop.
 *
 * The old heuristic escalated on words — a tier-3 verb, 240 characters, or
 * literally "and" bought the premium model for max-plan users. That measured
 * how someone types, not how hard their problem is: "compare apples and
 * oranges" paid premium, a genuinely hard task phrased tersely didn't.
 *
 * Escalation now happens on evidence instead of prediction: when the default
 * model actually fails to produce a usable plan, the pipeline retries once via
 * escalationFor() (see ai/routing.ts), premium only when the plan carries it.
 * Cheapest model that completes the task, always; stronger model only when
 * the task demonstrated it needs one.
 */
export function chooseModel(planId: string, _command: string, userId: string): string {
  const plan = PLANS[planId as keyof typeof PLANS] ?? PLANS.free;
  logInfo("model_routing", { userId, plan: plan.id, tier: "default" });
  return modelFor("plan");
}
