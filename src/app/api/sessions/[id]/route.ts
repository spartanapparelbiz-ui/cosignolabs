import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";
import { idParamSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    if (!idParamSchema.safeParse(id).success) {
      throw new ApiError(400, "bad_id", "that session id isn't valid.");
    }
    const store = getStore();
    const session = await store.getSession(userId, id);
    if (!session) throw new ApiError(404, "not_found", "we couldn't find that session.");
    const [messages, actions] = await Promise.all([
      store.listMessages(userId, id),
      store.listActions(userId, { session_id: id }),
    ]);
    return NextResponse.json({ session, messages, actions });
  } catch (err) {
    return errorResponse(err);
  }
}
