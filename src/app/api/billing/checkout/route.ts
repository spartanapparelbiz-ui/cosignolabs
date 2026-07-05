import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { appUrl, getStripe } from "@/lib/stripe";
import { priceIdFor } from "@/lib/plans";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const checkoutSchema = z
  .object({
    plan: z.enum(["pro", "max"]),
    interval: z.enum(["monthly", "annual"]),
  })
  .strict();

/** Creates a Stripe Checkout Session (subscription mode) for pro/max. */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);

    const stripe = getStripe();
    if (!stripe) {
      throw new ApiError(503, "billing_disabled", "billing isn't enabled yet.");
    }

    const { plan, interval } = parseStrict(checkoutSchema, await readJsonBody(req), "checkout");
    const price = priceIdFor(plan, interval);
    if (!price) {
      throw new ApiError(500, "price_missing", "that plan isn't configured for checkout.");
    }

    // Reuse the customer if we already have one for this user.
    const existing = await getStore().getSubscription(userId);
    const customer = existing?.stripe_customer_id || undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      client_reference_id: userId,
      customer,
      ...(customer ? {} : { customer_creation: "always" }),
      metadata: { cosigno_user_id: userId, cosigno_plan: plan, cosigno_interval: interval },
      subscription_data: {
        metadata: { cosigno_user_id: userId, cosigno_plan: plan, cosigno_interval: interval },
      },
      allow_promotion_codes: true,
      success_url: `${appUrl()}/app/account/plan?status=success`,
      cancel_url: `${appUrl()}/pricing?status=canceled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return errorResponse(err);
  }
}
