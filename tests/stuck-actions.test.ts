import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../src/lib/store/memory";
import { advanceMission } from "../src/lib/missions/engine";

/**
 * An action that leaves `proposed` must always reach a terminal state.
 *
 * When it didn't — a serverless invocation reclaimed between the `executing`
 * transition and its terminal write is enough — the card became invisible
 * (approvals lists only `proposed`) while its mission sat forever on "waiting
 * for your signature" with nothing to sign. A deadlock with no visible cause
 * and no way out. Nothing reaped those.
 *
 * The dangerous half of the fix is the timing source: reaping must key off
 * WHEN THE STATUS CHANGED, not when the action was created, or a card approved
 * hours after it was proposed gets killed mid-execution.
 */

vi.mock("@/lib/auth", () => ({
  authConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "user-a"),
}));

const USER = "user-a";

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
});

/** A mission with one step parked on an action card, as the engine leaves it. */
async function missionAwaitingAction(opts: {
  actionStatus: "approved" | "executing";
  /** Age of the status-change event, in minutes. */
  transitionedMinutesAgo: number;
  /** Age of the action row itself — deliberately independent of the above. */
  createdMinutesAgo?: number;
}) {
  const session = await store.createSession(USER, "t");
  const mission = await store.createMission({
    user_id: USER,
    session_id: session.id,
    goal: "open an issue in owner/name titled \"cosigno test\"",
  } as never);

  const action = await store.createAction({
    user_id: USER,
    session_id: session.id,
    category: "connection_call",
    tier: 2,
    summary: "open issue",
    payload: { action: "create_issue", args: { repo: "owner/name", title: "cosigno test" } },
  } as never);

  const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();

  // Age the row itself, so a created_at-based implementation would misfire.
  const row = (store as unknown as { actions: Array<{ id: string; created_at: string; status: string }> }).actions.find(
    (a) => a.id === action.id
  )!;
  row.created_at = iso(opts.createdMinutesAgo ?? opts.transitionedMinutesAgo);

  await store.transitionAction(USER, action.id, "approved");
  await store.logEvent(USER, action.id, "approved", "user", {});
  if (opts.actionStatus === "executing") {
    await store.transitionAction(USER, action.id, "executing");
    await store.logEvent(USER, action.id, "executing", "system", {});
  }

  // Backdate the event that marks entry into the current status.
  const events = (store as unknown as { events: Array<{ action_id: string; type: string; created_at: string }> }).events;
  const marker = events.filter((e) => e.action_id === action.id && e.type === opts.actionStatus).pop()!;
  marker.created_at = iso(opts.transitionedMinutesAgo);

  const [step] = await store.createMissionSteps([
    {
      mission_id: mission.id,
      user_id: USER,
      idx: 0,
      purpose: "Draft the issue and offer it for approval",
      operator: "code",
      tool: "github.propose_issue",
      depends_on: [],
    } as never,
  ]);
  await store.updateMissionStep(USER, step.id, {
    state: "awaiting_approval",
    action_id: action.id,
  });
  await store.updateMission(USER, mission.id, { state: "running" });

  return { mission, step, action };
}

describe("interrupted executions are recovered, not left to deadlock", () => {
  it.each(["executing", "approved"] as const)(
    "an action stuck in %s past the window fails its step instead of waiting forever",
    async (actionStatus) => {
      const { mission, step } = await missionAwaitingAction({
        actionStatus,
        transitionedMinutesAgo: 30,
      });

      await advanceMission(USER, mission.id);

      const steps = await store.listMissionSteps(USER, mission.id);
      const settled = steps.find((s) => s.id === step.id)!;
      expect(settled.state).toBe("failed");
      // The honest part: whether the side effect landed is genuinely unknown.
      expect(settled.error).toMatch(/can't confirm whether it took effect/i);
    }
  );

  it("moves the action itself to a terminal state so it stops being invisible", async () => {
    const { mission, action } = await missionAwaitingAction({
      actionStatus: "executing",
      transitionedMinutesAgo: 30,
    });

    await advanceMission(USER, mission.id);

    const after = await store.getAction(USER, action.id);
    expect(after?.status).toBe("failed");
  });

  it("leaves a recently-started execution alone", async () => {
    const { mission, step, action } = await missionAwaitingAction({
      actionStatus: "executing",
      transitionedMinutesAgo: 1,
    });

    await advanceMission(USER, mission.id);

    const steps = await store.listMissionSteps(USER, mission.id);
    expect(steps.find((s) => s.id === step.id)!.state).toBe("awaiting_approval");
    expect((await store.getAction(USER, action.id))?.status).toBe("executing");
  });

  it("does not kill a live run just because the card was proposed long ago", async () => {
    // The trap: created 6 hours ago, approved 30 seconds ago. Timing off
    // created_at would report a healthy, running execution as failed.
    const { mission, step, action } = await missionAwaitingAction({
      actionStatus: "executing",
      transitionedMinutesAgo: 0.5,
      createdMinutesAgo: 360,
    });

    await advanceMission(USER, mission.id);

    const steps = await store.listMissionSteps(USER, mission.id);
    expect(steps.find((s) => s.id === step.id)!.state).toBe("awaiting_approval");
    expect((await store.getAction(USER, action.id))?.status).toBe("executing");
  });

  it("a still-proposed card keeps waiting on the operator — it is not stuck", async () => {
    const session = await store.createSession(USER, "t");
    const mission = await store.createMission({
      user_id: USER,
      session_id: session.id,
      goal: "open an issue in owner/name titled \"x\"",
    } as never);
    const action = await store.createAction({
      user_id: USER,
      session_id: session.id,
      category: "connection_call",
      tier: 2,
      summary: "open issue",
      payload: {},
    } as never);
    const [step] = await store.createMissionSteps([
      {
        mission_id: mission.id,
        user_id: USER,
        idx: 0,
        purpose: "p",
        operator: "code",
        tool: "github.propose_issue",
        depends_on: [],
      } as never,
    ]);
    await store.updateMissionStep(USER, step.id, {
      state: "awaiting_approval",
      action_id: action.id,
    });
    await store.updateMission(USER, mission.id, { state: "running" });

    await advanceMission(USER, mission.id);

    const steps = await store.listMissionSteps(USER, mission.id);
    expect(steps.find((s) => s.id === step.id)!.state).toBe("awaiting_approval");
    expect((await store.getAction(USER, action.id))?.status).toBe("proposed");
  });
});
