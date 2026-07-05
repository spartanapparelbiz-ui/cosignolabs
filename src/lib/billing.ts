import { getStore } from "./store";
import {
  getPlan,
  PAST_DUE_GRACE_DAYS,
  Plan,
  PlanId,
} from "./plans";
import type { SubscriptionRecord } from "./types";

export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export interface ResolvedPlan {
  plan: Plan;
  planId: PlanId;
  status: SubscriptionRecord["status"] | "none";
  /** true while a canceled sub still has paid access until period end */
  activeUntil: number | null;
  cancelAtPeriodEnd: boolean;
  /** true when past_due but still inside the 7-day grace window */
  inGrace: boolean;
  pastDue: boolean;
}

/**
 * Resolve a user's effective plan — the single helper every enforcement
 * point uses. FAIL CLOSED: no subscription, unknown status, or any doubt →
 * free. Never trusts client input; reads the webhook-written row only.
 *
 * Rules:
 *  - active/trialing → the plan on the row.
 *  - canceled with cancel_at_period_end and still before period_end → keep
 *    paid access; after period_end → free.
 *  - past_due → keep paid access for PAST_DUE_GRACE_DAYS from past_due_since,
 *    then drop to free until resolved.
 *  - anything else → free.
 */
export async function getUserPlan(userId: string): Promise<ResolvedPlan> {
  const free: ResolvedPlan = {
    plan: getPlan("free"),
    planId: "free",
    status: "none",
    activeUntil: null,
    cancelAtPeriodEnd: false,
    inGrace: false,
    pastDue: false,
  };

  let sub: SubscriptionRecord | null = null;
  try {
    sub = await getStore().getSubscription(userId);
  } catch {
    return free; // store error → fail closed
  }
  if (!sub) return free;

  const planId = (sub.plan as PlanId) in { free: 1, pro: 1, max: 1 } ? (sub.plan as PlanId) : "free";
  if (planId === "free") return free;

  const now = Math.floor(Date.now() / 1000);
  const periodEnd = sub.current_period_end ?? 0;

  if (sub.status === "active" || sub.status === "trialing") {
    return {
      plan: getPlan(planId),
      planId,
      status: sub.status,
      activeUntil: periodEnd || null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      inGrace: false,
      pastDue: false,
    };
  }

  if (sub.status === "canceled") {
    // Access continues until the period end, then free.
    if (periodEnd && now < periodEnd) {
      return {
        plan: getPlan(planId),
        planId,
        status: "canceled",
        activeUntil: periodEnd,
        cancelAtPeriodEnd: true,
        inGrace: false,
        pastDue: false,
      };
    }
    return free;
  }

  if (sub.status === "past_due") {
    const since = sub.past_due_since ?? now;
    const graceEnds = since + PAST_DUE_GRACE_DAYS * 86400;
    if (now < graceEnds) {
      // keep access, but flag past due so the UI can nudge
      return {
        plan: getPlan(planId),
        planId,
        status: "past_due",
        activeUntil: graceEnds,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        inGrace: true,
        pastDue: true,
      };
    }
    return { ...free, pastDue: true };
  }

  // incomplete / unpaid / unknown → free
  return free;
}
