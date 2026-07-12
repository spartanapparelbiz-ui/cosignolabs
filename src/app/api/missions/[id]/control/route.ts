import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { idParamSchema, missionControlSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { controlMission } from "@/lib/missions/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Pause / resume / stop — pause halts new work, stop is terminal + vetoes waiting cards. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const id = parseStrict(idParamSchema, (await params).id, "mission_id");
    const body = parseStrict(missionControlSchema, await readJsonBody(req), "mission_control");
    const mission = await controlMission(userId, id, body.op);
    if (!mission) throw new ApiError(404, "not_found", "we couldn't find that mission.");
    return NextResponse.json({ mission });
  } catch (err) {
    return errorResponse(err);
  }
}
