import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { loadHome } from "@/lib/home/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/home — the whole operator home in one round trip.
 *
 * The page server-renders this same model, so this endpoint exists for the
 * background revalidate: when a mission advances or a decision is signed,
 * home refetches ONE thing instead of re-opening the five requests it used to
 * fan out on every poll.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const home = await loadHome(userId);
    return NextResponse.json(home, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
