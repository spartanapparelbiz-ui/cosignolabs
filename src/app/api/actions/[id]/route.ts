import { NextRequest, NextResponse } from "next/server";
import { editAction } from "@/lib/actions/engine";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";
import { editSchema, idParamSchema, parseStrict, readJsonBody } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function validId(params: Params["params"]): Promise<string> {
  const { id } = await params;
  if (!idParamSchema.safeParse(id).success) {
    throw new ApiError(400, "bad_id", "Invalid action id.");
  }
  return id;
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    const id = await validId(params);
    const action = await getStore().getAction(userId, id);
    if (!action) throw new ApiError(404, "not_found", "Action not found.");
    const events = await getStore().listEvents(userId, id);
    return NextResponse.json({ action, events });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Edit a PROPOSED action's payload/summary before approving. The schema is
 * strict: status, tier, result, user_id or any other server-controlled
 * field in the body → 400, logged as an attack signal, action unchanged.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const id = await validId(params);

    const body = parseStrict(editSchema, await readJsonBody(req), "action_edit");
    const action = await editAction(userId, id, {
      payload: body.payload,
      summary: body.summary?.trim(),
    });
    return NextResponse.json({ action });
  } catch (err) {
    return errorResponse(err);
  }
}
