import { NextResponse } from "next/server";
import { buildOverview } from "@/lib/autopilot/overview";
import { errorResponse, requireUser } from "@/lib/api";
import { authConfigured } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's first name for the brief greeting — best effort. */
async function firstName(): Promise<string | null> {
  if (!authConfigured()) return null;
  try {
    const { supabaseUser } = await import("@/lib/supabaseAuth/server");
    const user = await supabaseUser();
    const name = (user?.user_metadata as { name?: string } | undefined)?.name;
    if (name) return name.split(" ")[0] || null;
    return user?.email?.split("@")[0] ?? null;
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
