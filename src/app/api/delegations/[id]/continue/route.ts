import { NextRequest, NextResponse } from "next/server";
import { runCommand } from "@/lib/agent/pipeline";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { buildContinuationCommand } from "@/lib/continue";
import { enforceGlobalPlanningBudget, enforceLimit } from "@/lib/ratelimit";
import { continueSchema, idParamSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Finish This / Do Everything You Can / Rescue — continue an existing
 * delegation toward its outcome using the EXACT same planner pipeline as a
 * typed command. Cosigno reads the delegation's real state (what's done,
 * what's waiting, what failed), composes an honest continuation instruction
 * that never redoes completed work, and runs it IN THE SAME session so the
 * delegation continues rather than spawning a sibling. New proposals flow
 * through the unchanged boundary — nothing executes beyond tier-1 without the
 * user's approval or signature. Nothing is faked: if the planner finds no
 * next step (common on rescue), we say so honestly.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    // Same cost gates as /api/command — continuation is a real planning call.
    await enforceLimit("commandMinute", userId);
    await enforceLimit("commandDay", userId);
    const id = parseStrict(idParamSchema, (await params).id, "session_id");
    const body = parseStrict(continueSchema, await readJsonBody(req), "continue");

    const store = getStore();
    const session = await store.getSession(userId, id);
    if (!session) throw new ApiError(404, "not_found", "we couldn't find that delegation.");
    const actions = await store.listActions(userId, { session_id: id, limit: 500 });

    await enforceGlobalPlanningBudget(userId);

    const command = buildContinuationCommand(session.title, actions, body.mode);
    const result = await runCommand(userId, command, { sessionId: id });

    const proposed = result.actions.filter((a) => a.status === "proposed").length;
    const executed = result.actions.filter((a) => a.status === "executed").length;
    const movedForward = result.actions.length > 0;

    return NextResponse.json({
      result,
      moved_forward: movedForward,
      proposed,
      executed,
      // Honest rescue outcome: nothing new means cosigno couldn't safely continue.
      message: movedForward
        ? proposed > 0
          ? `Prepared ${proposed} step${proposed === 1 ? "" : "s"} — waiting at the boundary for you.`
          : `Ran ${executed} step${executed === 1 ? "" : "s"} that were already authorized.`
        : "I couldn't move this forward safely on my own — take it from here and I'll continue.",
    });
  } catch (err) {
    return errorResponse(err);
  }
}
