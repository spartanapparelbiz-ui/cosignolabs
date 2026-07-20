import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import {
  idParamSchema,
  parseStrict,
  permissionRulePatchSchema,
  readJsonBody,
} from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Toggle a rule on/off, or adjust its enforced level. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const id = parseStrict(idParamSchema, (await params).id, "rule_id");
    const body = parseStrict(permissionRulePatchSchema, await readJsonBody(req), "rule_patch");
    const rule = await getStore().updatePermissionRule(userId, id, body);
    if (!rule) throw new ApiError(404, "not_found", "we couldn't find that rule.");
    return NextResponse.json({ rule });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const id = parseStrict(idParamSchema, (await params).id, "rule_id");
    await getStore().deletePermissionRule(userId, id);
    await getStore().logAudit(userId, "rule_deleted", { id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
