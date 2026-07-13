import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List the current user's STAGED sources (in the ask box, not yet on a mission). */
export async function GET() {
  try {
    const userId = await requireUser();
    const sources = await getStore().listStagedSources(userId);
    return NextResponse.json({ sources });
  } catch (err) {
    return errorResponse(err);
  }
}
