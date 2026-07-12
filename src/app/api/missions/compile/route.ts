import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { missionCompileSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { compileMission } from "@/lib/missions/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Compile an open-ended goal into a validated plan PREVIEW (goal-understanding
 * screen + the plan). Nothing is created or executed — the user reviews it,
 * then POSTs /api/missions with the goal to actually start it.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("commandMinute", userId);
    const body = parseStrict(missionCompileSchema, await readJsonBody(req), "mission_compile");
    const result = await compileMission(userId, body.goal);
    return NextResponse.json({
      understood: result.understood,
      shape: result.shape,
      blocked: result.blocked,
      plan: result.plan,
      validation: result.validation,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
