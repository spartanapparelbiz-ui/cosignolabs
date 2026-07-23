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
    const [audit, injectionFlags] = await Promise.all([
      store.listAudit(userId, 10),
      // Count in the database — no need to transfer 1000 full rows for a number.
      store.countActions(userId, { injection_flag: true }),
    ]);
    return NextResponse.json({ audit, injectionFlags });
  } catch (err) {
    return errorResponse(err);
  }
}
