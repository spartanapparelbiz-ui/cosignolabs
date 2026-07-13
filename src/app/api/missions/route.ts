import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceGlobalPlanningBudget, enforceLimit } from "@/lib/ratelimit";
import { missionCreateSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { advanceMission } from "@/lib/missions/engine";
import { createMeetingPrepMission } from "@/lib/missions/meetingPrep";
import { createLaptopCompareMission } from "@/lib/missions/laptopCompare";
import { compileMission, type SourceContext } from "@/lib/missions/compiler";
import { instantiateCompiledMission } from "@/lib/missions/create";
import type { MissionSourceRecord } from "@/lib/types";

/** Load the caller's OWN staged sources by id, in the requested order. */
async function loadStagedSources(userId: string, ids: string[]): Promise<SourceContext[]> {
  if (ids.length === 0) return [];
  const staged = await getStore().listStagedSources(userId);
  const byId = new Map(staged.map((s: MissionSourceRecord) => [s.id, s]));
  const out: SourceContext[] = [];
  for (const id of ids) {
    const s = byId.get(id);
    if (s) {
      out.push({
        id: s.id,
        kind: s.kind,
        name: s.name,
        subtype: s.subtype,
        status: s.status,
        summary: s.summary,
        injection_flag: s.injection_flag,
      });
    }
  }
  return out;
}

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
    const body = parseStrict(missionCreateSchema, await readJsonBody(req), "mission_create");

    let missionId: string;
    if (body.template === "meeting_prep") {
      const { mission } = await createMeetingPrepMission(userId);
      missionId = mission.id;
    } else if (body.template === "laptop_compare") {
      const { mission } = await createLaptopCompareMission(userId);
      missionId = mission.id;
    } else {
      // Load any staged sources the ask box attached (only the caller's own).
      const sourceIds = body.sourceIds ?? [];
      const sources = await loadStagedSources(userId, sourceIds);
      // Compile the open-ended goal, validate, and refuse to start an
      // unsupported or invalid plan (never run something we can't do).
      const compiled = await compileMission(userId, body.goal!, sources);
      if (compiled.blocked) {
        throw new ApiError(
          422,
          "unsupported_goal",
          compiled.understood.boundary || "cosigno can't turn that goal into a plan it can actually run yet."
        );
      }
      const { mission } = await instantiateCompiledMission(userId, compiled.plan, {
        sourceIds: sources.map((s) => s.id),
        sources,
      });
      missionId = mission.id;
    }

    const advanced = await advanceMission(userId, missionId);
    return NextResponse.json({
      mission: advanced?.mission,
      steps: advanced?.steps ?? [],
    });
  } catch (err) {
    return errorResponse(err);
  }
}
