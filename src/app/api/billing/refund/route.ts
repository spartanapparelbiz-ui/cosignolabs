import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { getStripe } from "@/lib/stripe";
import { logSecurity } from "@/lib/log";
import { enforceLimit } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";
import { REFUND_WINDOW_DAYS, withinRefundWindow } from "@/lib/promos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 14-day refund guarantee. Refunds the subscription's latest payment and
 * cancels it immediately — but ONLY within the window and ONCE per customer,
 * ever. Every check is server-side; the client sends nothing but the request.
 */
export async function POST() {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);

    const stripe = getStripe();
    if (!stripe) {
      throw new ApiError(503, "billing_disabled", "billing isn't enabled yet.");
    }

    const store = getStore();
    const sub = await store.getSubscription(userId);
    if (!sub?.stripe_subscription_id) {
      throw new ApiError(400, "no_subscription", "you don't have a subscription to refund.");
    }

    if (!withinRefundWindow(sub.started_at)) {
      throw new ApiError(
        403,
        "refund_window_closed",
        `the ${REFUND_WINDOW_DAYS}-day refund window has closed for this subscription.`
      );
    }

    // One lifetime refund per customer — claim it atomically BEFORE the money
    // moves so two concurrent requests can't double-refund.
    const claimed = await store.claimPromo(userId, "refund_used", {
      subscription: sub.stripe_subscription_id,
    });
    if (!claimed) {
      throw new ApiError(409, "refund_used", "you've already used your refund guarantee.");
    }

    try {
      const full = await stripe.subscriptions.retrieve(sub.stripe_subscription_id, {
        expand: ["latest_invoice.payment_intent"],
      });
      const invoice = full.latest_invoice as Stripe.Invoice | null;
      const pi = (invoice as unknown as { payment_intent?: Stripe.PaymentIntent | string })
        ?.payment_intent;
      const paymentIntentId = typeof pi === "object" ? pi?.id : pi;

      if (paymentIntentId) {
        await stripe.refunds.create({ payment_intent: paymentIntentId });
      }
      // Immediate downgrade: cancel now (the webhook writes the canceled row).
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } catch {
      // The refund/cancel failed after we claimed it — this needs a human, but
      // never leak Stripe internals. The claim stays (a retry would double it);
      // support can reconcile.
      logSecurity("refund_failed", { userId });
      throw new ApiError(502, "refund_failed", "we couldn't process the refund — please contact support.");
    }

    await store.logAudit(userId, "promo", { offer: "refund_used", plan: sub.plan });
    logSecurity("refund_issued", { userId, plan: sub.plan });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
