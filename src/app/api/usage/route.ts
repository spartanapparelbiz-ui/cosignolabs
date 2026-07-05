import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getUserPlan } from "@/lib/billing";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUser();
    const [usage, resolved] = await Promise.all([
      getStore().getUsage(userId),
      getUserPlan(userId),
    ]);
    // The effective limit comes from the plan, not the stored usage row.
    return NextResponse.json({
      usage: { ...usage, limit: resolved.plan.actionLimit },
      plan: {
        id: resolved.planId,
        name: resolved.plan.name,
        status: resolved.status,
        interval: (await getStore().getSubscription(userId))?.interval ?? null,
        activeUntil: resolved.activeUntil,
        cancelAtPeriodEnd: resolved.cancelAtPeriodEnd,
        pastDue: resolved.pastDue,
        inGrace: resolved.inGrace,
        upgradeTo: resolved.plan.upgradeTo,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
