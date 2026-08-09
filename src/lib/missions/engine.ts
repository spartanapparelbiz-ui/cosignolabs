import { getStore } from "../store";
import { EngineError, proposeAction, vetoAction } from "../actions/engine";
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
import { contractCutoff, scopeQuestion, scopeVerdict } from "./contract";
import { pausedReason } from "./budget";
import { missionBudget } from "./missionBudget";

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

/**
 * Did a step's own verification come back negative?
 *
 * Only an EXPLICIT negative counts. Most steps have no verify hook at all, and
 * treating "no evidence gathered" as "evidence of failure" would invent
 * failures — the mirror of the bug this guards against, and just as dishonest.
 * Tools report either `{verified}` or `{ok}`, so both are read.
 */
function verificationFailed(step: MissionStepRecord): boolean {
  const v = step.verification;
  if (!v || typeof v !== "object") return false;
  const r = v as { verified?: unknown; ok?: unknown };
  return r.verified === false || r.ok === false;
}

function aggregateState(steps: MissionStepRecord[]): MissionRunState {
  if (steps.length === 0) return "queued";
  if (steps.some((s) => s.state === "awaiting_approval")) return "awaiting_approval";
  if (steps.some((s) => s.state === "awaiting_input")) return "awaiting_input";
  if (steps.some((s) => s.state === "retrying")) return "retrying";
  if (!steps.every((s) => TERMINAL_STEP.has(s.state))) return "running";

  const settled = steps.filter((s) => s.state === "completed" || s.state === "skipped").length;
  const ran = steps.filter((s) => s.state === "completed").length;
  const notRun = steps.length - settled;

  // "Completed" is a claim that the work happened AND held up. A step that ran
  // but whose verification came back negative — the issue that was opened but
  // isn't visible on the repository — is exactly the case where reporting
  // success would be reporting it without evidence.
  const unverified = steps.filter(verificationFailed).length;

  if (notRun === 0) {
    if (unverified > 0) return "partial";
    // Every step skipped means nothing was actually done. Counting that as
    // completed turns "we didn't do this" into "we did this".
    if (ran === 0) return "partial";
    return "completed";
  }
  if (settled > 0) return "partial";
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

/**
 * How long a non-terminal, non-proposed action may sit before it is treated as
 * an interrupted run. Real executions finish in seconds — every tool is
 * timeout-bounded well under this — so the window is generous on purpose:
 * declaring a live execution dead is far worse than waiting another minute.
 */
const STUCK_ACTION_MS = 5 * 60_000;

/**
 * When the action entered its current status, from the immutable event log —
 * the only record of when a transition actually happened, since ActionRecord
 * carries created_at but no updated_at. Returns null when no such event is
 * found, which is read as "not yet stuck" so a missing event can never cause
 * a live execution to be reaped.
 */
async function transitionStartedAt(
  userId: string,
  actionId: string,
  status: "approved" | "executing"
): Promise<number | null> {
  try {
    const events = await getStore().listEvents(userId, actionId, 50);
    const match = events.filter((e) => e.type === status).pop();
    if (!match) return null;
    const t = Date.parse(match.created_at);
    return Number.isNaN(t) ? null : t;
  } catch {
    return null;
  }
}

/**
 * Resolve steps blocked on an action card whose card has since settled.
 * Steps settle independently, so their card reads (and any 15s-bounded
 * verifications) run concurrently instead of stacking serially. Returns
 * whether anything actually changed, so the caller can skip a re-read when
 * nothing did — the common case on a quiet tick.
 */
async function settleApprovalSteps(
  userId: string,
  mission: MissionRecord,
  steps: MissionStepRecord[]
): Promise<boolean> {
  const store = getStore();
  const awaiting = steps.filter(
    (s) => s.state === "awaiting_approval" && s.action_id
  );
  if (awaiting.length === 0) return false;

  const settled = await Promise.all(
    awaiting.map(async (step) => {
      const action = await store.getAction(userId, step.action_id!);
      if (!action) return false;
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
            verification = { ok: false, detail: "Verification didn't complete — check the provider." };
          }
        }
        await store.updateMissionStep(userId, step.id, {
          state: "completed",
          output: {
            summary:
              typeof action.result?.summary === "string"
                ? action.result.summary
                : "Approved and executed.",
          },
          verification,
          completed_at: new Date().toISOString(),
        });
        return true;
      }
      if (action.status === "failed") {
        await store.updateMissionStep(userId, step.id, {
          state: "failed",
          error: "The approved action didn't complete — nothing was left half-done.",
        });
        return true;
      }
      if (action.status === "vetoed") {
        await store.updateMissionStep(userId, step.id, {
          state: "vetoed",
          error: null,
        });
        return true;
      }
      // An action that left `proposed` should reach a terminal state within
      // seconds. If it hasn't, the execution died between the `executing`
      // transition and its terminal write — a serverless invocation being
      // reclaimed mid-call is enough to do it. Nothing reaped those, so the
      // card vanished from approvals (which lists only `proposed`) while its
      // mission sat on "waiting for your signature" with nothing to sign:
      // a deadlock with no visible cause and no way out.
      if (action.status === "approved" || action.status === "executing") {
        const startedAt = await transitionStartedAt(userId, action.id, action.status);
        // Timed from the STATUS CHANGE, never from created_at: a card approved
        // hours after it was proposed is legitimately mid-flight, and reaping
        // that would report a real, running execution as failed.
        if (startedAt === null || Date.now() - startedAt < STUCK_ACTION_MS) return false;

        // The DB state machine allows approved → executing → failed, so walk
        // it rather than trying to skip a state the trigger would reject.
        try {
          if (action.status === "approved") {
            await store.transitionAction(userId, action.id, "executing");
          }
          await store.transitionAction(userId, action.id, "failed", {
            result: { summary: "Execution didn't complete — the run was interrupted." },
          });
          await store.logEvent(userId, action.id, "failed", "system", {
            reason: "stuck_execution",
            stuck_in: action.status,
          });
        } catch {
          // Another worker settled it first — fine, it will read as terminal
          // on the next pass.
          return false;
        }

        await store.updateMissionStep(userId, step.id, {
          state: "failed",
          // Say what is and isn't known. Whether the side effect happened is
          // genuinely undetermined, and guessing either way would be worse.
          error:
            "The approval was recorded but the run was interrupted, so cosigno can't confirm whether it took effect. Check the app before retrying.",
        });
        return true;
      }
      // proposed → still waiting on the operator; leave untouched.
      return false;
    })
  );
  return settled.some(Boolean);
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
    if (run > 0) {
      // Re-read on later passes only — run 0 uses the record fetched above
      // (nothing has intervened). A pause/stop that landed mid-pass wins
      // immediately.
      mission = (await store.getMission(userId, missionId))!;
      if (mission.state === "paused" || TERMINAL_MISSION.has(mission.state)) break;
    }

    let steps = await store.listMissionSteps(userId, missionId);
    // Only re-read the step list when settlement actually changed something.
    if (await settleApprovalSteps(userId, mission, steps)) {
      steps = await store.listMissionSteps(userId, missionId);
    }

    // The approval log this mission's contract is derived from. Re-read each
    // pass, because a card approved during this very advance moves the
    // cutoff — and reading it once up front would judge later steps against a
    // stale idea of what the user had signed.
    const missionEvents = await store
      .listEventsForActions(
        userId,
        steps.map((s) => s.action_id).filter((id): id is string => Boolean(id))
      )
      .catch(() => []);

    const runnable = runnableSteps(steps, attempted);
    if (runnable.length === 0 || run === maxRuns) {
      const next = aggregateState(steps);
      // "running" with nothing runnable means blocked-on-something-external
      // this pass (a retry backoff, or attempted set) — persist retrying/
      // running honestly; the next tick continues.
      await store.updateMission(userId, missionId, {
        state: next,
        ...(TERMINAL_MISSION.has(next) ? { completed_at: new Date().toISOString() } : {}),
        ...(next === "failed" ? { error: "No step completed — see the step list." } : {}),
      });
      break;
    }

    const step = runnable[0];
    attempted.add(step.id);

    // Cost control: a mission can never out-run its budget, and an adaptive
    // plan can't grow past it either. tool_calls is capped from budget_cents
    // (≈ one cent per five calls, matching the manifest limit). Over the cap →
    // a clean blocked state with a plain reason, never silent overrun.
    const maxToolCalls = Math.max(1, Math.floor(mission.budget_cents / 5));
    if (mission.tool_calls >= maxToolCalls) {
      await store.updateMission(userId, missionId, {
        state: "blocked",
        // Distinct from the action budget, and worded so the two can't be
        // confused: this one isn't a setting, and more room won't lift it.
        error: `this mission ran for as long as a single mission can (${maxToolCalls} steps of work). start a new one to carry on.`,
      });
      break;
    }

    // ACTION BUDGET. How many things cosigno may CHANGE in the world before it
    // stops and checks in — the limit the user actually set, in the unit they
    // set it in. Checked between steps, which is exact: one step proposes at
    // most one action, so the mission stops ON the limit rather than past it.
    //
    // Reading and drafting don't count, so a mission never stalls mid-research.
    // It stops at the moment before it would change something new.
    const budget = await missionBudget(userId, mission);
    if (budget.exhausted) {
      await store.updateMission(userId, missionId, {
        state: "paused",
        error: pausedReason(budget),
      });
      logInfo("mission_budget_reached", { missionId, used: budget.used, limit: budget.limit });
      break;
    }

    // SCOPE CONTRACT. Approval means "I approve this plan". A consequential
    // step that appeared AFTER the user signed was never in that plan, so it
    // gets its own decision rather than riding on the earlier signature.
    // Checked here — immediately before the tool runs and before any side
    // effect is possible — rather than at planning time, because the plan can
    // grow between the two.
    const verdict = scopeVerdict(step, contractCutoff(missionEvents));
    if (!verdict.allowed) {
      if (verdict.reason === "refused") {
        await store.updateMissionStep(userId, step.id, {
          state: "skipped",
          error: "You declined this step — it wasn't part of the approved plan.",
        });
        continue;
      }
      // Park the mission on an explicit question. It cannot proceed without a
      // human answer, and the question names the gap instead of reading like
      // routine progress.
      await store.updateMissionStep(userId, step.id, { state: "awaiting_input" });
      await store.updateMission(userId, missionId, {
        state: "awaiting_input",
        pending_question: { ...scopeQuestion(step), step_id: step.id },
      });
      logInfo("mission_scope_gate", { missionId, tool: step.tool, stepId: step.id });
      break;
    }

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
    await store.updateMission(userId, missionId, {
      state: "running",
      tool_calls: mission.tool_calls + 1,
    });
    mission.tool_calls += 1;

    try {
      const freshSteps = await store.listMissionSteps(userId, missionId);
      const fresh = freshSteps.find((s) => s.id === step.id)!;
      const result = await withTimeout(
        tool.run({ userId, mission, steps: freshSteps, step: fresh }),
        timeout
      );
      await applyToolResult({ userId, mission, steps: freshSteps, step: fresh }, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "The step didn't complete.";
      // A forbidden capability is a decision, not a transient failure. Retrying
      // it would burn attempts to arrive at the same refusal, and would read in
      // the log as if cosigno kept trying to do the thing you said never.
      if (err instanceof EngineError && err.code === "forbidden") {
        await store.updateMissionStep(userId, step.id, { state: "failed", error: message });
        continue;
      }
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

  const [finalMission, finalSteps] = await Promise.all([
    store.getMission(userId, missionId),
    store.listMissionSteps(userId, missionId),
  ]);
  return { mission: finalMission!, steps: finalSteps };
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
    // A mission that stopped because it ran out of changes can't be resumed by
    // asking again — it would pause on the very next pass. The only thing that
    // moves it is more budget, so say so rather than looping.
    const budget = await missionBudget(userId, mission);
    if (budget.exhausted) return mission;
    return store.updateMission(userId, missionId, { state: "queued", error: null });
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

const LEASE_TTL_MS = 90_000;

/**
 * The cron entry point: advance every runnable mission a bounded amount.
 * Each mission is guarded by a short execution lease so two overlapping ticks
 * (or a second worker) never advance the same mission — and therefore never
 * run the same consequential step — simultaneously. A worker that can't claim
 * the lease skips the mission; the holder releases it when done, and an
 * abandoned lease expires so work always recovers.
 */
export async function tickMissions(limit = 5, worker = newRequestId()): Promise<{ advanced: number; skipped: number }> {
  const store = getStore();
  const missions = await store.listRunnableMissions(limit);
  let advanced = 0;
  let skipped = 0;
  for (const m of missions) {
    const leased = await store.claimMissionLease(m.id, worker, LEASE_TTL_MS);
    if (!leased) {
      skipped += 1; // another worker holds a live lease — don't double-run
      continue;
    }
    try {
      await advanceMission(m.user_id, m.id, 3);
      advanced += 1;
    } catch (err) {
      logError(newRequestId(), err, { event: "mission_tick_failed", missionId: m.id });
    } finally {
      await store.releaseMissionLease(m.id, worker).catch(() => {});
    }
  }
  if (missions.length > 0) logInfo("mission_tick", { advanced, skipped });
  return { advanced, skipped };
}
