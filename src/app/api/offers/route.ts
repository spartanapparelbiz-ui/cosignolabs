import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getUserPlan } from "@/lib/billing";
import { getStore } from "@/lib/store";
import { annualSavings, withinUsageWindow } from "@/lib/promos";
import type { PlanId } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * In-app offer eligibility, all server-validated and single-use. Each offer is
 * claimed atomically the first time it's returned, so it surfaces exactly once
 * per customer. Every claim is audit-logged.
 *
 *  - usageOffer:  free user who hit the 25-action cap within 7 days of signup
 *                 → one-time "$9 first month" nudge, deep-linked to checkout.
 *  - annualNudge: after the first renewal, one-time "switch to annual" prompt
 *                 showing their real month-one action count + savings math.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const store = getStore();
    const [{ planId }, usage, sub, firstSeen] = await Promise.all([
      getUserPlan(userId),
      store.getUsage(userId),
      store.getSubscription(userId),
      store.firstSeenAt(userId),
    ]);

    // usage-triggered offer
    let usageOffer = false;
    if (
      planId === "free" &&
      usage.actions_executed >= usage.limit &&
      withinUsageWindow(firstSeen) &&
      !(await store.hasPromo(userId, "usage_offer_shown"))
    ) {
      usageOffer = await store.claimPromo(userId, "usage_offer_shown", {
        used: usage.actions_executed,
      });
      if (usageOffer) await store.logAudit(userId, "promo", { offer: "usage_offer_shown" });
    }

    // annual nudge (after first renewal)
    let annualNudge: { monthActions: number; savings: number } | null = null;
    if (
      planId !== "free" &&
      sub?.interval === "monthly" &&
      (await store.hasPromo(userId, "renewed_once")) &&
      !(await store.hasPromo(userId, "annual_nudge_shown"))
    ) {
      const claimed = await store.claimPromo(userId, "annual_nudge_shown");
      if (claimed) {
        await store.logAudit(userId, "promo", { offer: "annual_nudge_shown" });
        annualNudge = {
          monthActions: usage.actions_executed,
          savings: annualSavings(planId as PlanId),
        };
      }
    }

    return NextResponse.json({ usageOffer, annualNudge });
  } catch (err) {
    return errorResponse(err);
  }
}
