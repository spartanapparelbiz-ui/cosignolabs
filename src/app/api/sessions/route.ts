import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUser();
    const sessions = await getStore().listSessions(userId);
    return NextResponse.json({ sessions });
  } catch (err) {
    return errorResponse(err);
  }
}
