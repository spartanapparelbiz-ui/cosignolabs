import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { globalSearch } from "@/lib/search/global";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/search?q= — one search across the workspace.
 *
 * Reads only what this user already owns. The query is never forwarded to a
 * connected system: searching live APIs on every keystroke would fire a
 * request storm at somebody else's rate limit, and the results here are
 * navigation, not data extraction.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser();
    const q = req.nextUrl.searchParams.get("q") ?? "";
    // Bounded so a pasted document can't turn into an expensive scan.
    const results = await globalSearch(userId, q.slice(0, 120));
    return NextResponse.json({ results }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
