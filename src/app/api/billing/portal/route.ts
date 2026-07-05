import { NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { appUrl, getStripe } from "@/lib/stripe";
import { enforceLimit } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Opens the Stripe Billing Portal — upgrades, downgrades, cancellation, and
 * card changes all happen there. We never build custom subscription UI.
 */
export async function POST() {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);

    const stripe = getStripe();
    if (!stripe) {
      throw new ApiError(503, "billing_disabled", "billing isn't enabled yet.");
    }

    const sub = await getStore().getSubscription(userId);
    if (!sub?.stripe_customer_id) {
      throw new ApiError(400, "no_customer", "you don't have a billing account yet — upgrade first.");
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${appUrl()}/app/account/plan`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return errorResponse(err);
  }
}
