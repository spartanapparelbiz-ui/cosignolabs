import { describe, expect, it } from "vitest";
import { missionBrief } from "../src/lib/missions/brief";
import type { MissionRecord, MissionStepRecord } from "../src/lib/types";

/**
 * A mission card has about two seconds of someone's attention, and it spends
 * them answering five questions. These tests are about the two ways that
 * fails: saying something that isn't true, and staying silent about the one
 * thing that costs the reader money — that cosigno has stopped and is waiting
 * for them.
 */

const NOW = "2026-08-09T10:00:00.000Z";

function mission(over: Partial<MissionRecord> = {}): MissionRecord {
  return {
    id: "m1",
    user_id: "u1",
    goal: "prepare tomorrow's board meeting",
    state: "running",
    plan_version: 1,
    pending_question: null,
    receipt: null,
    created_at: NOW,
    updated_at: NOW,
    completed_at: null,
    ...over,
  } as MissionRecord;
}

function step(over: Partial<MissionStepRecord> = {}): MissionStepRecord {
  return {
    id: `s${over.idx ?? 0}`,
    mission_id: "m1",
    user_id: "u1",
    idx: 0,
    purpose: "Read the related mail",
    operator: "communication",
    tool: "gmail.search_related",
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
    created_at: NOW,
    updated_at: NOW,
    ...over,
  } as MissionStepRecord;
}

describe("WHAT — the goal, always readable", () => {
  it("leads with the goal the user actually asked for", () => {
    expect(missionBrief(mission()).what).toBe("Prepare tomorrow's board meeting");
  });

  it("never renders an empty title, whatever the record holds", () => {
    expect(missionBrief(mission({ goal: "   " })).what).toBe("Untitled request");
  });
});

describe("NOW — only what is genuinely in flight", () => {
  it("reports the running step", () => {
    const b = missionBrief(mission(), [
      step({ idx: 0, state: "completed", output: { summary: "read 12 threads" } }),
      step({ idx: 1, state: "running", purpose: "Draft the agenda", tool: "deliverable.agenda", operator: "files" }),
    ]);
    expect(b.now).toBeTruthy();
  });

  it("a queued mission is not described as working", () => {
    // The most-read screen in the product must not open with a small lie.
    const b = missionBrief(mission({ state: "queued" }), [step({ idx: 0, state: "ready" })]);
    expect(b.now).toBeNull();
  });

  it("a finished mission is doing nothing and has nothing next", () => {
    const b = missionBrief(
      mission({ state: "completed", completed_at: NOW }),
      [step({ idx: 0, state: "completed", output: { summary: "sent the agenda" } })]
    );
    expect(b.now).toBeNull();
    expect(b.next).toBeNull();
    expect(b.settled).toBe(true);
  });
});

describe("YOU — the answer that costs money when it's missing", () => {
  it("a waiting approval is surfaced with the thing being approved", () => {
    const b = missionBrief(mission({ state: "awaiting_approval" }), [
      step({ idx: 0, state: "awaiting_approval", purpose: "Send the follow-up", action_id: "a1" }),
    ]);
    expect(b.you?.kind).toBe("approval");
    expect(b.you?.ask.toLowerCase()).toContain("send the follow-up");
  });

  it("several waiting approvals are counted rather than listed", () => {
    const b = missionBrief(mission({ state: "awaiting_approval" }), [
      step({ idx: 0, state: "awaiting_approval", action_id: "a1" }),
      step({ idx: 1, state: "awaiting_approval", action_id: "a2" }),
    ]);
    expect(b.you?.ask).toContain("2 actions");
  });

  it("a pending question outranks a pending approval", () => {
    // Approving first would sign off work the answer may be about to change.
    const b = missionBrief(
      mission({
        state: "awaiting_input",
        pending_question: {
          question: "Which quarter should the summary cover?",
          why: "two are open",
          effect: "changes the numbers",
          options: ["Q2", "Q3"],
          recommended: "Q3",
        },
      } as Partial<MissionRecord>),
      [step({ idx: 0, state: "awaiting_approval", action_id: "a1" })]
    );
    expect(b.you?.kind).toBe("question");
  });

  it("a paused mission says it is waiting, because it will never move by itself", () => {
    const b = missionBrief(mission({ state: "paused" }), [step({ idx: 0, state: "ready" })]);
    expect(b.you).not.toBeNull();
  });

  it("a mission that is simply working needs nothing", () => {
    const b = missionBrief(mission(), [step({ idx: 0, state: "running" })]);
    expect(b.you).toBeNull();
  });
});

describe("DONE — recorded outcomes only", () => {
  it("uses what the work actually recorded", () => {
    const b = missionBrief(mission({ state: "completed", completed_at: NOW }), [
      step({ idx: 0, state: "completed", output: { summary: "booked the room for 9am" } }),
    ]);
    expect(b.done.headline).toContain("Booked the room");
  });

  it("invents nothing when a mission finished without recording anything", () => {
    const b = missionBrief(mission({ state: "completed", completed_at: NOW }), [
      step({ idx: 0, state: "completed", output: null }),
    ]);
    expect(b.done.headline).toBeNull();
  });

  it("counts finished steps against the plan", () => {
    const b = missionBrief(mission(), [
      step({ idx: 0, state: "completed" }),
      step({ idx: 1, state: "completed" }),
      step({ idx: 2, state: "running" }),
      step({ idx: 3, state: "ready" }),
    ]);
    expect(b.done.count).toBe(2);
    expect(b.done.total).toBe(4);
    expect(b.progress).toBeCloseTo(0.5);
  });

  it("has no progress bar before there is a plan to measure", () => {
    // 0% of 0 steps is a decoration pretending to be a measurement.
    expect(missionBrief(mission(), []).progress).toBeNull();
  });
});

describe("the card and the shared vocabulary agree", () => {
  it.each([
    ["running", "Working"],
    ["awaiting_approval", "Needs approval"],
    ["paused", "Waiting"],
    ["completed", "Finished"],
    ["stopped", "Stopped"],
    ["partial", "Needs attention"],
    ["failed", "Failed"],
  ] as const)("%s reads as %s", (state, expected) => {
    expect(missionBrief(mission({ state })).status).toBe(expected);
  });
});
