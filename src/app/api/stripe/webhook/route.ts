import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getStore } from "@/lib/store";
import { logInfo, logSecurity } from "@/lib/log";
import type { PlanId } from "@/lib/plans";
import type { SubscriptionRecord, SubscriptionStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook — the ONLY writer of subscription state. Signature-verified;
 * an unsigned or forged request is rejected 400 and writes nothing. Handles
 * checkout.session.completed, customer.subscription.updated/deleted, and
 * invoice.payment_failed.
 */
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json(
      { error: "not_configured", message: "billing isn't enabled." },
      { status: 501 }
    );
  }

  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    if (!sig) throw new Error("missing signature");
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    logSecurity("webhook_verification_failed", {
      at: "stripe_webhook",
      reason: err instanceof Error ? err.message : "bad_signature",
    });
    // Reject unsigned / bad signature; nothing is written.
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  // Replay/duplicate guard: each Stripe event id is processed exactly once.
  // A re-delivery (Stripe retries, or a replayed capture) is acknowledged
  // with 200 so Stripe stops retrying — but changes nothing.
  try {
    const fresh = await getStore().claimWebhookEvent(event.id, event.type, event.created);
    if (!fresh) {
      logSecurity("webhook_replay_blocked", { id: event.id, type: event.type });
      return NextResponse.json({ received: true, duplicate: true });
    }
  } catch {
    // The dedup store being briefly unavailable must not drop the event:
    // fall through and process (Stripe-side retries are idempotent per the
    // out-of-order guard below).
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || session.metadata?.cosigno_user_id;
        if (userId && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(String(session.subscription));
          await writeSubscription(stripe, userId, sub, String(session.customer), event.created);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserId(sub.metadata?.cosigno_user_id, String(sub.customer));
        if (userId) await writeSubscription(stripe, userId, sub, String(sub.customer), event.created);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserId(sub.metadata?.cosigno_user_id, String(sub.customer));
        if (userId) {
          const existing = await getStore().getSubscription(userId);
          if (staleEvent(existing, event.created)) break;
          await getStore().upsertSubscription({
            ...(existing ?? emptyRow(userId)),
            stripe_customer_id: String(sub.customer),
            stripe_subscription_id: sub.id,
            status: "canceled",
            current_period_end: currentPeriodEnd(sub),
            cancel_at_period_end: true,
            last_event_at: event.created,
            updated_at: new Date().toISOString(),
          });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const existing = await getStore().getSubscriptionByCustomer(String(invoice.customer));
        if (existing && !staleEvent(existing, event.created)) {
          const now = Math.floor(Date.now() / 1000);
          await getStore().upsertSubscription({
            ...existing,
            status: "past_due",
            past_due_since: existing.past_due_since ?? now,
            last_event_at: event.created,
            updated_at: new Date().toISOString(),
          });
        }
        break;
      }
      case "invoice.payment_succeeded": {
        // A renewal (not the first invoice) unlocks the one-time annual nudge.
        const invoice = event.data.object as Stripe.Invoice;
        const reason = (invoice as unknown as { billing_reason?: string }).billing_reason;
        if (reason === "subscription_cycle") {
          const existing = await getStore().getSubscriptionByCustomer(String(invoice.customer));
          if (existing) await getStore().claimPromo(existing.user_id, "renewed_once");
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // Log and 500 so Stripe retries; never leak internals.
    logInfo("stripe_webhook_error", {
      type: event.type,
      message: err instanceof Error ? err.message : "error",
    });
    return NextResponse.json({ error: "handler_error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function emptyRow(userId: string): SubscriptionRecord {
  return {
    user_id: userId,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    plan: "free",
    interval: null,
    status: "active",
    current_period_end: null,
    cancel_at_period_end: false,
    past_due_since: null,
    started_at: null,
    last_event_at: null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Out-of-order guard: Stripe does not guarantee delivery order. An event
 * older than the newest one already applied to this subscription row must
 * never overwrite fresher state — it is skipped (and logged).
 */
function staleEvent(existing: SubscriptionRecord | null, eventCreated: number): boolean {
  const stale = Boolean(
    existing?.last_event_at && eventCreated < existing.last_event_at
  );
  if (stale) {
    logSecurity("webhook_stale_event_skipped", {
      last_applied: existing?.last_event_at,
      event_created: eventCreated,
    });
  }
  return stale;
}

async function resolveUserId(
  metaUserId: string | undefined,
  customerId: string
): Promise<string | null> {
  if (metaUserId) return metaUserId;
  const existing = await getStore().getSubscriptionByCustomer(customerId);
  return existing?.user_id ?? null;
}

function currentPeriodEnd(sub: Stripe.Subscription): number | null {
  const item = sub.items?.data?.[0] as { current_period_end?: number } | undefined;
  return (
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    item?.current_period_end ??
    null
  );
}

function mapStatus(s: Stripe.Subscription.Status): SubscriptionStatus {
  switch (s) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "unpaid";
    default:
      return "incomplete";
  }
}

/** Derive the cosigno plan + interval from the subscription's price. */
function planFromSubscription(sub: Stripe.Subscription): { plan: PlanId; interval: string | null } {
  const price = sub.items?.data?.[0]?.price;
  const plan = (price?.metadata?.cosigno_plan as PlanId) || (sub.metadata?.cosigno_plan as PlanId);
  const interval =
    price?.metadata?.cosigno_interval ||
    sub.metadata?.cosigno_interval ||
    (price?.recurring?.interval === "year" ? "annual" : price?.recurring?.interval === "month" ? "monthly" : null);
  const valid: PlanId = plan === "pro" || plan === "max" ? plan : "free";
  return { plan: valid, interval };
}

async function writeSubscription(
  _stripe: Stripe,
  userId: string,
  sub: Stripe.Subscription,
  customerId: string,
  eventCreated: number
): Promise<void> {
  const { plan, interval } = planFromSubscription(sub);
  const status = mapStatus(sub.status);
  const existing = await getStore().getSubscription(userId);
  if (staleEvent(existing, eventCreated)) return;
  await getStore().upsertSubscription({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    plan,
    interval,
    status,
    current_period_end: currentPeriodEnd(sub),
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    // preserve grace clock while past_due; clear it once healthy again
    past_due_since:
      status === "past_due"
        ? existing?.past_due_since ?? Math.floor(Date.now() / 1000)
        : null,
    started_at: existing?.started_at ?? sub.created ?? Math.floor(Date.now() / 1000),
    last_event_at: eventCreated,
    updated_at: new Date().toISOString(),
  });
  // The first time a subscription is truly active, mark the customer as having
  // subscribed — this is what makes them a "returning" customer for the
  // first-timer-only intro coupon. Idempotent (single-use row).
  if (status === "active" || status === "trialing") {
    await getStore().claimPromo(userId, "subscribed", { plan });
  }
  logInfo("subscription_updated", { userId, plan, status, interval });
}
