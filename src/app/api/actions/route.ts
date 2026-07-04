import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";
import { actionsQuerySchema, parseStrict } from "@/lib/schemas";
import type { ActionStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser();
    const q = parseStrict(
      actionsQuerySchema,
      Object.fromEntries(req.nextUrl.searchParams),
      "actions_query"
    );
    const actions = await getStore().listActions(userId, {
      session_id: q.session,
      status: q.status as ActionStatus | undefined,
      tier: q.tier ? Number(q.tier) : undefined,
      category: q.category,
      limit: q.limit,
    });
    return NextResponse.json({ actions });
  } catch (err) {
    return errorResponse(err);
  }
}
