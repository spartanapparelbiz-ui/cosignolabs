import { describe, expect, it } from "vitest";
import { buildReplay, spanLabel, whereTimeWent } from "../src/lib/missions/replay";
import type { ActionRecord, MissionRecord, MissionStepRecord } from "../src/lib/types";

/**
 * A replay is a court record, not a dramatization: every moment on it is a
 * timestamp that already exists, and the same records always produce the
 * same timeline. What these tests protect beyond that is the part replays
 * exist for — the STALL. Outcomes hide where time went; the replay's job is
 * to show that the two-day mission was thirty seconds of work and a two-day
 * wait on a decision.
 */

const T0 = "2026-08-08T09:00:00Z";

function at(minutes: number): string {
  return new Date(Date.parse(T0) + minutes * 60_000).toISOString();
}

function mission(over: Partial<MissionRecord> = {}): MissionRecord {
  return {
    id: "m1",
    user_id: "u",
    session_id: "s",
    goal: "Clean up my inbox",
    state: "completed",
    plan_version: 1,
    pending_question: null,
    receipt: null,
    error: null,
    lease_owner: null,
    lease_expires_at: null,
    tool_calls: 0,
    browser_actions: 0,
    budget_cents: 0,
    action_budget: null,
    created_at: T0,
    updated_at: T0,
    completed_at: null,
    ...over,
  };
}

function step(idx: number, startMin: number, endMin: number, over: Partial<MissionStepRecord> = {}): MissionStepRecord {
  return {
    id: `s${idx}`,
    mission_id: "m1",
    user_id: "u",
    idx,
    purpose: `Step ${idx}`,
    operator: "inbox",
    tool: "gmail.search",
    state: "completed",
    depends_on: [],
    input: {},
    output: null,
    sources: [],
    action_id: null,
    retry_count: 0,
    max_retries: 2,
    error: null,
    verification: null,
    started_at: at(startMin),
    completed_at: at(endMin),
    created_at: T0,
    updated_at: at(endMin),
    ...over,
  };
}

function action(over: Partial<ActionRecord> = {}): ActionRecord {
  return {
    id: "a1",
    session_id: "s",
    user_id: "u",
    category: "send_email",
    tier: 2,
    status: "executed",
    summary: "Send the drafted replies",
    payload: {},
    result: null,
    veto_reason: null,
    injection_flag: false,
    tier_note: null,
    created_at: at(5),
    resolved_at: at(10),
    ...over,
  };
}

describe("the replay is assembled from timestamps that already exist", () => {
  it("orders acceptance, steps, boundary, decision and end by time", () => {
    const r = buildReplay(
      mission({ completed_at: at(12) }),
      [step(0, 1, 4)],
      [action()]
    );
    expect(r.moments.map((m) => m.kind)).toEqual([
      "accepted",
      "started",
      "finished",
      "boundary",
      "decided",
      "ended",
    ]);
    expect(r.spanMs).toBe(12 * 60_000);
  });

  it("is deterministic — the same records replay identically", () => {
    const m = mission({ completed_at: at(12) });
    const steps = [step(0, 1, 4)];
    const actions = [action()];
    expect(buildReplay(m, steps, actions)).toEqual(buildReplay(m, steps, actions));
  });

  it("a step that never started leaves no started moment", () => {
    const r = buildReplay(mission(), [step(0, 0, 0, { started_at: null, completed_at: null, state: "ready" })]);
    expect(r.moments.filter((m) => m.stepIdx === 0)).toEqual([]);
  });

  it("a tier-1 action never reached the user, so it is not a boundary", () => {
    const r = buildReplay(mission(), [], [action({ tier: 1, resolved_at: null })]);
    expect(r.moments.some((m) => m.kind === "boundary")).toBe(false);
  });

  it("a veto reads as a veto, not as work that happened", () => {
    const r = buildReplay(mission(), [], [action({ status: "vetoed" })]);
    expect(r.moments.find((m) => m.kind === "decided")!.text).toMatch(/vetoed it — it never ran/);
  });
});

describe("stalls — the part outcomes hide", () => {
  it("names a dominant gap after a boundary as waiting on a decision", () => {
    // 2 minutes of work, then a boundary, then a ~2 day wait for the decision.
    const twoDays = 60 * 48;
    const r = buildReplay(
      mission({ completed_at: at(twoDays + 10) }),
      [step(0, 1, 2)],
      [action({ created_at: at(3), resolved_at: at(twoDays + 5) })]
    );
    const stall = r.moments.find((m) => m.kind === "stalled")!;
    expect(stall.text).toMatch(/2 days passed — waiting on a decision/);
    expect(whereTimeWent(r)).toMatch(/one gap/);
  });

  it("stays silent about ordinary machine pauses", () => {
    const r = buildReplay(
      mission({ completed_at: at(9) }),
      [step(0, 1, 3), step(1, 4, 8)] // a 1-minute gap between steps
    );
    expect(r.moments.some((m) => m.kind === "stalled")).toBe(false);
    expect(whereTimeWent(r)).toMatch(/no long waits/);
  });

  it("a long gap with no boundary before it claims only what is known", () => {
    const r = buildReplay(
      mission({ completed_at: at(60 * 30) }),
      [step(0, 1, 2), step(1, 60 * 29, 60 * 30 - 1)]
    );
    const stall = r.moments.find((m) => m.kind === "stalled")!;
    expect(stall.text).toMatch(/nothing was recorded/);
  });

  it("a complete single-step run earns the clean-run sentence", () => {
    // accepted → started → finished is a whole, checkable story.
    const r = buildReplay(mission(), [step(0, 1, 2)]);
    expect(whereTimeWent(r)).toBe("ran start to finish in 2 minutes with no long waits.");
  });

  it("says nothing about where time went when the timeline is too thin", () => {
    // Acceptance alone — there is no run to characterize.
    const r = buildReplay(mission(), []);
    expect(whereTimeWent(r)).toBeNull();
  });
});

describe("edge cases stay total", () => {
  it("a mission with nothing recorded replays as its acceptance alone", () => {
    const r = buildReplay(mission(), []);
    expect(r.moments).toHaveLength(1);
    expect(r.moments[0].kind).toBe("accepted");
    expect(r.spanMs).toBe(0);
  });

  it("an unparseable acceptance produces an empty replay, not a crash", () => {
    const r = buildReplay(mission({ created_at: "garbage" }), [step(0, 1, 2)]);
    expect(r.moments).toEqual([]);
  });

  it("span labels read like speech", () => {
    expect(spanLabel(12 * 60_000)).toBe("12 minutes");
    expect(spanLabel(3 * 60 * 60_000)).toBe("3 hours");
    expect(spanLabel(48 * 60 * 60_000)).toBe("2 days");
  });

  it("a fast run reads as fast, never as '0 minutes'", () => {
    // "0 minutes recorded" sounds like a recording failure; a quick mission
    // is the good case and must read like one.
    expect(spanLabel(20_000)).toBe("under a minute");
  });
});
