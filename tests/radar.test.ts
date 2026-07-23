import { describe, expect, it } from "vitest";
import { detectRadar, type RadarInputs } from "../src/lib/radar/detect";
import type { ActionRecord, MissionRecord } from "../src/lib/types";
import type { ConnectionRecord } from "../src/lib/integrations/types";

/**
 * Radar detection is deterministic and read-only: given the user's own state,
 * it emits factual findings that separate observed data from inference and
 * recommendation. These tests pin the categories and the no-execution promise.
 */

const NOW = Date.parse("2026-07-23T12:00:00Z");

function baseInputs(overrides: Partial<RadarInputs> = {}): RadarInputs {
  return {
    now: NOW,
    actions: [],
    missions: [],
    automations: [],
    connections: [],
    subscription: null,
    ...overrides,
  };
}

function action(overrides: Partial<ActionRecord> = {}): ActionRecord {
  return {
    id: "a1",
    session_id: "s1",
    user_id: "user-a",
    category: "send_email",
    tier: 2,
    status: "proposed",
    summary: "reply to finance",
    payload: {},
    result: null,
    veto_reason: null,
    injection_flag: false,
    tier_note: null,
    created_at: new Date(NOW).toISOString(),
    resolved_at: null,
    ...overrides,
  };
}

describe("radar detectors", () => {
  it("surfaces pending approvals as a Needs You item", () => {
    const items = detectRadar(baseInputs({ actions: [action(), action({ id: "a2" })] }));
    const needs = items.find((i) => i.key === "pending_approvals");
    expect(needs).toBeTruthy();
    expect(needs!.category).toBe("needs_you");
    expect(needs!.observed).toMatch(/2 prepared actions/);
    // Separation of observed vs recommendation is explicit.
    expect(needs!.recommendation).toBeTruthy();
    expect(needs!.inference).toBeTruthy();
  });

  it("flags stale proposals (>3 days) as At Risk", () => {
    const old = new Date(NOW - 5 * 86_400_000).toISOString();
    const items = detectRadar(baseInputs({ actions: [action({ created_at: old })] }));
    expect(items.find((i) => i.key === "stale_approvals")?.category).toBe("at_risk");
  });

  it("never surfaces an injection-flagged card as actionable", () => {
    const items = detectRadar(baseInputs({ actions: [action({ injection_flag: true })] }));
    expect(items.find((i) => i.key === "pending_approvals")).toBeUndefined();
  });

  it("detects a broken connection as At Risk", () => {
    const conn = {
      id: "c1",
      user_id: "user-a",
      provider_key: "gmail",
      kind: "app",
      display_name: "Gmail",
      auth_type: "oauth2",
      status: "needs_reauth",
      scopes: null,
      encrypted_credentials: null,
      metadata: {},
      created_at: new Date(NOW).toISOString(),
      last_health_at: null,
    } as unknown as ConnectionRecord;
    const items = detectRadar(baseInputs({ connections: [conn] }));
    const broken = items.find((i) => i.key.startsWith("conn_broken_"));
    expect(broken?.category).toBe("at_risk");
    expect(broken?.confidence).toBe("high");
  });

  it("suggests a real preparable template when Gmail is connected and no cleanup ran", () => {
    const conn = {
      id: "c1",
      user_id: "user-a",
      provider_key: "gmail",
      kind: "app",
      display_name: "Gmail",
      auth_type: "oauth2",
      status: "connected",
      scopes: null,
      encrypted_credentials: null,
      metadata: {},
      created_at: new Date(NOW).toISOString(),
      last_health_at: null,
    } as unknown as ConnectionRecord;
    const items = detectRadar(baseInputs({ connections: [conn] }));
    const opp = items.find((i) => i.key === "opp_inbox_cleanup");
    expect(opp?.category).toBe("opportunity");
    expect(opp?.suggestedTemplate).toBe("inbox_cleanup");
  });

  it("surfaces a mission awaiting input as Needs You", () => {
    const mission = {
      id: "m1",
      user_id: "user-a",
      session_id: "s1",
      goal: "plan the launch",
      state: "awaiting_input",
      plan_version: 1,
      pending_question: { step_id: "x", question: "Which date?", why: "no default", options: [], effect: "sets the date" },
      receipt: null,
      error: null,
      lease_owner: null,
      lease_expires_at: null,
      tool_calls: 0,
      browser_actions: 0,
      budget_cents: 200,
      created_at: new Date(NOW).toISOString(),
      updated_at: new Date(NOW).toISOString(),
      completed_at: null,
    } as MissionRecord;
    const items = detectRadar(baseInputs({ missions: [mission] }));
    expect(items.find((i) => i.key === "mission_awaiting_m1")?.category).toBe("needs_you");
  });

  it("emits nothing that carries an execution capability (suggestion-only)", () => {
    const items = detectRadar(baseInputs({ actions: [action()] }));
    for (const i of items) {
      // The only actionable field is a suggested template/command — data, not a call.
      expect(Object.keys(i)).not.toContain("execute");
      expect(Object.keys(i)).not.toContain("run");
    }
  });
});
