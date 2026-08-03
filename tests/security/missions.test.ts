import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";
import {
  advanceMission,
  answerMissionQuestion,
  controlMission,
  tickMissions,
} from "../../src/lib/missions/engine";
import { createMeetingPrepMission } from "../../src/lib/missions/meetingPrep";
import { TOOLS, type ToolResult } from "../../src/lib/missions/tools";
import { approveAction } from "../../src/lib/actions/engine";

/**
 * The durable mission engine's core promises, proven against persisted state
 * only (every advance call is a fresh engine pass over the store — exactly
 * what a worker restart or a cron tick looks like):
 *   - the reference mission runs end-to-end in the sandbox with honest
 *     labeling, real deliverables, approval-gated sending, verification,
 *     and a receipt,
 *   - pause halts work, stop is terminal and vetoes waiting cards,
 *   - retries are counted and give up safely,
 *   - completed steps are never re-run (no duplicate execution),
 *   - independent steps continue while one waits for input,
 *   - missions are isolated per user.
 */

vi.mock("@/lib/auth", () => ({
  authConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "user-a"),
}));

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
  resetRateLimitsForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Advance repeatedly with FRESH passes until the mission stops moving. */
async function drive(userId: string, missionId: string, passes = 10) {
  let last = null;
  for (let i = 0; i < passes; i++) {
    last = await advanceMission(userId, missionId);
    if (!last) break;
    if (["completed", "partial", "failed", "stopped", "awaiting_input", "awaiting_approval", "paused"].includes(last.mission.state)) {
      break;
    }
  }
  return last!;
}

describe("the reference mission: prepare everything for tomorrow's meeting", () => {
  it("runs end-to-end in the sandbox: deliverables, adaptive plan, approval gate, verification, receipt", async () => {
    const { mission } = await createMeetingPrepMission("user-a");

    // Drive to the approval gate — separate passes simulate restarts.
    let r = await drive("user-a", mission.id);
    expect(r.mission.state).toBe("awaiting_approval");

    // The plan expanded adaptively from the analysis discovery (v2), and the
    // change is recorded on the step that caused it.
    expect(r.mission.plan_version).toBe(2);
    const analyze = r.steps.find((s) => s.tool === "analyze.extract")!;
    expect(String(analyze.output?.plan_note)).toMatch(/added a follow-up/i);

    // Every source so far is honestly sandbox-labeled — never mixed with live.
    const gather = r.steps.filter((s) => ["calendar.find_event", "gmail.search_related", "drive.search_files"].includes(s.tool));
    for (const s of gather) {
      expect(s.state).toBe("completed");
      expect(s.sources.every((src) => src.simulated)).toBe(true);
    }

    // Real deliverables exist in the files system (brief + agenda + follow-up).
    const files = await store.listFiles("user-a");
    expect(files.map((f) => f.name).join()).toMatch(/meeting-brief/);
    expect(files.map((f) => f.name).join()).toMatch(/agenda/);
    expect(files.map((f) => f.name).join()).toMatch(/follow-up/);

    // The send step is blocked on a REAL action card — nothing sent yet.
    const sendStep = r.steps.find((s) => s.tool === "approval.offer_send")!;
    expect(sendStep.state).toBe("awaiting_approval");
    const action = (await store.getAction("user-a", sendStep.action_id!))!;
    expect(action.status).toBe("proposed");
    expect(action.category).toBe("send_email");

    // Approve → the engine settles the step WITH a verification record.
    await approveAction("user-a", action.id);
    r = await drive("user-a", mission.id);
    const settled = r.steps.find((s) => s.tool === "approval.offer_send")!;
    expect(settled.state).toBe("completed");
    expect(settled.verification?.ok).toBe(true);
    expect(settled.verification?.simulated).toBe(true); // sandbox: honestly marked

    // The mission closes with a receipt.
    expect(r.mission.state).toBe("completed");
    expect(r.mission.receipt).not.toBeNull();
    const receipt = r.mission.receipt as Record<string, unknown>;
    expect((receipt.deliverables as unknown[]).length).toBeGreaterThanOrEqual(3);
    expect((receipt.verifications as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it("a vetoed send resolves the mission as partial — the step never ran", async () => {
    const { mission } = await createMeetingPrepMission("user-a");
    let r = await drive("user-a", mission.id);
    const sendStep = r.steps.find((s) => s.tool === "approval.offer_send")!;
    const { vetoAction } = await import("../../src/lib/actions/engine");
    await vetoAction("user-a", sendStep.action_id!, "not now");
    r = await drive("user-a", mission.id);
    expect(r.steps.find((s) => s.tool === "approval.offer_send")!.state).toBe("vetoed");
    expect(r.mission.state).toBe("partial");
  });
});

describe("durability", () => {
  it("progress persists across passes — completed steps are NEVER re-run", async () => {
    const { mission } = await createMeetingPrepMission("user-a");
    await advanceMission("user-a", mission.id, 1); // one step, then "restart"
    const after1 = await store.listMissionSteps("user-a", mission.id);
    const doneIds = after1.filter((s) => s.state === "completed").map((s) => s.id);
    expect(doneIds.length).toBeGreaterThan(0);
    const stamps = new Map(after1.map((s) => [s.id, s.completed_at]));

    await advanceMission("user-a", mission.id, 1); // a fresh pass (new "worker")
    const after2 = await store.listMissionSteps("user-a", mission.id);
    for (const id of doneIds) {
      // untouched: same completion timestamp, still completed
      expect(after2.find((s) => s.id === id)!.completed_at).toBe(stamps.get(id));
    }
    // and new work happened
    expect(after2.filter((s) => s.state === "completed").length).toBeGreaterThan(doneIds.length);
  });

  it("duplicate advance after approval executes exactly once", async () => {
    const { mission } = await createMeetingPrepMission("user-a");
    let r = await drive("user-a", mission.id);
    const sendStep = r.steps.find((s) => s.tool === "approval.offer_send")!;
    await approveAction("user-a", sendStep.action_id!);
    // Two concurrent-ish settles: the second finds the card already consumed.
    await advanceMission("user-a", mission.id);
    r = (await advanceMission("user-a", mission.id))!;
    const events = await store.listEvents("user-a", sendStep.action_id!);
    expect(events.filter((e) => e.type === "executed")).toHaveLength(1);
    expect(r.steps.find((s) => s.tool === "approval.offer_send")!.state).toBe("completed");
  });

  it("the cron tick advances runnable missions without a user session", async () => {
    const { mission } = await createMeetingPrepMission("user-a");
    const { advanced } = await tickMissions(5);
    expect(advanced).toBe(1);
    const after = await store.getMission("user-a", mission.id);
    const steps = await store.listMissionSteps("user-a", mission.id);
    expect(steps.some((s) => s.state === "completed")).toBe(true);
    expect(after!.state).not.toBe("queued");
  });
});

describe("pause / stop", () => {
  it("a paused mission does no new work; resume continues", async () => {
    const { mission } = await createMeetingPrepMission("user-a");
    await controlMission("user-a", mission.id, "pause");
    await advanceMission("user-a", mission.id);
    const steps = await store.listMissionSteps("user-a", mission.id);
    expect(steps.every((s) => s.state === "ready")).toBe(true); // nothing ran

    await controlMission("user-a", mission.id, "resume");
    await advanceMission("user-a", mission.id, 1);
    const after = await store.listMissionSteps("user-a", mission.id);
    expect(after.some((s) => s.state === "completed")).toBe(true);
  });

  it("stop is terminal: steps cancel, waiting cards are vetoed, restart is impossible", async () => {
    const { mission } = await createMeetingPrepMission("user-a");
    let r = await drive("user-a", mission.id); // reach the approval gate
    const sendStep = r.steps.find((s) => s.tool === "approval.offer_send")!;

    await controlMission("user-a", mission.id, "stop");
    const action = (await store.getAction("user-a", sendStep.action_id!))!;
    expect(action.status).toBe("vetoed");

    // Neither resume nor advance can revive it.
    await controlMission("user-a", mission.id, "resume");
    r = (await advanceMission("user-a", mission.id))!;
    expect(r.mission.state).toBe("stopped");
    expect(r.steps.filter((s) => !["completed", "vetoed"].includes(s.state)).every((s) => s.state === "canceled")).toBe(true);
    // The tick skips it too.
    expect((await tickMissions(5)).advanced).toBe(0);
  });
});

describe("retries and provider failure", () => {
  it("a failing tool retries with a counted budget, then fails safely", async () => {
    const original = TOOLS["calendar.find_event"].run;
    vi.spyOn(TOOLS["calendar.find_event"], "run").mockRejectedValue(new Error("provider outage"));

    const { mission } = await createMeetingPrepMission("user-a");
    // Each advance consumes one attempt (retries happen on LATER passes —
    // exactly how a cron-driven backoff behaves).
    await advanceMission("user-a", mission.id);
    let step = (await store.listMissionSteps("user-a", mission.id))[0];
    expect(step.state).toBe("retrying");
    expect(step.retry_count).toBe(1);
    expect(step.error).toMatch(/will retry/);

    await advanceMission("user-a", mission.id);
    await advanceMission("user-a", mission.id);
    step = (await store.listMissionSteps("user-a", mission.id))[0];
    expect(step.state).toBe("failed");
    expect(step.retry_count).toBe(3);
    expect(step.error).toMatch(/gave up after 3 attempts/);

    // Recovery path: the tool comes back → a NEW mission succeeds.
    vi.mocked(TOOLS["calendar.find_event"].run).mockImplementation(original);
    const second = await createMeetingPrepMission("user-a");
    await advanceMission("user-a", second.mission.id, 1);
    const fresh = (await store.listMissionSteps("user-a", second.mission.id))[0];
    expect(fresh.state).toBe("completed");
  });

  it("a transient failure recovers on a later pass without losing progress", async () => {
    const original = TOOLS["gmail.search_related"].run;
    let calls = 0;
    vi.spyOn(TOOLS["gmail.search_related"], "run").mockImplementation(async (ctx) => {
      calls++;
      if (calls === 1) throw new Error("rate limited");
      return original(ctx);
    });
    const { mission } = await createMeetingPrepMission("user-a");
    const r = await drive("user-a", mission.id, 12);
    const step = r.steps.find((s) => s.tool === "gmail.search_related")!;
    expect(step.state).toBe("completed");
    expect(step.retry_count).toBe(1); // the failure was real and counted
    expect(r.mission.state).toBe("awaiting_approval"); // and the mission went on
  });
});

describe("structured questions", () => {
  it("a blocked step asks; independent steps continue; the answer resumes it", async () => {
    // A custom two-step mission: step 0 asks a question, step 1 is independent.
    const session = await store.createSession("user-a", "custom");
    const mission = await store.createMission({ user_id: "user-a", session_id: session.id, goal: "custom" });
    await store.createMissionSteps([
      { mission_id: mission.id, user_id: "user-a", idx: 0, purpose: "pick the meeting", operator: "calendar", tool: "calendar.find_event", depends_on: [] },
      { mission_id: mission.id, user_id: "user-a", idx: 1, purpose: "independent gather", operator: "files", tool: "drive.search_files", depends_on: [] },
    ]);
    const original = TOOLS["calendar.find_event"].run;
    vi.spyOn(TOOLS["calendar.find_event"], "run").mockImplementation(async (ctx) => {
      if (typeof ctx.step.input.answer === "string") return original(ctx);
      return {
        kind: "question",
        question: {
          question: "I found two meetings with similar names. Which one should I prepare?",
          why: "the prep is scoped to one meeting.",
          options: ["product sync", "board review"],
          recommended: "product sync",
          effect: "everything else follows the event you pick.",
        },
      } satisfies ToolResult;
    });

    let r = (await advanceMission("user-a", mission.id))!;
    // The independent step COMPLETED while the question waits.
    expect(r.steps.find((s) => s.idx === 1)!.state).toBe("completed");
    expect(r.mission.state).toBe("awaiting_input");
    expect(r.mission.pending_question?.options).toContain("board review");

    r = (await answerMissionQuestion("user-a", mission.id, "product sync"))!;
    const answered = r.steps.find((s) => s.idx === 0)!;
    expect(answered.state).toBe("completed");
    expect(String(answered.output?.summary)).toMatch(/product sync/);
    expect(r.mission.pending_question).toBeNull();
  });
});

describe("isolation and permissions", () => {
  it("missions are invisible and inert across users", async () => {
    const { mission } = await createMeetingPrepMission("user-a");
    expect(await store.getMission("user-b", mission.id)).toBeNull();
    expect(await advanceMission("user-b", mission.id)).toBeNull();
    expect(await controlMission("user-b", mission.id, "stop")).toBeNull();
    expect(await answerMissionQuestion("user-b", mission.id, "x")).toBeNull();
  });

  it("an operator can never run a tool outside its profile", async () => {
    const session = await store.createSession("user-a", "x");
    const mission = await store.createMission({ user_id: "user-a", session_id: session.id, goal: "x" });
    await store.createMissionSteps([
      // research operator trying to use the send-approval tool → refused.
      { mission_id: mission.id, user_id: "user-a", idx: 0, purpose: "sneak a send", operator: "research", tool: "approval.offer_send", depends_on: [] },
    ]);
    const r = (await advanceMission("user-a", mission.id))!;
    expect(r.steps[0].state).toBe("failed");
    expect(r.steps[0].error).toMatch(/isn't permitted/);
  });

  it("account deletion sweeps missions and steps", async () => {
    const { mission } = await createMeetingPrepMission("user-a");
    await store.deleteAllUserData("user-a");
    expect(await store.getMission("user-a", mission.id)).toBeNull();
    expect(await store.listMissionSteps("user-a", mission.id)).toHaveLength(0);
  });
});
