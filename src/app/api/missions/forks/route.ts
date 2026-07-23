import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceGlobalPlanningBudget, enforceLimit } from "@/lib/ratelimit";
import { forkKeySchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { z } from "zod";
import { budgetForFork, buildForks, compileFork } from "@/lib/missions/forks";
import { instantiateCompiledMission } from "@/lib/missions/create";
import { advanceMission } from "@/lib/missions/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const previewSchema = z.object({ goal: z.string().min(1).max(2000) }).strict();
const selectSchema = z
  .object({ goal: z.string().min(1).max(2000), fork: forkKeySchema })
  .strict();

/**
 * Mission Forks. GET-style preview via POST (goal only) returns the fork
 * options + tradeoffs — no mission is created. With a `fork` chosen, it
 * compiles THAT approach into a mission and advances one pass — still no
 * execution beyond the approval gate. Selecting a fork never runs anything.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("commandMinute", userId);
    await enforceLimit("commandDay", userId);
    await enforceGlobalPlanningBudget();

    const raw = await readJsonBody(req);

    // Selection path (goal + fork) creates the mission; preview path (goal
    // only) just returns options.
    if (raw && typeof raw === "object" && "fork" in (raw as Record<string, unknown>)) {
      const body = parseStrict(selectSchema, raw, "fork_select");
      const plan = await compileFork(userId, body.goal, body.fork, []);
      if (!plan) {
        throw new ApiError(
          422,
          "unsupported_goal",
          "cosigno can't turn that goal into a runnable plan yet."
        );
      }
      const { mission } = await instantiateCompiledMission(userId, plan, {
        forkKey: body.fork,
        budgetCents: budgetForFork(body.fork),
      });
      const advanced = await advanceMission(userId, mission.id);
      return NextResponse.json({
        mission: advanced?.mission ?? mission,
        steps: advanced?.steps ?? [],
      });
    }

    const body = parseStrict(previewSchema, raw, "fork_preview");
    const forks = await buildForks(userId, body.goal, []);
    return NextResponse.json({ forks });
  } catch (err) {
    return errorResponse(err);
  }
}
