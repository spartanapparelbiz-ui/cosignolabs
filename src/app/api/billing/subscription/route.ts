import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { z } from "zod";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { getStripe } from "@/lib/stripe";
import { getPlan, priceIdFor, type Interval } from "@/lib/plans";
import { introCoupon, introEligible } from "@/lib/promos";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    plan: z.enum(["pro", "max"]),
    interval: z.enum(["monthly", "annual"]),
  })
  .strict();

/**
 * Embedded-checkout entry point. Creates a Stripe Subscription in
 * `default_incomplete` state and returns the PaymentIntent client secret so
 * the browser can confirm the first payment with Stripe Elements.
 *
 * SECURITY: this route never touches card data — the client secret only
 * authorizes confirming a specific PaymentIntent inside Stripe's iframes.
 * Plan access is NOT granted here: the subscription is `incomplete` until the
 * webhook (the sole writer) observes it go `active`, and getUserPlan fails
 * closed on any non-active status. A confirmed payment on the client grants
 * nothing on its own.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);

    const stripe = getStripe();
    if (!stripe) {
      throw new ApiError(503, "billing_disabled", "billing isn't enabled yet.");
    }

    const { plan, interval } = parseStrict(bodySchema, await readJsonBody(req), "subscription");
    const price = priceIdFor(plan, interval);
    if (!price) {
      throw new ApiError(500, "price_missing", "that plan isn't configured for checkout.");
    }

    // Reuse the customer if we already have one; otherwise create it.
    const existing = await getStore().getSubscription(userId);
    let customerId = existing?.stripe_customer_id || null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { cosigno_user_id: userId },
      });
      customerId = customer.id;
    }

    // Intro pricing: $9 first month on pro-monthly, first-time subscribers
    // only. "First-time" is server-truth — the customer has never had a live
    // subscription (the `subscribed` promo is set by the webhook on activation),
    // so a returning subscriber can never re-trigger it.
    const coupon = introCoupon();
    const firstTimer = !(await getStore().hasPromo(userId, "subscribed"));
    const applyIntro = Boolean(coupon) && introEligible(plan, interval) && firstTimer;

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      ...(applyIntro ? { discounts: [{ coupon: coupon as string }] } : {}),
      metadata: { cosigno_user_id: userId, cosigno_plan: plan, cosigno_interval: interval },
    });

    if (applyIntro) {
      await getStore().claimPromo(userId, "intro_used", { coupon });
      await getStore().logAudit(userId, "promo", { offer: "intro_used", plan, interval });
    }

    const invoice = subscription.latest_invoice as Stripe.Invoice | null;
    const paymentIntent =
      (invoice as unknown as { payment_intent?: Stripe.PaymentIntent | string })
        ?.payment_intent;
    const clientSecret =
      typeof paymentIntent === "object" ? paymentIntent?.client_secret : null;

    if (!clientSecret) {
      throw new ApiError(500, "no_client_secret", "couldn't start checkout — try again.");
    }

    const planMeta = getPlan(plan);
    const amount =
      (interval as Interval) === "annual" ? planMeta.price.annual : planMeta.price.monthly;

    return NextResponse.json({
      subscriptionId: subscription.id,
      clientSecret,
      plan,
      interval,
      amount,
      introApplied: applyIntro,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
