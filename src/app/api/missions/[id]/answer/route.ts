import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { idParamSchema, missionAnswerSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { answerMissionQuestion } from "@/lib/missions/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const id = parseStrict(idParamSchema, (await params).id, "mission_id");
    const body = parseStrict(missionAnswerSchema, await readJsonBody(req), "mission_answer");
    const result = await answerMissionQuestion(userId, id, body.answer);
    if (!result) {
      throw new ApiError(404, "not_found", "that mission isn't waiting on a question.");
    }
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
