import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, radarStatusSchema, readJsonBody } from "@/lib/schemas";
import { buildRadar } from "@/lib/radar";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dismiss / snooze / mark-seen a Radar item. The item must currently exist in
 * the user's own detected feed (server-recomputed) — you can't set a
 * disposition on an arbitrary key. Snooze windows are bounded by the schema.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const body = parseStrict(radarStatusSchema, await readJsonBody(req), "radar_disposition");

    // Ensure the key is a real, currently-detected item for THIS user before
    // writing a disposition (ensureRadarStates only creates rows for real keys).
    const radar = await buildRadar(userId);
    if (!radar.items.some((i) => i.key === body.key)) {
      throw new ApiError(404, "not_found", "that radar item isn't in your current feed.");
    }

    const snoozedUntil =
      body.status === "snoozed"
        ? new Date(Date.now() + (body.snooze_hours ?? 24) * 3_600_000).toISOString()
        : null;
    const updated = await getStore().setRadarStatus(userId, body.key, body.status, snoozedUntil);
    return NextResponse.json({ item: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
