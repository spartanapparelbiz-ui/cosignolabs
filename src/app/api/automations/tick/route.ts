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
      { error: "not_configured", message: "The scheduler isn't enabled on this deployment." },
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
  // Bounded concurrency: runs are per-owner independent (each carries its
  // owner's own rate/usage gates), and three-at-a-time keeps a full batch of
  // worst-case planner calls inside the 60s function budget — serially,
  // three slow runs already blew it and starved the rest of the batch.
  const CONCURRENCY = 3;
  for (let i = 0; i < due.length; i += CONCURRENCY) {
    const chunk = due.slice(i, i + CONCURRENCY);
    const runs = await Promise.all(chunk.map((a) => runAutomation(a)));
    chunk.forEach((a, j) => results.push({ id: a.id, status: runs[j].status }));
  }
  logInfo("automation_tick", { due: due.length });
  return NextResponse.json({ ran: results.length, results });
}
