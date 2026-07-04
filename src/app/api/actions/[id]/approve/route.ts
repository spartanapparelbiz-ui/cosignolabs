import { NextRequest, NextResponse } from "next/server";
import { approveAction } from "@/lib/actions/engine";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { approveSchema, idParamSchema, parseStrict, readJsonBody } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);

    const { id } = await params;
    if (!idParamSchema.safeParse(id).success) {
      throw new ApiError(400, "bad_id", "Invalid action id.");
    }

    const body = parseStrict(approveSchema, await readJsonBody(req), "approve");
    const action = await approveAction(userId, id, {
      confirmation: body.confirmation,
      payload: body.payload,
    });
    return NextResponse.json({ action });
  } catch (err) {
    return errorResponse(err);
  }
}
