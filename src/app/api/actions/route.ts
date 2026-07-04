import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";
import type { ActionStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser();
    const params = req.nextUrl.searchParams;
    const actions = await getStore().listActions(userId, {
      session_id: params.get("session") ?? undefined,
      status: (params.get("status") as ActionStatus) ?? undefined,
      tier: params.get("tier") ? Number(params.get("tier")) : undefined,
      category: params.get("category") ?? undefined,
      limit: params.get("limit") ? Number(params.get("limit")) : undefined,
    });
    return NextResponse.json({ actions });
  } catch (err) {
    return errorResponse(err);
  }
}
