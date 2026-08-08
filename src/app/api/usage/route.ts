import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getUserPlan } from "@/lib/billing";
import { getStore } from "@/lib/store";
import { PLANS } from "@/lib/plans";
import { REFUND_WINDOW_DAYS, withinRefundWindow } from "@/lib/promos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUser();
    const store = getStore();
    const [usage, resolved, subscription, refundUsed] = await Promise.all([
      store.getUsage(userId),
      getUserPlan(userId),
      store.getSubscription(userId),
      store.hasPromo(userId, "refund_used"),
    ]);
    // Refund is offerable only for a live paid sub, inside the window, once.
    const refundEligible =
      resolved.planId !== "free" &&
      !refundUsed &&
      Boolean(subscription?.stripe_subscription_id) &&
      withinRefundWindow(subscription?.started_at ?? null);
    // The effective limit comes from the plan, not the stored usage row.
    //
    // An unlimited plan has no finite ceiling, and JSON has no way to carry
    // one — `Infinity` serializes to `null`, which the usage meter would then
    // try to format and crash on. So the DISPLAY value falls back to the top
    // published plan's number. It is display only: enforcement never reads
    // this field, it reads the plan server-side, where the limit is still
    // unlimited. This also keeps the account page indistinguishable from a
    // top-tier subscriber's — nothing here can hint that an override exists.
    const shownLimit = Number.isFinite(resolved.plan.actionLimit)
      ? resolved.plan.actionLimit
      : PLANS.max.actionLimit;
    return NextResponse.json({
      usage: { ...usage, limit: shownLimit },
      plan: {
        id: resolved.planId,
        name: resolved.plan.name,
        status: resolved.status,
        interval: subscription?.interval ?? null,
        activeUntil: resolved.activeUntil,
        cancelAtPeriodEnd: resolved.cancelAtPeriodEnd,
        pastDue: resolved.pastDue,
        inGrace: resolved.inGrace,
        upgradeTo: resolved.plan.upgradeTo,
        refundEligible,
        refundWindowDays: REFUND_WINDOW_DAYS,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
