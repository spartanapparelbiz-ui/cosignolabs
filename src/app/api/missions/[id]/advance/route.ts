import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { idParamSchema, parseStrict } from "@/lib/schemas";
import { advanceMission } from "@/lib/missions/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/**
 * User-present driver: while the mission page is open the client calls this
 * to keep work moving between cron ticks. Same engine, same guarantees —
 * a duplicate call finds nothing runnable and returns the current state.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const id = parseStrict(idParamSchema, (await params).id, "mission_id");
    const result = await advanceMission(userId, id);
    if (!result) throw new ApiError(404, "not_found", "we couldn't find that mission.");
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
