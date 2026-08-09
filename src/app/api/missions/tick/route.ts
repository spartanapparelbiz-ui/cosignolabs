import { NextRequest, NextResponse } from "next/server";
import { logSecurity } from "@/lib/log";
import { tickMissions } from "@/lib/missions/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The mission engine's background heartbeat — same contract as the
 * automations tick: called by an external cron with the shared secret,
 * never by browsers, fail-closed without CRON_SECRET. This is what keeps
 * missions moving after the tab closes.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "not_configured", message: "The scheduler isn't enabled on this deployment." },
      { status: 503 }
    );
  }
  const given = req.headers.get("x-cron-secret") ?? "";
  if (given !== secret) {
    logSecurity("auth_failure", { at: "mission_tick" });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await tickMissions(5);
  return NextResponse.json(result);
}
