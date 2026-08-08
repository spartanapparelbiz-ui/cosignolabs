import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getUserPlan } from "@/lib/billing";
import { getPlan, publicFace } from "@/lib/plans";
import { getStore } from "@/lib/store";
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
    // The owner tier is internal, so this payload — the only one that carries
    // a plan id to the browser — reports its public face instead. An owner's
    // account page is then byte-identical to a max subscriber's, and no client
    // learns that a hidden tier exists. Enforcement everywhere else still uses
    // `resolved`, which is the real plan.
    //
    // This also keeps the response serializable: the owner plan's actionLimit
    // is Infinity, and JSON.stringify turns that into `null`, which would
    // crash the account page on `usage.limit.toLocaleString()`.
    const shownId = publicFace(resolved.planId);
    const shown = getPlan(shownId);

    // The effective limit comes from the plan, not the stored usage row.
    return NextResponse.json({
      usage: { ...usage, limit: shown.actionLimit },
      plan: {
        id: shownId,
        name: shown.name,
        status: resolved.status,
        interval: subscription?.interval ?? null,
        activeUntil: resolved.activeUntil,
        cancelAtPeriodEnd: resolved.cancelAtPeriodEnd,
        pastDue: resolved.pastDue,
        inGrace: resolved.inGrace,
        upgradeTo: shown.upgradeTo,
        refundEligible,
        refundWindowDays: REFUND_WINDOW_DAYS,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
