import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { buildDailyCosign } from "@/lib/dailyCosign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily CoSign — the day's review. Read-only: it organizes prepared work,
 * warnings, and recommendations. Every item is approved individually through
 * the normal gate; there is deliberately no "approve everything" endpoint.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const daily = await buildDailyCosign(userId);
    return NextResponse.json({ daily });
  } catch (err) {
    return errorResponse(err);
  }
}
