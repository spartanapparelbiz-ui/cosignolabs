import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { learnedPreferences } from "@/lib/personalization";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What cosigno has learned about how this person works — read-only, and the
 * exact same list that reaches the planner.
 *
 * That equality is the point of exposing it at all: a personalization panel
 * that shows a curated subset of what the system actually believes is worse
 * than showing nothing, because it invites trust it hasn't earned. There is
 * no second, private profile.
 *
 * Turning it off is the memory switch (PATCH /api/memory) — one control for
 * "don't remember me", covering both saved notes and learned behavior.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const [preferences, prefs] = await Promise.all([
      learnedPreferences(userId),
      getStore().getPrefs(userId),
    ]);
    return NextResponse.json({ preferences, enabled: prefs.memory_enabled });
  } catch (err) {
    return errorResponse(err);
  }
}
