import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody, signalStatusSchema } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Set the user's disposition on one signal (ignore / seen / actioned). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const { key } = await params;
    const body = parseStrict(signalStatusSchema, await readJsonBody(req), "signal status");
    const state = await getStore().setSignalStatus(userId, key, body.status);
    if (!state) {
      throw new ApiError(404, "not_found", "that signal isn't in your feed.");
    }
    return NextResponse.json({ state });
  } catch (err) {
    return errorResponse(err);
  }
}
