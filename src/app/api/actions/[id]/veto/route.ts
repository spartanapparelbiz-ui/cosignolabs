import { NextRequest, NextResponse } from "next/server";
import { vetoAction } from "@/lib/actions/engine";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { idParamSchema, parseStrict, readJsonBody, vetoSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);

    const { id } = await params;
    if (!idParamSchema.safeParse(id).success) {
      throw new ApiError(400, "bad_id", "that action id isn't valid.");
    }

    const body = parseStrict(vetoSchema, await readJsonBody(req), "veto");
    const action = await vetoAction(userId, id, (body.reason ?? "").trim());
    return NextResponse.json({ action });
  } catch (err) {
    return errorResponse(err);
  }
}
