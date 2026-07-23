import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cheap aggregate counts for the home "today" strip. Everything is counted in
 * the database (head-only count queries, run in parallel) so the strip costs
 * four tiny numbers instead of a 1000-row action transfer.
 *
 * `since` (optional ISO timestamp) bounds the executed count — the client
 * passes its local midnight so "completed today" keeps the user's timezone.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser();
    const store = getStore();

    const sinceRaw = req.nextUrl.searchParams.get("since");
    const sinceMs = sinceRaw ? Date.parse(sinceRaw) : NaN;
    // Reject garbage quietly: an unparseable `since` just means "no bound".
    const since = Number.isFinite(sinceMs) ? new Date(sinceMs).toISOString() : undefined;

    const [sessions, proposed, failed, executed] = await Promise.all([
      store.countSessions(userId),
      store.countActions(userId, { status: "proposed" }),
      store.countActions(userId, { status: "failed" }),
      store.countActions(userId, { status: "executed", since }),
    ]);

    return NextResponse.json({
      summary: { sessions, proposed, failed, executed },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
