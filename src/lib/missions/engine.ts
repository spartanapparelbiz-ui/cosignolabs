import { getStore } from "../store";
import { proposeAction, vetoAction } from "../actions/engine";
import { logError, logInfo, newRequestId } from "../log";
import { CATEGORIES } from "../types";
import type {
  MissionRecord,
  MissionRunState,
  MissionStepRecord,
  MissionStepState,
} from "../types";
import { OPERATOR_PROFILES, operatorAllows } from "./operators";
import { TOOLS, type ToolContext, type ToolResult } from "./tools";

/**
 * The durable mission engine. All state lives in the store; this module only
 * ADVANCES it, one bounded pass at a time, from wherever it left off — a
 * browser tab, a cron tick, and a worker restart all resume identically.
 *
 * Guarantees:
 *  - a consequential step can only ever produce an action CARD; execution
 *    still flows through the one approval state machine,
 *  - steps are idempotent checkpoints: a completed step is never re-run,
 *    and a retried step re-runs only its own tool with a counted budget,
 *  - the plan is append-only: adaptive expansion adds steps and bumps
 *    plan_version; history is never rewritten,
 *  - paused does nothing, stopped is terminal and vetoes waiting cards.
 */

const TERMINAL_STEP: ReadonlySet<MissionStepState> = new Set([
  "completed",
  "failed",
  "vetoed",
  "skipped",
  "canceled",
]);
const TERMINAL_MISSION: ReadonlySet<MissionRunState> = new Set([
  "completed",
  "partial",
  "failed",
  "stopped",
]);

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("the step timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function depsMet(step: MissionStepRecord, steps: MissionStepRecord[]): boolean {
  return step.depends_on.every((d) => {
    const dep = steps.find((s) => s.idx === d);
    return dep ? dep.state === "completed" || dep.state === "skipped" : true;
  });
}

/** The receipt closes the mission — it runs only once everything else settled. */
function isReceipt(step: MissionStepRecord): boolean {
  return step.tool === "mission.receipt";
}

function runnableSteps(steps: MissionStepRecord[], attempted: Set<string>): MissionStepRecord[] {
  const othersSettled = steps.filter((s) => !isReceipt(s)).every((s) => TERMINAL_STEP.has(s.state));
  return steps.filter((s) => {
    if (attempted.has(s.id)) return false;
    if (s.state !== "ready" && s.state !== "retrying") return false;
    if (isReceipt(s)) return othersSettled;
    return depsMet(s, steps);
  });
}

function aggregateState(steps: MissionStepRecord[]): MissionRunState {
  if (steps.some((s) => s.state === "awaiting_approval")) return "awaiting_approval";
  if (steps.some((s) => s.state === "awaiting_input")) return "awaiting_input";
  if (steps.some((s) => s.state === "retrying")) return "retrying";
  if (!steps.every((s) => TERMINAL_STEP.has(s.state))) return "running";
  const completed = steps.filter((s) => s.state === "completed" || s.state === "skipped").length;
  const notRun = steps.length - completed;
  if (notRun === 0) return "completed";
  if (completed > 0) return "partial";
  return "failed";
}

/** Resolve the tier a proposed category runs at, honoring the user's settings. */
async function tierFor(userId: string, category: keyof typeof CATEGORIES): Promise<1 | 2 | 3> {
  const meta = CATEGORIES[category];
  if (meta.pinned) return meta.defaultTier;
  const settings = await getStore().getTierSettings(userId);
  const s = settings.find((t) => t.category === category);
  // A user setting may only RAISE the tier above the default, never lower it.
  return (s && s.tier > meta.defaultTier ? s.tier : meta.defaultTier) as 1 | 2 | 3;
}

async function applyToolResult(
  ctx: ToolContext,
  result: ToolResult
): Promise<void> {
  const store = getStore();
  const { userId, mission, step } = ctx;
  const now = new Date().toISOString();

  if (result.kind === "question") {
    await store.updateMissionStep(userId, step.id, { state: "awaiting_input" });
    await store.updateMission(userId, mission.id, {
      pending_question: { step_id: step.id, ...result.question },
    });
    return;
  }

  if (result.kind === "propose") {
    const tier = await tierFor(userId, result.category);
    const action = await proposeAction({
      session_id: mission.session_id,
      user_id: userId,
      category: result.category,
      tier,
      summary: result.summary,
      payload: result.payload,
      injection_flag: false,
      tier_note: null,
    });
    await store.updateMissionStep(userId, step.id, {
      state: "awaiting_approval",
      action_id: action.id,
    });
    return;
  }

  // kind === "ok"
  await store.updateMissionStep(userId, step.id, {
    state: "completed",
    output: { summary: result.summary, ...(result.output ?? {}) },
    sources: result.sources ?? [],
    completed_at: now,
    error: null,
  });

  if (result.expand && result.expand.steps.length > 0) {
    const steps = await store.listMissionSteps(userId, mission.id);
    const baseIdx = Math.max(...steps.map((s) => s.idx)) + 1;
    await store.createMissionSteps(
      result.expand.steps.map((n, i) => ({
        mission_id: mission.id,
        user_id: userId,
        idx: baseIdx + i,
        purpose: n.purpose,
        operator: n.operator,
        tool: n.tool,
        depends_on: n.dependsOnCurrent
          ? [step.idx]
          : n.dependsOnNewIndex !== undefined
            ? [baseIdx + n.dependsOnNewIndex]
            : [],
      }))
    );
    await store.updateMission(userId, mission.id, {
      plan_version: mission.plan_version + 1,
    });
    // The change is visible on the step that caused it — plan history intact.
    await store.updateMissionStep(userId, step.id, {
      output: { summary: result.summary, ...(result.output ?? {}), plan_note: result.expand.note },
    });
    logInfo("mission_plan_expanded", { missionId: mission.id, added: result.expand.steps.length });
  }
}

/** Resolve steps blocked on an action card whose card has since settled. */
async function settleApprovalSteps(
  userId: string,
  mission: MissionRecord,
  steps: MissionStepRecord[]
): Promise<void> {
  const store = getStore();
  for (const step of steps) {
    if (step.state !== "awaiting_approval" || !step.action_id) continue;
    const action = await store.getAction(userId, step.action_id);
    if (!action) continue;
    if (action.status === "executed") {
      // Verification: an executed card is not "done" until the outcome is
      // confirmed (or honestly marked sandbox-verified).
      let verification: Record<string, unknown> = { ok: true, detail: "executed." };
      const tool = TOOLS[step.tool];
      if (tool?.verify) {
        await store.updateMissionStep(userId, step.id, { state: "verifying" });
        try {
          verification = await withTimeout(
            tool.verify({ userId, mission, steps, step }, action),
            15_000
          );
        } catch {
          verification = { ok: false, detail: "verification didn't complete — check the provider." };
        }
      }
      await store.updateMissionStep(userId, step.id, {
        state: "completed",
        output: {
          summary:
            typeof action.result?.summary === "string"
              ? action.result.summary
              : "approved and executed.",
        },
        verification,
        completed_at: new Date().toISOString(),
      });
    } else if (action.status === "failed") {
      await store.updateMissionStep(userId, step.id, {
        state: "failed",
        error: "the approved action didn't complete — nothing was left half-done.",
      });
    } else if (action.status === "vetoed") {
      await store.updateMissionStep(userId, step.id, {
        state: "vetoed",
        error: null,
      });
    }
    // proposed/approved/executing → still waiting; leave untouched.
  }
}

export interface AdvanceResult {
  mission: MissionRecord;
  steps: MissionStepRecord[];
}

/**
 * Advance one mission by a bounded number of step-runs. Safe to call from
 * anywhere, any number of times: completed work is never redone, failures
 * consume their retry budget, and every pass ends with the persisted mission
 * state matching the aggregate of its steps.
 */
export async function advanceMission(
  userId: string,
  missionId: string,
  maxRuns = 4
): Promise<AdvanceResult | null> {
  const store = getStore();
  let mission = await store.getMission(userId, missionId);
  if (!mission) return null;
  if (mission.state === "paused" || TERMINAL_MISSION.has(mission.state)) {
    return { mission, steps: await store.listMissionSteps(userId, missionId) };
  }

  const attempted = new Set<string>();

  for (let run = 0; run <= maxRuns; run++) {
    mission = (await store.getMission(userId, missionId))!;
    // A pause/stop that landed mid-pass wins immediately.
    if (mission.state === "paused" || TERMINAL_MISSION.has(mission.state)) break;

    let steps = await store.listMissionSteps(userId, missionId);
    await settleApprovalSteps(userId, mission, steps);
    steps = await store.listMissionSteps(userId, missionId);

    const runnable = runnableSteps(steps, attempted);
    if (runnable.length === 0 || run === maxRuns) {
      const next = aggregateState(steps);
      // "running" with nothing runnable means blocked-on-something-external
      // this pass (a retry backoff, or attempted set) — persist retrying/
      // running honestly; the next tick continues.
      await store.updateMission(userId, missionId, {
        state: next,
        ...(TERMINAL_MISSION.has(next) ? { completed_at: new Date().toISOString() } : {}),
        ...(next === "failed" ? { error: "no step completed — see the step list." } : {}),
      });
      break;
    }

    const step = runnable[0];
    attempted.add(step.id);

    if (!operatorAllows(step.operator, step.tool) || !TOOLS[step.tool]) {
      await store.updateMissionStep(userId, step.id, {
        state: "failed",
        error: `the ${step.operator} operator isn't permitted to run ${step.tool}.`,
      });
      continue;
    }

    const tool = TOOLS[step.tool];
    const profile = OPERATOR_PROFILES[step.operator];
    const timeout = Math.min(tool.timeoutMs, profile.maxRuntimeMs);

    await store.updateMissionStep(userId, step.id, {
      state: "running",
      started_at: step.started_at ?? new Date().toISOString(),
    });
    await store.updateMission(userId, missionId, { state: "running" });

    try {
      const freshSteps = await store.listMissionSteps(userId, missionId);
      const fresh = freshSteps.find((s) => s.id === step.id)!;
      const result = await withTimeout(
        tool.run({ userId, mission, steps: freshSteps, step: fresh }),
        timeout
      );
      await applyToolResult({ userId, mission, steps: freshSteps, step: fresh }, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "the step didn't complete.";
      const retries = step.retry_count + 1;
      if (retries > step.max_retries) {
        await store.updateMissionStep(userId, step.id, {
          state: "failed",
          retry_count: retries,
          error: `${message} (gave up after ${retries} attempt${retries === 1 ? "" : "s"})`,
        });
      } else {
        await store.updateMissionStep(userId, step.id, {
          state: "retrying",
          retry_count: retries,
          error: `${message} (will retry — attempt ${retries} of ${step.max_retries + 1})`,
        });
      }
      logError(newRequestId(), err, { event: "mission_step_failed", missionId, tool: step.tool });
    }
  }

  const finalMission = (await store.getMission(userId, missionId))!;
  return { mission: finalMission, steps: await store.listMissionSteps(userId, missionId) };
}

/** Answer the mission's pending question — the blocked step becomes ready. */
export async function answerMissionQuestion(
  userId: string,
  missionId: string,
  answer: string
): Promise<AdvanceResult | null> {
  const store = getStore();
  const mission = await store.getMission(userId, missionId);
  if (!mission || !mission.pending_question) return null;
  const q = mission.pending_question;
  const steps = await store.listMissionSteps(userId, missionId);
  const step = steps.find((s) => s.id === q.step_id);
  if (!step) return null;
  await store.updateMissionStep(userId, step.id, {
    state: "ready",
    input: { ...step.input, answer },
    error: null,
  });
  await store.updateMission(userId, missionId, { pending_question: null, state: "queued" });
  return advanceMission(userId, missionId);
}

export type MissionControlOp = "pause" | "resume" | "stop";

/** Pause stops new work; resume re-queues; stop is terminal + vetoes waiting cards. */
export async function controlMission(
  userId: string,
  missionId: string,
  op: MissionControlOp
): Promise<MissionRecord | null> {
  const store = getStore();
  const mission = await store.getMission(userId, missionId);
  if (!mission) return null;

  if (op === "pause") {
    if (TERMINAL_MISSION.has(mission.state)) return mission;
    return store.updateMission(userId, missionId, { state: "paused" });
  }
  if (op === "resume") {
    if (mission.state !== "paused") return mission;
    return store.updateMission(userId, missionId, { state: "queued" });
  }
  // stop — terminal. Cancel every non-terminal step and veto waiting cards.
  if (TERMINAL_MISSION.has(mission.state)) return mission;
  const steps = await store.listMissionSteps(userId, missionId);
  for (const step of steps) {
    if (TERMINAL_STEP.has(step.state)) continue;
    if (step.state === "awaiting_approval" && step.action_id) {
      await vetoAction(userId, step.action_id, "mission stopped by user").catch(() => {});
    }
    await store.updateMissionStep(userId, step.id, { state: "canceled" });
  }
  return store.updateMission(userId, missionId, {
    state: "stopped",
    pending_question: null,
    completed_at: new Date().toISOString(),
  });
}

/** The cron entry point: advance every runnable mission a bounded amount. */
export async function tickMissions(limit = 5): Promise<{ advanced: number }> {
  const missions = await getStore().listRunnableMissions(limit);
  for (const m of missions) {
    try {
      await advanceMission(m.user_id, m.id, 3);
    } catch (err) {
      logError(newRequestId(), err, { event: "mission_tick_failed", missionId: m.id });
    }
  }
  if (missions.length > 0) logInfo("mission_tick", { advanced: missions.length });
  return { advanced: missions.length };
}
