import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";
import { missionBudget } from "@/lib/missions/missionBudget";
import { listDecisions } from "@/lib/authz/store";
import type { MissionRecord, MissionStepRecord } from "@/lib/types";

/**
 * GET /api/mission-control — one live node per running agent.
 *
 * A "node" is a mission: the durable unit of agent work. Every field below is
 * read from real state — the mission's own counters (tool_calls,
 * browser_actions, changes made against the mission's limit), its worker lease, and its step rows.
 *
 * Telemetry the runtime does not collect — process CPU, RSS memory, token
 * counts, cost-per-minute, model confidence — is NOT returned. It would have
 * to be invented, and a control room that invents numbers is actively
 * dangerous: operators make go/no-go calls on it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIVE_STATES = new Set([
  "queued",
  "running",
  "retrying",
  "verifying",
  "awaiting_input",
  "awaiting_approval",
]);

const QUEUED_STEP_STATES = new Set(["ready", "retrying"]);

/** Health is derived, never asserted: retries and failures degrade it. */
function healthOf(m: MissionRecord, steps: MissionStepRecord[]): {
  score: number;
  label: "healthy" | "degraded" | "stalled" | "failed";
} {
  if (m.state === "failed") return { score: 0, label: "failed" };
  const retries = steps.reduce((n, s) => n + (s.retry_count ?? 0), 0);
  const failed = steps.filter((s) => s.state === "failed").length;
  const leaseLive = m.lease_expires_at ? Date.parse(m.lease_expires_at) > Date.now() : false;

  let score = 100 - retries * 12 - failed * 25;
  if (m.state === "awaiting_input" || m.state === "awaiting_approval") score = Math.min(score, 80);
  // Running but nobody holds the lease = no worker is advancing it.
  if (m.state === "running" && !leaseLive) score = Math.min(score, 45);
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    label: score >= 75 ? "healthy" : score >= 40 ? "degraded" : "stalled",
  };
}

export async function GET() {
  try {
    const userId = await requireUser();
    const store = getStore();

    const missions = await store.listMissions(userId, 40).catch(() => []);
    const live = missions.filter((m) => LIVE_STATES.has(m.state));
    const shown = (live.length ? live : missions).slice(0, 12);

    const stepLists = await Promise.all(
      shown.map((m) => store.listMissionSteps(userId, m.id).catch(() => [] as MissionStepRecord[]))
    );
    // The user-facing limit, in changes. `budget_cents` stays where it is and
    // keeps capping tool calls internally — it just stops being shown as if it
    // were a number anyone chose.
    const budgets = await Promise.all(
      shown.map((m) => missionBudget(userId, m).catch(() => null))
    );

    // Risk per actor comes from the authorization ledger — the same blast
    // radius the engine already computed. Not a new score.
    const ledger = listDecisions(`org_${userId}`, 200).concat(listDecisions("org_demo", 200));
    const riskByActor = new Map<string, string>();
    for (const d of ledger) {
      if (!riskByActor.has(d.actor)) riskByActor.set(d.actor, d.blast_level);
    }

    const now = Date.now();
    const nodes = shown.map((m, i) => {
      const steps = stepLists[i] ?? [];
      const running = steps.find((s) => s.state === "running");
      const done = steps.filter((s) => s.state === "completed");
      const last = [...done].sort(
        (a, b) => Date.parse(b.completed_at ?? "0") - Date.parse(a.completed_at ?? "0")
      )[0];
      const operator = running?.operator ?? last?.operator ?? "operator";
      const connectors = Array.from(new Set(steps.map((s) => s.tool).filter(Boolean)));
      const health = healthOf(m, steps);
      const leaseLive = m.lease_expires_at ? Date.parse(m.lease_expires_at) > now : false;

      return {
        id: m.id,
        operator,
        goal: m.goal,
        state: m.state,
        // what it is doing right now
        // A live mission with no step mid-flight is BETWEEN steps, not idle —
        // saying "idle" would misreport an agent that is actively working.
        current_task:
          running?.purpose ??
          (m.state === "queued"
            ? "waiting to start"
            : m.state === "running" || m.state === "retrying" || m.state === "verifying"
              ? "between steps"
              : null),
        current_tool: running?.tool ?? null,
        // real counters
        tool_calls: m.tool_calls,
        browser_actions: m.browser_actions,
        changes_made: budgets[i]?.used ?? 0,
        changes_allowed: budgets[i]?.limit ?? null,
        // real progress
        steps_total: steps.length,
        steps_done: done.length,
        queue_size: steps.filter((s) => QUEUED_STEP_STATES.has(s.state)).length,
        retries: steps.reduce((n, s) => n + (s.retry_count ?? 0), 0),
        // real timing
        runtime_ms: Math.max(0, now - Date.parse(m.created_at)),
        updated_ms_ago: Math.max(0, now - Date.parse(m.updated_at)),
        worker_attached: leaseLive,
        // derived, explainable
        health_score: health.score,
        health: health.label,
        risk: riskByActor.get(operator) ?? null,
        connectors,
        last_action: last?.purpose ?? null,
        blocked_on:
          m.state === "awaiting_approval"
            ? "your signature"
            : m.state === "awaiting_input"
              ? "your answer"
              : null,
      };
    });

    return NextResponse.json(
      {
        generated_at: new Date().toISOString(),
        live_count: live.length,
        nodes,
        // Declared so the UI can state the gap rather than imply completeness.
        not_instrumented: ["cpu", "memory", "tokens", "cost_per_minute", "confidence"],
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
