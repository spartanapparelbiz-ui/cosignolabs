import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { checkHealth } from "@/lib/integrations/runtime/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Re-check a connection's health (OAuth token validity or MCP reachability)
 * and persist the resulting status. `key` is the connection id. Returns the
 * status so the UI can update its pill; never leaks provider detail.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const { key } = await params;
    const res = await checkHealth(userId, key);
    return NextResponse.json(res);
  } catch (err) {
    return errorResponse(err);
  }
}
