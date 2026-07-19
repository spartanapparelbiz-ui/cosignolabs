import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { idParamSchema, objectiveLinkSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Link a delegation (session) to this objective. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const id = parseStrict(idParamSchema, (await params).id, "objective_id");
    const body = parseStrict(objectiveLinkSchema, await readJsonBody(req), "objective_link");
    const store = getStore();
    // Both ends must belong to the user — the store scopes by user, but check
    // the objective and session exist so we never link a stray id.
    const [objective, session] = await Promise.all([
      store.getObjective(userId, id),
      store.getSession(userId, body.session_id),
    ]);
    if (!objective) throw new ApiError(404, "not_found", "we couldn't find that objective.");
    if (!session) throw new ApiError(404, "not_found", "we couldn't find that delegation.");
    await store.linkObjectiveDelegation(userId, id, body.session_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Unlink a delegation from this objective. */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const id = parseStrict(idParamSchema, (await params).id, "objective_id");
    const body = parseStrict(objectiveLinkSchema, await readJsonBody(req), "objective_link");
    await getStore().unlinkObjectiveDelegation(userId, id, body.session_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
