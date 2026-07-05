import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Security-cockpit data: recent account audit events (tier changes,
 * integration changes) and this cycle's injection-flag count.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const store = getStore();
    const [audit, actions] = await Promise.all([
      store.listAudit(userId, 10),
      store.listActions(userId, { limit: 1000 }),
    ]);
    const injectionFlags = actions.filter((a) => a.injection_flag).length;
    return NextResponse.json({ audit, injectionFlags });
  } catch (err) {
    return errorResponse(err);
  }
}
