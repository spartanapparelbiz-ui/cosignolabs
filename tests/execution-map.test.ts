import { describe, expect, it } from "vitest";
import { buildExecutionMap, mapHeadline } from "../src/lib/workspace/map";
import type { ActionRecord, AutomationRecord, MissionRecord } from "../src/lib/types";

/**
 * The map's one addition over a list is the bottleneck: the oldest decision,
 * ranked by the only dimension that worsens on its own. These tests pin that
 * the bottleneck is computed rather than judged, and that the headline
 * directs instead of describing.
 */

const now = new Date("2026-08-10T12:00:00Z");

function mission(over: Partial<MissionRecord> = {}): MissionRecord {
  return {
    id: "m1",
    user_id: "u",
    session_id: "s",
    goal: "Launch",
    state: "running",
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
    created_at: "2026-08-10T09:00:00Z",
    updated_at: "2026-08-10T10:00:00Z",
    completed_at: null,
    ...over,
  };
}

function proposal(over: Partial<ActionRecord> = {}): ActionRecord {
  return {
    id: "a1",
    session_id: "s",
    user_id: "u",
    category: "send_email",
    tier: 2,
    status: "proposed",
    summary: "Send the update",
    payload: {},
    result: null,
    veto_reason: null,
    injection_flag: false,
    tier_note: null,
    created_at: "2026-08-10T10:00:00Z",
    resolved_at: null,
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
    next_run_at: "2026-08-11T08:00:00Z",
    created_at: "2026-08-10T09:00:00Z",
    updated_at: "2026-08-10T09:00:00Z",
    ...over,
  };
}

describe("the four lanes are states, not machinery", () => {
  it("sorts work into moving / stopped / standing / landed today", () => {
    const map = buildExecutionMap(
      [
        mission({ id: "run", state: "running" }),
        mission({ id: "wait", state: "awaiting_approval" }),
        mission({ id: "done", state: "completed", completed_at: "2026-08-10T11:00:00Z" }),
        mission({ id: "old", state: "completed", completed_at: "2026-08-09T11:00:00Z" }),
      ],
      [],
      [automation(), automation({ id: "au2", enabled: false })],
      now
    );
    expect(map.moving.map((m) => m.id)).toEqual(["run"]);
    expect(map.stopped.map((m) => m.id)).toEqual(["wait"]);
    expect(map.landedToday.map((m) => m.id)).toEqual(["done"]);
    expect(map.standing.map((s) => s.id)).toEqual(["au1"]);
  });

  it("every lane entry carries a human age, not a timestamp", () => {
    const map = buildExecutionMap([mission()], [], [], now);
    expect(map.moving[0].age).toBe("2 hours");
  });
});

describe("the bottleneck is computed, never judged", () => {
  it("is the OLDEST waiting decision, with the stacked work counted", () => {
    const map = buildExecutionMap(
      [mission({ id: "w1", state: "awaiting_approval" }), mission({ id: "w2", state: "blocked" })],
      [
        proposal({ id: "new", created_at: "2026-08-10T11:30:00Z" }),
        proposal({ id: "old", created_at: "2026-08-08T12:00:00Z", summary: "Refund order 4471" }),
      ],
      [],
      now
    );
    expect(map.bottleneck!.actionId).toBe("old");
    expect(map.bottleneck!.summary).toBe("Refund order 4471");
    expect(map.bottleneck!.waitingFor).toBe("2 days");
    expect(map.bottleneck!.missionsStopped).toBe(2);
    expect(map.bottleneck!.decisionsWaiting).toBe(2);
  });

  it("ignores resolved cards that happen to be in the list", () => {
    const map = buildExecutionMap([], [proposal({ status: "executed" })], [], now);
    expect(map.bottleneck).toBeNull();
  });
});

describe("the headline directs, it does not describe", () => {
  it("leads with the stacked work when decisions are blocking missions", () => {
    const map = buildExecutionMap(
      [mission({ state: "awaiting_approval" })],
      [proposal()],
      [],
      now
    );
    expect(mapHeadline(map)).toBe("1 decision waiting — 1 mission is stopped behind it.");
  });

  it("plural forms agree", () => {
    const map = buildExecutionMap(
      [mission({ id: "w1", state: "blocked" }), mission({ id: "w2", state: "paused" })],
      [proposal(), proposal({ id: "a2" })],
      [],
      now
    );
    expect(mapHeadline(map)).toBe("2 decisions waiting — 2 missions are stopped behind them.");
  });

  it("a clear board with moving work says nothing needs you", () => {
    const map = buildExecutionMap([mission()], [], [], now);
    expect(mapHeadline(map)).toBe("1 mission moving — nothing needs you.");
  });

  it("an idle board with standing work points at the schedule", () => {
    const map = buildExecutionMap([], [], [automation()], now);
    expect(mapHeadline(map)).toMatch(/standing work runs on schedule/);
  });

  it("a truly empty board says so plainly", () => {
    expect(mapHeadline(buildExecutionMap([], [], [], now))).toBe("nothing in flight.");
  });
});
