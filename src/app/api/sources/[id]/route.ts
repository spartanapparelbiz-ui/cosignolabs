import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { idParamSchema, parseStrict } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Remove a staged source the user decided not to include (idempotent, self-scoped). */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    const id = parseStrict(idParamSchema, (await params).id, "source_id");
    await getStore().deleteMissionSource(userId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
