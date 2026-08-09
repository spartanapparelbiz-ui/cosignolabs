import { getStore } from "./store";
import { isOwner, OWNER_PLAN } from "./owner";
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
 *
 * The ONE exception to "read the row" is the owner override, checked first:
 * see below.
 */
export async function getUserPlan(userId: string): Promise<ResolvedPlan> {
  /**
   * Owner override — server-side, and BEFORE any store read so an owner's
   * access never depends on Stripe, a webhook, or a row existing at all.
   *
   * Keyed on the immutable Supabase Auth user id via OWNER_IDS (lib/owner.ts).
   * This is the only path to the owner plan and the only place it is granted:
   * putting it here rather than at a route means all nine enforcement points
   * that already funnel through getUserPlan inherit it, and none of them can
   * disagree about who an owner is.
   *
   * It fails closed in the same direction as everything else — OWNER_IDS unset
   * means no owners.
   */
  if (isOwner(userId)) {
    return {
      plan: OWNER_PLAN,
      planId: "owner",
      status: "active",
      activeUntil: null,
      cancelAtPeriodEnd: false,
      inGrace: false,
      pastDue: false,
    };
  }

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

  // Only the three PUBLIC tiers are honored from a stored row. `owner` is
  // absent from this map on purpose: the owner plan is granted by OWNER_IDS
  // alone, so an "owner" value that somehow reaches the subscriptions table
  // resolves to free instead of escalating. Do not add it here.
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
