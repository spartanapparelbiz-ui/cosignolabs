import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../src/lib/store/memory";
import { advanceMission, answerMissionQuestion } from "../src/lib/missions/engine";
import {
  contractCutoff,
  scopeVerdict,
  withinContract,
  SCOPE_APPROVE,
  SCOPE_REFUSE,
} from "../src/lib/missions/contract";
import type { ActionEventRecord, MissionStepRecord } from "../src/lib/types";

/**
 * The question this feature has to survive:
 *
 *   "Could this ever allow cosigno to perform an action the user did not
 *    approve?"
 *
 * Approval means "I approve THIS plan". The plan can legitimately grow
 * mid-flight — analyze.extract appends a follow-up draft when it measurably
 * finds follow-up material — so the guard can't just ban growth. It has to let
 * execution detail through and stop new consequential work.
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

const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

function ev(over: Partial<ActionEventRecord> = {}): ActionEventRecord {
  return {
    id: "e",
    action_id: "a",
    user_id: USER,
    type: "approved",
    actor: "user",
    detail: {},
    created_at: ago(10),
    ...over,
  } as ActionEventRecord;
}

function step(over: Partial<MissionStepRecord> = {}): MissionStepRecord {
  return {
    id: "s",
    mission_id: "m",
    user_id: USER,
    idx: 0,
    purpose: "do a thing",
    operator: "communication",
    tool: "approval.offer_send",
    state: "ready",
    depends_on: [],
    input: {},
    output: null,
    sources: [],
    action_id: null,
    retry_count: 0,
    max_retries: 2,
    error: null,
    verification: null,
    started_at: null,
    completed_at: null,
    created_at: ago(20),
    updated_at: ago(20),
    ...over,
  } as MissionStepRecord;
}

describe("the contract starts at the human signature", () => {
  it("takes the earliest human approval", () => {
    const recent = ago(5);
    const earliest = ago(30);
    expect(contractCutoff([ev({ created_at: recent }), ev({ created_at: earliest })])).toBe(earliest);
  });

  it("an auto-approved tier-1 card does not start it", () => {
    // Otherwise a mission bootstraps its own contract out of work the engine
    // cleared for itself, and every later step looks pre-approved.
    expect(contractCutoff([ev({ actor: "system", detail: { auto: true } })])).toBeNull();
    expect(contractCutoff([ev({ actor: "agent" })])).toBeNull();
  });

  it("is null when nothing has been signed", () => {
    expect(contractCutoff([])).toBeNull();
    expect(contractCutoff([ev({ type: "proposed" })])).toBeNull();
  });
});

describe("what counts as inside the plan", () => {
  it("a step that existed at signing is inside", () => {
    expect(withinContract(step({ created_at: ago(30) }), ago(10))).toBe(true);
  });

  it("treats a tie as outside — an ambiguous case must not execute", () => {
    const t = ago(10);
    expect(withinContract(step({ created_at: t }), t)).toBe(false);
  });

  it("a step created after signing is outside", () => {
    expect(withinContract(step({ created_at: ago(5) }), ago(10))).toBe(false);
  });

  it("everything is inside before anything has been signed", () => {
    // Consequential steps still face their own approval card as usual — this
    // gate adds to that, it does not replace it.
    expect(withinContract(step({ created_at: ago(1) }), null)).toBe(true);
  });
});

describe("execution detail passes; new consequential work does not", () => {
  it("lets a read/draft step added mid-flight run", () => {
    // Reading more data and drafting a file change nothing outside cosigno,
    // and are often exactly what the next approved step needs.
    const v = scopeVerdict(step({ tool: "deliverable.followup", created_at: ago(1) }), ago(10));
    expect(v.allowed).toBe(true);
  });

  it("stops a consequential step the user never saw", () => {
    const v = scopeVerdict(step({ tool: "approval.offer_send", created_at: ago(1) }), ago(10));
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe("unapproved");
  });

  it.each([
    "approval.offer_send",
    "inbox.propose_cleanup",
    "followup.offer_send",
    "calendar.propose_reminder",
    "github.propose_issue",
    "browser.prepare_purchase",
  ])("stops %s when it appears after signing", (tool) => {
    expect(scopeVerdict(step({ tool, created_at: ago(1) }), ago(10)).allowed).toBe(false);
  });

  it("runs a consequential step that WAS in the approved plan", () => {
    expect(scopeVerdict(step({ tool: "approval.offer_send", created_at: ago(30) }), ago(10)).allowed).toBe(
      true
    );
  });
});

describe("a person decides, and only for that step", () => {
  it("runs once explicitly approved", () => {
    const v = scopeVerdict(
      step({ tool: "approval.offer_send", created_at: ago(1), input: { answer: SCOPE_APPROVE } }),
      ago(10)
    );
    expect(v.allowed).toBe(true);
  });

  it("stays blocked on refusal", () => {
    const v = scopeVerdict(
      step({ tool: "approval.offer_send", created_at: ago(1), input: { answer: SCOPE_REFUSE } }),
      ago(10)
    );
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe("refused");
  });

  it("an unrelated answer is not consent", () => {
    // Answering some other question must never grant scope.
    const v = scopeVerdict(
      step({ tool: "approval.offer_send", created_at: ago(1), input: { answer: "tuesday" } }),
      ago(10)
    );
    expect(v.allowed).toBe(false);
  });

  it("approving one step does not approve the next one", () => {
    const approved = scopeVerdict(
      step({ id: "s1", tool: "approval.offer_send", created_at: ago(1), input: { answer: SCOPE_APPROVE } }),
      ago(10)
    );
    const sibling = scopeVerdict(
      step({ id: "s2", tool: "inbox.propose_cleanup", created_at: ago(1), input: {} }),
      ago(10)
    );
    expect(approved.allowed).toBe(true);
    expect(sibling.allowed).toBe(false);
  });
});

describe("end to end: the mission parks instead of acting", () => {
  async function missionWithLateConsequentialStep() {
    const session = await store.createSession(USER, "t");
    const mission = await store.createMission({
      user_id: USER,
      session_id: session.id,
      goal: "prepare for my meeting",
    } as never);

    const action = await store.createAction({
      user_id: USER,
      session_id: session.id,
      category: "send_email",
      tier: 2,
      summary: "approved thing",
      payload: {},
    } as never);
    await store.transitionAction(USER, action.id, "approved");
    await store.logEvent(USER, action.id, "approved", "user", {});
    // Backdate the signature so the step below is unambiguously later —
    // otherwise both land in the same millisecond and the test is timing luck.
    const events = (store as unknown as { events: Array<{ action_id: string; created_at: string }> }).events;
    for (const e of events) if (e.action_id === action.id) e.created_at = ago(10);

    // A consequential step created AFTER that signature.
    const [late] = await store.createMissionSteps([
      {
        mission_id: mission.id,
        user_id: USER,
        idx: 5,
        purpose: "offer the follow-up for your approval",
        operator: "communication",
        tool: "approval.offer_send",
        depends_on: [],
      } as never,
    ]);
    await store.updateMissionStep(USER, late.id, { state: "ready", action_id: action.id });
    await store.updateMission(USER, mission.id, { state: "running" });
    return { mission, late };
  }

  it("asks instead of running, and names the gap", async () => {
    const { mission, late } = await missionWithLateConsequentialStep();

    await advanceMission(USER, mission.id);

    const after = await store.getMission(USER, mission.id);
    expect(after?.state).toBe("awaiting_input");
    expect(after?.pending_question?.step_id).toBe(late.id);
    // A prompt that reads like routine progress would get waved through.
    expect(after?.pending_question?.question).toMatch(/wasn't in the plan you approved/i);

    const steps = await store.listMissionSteps(USER, mission.id);
    expect(steps.find((s) => s.id === late.id)?.state).toBe("awaiting_input");
  });

  it("skips the step when the user declines, and the mission carries on", async () => {
    const { mission, late } = await missionWithLateConsequentialStep();
    await advanceMission(USER, mission.id);

    await answerMissionQuestion(USER, mission.id, SCOPE_REFUSE);

    const steps = await store.listMissionSteps(USER, mission.id);
    expect(steps.find((s) => s.id === late.id)?.state).toBe("skipped");
  });
});
