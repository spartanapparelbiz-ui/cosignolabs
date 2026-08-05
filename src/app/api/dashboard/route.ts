import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { buildAdaptiveDashboard } from "@/lib/dashboard/adaptive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard — the dashboard this company should actually see.
 *
 * Assembled from live connections rather than a fixed widget list, so the
 * layout grows as more is connected and never shows a card for an app that
 * isn't there.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const dashboard = await buildAdaptiveDashboard(userId);
    return NextResponse.json(dashboard, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
