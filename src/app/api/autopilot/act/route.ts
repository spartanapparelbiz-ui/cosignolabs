import { NextRequest, NextResponse } from "next/server";
import { runCommand } from "@/lib/agent/pipeline";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceGlobalPlanningBudget, enforceLimit } from "@/lib/ratelimit";
import { autopilotActSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Take action" on an Autopilot insight. The recommended command runs
 * through the EXACT same pipeline as a typed command — the same rate
 * limits, the same planner, the same approval state machine. Autopilot
 * never gets a faster door: everything consequential still waits for the
 * user's signature. If the insight came from a signal, that signal is
 * marked actioned so the queue reflects reality.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("commandMinute", userId);
    await enforceLimit("commandDay", userId);
    const body = parseStrict(autopilotActSchema, await readJsonBody(req), "action");
    await enforceGlobalPlanningBudget(userId);

    const result = await runCommand(userId, body.command, {});

    if (body.signal_key) {
      // Best-effort disposition update — the mission matters more.
      await getStore().setSignalStatus(userId, body.signal_key, "actioned").catch(() => null);
    }

    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
