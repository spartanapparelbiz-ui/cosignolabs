import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { idParamSchema, parseStrict } from "@/lib/schemas";
import { replayOf } from "@/lib/state";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Delegation Replay — the ordered operational history of one delegation
 * (session): accepted → prepared → boundary → authorized → executed →
 * outcome. Assembled purely from the stored audit record.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser();
    const sessionId = parseStrict(
      idParamSchema,
      req.nextUrl.searchParams.get("session_id"),
      "session_id"
    );
    const store = getStore();
    const session = await store.getSession(userId, sessionId);
    if (!session) throw new ApiError(404, "not_found", "we couldn't find that delegation.");
    const actions = await store.listActions(userId, { session_id: sessionId, limit: 200 });
    // Fetch only this delegation's events — not the account's full history.
    const events = await store.listEventsForActions(
      userId,
      actions.map((a) => a.id)
    );
    return NextResponse.json({
      goal: session.title,
      lines: replayOf(events, actions, session.created_at, session.title),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
