import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceGlobalPlanningBudget, enforceLimit } from "@/lib/ratelimit";
import { missionCreateSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { advanceMission } from "@/lib/missions/engine";
import { createMeetingPrepMission } from "@/lib/missions/meetingPrep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const userId = await requireUser();
    const missions = await getStore().listMissions(userId, 25);
    return NextResponse.json({ missions });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Start a mission from a template, then advance it as far as one pass allows. */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("commandMinute", userId);
    await enforceLimit("commandDay", userId);
    await enforceGlobalPlanningBudget();
    parseStrict(missionCreateSchema, await readJsonBody(req), "mission_create");
    const { mission } = await createMeetingPrepMission(userId);
    const advanced = await advanceMission(userId, mission.id);
    return NextResponse.json({
      mission: advanced?.mission ?? mission,
      steps: advanced?.steps ?? [],
    });
  } catch (err) {
    return errorResponse(err);
  }
}
