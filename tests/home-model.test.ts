import { describe, expect, it } from "vitest";
import {
  feedLines,
  homeApps,
  homeMission,
  operatorStatus,
  suggestionsFor,
  todayTiles,
} from "../src/lib/home/model";
import type { ConnectionView } from "../src/lib/integrations/types";
import type {
  ActionRecord,
  AutomationRecord,
  MissionRecord,
  MissionRunState,
  MissionStepRecord,
} from "../src/lib/types";

/**
 * Home is the screen someone reads before anything else, which makes it the
 * most expensive place in the product to state something that isn't true.
 * These tests pin the two rules the model exists to enforce: a source nobody
 * counted never produces a number, and a source nobody connected never
 * produces a metric.
 */

const now = new Date("2026-08-10T15:00:00Z");
const today = "2026-08-10T09:00:00Z";
const yesterday = "2026-08-09T09:00:00Z";

function mission(over: Partial<MissionRecord> = {}): MissionRecord {
  return {
    id: "m1",
    user_id: "u",
    session_id: "s",
    goal: "Review my unread email",
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
    purpose: "Read your inbox",
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
    started_at: null,
    completed_at: today,
    created_at: today,
    updated_at: today,
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

function automation(over: Partial<AutomationRecord> = {}): AutomationRecord {
  return {
    id: "au1",
    user_id: "u",
    name: "morning inbox",
    command: "review my unread email",
    interval_hours: 24,
    mode: "propose",
    enabled: true,
    last_run_at: null,
    next_run_at: "2026-08-10T16:00:00Z",
    created_at: today,
    updated_at: today,
    ...over,
  } as AutomationRecord;
}

const noTiles = {
  missions: [],
  approvals: 0,
  connections: [],
  automations: [],
  files: 0,
  now,
};

describe("operator status says the thing that costs most to miss", () => {
  it("a hold outranks everything — nothing moves under one", () => {
    const s = operatorStatus([mission()], 3, true);
    expect(s.state).toBe("held");
    expect(s.headline).toMatch(/hold/);
  });

  it("a waiting decision outranks work in flight", () => {
    const s = operatorStatus([mission({ state: "running" })], 2, false);
    expect(s.state).toBe("waiting");
    expect(s.headline).toBe("2 decisions waiting on you");
    expect(s.detail).toMatch(/1 mission still running/);
  });

  it("running work is reported only when nothing is waiting", () => {
    const s = operatorStatus([mission({ state: "running" })], 0, false);
    expect(s.state).toBe("working");
    expect(s.headline).toBe("working on 1 mission");
  });

  it("an idle workspace says it is ready, not that it is empty", () => {
    const s = operatorStatus([], 0, false);
    expect(s.state).toBe("ready");
    expect(s.headline).toBe("ready");
  });
});

describe("a tile never shows a number nobody measured", () => {
  it("counts only missions that finished TODAY as done today", () => {
    const tiles = todayTiles({
      ...noTiles,
      missions: [
        mission({ id: "a", state: "completed", completed_at: today }),
        mission({ id: "b", state: "completed", completed_at: yesterday }),
      ],
    });
    expect(tiles.find((t) => t.key === "completed")?.value).toBe(1);
  });

  it("the inbox tile invites a connection instead of printing a zero", () => {
    const tile = todayTiles(noTiles).find((t) => t.key === "inbox")!;
    expect(tile.value).toBeNull();
    expect(tile.invite).toMatch(/connect/);
    expect(tile.href).toBe("/app/connections");
  });

  it("once mail is connected the inbox tile offers the mission, still no fake count", () => {
    const tile = todayTiles({ ...noTiles, connections: [connection()] }).find(
      (t) => t.key === "inbox"
    )!;
    expect(tile.value).toBeNull();
    expect(tile.compose).toBe("review my unread email");
  });

  it("a connector needing reauth raises attention on the apps tile", () => {
    const tiles = todayTiles({
      ...noTiles,
      connections: [connection({ status: "needs_reauth" })],
    });
    const apps = tiles.find((t) => t.key === "apps")!;
    expect(apps.attention).toBe(true);
    expect(apps.meta).toMatch(/reconnect/);
  });

  it("agrees with its own numbers — one mission is never '1 missions'", () => {
    const one = todayTiles({
      ...noTiles,
      missions: [mission({ id: "a", state: "completed", completed_at: today })],
    });
    expect(one.find((t) => t.key === "completed")?.meta).toBe("mission finished");

    const two = todayTiles({
      ...noTiles,
      missions: [
        mission({ id: "a", state: "completed", completed_at: today }),
        mission({ id: "b", state: "completed", completed_at: today }),
      ],
    });
    expect(two.find((t) => t.key === "completed")?.meta).toBe("missions finished");
  });

  it("counts only enabled automations as scheduled", () => {
    const tiles = todayTiles({
      ...noTiles,
      automations: [automation(), automation({ id: "au2", enabled: false })],
    });
    expect(tiles.find((t) => t.key === "scheduled")?.value).toBe(1);
  });
});

describe("mission progress is counted, never estimated", () => {
  it("derives progress from step states", () => {
    const m = homeMission(mission(), [
      step({ id: "1", idx: 0, state: "completed" }),
      step({ id: "2", idx: 1, state: "running", purpose: "Draft the replies" }),
      step({ id: "3", idx: 2, state: "ready" }),
    ]);
    expect(m.progress).toEqual({ done: 1, total: 3 });
    expect(m.doing).toMatch(/^Drafting/);
  });

  it("reports no progress at all when there are no steps to count", () => {
    expect(homeMission(mission(), []).progress).toBeNull();
  });

  it("says nothing about what it is doing when no step is running", () => {
    const m = homeMission(mission({ state: "awaiting_approval" }), [
      step({ state: "awaiting_approval" }),
    ]);
    expect(m.doing).toBeNull();
    expect(m.waiting).toBe(true);
  });

  it("windows a long plan around the step actually running", () => {
    const steps = Array.from({ length: 12 }, (_, i) =>
      step({ id: `s${i}`, idx: i, state: i < 7 ? "completed" : i === 7 ? "running" : "ready" })
    );
    const m = homeMission(mission(), steps, 5);
    expect(m.steps).toHaveLength(5);
    expect(m.steps.map((s) => s.idx)).toContain(7);
  });
});

describe("apps surface what is broken first", () => {
  it("sorts a connector needing attention above a healthy one", () => {
    const apps = homeApps([
      connection({ id: "ok", display_name: "Calendar" }),
      connection({ id: "bad", display_name: "Gmail", status: "needs_reauth" }),
    ]);
    expect(apps[0].name).toBe("Gmail");
    expect(apps[0].health).toBe("attention");
    expect(apps[0].healthLabel).toBe("needs reconnecting");
  });

  it("never leaks a raw status code as a label", () => {
    const apps = homeApps([connection({ status: "connected" })]);
    expect(apps[0].healthLabel).toBe("working");
  });
});

describe("suggestions only offer what would actually run", () => {
  it("withholds app suggestions for apps that are not connected", () => {
    const s = suggestionsFor([]);
    expect(s.every((x) => !x.requires)).toBe(true);
  });

  it("leads with the connected app's suggestion", () => {
    const s = suggestionsFor([connection({ provider_key: "github", display_name: "GitHub" })]);
    expect(s[0].requires).toBe("github");
  });

  it("always offers something, even in an empty workspace", () => {
    expect(suggestionsFor([]).length).toBeGreaterThan(0);
  });
});

describe("the feed floats what is waiting to the top", () => {
  it("puts a pending decision above finished work", () => {
    const lines = feedLines(
      [
        action({ id: "done", status: "executed", resolved_at: today, summary: "Drafted the reply" }),
        action({ id: "wait", status: "proposed", summary: "Send the investor update" }),
      ],
      [],
      8,
      now
    );
    expect(lines[0].kind).toBe("waiting");
    expect(lines[0].text).toBe("Send the investor update");
  });

  it("keeps yesterday's finished missions off today's feed", () => {
    const lines = feedLines(
      [],
      [mission({ state: "completed", completed_at: yesterday })],
      8,
      now
    );
    expect(lines).toHaveLength(0);
  });

  it("shows a running mission as live", () => {
    const lines = feedLines([], [mission({ state: "running" })], 8, now);
    expect(lines[0].kind).toBe("live");
  });
});
