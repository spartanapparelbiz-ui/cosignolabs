import { NextResponse } from "next/server";
import { buildOverview } from "@/lib/autopilot/overview";
import { errorResponse, requireUser } from "@/lib/api";
import { clerkConfigured } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's first name for the brief greeting — best effort. */
async function firstName(): Promise<string | null> {
  if (!clerkConfigured()) return null;
  try {
    const { currentUser } = await import("@clerk/nextjs/server");
    const user = await currentUser();
    return user?.firstName ?? null;
  } catch {
    return null;
  }
}

/**
 * The full Autopilot overview: brief, changes, health, priority queue,
 * opportunities, signals, forecast, business map, and recommendations.
 * Read-only — marking signals seen is a separate, explicit POST (/seen).
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const overview = await buildOverview(userId, { firstName: await firstName() });
    return NextResponse.json({ overview });
  } catch (err) {
    return errorResponse(err);
  }
}
