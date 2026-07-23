import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceGlobalPlanningBudget, enforceLimit } from "@/lib/ratelimit";
import { parseStrict, radarPrepareSchema, readJsonBody } from "@/lib/schemas";
import { radarItemByKey } from "@/lib/radar";
import { getStore } from "@/lib/store";
import { advanceMission } from "@/lib/missions/engine";
import { compileMission } from "@/lib/missions/compiler";
import { instantiateCompiledMission } from "@/lib/missions/create";
import { createMeetingPrepMission } from "@/lib/missions/meetingPrep";
import { createLaptopCompareMission } from "@/lib/missions/laptopCompare";
import {
  createDailyBriefMission,
  createFollowupsMission,
  createInboxCleanupMission,
} from "@/lib/missions/dailyJobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Radar → "Prepare Mission". Converts a detected Radar item into a real,
 * approval-gated mission — never an execution. The command/template comes from
 * the SERVER-recomputed item (never from the client body), so a user can't
 * smuggle an arbitrary goal through this door. Items that point at an existing
 * surface (approve a card, resume a mission) are honestly refused with a 409
 * telling the caller what to do instead — no fake mission, no dead button.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("commandMinute", userId);
    await enforceLimit("commandDay", userId);
    await enforceGlobalPlanningBudget();
    const body = parseStrict(radarPrepareSchema, await readJsonBody(req), "radar_prepare");

    const item = await radarItemByKey(userId, body.key);
    if (!item) {
      throw new ApiError(404, "not_found", "that radar item isn't in your current feed anymore.");
    }

    let missionId: string | null = null;

    if (item.suggestedTemplate) {
      const t = item.suggestedTemplate;
      const created =
        t === "meeting_prep"
          ? await createMeetingPrepMission(userId)
          : t === "laptop_compare"
            ? await createLaptopCompareMission(userId)
            : t === "inbox_cleanup"
              ? await createInboxCleanupMission(userId)
              : t === "followups"
                ? await createFollowupsMission(userId)
                : await createDailyBriefMission(userId);
      missionId = created.mission.id;
    } else if (item.suggestedCommand) {
      const compiled = await compileMission(userId, item.suggestedCommand, []);
      if (compiled.blocked) {
        throw new ApiError(
          422,
          "unsupported_goal",
          compiled.understood.boundary ||
            "cosigno can't turn this into a runnable plan yet — the recommended step is manual for now."
        );
      }
      const { mission } = await instantiateCompiledMission(userId, compiled.plan, {});
      missionId = mission.id;
    } else {
      // Honest: this Radar item is a pointer to an existing surface, not new
      // work to prepare. Tell the caller exactly what to do instead.
      throw new ApiError(
        409,
        "not_preparable",
        item.recommendation ||
          "this signal points to work you already have open — no new mission to prepare."
      );
    }

    // Record that the user acted on this item, then advance one pass so the
    // prepared CoSign Card (if the plan reaches an approval step) is ready.
    await getStore().setRadarStatus(userId, item.key, "prepared").catch(() => null);
    const advanced = await advanceMission(userId, missionId);
    return NextResponse.json({
      mission: advanced?.mission ?? { id: missionId },
      steps: advanced?.steps ?? [],
    });
  } catch (err) {
    return errorResponse(err);
  }
}
