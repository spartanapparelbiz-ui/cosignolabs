import { describe, expect, it } from "vitest";
import { ageOf, buildBriefing, missionPercent } from "../src/lib/home/briefing";
import type { ConnectionView } from "../src/lib/integrations/types";
import type {
  ActionRecord,
  AutomationRecord,
  MissionRecord,
  MissionRunState,
  MissionStepRecord,
} from "../src/lib/types";

/**
 * The briefing is the first thing read and the most quotable thing on the
 * screen — "your launch is 82% complete" gets repeated to other people. So
 * every line has to come from a record, and the ordering has to put the
 * blocking item first, or the briefing is just a status update with a
 * greeting on top.
 */

const now = new Date("2026-08-10T09:00:00Z");
const today = "2026-08-10T07:00:00Z";
const twoDaysAgo = "2026-08-08T09:00:00Z";
const yesterday = "2026-08-09T09:00:00Z";

function mission(over: Partial<MissionRecord> = {}): MissionRecord {
  return {
    id: "m1",
    user_id: "u",
    session_id: "s",
    goal: "Launch the new pricing page",
    state: "running" as MissionRunState,
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
    created_at: today,
    updated_at: today,
    completed_at: null,
    ...over,
  };
}

function step(over: Partial<MissionStepRecord> = {}): MissionStepRecord {
  return {
    id: "s1",
    mission_id: "m1",
    user_id: "u",
    idx: 0,
    purpose: "Read the current page",
    operator: "research",
    tool: "browser.read",
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
    started_at: null,
    completed_at: today,
    created_at: today,
    updated_at: today,
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
    status: "proposed",
    summary: "Send the investor update",
    payload: {},
    result: null,
    veto_reason: null,
    injection_flag: false,
    tier_note: null,
    created_at: today,
    resolved_at: null,
    ...over,
  };
}

function connection(over: Partial<ConnectionView> = {}): ConnectionView {
  return {
    id: "c1",
    provider_key: "google",
    kind: "app",
    display_name: "Gmail",
    status: "connected",
    auth_type: "oauth2",
    scopes: null,
    metadata: {},
    created_at: today,
    updated_at: today,
    last_health_at: today,
    ...over,
  };
}

function automation(over: Partial<AutomationRecord> = {}): AutomationRecord {
  return {
    id: "au1",
    user_id: "u",
    name: "morning inbox",
    command: "review my unread email",
    interval_hours: 24,
    mode: "prepare",
    enabled: true,
    last_run_at: null,
    next_run_at: "2026-08-10T12:00:00Z",
    created_at: today,
    updated_at: today,
    ...over,
  };
}

const base = {
  name: "Nick",
  missions: [],
  steps: {},
  approvals: [],
  connections: [connection()],
  automations: [],
  now,
};

describe("the greeting is a courtesy, the briefing is the reason to open it", () => {
  it("uses the name when there is one, and the hour the reader is in", () => {
    expect(buildBriefing(base).greeting).toBe("good morning, Nick");
    expect(buildBriefing({ ...base, name: "" }).greeting).toBe("good morning");
    expect(
      buildBriefing({ ...base, now: new Date("2026-08-10T19:00:00Z") }).greeting
    ).toMatch(/good evening/);
  });
});

describe("ordering puts what is blocked on you first", () => {
  it("a hold outranks everything — nothing moves under one", () => {
    const b = buildBriefing({
      ...base,
      held: true,
      approvals: [action()],
      missions: [mission()],
    });
    expect(b.lines[0].key).toBe("hold");
    expect(b.headline).toBe("Everything is paused.");
  });

  it("waiting decisions outrank running work", () => {
    const b = buildBriefing({
      ...base,
      approvals: [action()],
      missions: [mission({ state: "running" })],
    });
    expect(b.lines[0].key).toBe("approvals");
    expect(b.lines.findIndex((l) => l.key === "running")).toBeGreaterThan(0);
  });

  it("a broken connector outranks progress, because it costs you tomorrow", () => {
    const b = buildBriefing({
      ...base,
      connections: [connection({ status: "needs_reauth" })],
      missions: [mission({ state: "running" })],
    });
    expect(b.lines.findIndex((l) => l.key === "connections")).toBeLessThan(
      b.lines.findIndex((l) => l.key === "running")
    );
  });
});

describe("every line names a real cost", () => {
  it("says how long the oldest decision has been sitting", () => {
    const b = buildBriefing({ ...base, approvals: [action({ created_at: twoDaysAgo })] });
    expect(b.lines[0].text).toMatch(/2 days/);
  });

  it("counts one decision as one, in words that agree", () => {
    const b = buildBriefing({ ...base, approvals: [action()] });
    expect(b.lines[0].text).toMatch(/^One decision is waiting on you/);
    expect(b.headline).toBe("One decision, then cosigno can keep going.");
  });

  it("calls out content that tried to steer the agent", () => {
    const b = buildBriefing({ ...base, approvals: [action({ injection_flag: true })] });
    expect(b.lines.some((l) => l.key === "flagged")).toBe(true);
    expect(b.lines.find((l) => l.key === "flagged")!.text).toMatch(/locked until you re-issue/);
  });

  it("names the mission that is stopped, not just the count", () => {
    const b = buildBriefing({
      ...base,
      missions: [mission({ state: "awaiting_input", goal: "Prepare the board deck" })],
    });
    const stuck = b.lines.find((l) => l.key === "blocked")!;
    expect(stuck.text).toContain("Prepare the board deck");
    expect(stuck.action?.href).toBe("/app/missions/m1");
  });
});

describe("a percentage is only ever counted", () => {
  it("comes from completed steps", () => {
    expect(
      missionPercent([
        step({ id: "1", state: "completed" }),
        step({ id: "2", state: "completed" }),
        step({ id: "3", state: "running" }),
        step({ id: "4", state: "ready" }),
      ])
    ).toBe(50);
  });

  it("is absent when there are no steps to count", () => {
    expect(missionPercent([])).toBeNull();
  });

  it("is never quoted for a mission whose steps aren't loaded", () => {
    const b = buildBriefing({ ...base, missions: [mission({ state: "running" })], steps: {} });
    const running = b.lines.find((l) => l.key === "running")!;
    expect(running.text).not.toMatch(/%/);
    expect(running.text).toMatch(/working on 1 mission/);
  });

  it("quotes the furthest-along mission when the steps are there", () => {
    const b = buildBriefing({
      ...base,
      missions: [mission({ state: "running" })],
      steps: {
        m1: [
          step({ id: "1", state: "completed" }),
          step({ id: "2", state: "completed" }),
          step({ id: "3", state: "completed" }),
          step({ id: "4", state: "running" }),
        ],
      },
    });
    expect(b.lines.find((l) => l.key === "running")!.text).toMatch(/75% complete/);
  });
});

describe("finished work counts only for today", () => {
  it("ignores yesterday's completions", () => {
    const b = buildBriefing({
      ...base,
      missions: [mission({ state: "completed", completed_at: yesterday })],
    });
    expect(b.lines.some((l) => l.key === "done")).toBe(false);
  });

  it("reports today's", () => {
    const b = buildBriefing({
      ...base,
      missions: [mission({ state: "completed", completed_at: today })],
    });
    expect(b.lines.find((l) => l.key === "done")!.text).toMatch(/finished 1 mission today/);
  });
});

describe("a quiet morning says so rather than inventing a line", () => {
  it("produces no lines and an honest headline", () => {
    const b = buildBriefing(base);
    expect(b.lines).toEqual([]);
    expect(b.headline).toBe("Nothing needs you this morning.");
  });

  it("an unconnected workspace is told what would change that", () => {
    const b = buildBriefing({ ...base, connections: [] });
    const connect = b.lines.find((l) => l.key === "connect")!;
    expect(connect.action?.href).toBe("/app/connections");
  });
});

describe("the briefing stays readable", () => {
  it("never runs past five lines, however much is happening", () => {
    const b = buildBriefing({
      ...base,
      held: true,
      approvals: [action({ injection_flag: true }), action({ id: "a2" })],
      missions: [
        mission({ state: "awaiting_approval" }),
        mission({ id: "m2", state: "running" }),
        mission({ id: "m3", state: "completed", completed_at: today }),
      ],
      connections: [connection({ status: "error" })],
      automations: [automation()],
    });
    expect(b.lines.length).toBeLessThanOrEqual(5);
  });
});

describe("ageOf reads the way a person would say it", () => {
  it("scales from minutes to days", () => {
    expect(ageOf("2026-08-10T08:40:00Z", now)).toBe("20 minutes");
    expect(ageOf("2026-08-10T06:00:00Z", now)).toBe("3 hours");
    expect(ageOf(twoDaysAgo, now)).toBe("2 days");
  });
});
