import { NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { getStripe } from "@/lib/stripe";
import { getUserPlan } from "@/lib/billing";
import { enforceLimit } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";
import { RETENTION_MONTHS, retentionCoupon } from "@/lib/promos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cancel-flow retention: apply 50% off the next 2 months to keep an active
 * subscriber. Offered once per customer, active subscribers only, before the
 * portal cancellation. Server-validated; the coupon is applied to the live
 * Stripe subscription and the webhook reflects the resulting state.
 */
export async function POST() {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);

    const stripe = getStripe();
    if (!stripe) throw new ApiError(503, "billing_disabled", "billing isn't enabled yet.");

    const coupon = retentionCoupon();
    if (!coupon) throw new ApiError(503, "offer_unavailable", "that offer isn't available right now.");

    const { status } = await getUserPlan(userId);
    if (status !== "active" && status !== "trialing") {
      throw new ApiError(403, "not_active", "the retention offer is for active subscribers only.");
    }

    const store = getStore();
    const sub = await store.getSubscription(userId);
    if (!sub?.stripe_subscription_id) {
      throw new ApiError(400, "no_subscription", "no active subscription found.");
    }

    // One retention save per customer, ever — claim before applying.
    const claimed = await store.claimPromo(userId, "retention_offered", { coupon });
    if (!claimed) {
      throw new ApiError(409, "already_offered", "you've already used this offer.");
    }

    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      discounts: [{ coupon }],
    });
    await store.logAudit(userId, "promo", { offer: "retention_offered", months: RETENTION_MONTHS });

    return NextResponse.json({ ok: true, months: RETENTION_MONTHS });
  } catch (err) {
    return errorResponse(err);
  }
}
