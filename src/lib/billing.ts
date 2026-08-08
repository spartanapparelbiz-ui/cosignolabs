import { getStore } from "./store";
import { isOwnerUser } from "./owner";
import {
  getPlan,
  OWNER_PLAN,
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
  /**
   * INTERNAL — the owner override is in effect for this user.
   *
   * NEVER SERIALIZE THIS. Routes build their JSON field by field (see
   * /api/usage) precisely so a flag like this cannot ride along in a spread.
   * It exists for server-side bypasses that aren't expressed as a plan limit
   * — anything that isn't a number on `plan`.
   */
  isOwner: boolean;
}

/**
 * The resolved Owner plan. Built here rather than inline so every field of
 * ResolvedPlan has one deliberate answer: an owner is permanently active,
 * with no period end, no cancellation, no grace window and no past-due state
 * — because there is no subscription behind them to have any of those.
 */
function ownerResolved(): ResolvedPlan {
  return {
    plan: OWNER_PLAN,
    // Publicly the top paid plan — see OWNER_PLAN. Downstream code that keys
    // off planId (model routing, upgrade copy) therefore treats an owner as a
    // top-tier customer, which is exactly right.
    planId: "max",
    status: "active",
    activeUntil: null,
    cancelAtPeriodEnd: false,
    inGrace: false,
    pastDue: false,
    isOwner: true,
  };
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
 * ONE EXCEPTION, and it is the first thing this function does: the owner
 * override below.
 */
export async function getUserPlan(userId: string): Promise<ResolvedPlan> {
  // ─── OWNER OVERRIDE ────────────────────────────────────────────────────
  // THIS IS THE PLACE. Every plan-driven limit in the product — actions,
  // missions, automations, connections, AI usage, storage, uploads,
  // templates, monitoring, preview, and whatever is sold next — is read off
  // the Plan this function returns. Overriding here therefore covers all of
  // them at once, and covers them server-side: no caller passes a plan in,
  // and no client input reaches this decision.
  //
  // It runs BEFORE the subscription read on purpose. That is what "bypass
  // billing and subscription checks" means literally: an owner has no Stripe
  // customer, no subscription row and no status, and never needs one. The
  // store is not even consulted for them.
  //
  // isOwnerUser() matches the session's verified email against
  // process.env.OWNER_EMAILS (see src/lib/owner.ts). With that variable
  // unset it returns false without doing any work, so this line costs
  // nothing on a deployment that doesn't use it.
  if (await isOwnerUser(userId)) return ownerResolved();

  const free: ResolvedPlan = {
    plan: getPlan("free"),
    planId: "free",
    status: "none",
    activeUntil: null,
    cancelAtPeriodEnd: false,
    inGrace: false,
    pastDue: false,
    isOwner: false,
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
      isOwner: false,
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
        isOwner: false,
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
        isOwner: false,
      };
    }
    return { ...free, pastDue: true };
  }

  // incomplete / unpaid / unknown → free
  return free;
}
