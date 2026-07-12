import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { filePatchSchema, idParamSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    const id = parseStrict(idParamSchema, (await params).id, "file_id");
    const file = await getStore().getFile(userId, id);
    if (!file) throw new ApiError(404, "not_found", "we couldn't find that file.");
    return NextResponse.json({ file });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Edits bump the version — every save is an explicit, visible revision. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const id = parseStrict(idParamSchema, (await params).id, "file_id");
    const body = parseStrict(filePatchSchema, await readJsonBody(req), "file_patch");
    const file = await getStore().updateFile(userId, id, body);
    if (!file) throw new ApiError(404, "not_found", "we couldn't find that file.");
    return NextResponse.json({ file });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const id = parseStrict(idParamSchema, (await params).id, "file_id");
    await getStore().deleteFile(userId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
