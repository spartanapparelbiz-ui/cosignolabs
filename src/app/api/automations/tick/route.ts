import { NextRequest, NextResponse } from "next/server";
import { logInfo, logSecurity } from "@/lib/log";
import { getStore } from "@/lib/store";
import { runAutomation } from "@/lib/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The scheduler's entry point. Called by an external cron (Netlify scheduled
 * function / cron-job service) with the shared secret — NEVER by browsers.
 * Fail-closed: without CRON_SECRET configured, or without the right header,
 * it refuses. Each due automation runs under ITS OWNER'S identity and cost
 * gates; a bounded batch per tick keeps the function inside its budget.
 */
const BATCH = 10;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Not configured → the scheduler simply isn't on. Refuse loudly.
    return NextResponse.json(
      { error: "not_configured", message: "the scheduler isn't enabled on this deployment." },
      { status: 503 }
    );
  }
  const given = req.headers.get("x-cron-secret") ?? "";
  if (given !== secret) {
    logSecurity("auth_failure", { at: "automation_tick" });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const due = await getStore().listDueAutomations(BATCH);
  const results: { id: string; status: string }[] = [];
  for (const automation of due) {
    const run = await runAutomation(automation);
    results.push({ id: automation.id, status: run.status });
  }
  logInfo("automation_tick", { due: due.length });
  return NextResponse.json({ ran: results.length, results });
}
