import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { idParamSchema, parseStrict } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { missionBudget } from "@/lib/missions/missionBudget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    const id = parseStrict(idParamSchema, (await params).id, "mission_id");
    const mission = await getStore().getMission(userId, id);
    if (!mission) throw new ApiError(404, "not_found", "we couldn't find that mission.");
    // The budget rides along with the mission so the live counter never
    // disagrees with the state next to it — one fetch, one moment in time.
    const [steps, sources, budget] = await Promise.all([
      getStore().listMissionSteps(userId, id),
      getStore().listMissionSources(userId, id),
      missionBudget(userId, mission),
    ]);
    return NextResponse.json({ mission, steps, sources, budget });
  } catch (err) {
    return errorResponse(err);
  }
}
