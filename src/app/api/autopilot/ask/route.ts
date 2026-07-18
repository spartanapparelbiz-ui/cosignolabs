import { NextRequest, NextResponse } from "next/server";
import { answerQuestion } from "@/lib/autopilot/overview";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { autopilotAskSchema, parseStrict, readJsonBody } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ask Cosigno about the business. Answers are composed deterministically
 * from the same snapshot, signals, health, and forecast the Autopilot page
 * shows — direct answer, evidence, metrics, confidence, and a next step.
 * No model call is involved, so this is fast and never invents numbers.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const body = parseStrict(autopilotAskSchema, await readJsonBody(req), "question");
    const answer = await answerQuestion(userId, body.question);
    return NextResponse.json({ answer });
  } catch (err) {
    return errorResponse(err);
  }
}
