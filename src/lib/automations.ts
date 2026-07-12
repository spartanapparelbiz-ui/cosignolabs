import { runCommand } from "./agent/pipeline";
import { EngineError } from "./actions/engine";
import { logInfo } from "./log";
import { enforceGlobalPlanningBudget, enforceLimit, RateLimitError } from "./ratelimit";
import { getStore } from "./store";
import type { AutomationRecord, AutomationRunRecord } from "./types";

/**
 * Automation execution — a recurring mission run. One run = one pass through
 * the EXACT same pipeline as a typed command: the owner's per-user rate
 * limits, the global daily spend cap, the plan usage gate, the planner, and
 * the approval state machine. A run can therefore PROPOSE cards (which land
 * in the owner's decision inbox) but can never execute anything beyond tier-1
 * reads without a signature. Failures are recorded as honest run records with
 * a SAFE note — never a stack, never provider detail.
 */

export function nextRunAt(intervalHours: number, from = new Date()): string {
  return new Date(from.getTime() + intervalHours * 3_600_000).toISOString();
}

export async function runAutomation(
  automation: AutomationRecord
): Promise<AutomationRunRecord> {
  const store = getStore();
  const userId = automation.user_id;

  let status: AutomationRunRecord["status"] = "ok";
  let detail: string | null = null;
  let sessionId: string | null = null;

  try {
    // The owner's own cost gates apply to scheduled work exactly as they do
    // to typed commands — an automation can never out-spend its owner.
    await enforceLimit("commandMinute", userId);
    await enforceLimit("commandDay", userId);
    await enforceGlobalPlanningBudget();

    const result = await runCommand(userId, automation.command, {});
    sessionId = result.session.id;
    const proposed = result.actions.filter((a) => a.status === "proposed").length;
    const executed = result.actions.filter((a) => a.status === "executed").length;
    detail = `${result.actions.length} action${result.actions.length === 1 ? "" : "s"} planned · ${proposed} awaiting your signature · ${executed} auto-ran (tier 1)`;
  } catch (err) {
    status = "error";
    if (err instanceof RateLimitError) detail = "paused by rate limit — will retry next cycle.";
    else if (err instanceof EngineError) detail = err.message;
    else detail = "the run didn't complete — it will retry next cycle.";
  }

  // Advance the schedule regardless of outcome (a failing automation must
  // not hot-loop) and record the run.
  await store.updateAutomation(userId, automation.id, {
    last_run_at: new Date().toISOString(),
    next_run_at: nextRunAt(automation.interval_hours),
  });
  const run = await store.createAutomationRun({
    automation_id: automation.id,
    user_id: userId,
    status,
    detail,
    session_id: sessionId,
  });
  logInfo("automation_run", { automationId: automation.id, status });
  return run;
}
