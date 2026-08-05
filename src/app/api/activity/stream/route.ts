import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { buildActivity, type ActivityKind } from "@/lib/activity/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: ActivityKind[] = ["work", "decision", "connection", "policy", "safety"];

/**
 * GET /api/activity/stream — the one timeline.
 *
 * Every page that shows history reads this and filters it, so there is no
 * second history anywhere to disagree with this one.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser();
    const params = req.nextUrl.searchParams;

    const requested = (params.get("kinds") ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter((k): k is ActivityKind => (KINDS as string[]).includes(k));

    const events = await buildActivity(userId, {
      ...(requested.length ? { kinds: requested } : {}),
      ...(params.get("mission") ? { missionId: params.get("mission")! } : {}),
      ...(params.get("app") ? { providerKey: params.get("app")! } : {}),
      limit: Math.min(Number(params.get("limit") ?? 60) || 60, 200),
    });

    return NextResponse.json({ events }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
