import { NextRequest, NextResponse } from "next/server";
import { editAction } from "@/lib/actions/engine";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const action = await getStore().getAction(userId, id);
    if (!action) throw new ApiError(404, "not_found", "Action not found.");
    const events = await getStore().listEvents(userId, id);
    return NextResponse.json({ action, events });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Edit a PROPOSED action's payload/summary before approving. Status is not
 * editable here or anywhere else client-reachable: any attempt to pass a
 * status field is rejected outright (acceptance test: "client request
 * attempting to set status directly is rejected").
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    if ("status" in body || "tier" in body || "result" in body || "injection_flag" in body) {
      throw new ApiError(
        403,
        "immutable_field",
        "status, tier, result and injection_flag are server-controlled and cannot be set by the client."
      );
    }

    const patch: { payload?: Record<string, unknown>; summary?: string } = {};
    if (body.payload && typeof body.payload === "object") patch.payload = body.payload;
    if (typeof body.summary === "string" && body.summary.trim()) {
      patch.summary = body.summary.trim().slice(0, 500);
    }
    if (!patch.payload && !patch.summary) {
      throw new ApiError(400, "empty_patch", "Nothing to update.");
    }

    const action = await editAction(userId, id, patch);
    return NextResponse.json({ action });
  } catch (err) {
    return errorResponse(err);
  }
}
