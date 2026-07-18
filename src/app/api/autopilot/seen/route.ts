import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The user has looked at Autopilot: flip "new" signals to "seen" and stamp
 * the last-viewed marker (which frames the next visit's "what changed").
 * Called by the page AFTER it renders, so the current visit still shows
 * what was new.
 */
export async function POST() {
  try {
    const userId = await requireUser();
    const store = getStore();
    await store.markSignalsSeen(userId);
    await store.setAutopilotViewedAt(userId, new Date().toISOString());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
