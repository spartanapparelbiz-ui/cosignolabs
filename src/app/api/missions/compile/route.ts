import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { missionCompileSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { compileMission, type SourceContext } from "@/lib/missions/compiler";
import { getStore } from "@/lib/store";
import type { MissionSourceRecord } from "@/lib/types";

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
    let sources: SourceContext[] = [];
    if (body.sourceIds && body.sourceIds.length > 0) {
      const staged = await getStore().listStagedSources(userId);
      const byId = new Map(staged.map((s: MissionSourceRecord) => [s.id, s]));
      sources = body.sourceIds
        .map((id) => byId.get(id))
        .filter((s): s is MissionSourceRecord => Boolean(s))
        .map((s) => ({
          id: s.id,
          kind: s.kind,
          name: s.name,
          subtype: s.subtype,
          status: s.status,
          summary: s.summary,
          injection_flag: s.injection_flag,
        }));
    }
    const result = await compileMission(userId, body.goal, sources);
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
