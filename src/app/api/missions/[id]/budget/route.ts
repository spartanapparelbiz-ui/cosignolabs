import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { budgetIncreaseSchema, idParamSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { advanceMission } from "@/lib/missions/engine";
import { clampBudget } from "@/lib/missions/budget";
import { missionBudget } from "@/lib/missions/missionBudget";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Where this mission stands against its limit. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    const id = parseStrict(idParamSchema, (await params).id, "mission_id");
    const mission = await getStore().getMission(userId, id);
    if (!mission) throw new ApiError(404, "not_found", "we couldn't find that mission.");
    return NextResponse.json({ budget: await missionBudget(userId, mission) });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Give one mission more room, and let it carry on.
 *
 * Deliberately ADDITIVE — "10 more" rather than "set it to 30". Someone
 * answering a mission that just stopped is deciding how much further to let it
 * go, not recomputing a total, and a field that asked for a total could be
 * fumbled into a much larger number than intended.
 *
 * It raises THIS mission only. Nothing here changes the workspace default,
 * because the answer to "let it finish this once" is not "do that from now on".
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const id = parseStrict(idParamSchema, (await params).id, "mission_id");
    const { add } = parseStrict(budgetIncreaseSchema, await readJsonBody(req), "budget_increase");

    const store = getStore();
    const mission = await store.getMission(userId, id);
    if (!mission) throw new ApiError(404, "not_found", "we couldn't find that mission.");

    const before = await missionBudget(userId, mission);
    if (before.unlimited) {
      throw new ApiError(
        400,
        "no_limit_to_raise",
        "this mission has no action limit — there's nothing to increase."
      );
    }
    const raised = clampBudget(before.limit + add);
    if (raised === before.limit) {
      throw new ApiError(
        400,
        "budget_at_maximum",
        "this mission is already at the highest limit a single mission can have. Start a new one to keep going."
      );
    }

    const updated = await store.updateMission(userId, id, { action_budget: raised });
    await store.logAudit(userId, "budget_raised", {
      mission_id: id,
      from: before.limit,
      to: raised,
    });

    // Only a mission that STOPPED for this reason starts moving again. One
    // paused for any other reason stays paused — more budget doesn't overrule
    // a person who pressed pause.
    if (updated && updated.state === "paused" && before.exhausted) {
      await store.updateMission(userId, id, { state: "queued", error: null });
      void advanceMission(userId, id).catch(() => undefined);
    }

    const mission2 = await store.getMission(userId, id);
    return NextResponse.json({
      mission: mission2,
      budget: mission2 ? await missionBudget(userId, mission2) : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
