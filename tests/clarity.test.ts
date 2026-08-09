import { describe, expect, it } from "vitest";
import {
  afterApprovalLine,
  approveLabel,
  beforeApprovalLine,
  missionGuide,
  missionState,
  missionSteps,
  sourceIdentity,
} from "../src/lib/clarity";
import type { ActionRecord } from "../src/lib/types";

/**
 * The clarity system never invents progress: every state, step, and line is
 * a deterministic function of the real action records. These tests pin the
 * honest behaviors — states match reality, changes-made only lists executed
 * work, approval language is action-specific, tier-3 is never softened.
 */

let seq = 0;
function act(over: Partial<ActionRecord>): ActionRecord {
  seq += 1;
  return {
    id: `a${seq}`,
    session_id: "s1",
    user_id: "u1",
    category: "search",
    tier: 1,
    status: "proposed",
    summary: "look something up",
    payload: {},
    result: null,
    veto_reason: null,
    injection_flag: false,
    tier_note: null,
    created_at: new Date(2026, 0, 1, 0, seq).toISOString(),
    resolved_at: null,
    ...over,
  };
}

describe("missionState mirrors reality", () => {
  it("planning > waiting > executing > completed, in that priority", () => {
    expect(missionState([], true).key).toBe("planning");
    expect(missionState([], false).key).toBe("idle");
    expect(missionState([act({ status: "proposed", tier: 2 })], false).key).toBe("waiting_approval");
    expect(missionState([act({ status: "executing" }), act({ status: "proposed" })], false).key).toBe("executing");
    expect(missionState([act({ status: "executed" })], false).key).toBe("completed");
  });

  it("mixed outcomes are partial; all-failed is failed safely; all-vetoed is stopped", () => {
    expect(missionState([act({ status: "executed" }), act({ status: "failed" })], false).key).toBe("partial");
    expect(missionState([act({ status: "failed" })], false).key).toBe("failed");
    expect(missionState([act({ status: "vetoed" })], false).key).toBe("stopped");
  });

  it("all-flagged proposals read as held for safety", () => {
    const s = missionState([act({ status: "proposed", injection_flag: true })], false);
    expect(s.key).toBe("held");
  });
});

describe("missionGuide — changes made are only what actually executed", () => {
  it("empty missions honestly say no external changes", () => {
    const g = missionGuide([act({ status: "proposed", tier: 2 })]);
    expect(g.changes).toEqual([]);
    expect(g.noChangesLine).toMatch(/no external changes/i);
  });

  it("executed actions surface with their real result summary; sandbox is labeled", () => {
    const g = missionGuide([
      act({ status: "executed", summary: "archive newsletters", result: { summary: "archived 12", simulated: true } }),
      act({ status: "proposed", tier: 2, summary: "send the reply" }),
      act({ status: "proposed", tier: 2, summary: "update the sheet" }),
    ]);
    expect(g.changes).toHaveLength(1);
    expect(g.changes[0]).toContain("archived 12");
    expect(g.changes[0]).toMatch(/sandbox/i);
    expect(g.current?.summary).toBe("send the reply");
    expect(g.next).toBe("update the sheet");
  });

  it("an in-flight action is the current step even with proposals waiting", () => {
    const g = missionGuide([
      act({ status: "executing", summary: "sending now" }),
      act({ status: "proposed", tier: 2, summary: "then update" }),
    ]);
    expect(g.current?.summary).toBe("sending now");
    expect(g.current?.approval).toMatch(/approved — running/i);
    expect(g.next).toBe("then update");
  });
});

describe("approval language is action-specific and truthful", () => {
  it("labels name the consequence, never a bare approve", () => {
    expect(approveLabel("send_email")).toBe("Approve & send");
    expect(approveLabel("delete")).toBe("Approve deletion");
    expect(approveLabel("payment")).toBe("Approve & pay");
    expect(approveLabel("post_content")).toBe("Approve & publish");
  });

  it("before-approval lines state that nothing has happened", () => {
    expect(beforeApprovalLine("send_email")).toMatch(/nothing has been sent/i);
    expect(beforeApprovalLine("payment")).toMatch(/no money has moved/i);
    expect(beforeApprovalLine("delete")).toMatch(/nothing has been deleted/i);
  });

  it("delete's after-line never claims reversibility", () => {
    expect(afterApprovalLine("delete")).toMatch(/can't be automatically undone/i);
  });
});

describe("sources and steps", () => {
  it("connector calls name the real app; sandbox categories say sandbox", () => {
    const gmail = sourceIdentity(act({ category: "connection_call", payload: { provider: "google" } }));
    expect(gmail.name).toBe("Gmail");
    const cal = sourceIdentity(act({ category: "connection_call", payload: { provider: "google-calendar" } }));
    expect(cal.name).toBe("Google Calendar");
    expect(sourceIdentity(act({ category: "search" })).name).toMatch(/sandbox/i);
  });

  it("steps carry honest states, and tier-3 notes demand typed approval", () => {
    const steps = missionSteps([
      act({ status: "executed", summary: "researched" }),
      act({ status: "proposed", tier: 3, category: "delete", summary: "purge old rows" }),
      act({ status: "vetoed", summary: "not this" }),
    ]);
    expect(steps.map((s) => s.state)).toEqual(["done", "waiting", "vetoed"]);
    expect(steps[1].note).toMatch(/typed approval/i);
    expect(steps[2].note).toMatch(/never ran/i);
  });

  it("flagged steps read as held", () => {
    const [s] = missionSteps([act({ status: "proposed", tier: 2, injection_flag: true })]);
    expect(s.state).toBe("held");
    expect(s.note).toMatch(/held/i);
  });
});
