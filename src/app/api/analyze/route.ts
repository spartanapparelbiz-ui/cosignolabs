import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceGlobalPlanningBudget, enforceLimit } from "@/lib/ratelimit";
import { analyzeSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { analyze, loadSourcesForAnalysis } from "@/lib/agent/analyze";
import { getUserPlan } from "@/lib/billing";
import { logSecurity } from "@/lib/log";
import { getStore } from "@/lib/store";
import { usageLimitMessage } from "@/lib/enforcement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Read the material the user attached and ANSWER them.
 *
 * This is deliberately not the proposal pipeline. Reading is not acting: no
 * action is created, no tier is assigned, nothing is queued for approval, and
 * nothing here can reach a connected app. That is why it can return an answer
 * immediately instead of a card to approve.
 *
 * The model call is still metered and rate-limited like any other, because it
 * costs the same money whether it plans or reads.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await Promise.all([
      enforceLimit("commandMinute", userId),
      enforceLimit("commandDay", userId),
    ]);

    const body = parseStrict(analyzeSchema, await readJsonBody(req), "analyze");
    const question = body.question.trim();
    if (!question) {
      throw new ApiError(400, "empty_question", "ask a question about what you attached.");
    }

    const store = getStore();
    const [{ plan: userPlan, planId }, usage] = await Promise.all([
      getUserPlan(userId),
      store.getUsage(userId),
    ]);
    if (usage.actions_executed >= userPlan.actionLimit) {
      logSecurity("usage_limit_hit", { userId, at: "analyze", plan: planId });
      throw new ApiError(402, "usage_limit", usageLimitMessage(planId));
    }

    await enforceGlobalPlanningBudget(userId);

    const { sources, media } = await loadSourcesForAnalysis(userId, body.sourceIds ?? []);
    if ((body.sourceIds ?? []).length > 0 && sources.length === 0) {
      throw new ApiError(404, "sources_missing", "we couldn't find those attachments — add them again.");
    }

    const result = await analyze(userId, question, sources, media, {
      planId,
      sessionId: body.sessionId ?? null,
    });

    // The read call is metered — it is a real model call.
    await store.incrementUsage(userId, usage.cycle_start);

    if (!result.answer) {
      throw new ApiError(
        502,
        "no_answer",
        "the operator couldn't produce an answer — try asking it a different way."
      );
    }

    return NextResponse.json({
      answer: result.answer,
      /** Named so the user can verify what was actually opened. */
      looked_at: result.looked_at,
      could_not_read: result.could_not_read,
      images_seen: result.imagesSeen,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
