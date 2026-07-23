import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { buildRadar } from "@/lib/radar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cosigno Radar — proactive detection over the user's own state. Read-only:
 * this endpoint never proposes or executes anything. Preparing a mission is a
 * separate, explicit POST (/api/radar/prepare).
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const radar = await buildRadar(userId);
    return NextResponse.json({ radar });
  } catch (err) {
    return errorResponse(err);
  }
}
