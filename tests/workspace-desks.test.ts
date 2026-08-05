import { describe, expect, it } from "vitest";
import { buildDesks, roomSummary } from "@/lib/workspaceDesks";
import type { ActionRecord, MissionStepRecord, MissionStepState } from "@/lib/types";

/**
 * The glass wall. Its one non-negotiable property: a desk never claims work
 * that isn't happening. The room can breathe; the sentences cannot.
 */

function step(over: Partial<MissionStepRecord> & { tool: string; state: MissionStepState }): MissionStepRecord {
  const idx = over.idx ?? 0;
  return {
    id: `s_${idx}_${over.tool}`,
    mission_id: "m1",
    user_id: "u1",
    idx,
    purpose: over.purpose ?? "do the thing",
    operator: "research",
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
    created_at: "2026-01-01T10:00:00.000Z",
    updated_at: "2026-01-01T10:00:00.000Z",
    ...over,
  };
}

function action(over: Partial<ActionRecord> = {}): ActionRecord {
  return {
    id: `a_${Math.random().toString(16).slice(2)}`,
    session_id: "s1",
    user_id: "u1",
    category: "connection_call",
    tier: 2,
    status: "proposed",
    summary: "do a thing",
    payload: {},
    result: null,
    veto_reason: null,
    injection_flag: false,
    tier_note: null,
    created_at: "2026-01-01T10:00:00.000Z",
    resolved_at: null,
    ...over,
  };
}

const github = {
  id: "conn_gh",
  provider_key: "github",
  display_name: "GitHub",
  status: "connected",
  kind: "app",
};
const slack = { id: "conn_slack", provider_key: "slack", display_name: "Slack", status: "connected", kind: "app" };

describe("the room", () => {
  it("gives every connected app a desk, even a quiet one", () => {
    const desks = buildDesks({ connections: [github, slack], steps: [], proposed: [], recent: [] });
    expect(desks.map((d) => d.name).sort()).toEqual(["GitHub", "Slack"]);
    expect(desks.every((d) => d.state === "idle")).toBe(true);
  });

  it("says quiet when a desk is quiet — never invents activity", () => {
    const [desk] = buildDesks({ connections: [github], steps: [], proposed: [], recent: [] });
    expect(desk.state).toBe("idle");
    expect(desk.now).toBe("nothing right now");
    expect(desk.worker).toBeNull();
    expect(desk.last_activity_at).toBeNull();
  });

  it("shows someone working only when a step is genuinely running", () => {
    const desks = buildDesks({
      connections: [github],
      steps: [step({ tool: "github.edit", state: "running", purpose: "Editing the login page" })],
      proposed: [],
      recent: [],
    });
    const gh = desks.find((d) => d.name === "GitHub")!;
    expect(gh.state).toBe("working");
    expect(gh.now).toBe("Editing the login page");
    // Named from what actually did the work — no invented employee.
    expect(gh.worker).toBe("cosigno");
  });

  it("puts a broken connection at the front of the room", () => {
    const desks = buildDesks({
      connections: [github, { ...slack, status: "needs_reauth" }],
      steps: [step({ tool: "github.edit", state: "running" })],
      proposed: [],
      recent: [],
    });
    expect(desks[0].name).toBe("Slack");
    expect(desks[0].state).toBe("attention");
    expect(desks[0].now).toMatch(/needs reconnecting/);
  });

  it("counts what is waiting on a human, per app", () => {
    const desks = buildDesks({
      connections: [github],
      steps: [],
      proposed: [
        action({ payload: { connection_id: "conn_gh", action: "create_pull_request" } }),
        action({ payload: { connection_id: "conn_gh", action: "merge_pull_request" } }),
      ],
      recent: [],
    });
    const gh = desks[0];
    expect(gh.pending_approvals).toBe(2);
    expect(gh.state).toBe("waiting");
  });

  it("shows what recently happened as the objects it changed", () => {
    const desks = buildDesks({
      connections: [github],
      steps: [],
      proposed: [],
      recent: [
        action({
          status: "executed",
          resolved_at: "2026-01-01T11:00:00.000Z",
          payload: { connection_id: "conn_gh", action: "create_issue", args: { title: "Broken checkout" } },
        }),
      ],
    });
    expect(desks[0].recent[0].text).toContain("Broken checkout");
    expect(desks[0].last_activity_at).toBe("2026-01-01T11:00:00.000Z");
  });

  it("ignores cosigno's own thinking — it isn't an app with a desk", () => {
    const desks = buildDesks({
      connections: [github],
      steps: [step({ tool: "analyze.extract", state: "running" })],
      proposed: [],
      recent: [],
    });
    expect(desks.map((d) => d.name)).toEqual(["GitHub"]);
  });

  it("sums up the room in one honest line", () => {
    const quiet = buildDesks({ connections: [github, slack], steps: [], proposed: [], recent: [] });
    expect(roomSummary(quiet)).toBe("All 2 apps are quiet.");

    const busy = buildDesks({
      connections: [github, { ...slack, status: "error" }],
      steps: [step({ tool: "github.edit", state: "running" })],
      proposed: [],
      recent: [],
    });
    expect(roomSummary(busy)).toContain("working in 1 app");
    expect(roomSummary(busy)).toContain("needs reconnecting");
  });

  it("says so plainly when the room is empty", () => {
    expect(roomSummary([])).toBe("No apps connected yet.");
  });
});
