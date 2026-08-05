import { beforeEach, describe, expect, it } from "vitest";
import { approveAction } from "../src/lib/actions/engine";
import { runCommand } from "../src/lib/agent/pipeline";
import { classifyIntent, intentHref } from "../src/lib/intent";
import {
  assembleState,
  assembleStream,
  momentumOf,
  operationalNotes,
} from "../src/lib/state";
import { getStore } from "../src/lib/store";
import { MemoryStore } from "../src/lib/store/memory";
import type { AutomationRecord, MissionRecord } from "../src/lib/types";

const USER = "test-user";

function freshStore(): MemoryStore {
  const store = new MemoryStore();
  (globalThis as unknown as { __cosignoStore?: unknown }).__cosignoStore = store;
  return store;
}

beforeEach(() => {
  freshStore();
});

function mission(state: MissionRecord["state"], goal = "Launch summer collection"): MissionRecord {
  const now = new Date().toISOString();
  return {
    id: `m_${state}_${goal.length}`,
    user_id: USER,
    session_id: "s1",
    goal,
    state,
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
    created_at: now,
    updated_at: now,
    completed_at: state === "completed" ? now : null,
  };
}

function automation(enabled: boolean): AutomationRecord {
  const now = new Date().toISOString();
  return {
    id: `a_${enabled}`,
    user_id: USER,
    name: "Investor email watch",
    command: "watch for investor emails",
    interval_hours: 1,
    mode: "monitor",
    enabled,
    last_run_at: null,
    next_run_at: now,
    created_at: now,
    updated_at: now,
  };
}

/* ---------------------------------------------------------------- momentum */

describe("momentum (human-readable movement, never a score)", () => {
  it("maps every mission state onto the five words", () => {
    expect(momentumOf(mission("running"))).toBe("moving");
    expect(momentumOf(mission("queued"))).toBe("moving");
    expect(momentumOf(mission("awaiting_approval"))).toBe("needs_you");
    expect(momentumOf(mission("awaiting_input"))).toBe("needs_you");
    expect(momentumOf(mission("failed"))).toBe("blocked");
    expect(momentumOf(mission("blocked"))).toBe("blocked");
    expect(momentumOf(mission("completed"))).toBe("complete");
    expect(momentumOf(mission("paused"))).toBe("waiting");
  });
});

/* ------------------------------------------------------------------- state */

describe("cosigno state (the real condition of delegated work)", () => {
  it("counts moving / need-you / watching / blocked from actual records", async () => {
    // Real proposals through the real pipeline (2 tier-2 cards expected ≥1).
    const { actions } = await runCommand(USER, "clear my inbox of newsletters");
    const proposals = actions.filter((a) => a.status === "proposed").length;
    const store = getStore();
    const events = await store.listEvents(USER);

    const state = assembleState({
      missions: [
        mission("running", "Launch summer collection"),
        mission("awaiting_approval", "Investor outreach"),
        mission("failed", "Website update"),
      ],
      actions,
      automations: [automation(true), automation(false)],
      events,
    });

    expect(state.moving).toBe(1);
    expect(state.blocked).toBe(1);
    expect(state.watching).toBe(1); // disabled watch doesn't count
    // proposals + the mission paused on the user
    expect(state.need_you).toBe(proposals + 1);
    expect(state.missions.map((m) => m.momentum)).toEqual(["moving", "needs_you", "blocked"]);
  });

  it("the stream records meaning, not mechanics — auto approvals stay out", async () => {
    const { actions } = await runCommand(USER, "clear my inbox of newsletters");
    const tier2 = actions.find((a) => a.status === "proposed")!;
    await approveAction(USER, tier2.id, { signature: { name: "Nicholas" } });
    const store = getStore();
    const events = await store.listEvents(USER);
    const all = await store.listActions(USER, { limit: 100 });

    const stream = assembleStream(events, all, [mission("running")]);
    const texts = stream.map((s) => s.text);

    expect(texts.some((t) => t.startsWith("Signed:"))).toBe(true);
    expect(texts.some((t) => t.startsWith("Completed:"))).toBe(true);
    expect(texts.some((t) => t.includes("Cosigno is working on"))).toBe(true);
    // Tier-1 auto approvals are mechanics, not meaning.
    expect(texts.some((t) => t.startsWith("Approved:") && /tier 1/i.test(t))).toBe(false);
    // Newest first.
    for (let i = 1; i < stream.length; i++) {
      expect(Date.parse(stream[i - 1].at)).toBeGreaterThanOrEqual(Date.parse(stream[i].at));
    }
  });

  it("operational notes are honest counts from the record", async () => {
    for (let i = 0; i < 2; i++) {
      const { actions } = await runCommand(USER, "clear my inbox of newsletters");
      const t2 = actions.find((a) => a.status === "proposed");
      if (t2) await approveAction(USER, t2.id, { signature: { name: "Nicholas" } });
    }
    const store = getStore();
    const notes = operationalNotes(
      await store.listEvents(USER),
      await store.listActions(USER, { limit: 100 })
    );
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.some((n) => /signed 2/i.test(n))).toBe(true);
  });
});

/* ------------------------------------------------------------------ intent */

describe("adaptive UI intent — the interface becomes the answer", () => {
  it("routes 'where am I needed' asks to focus", () => {
    expect(classifyIntent("What's waiting on me?").view).toBe("focus");
    expect(classifyIntent("where am i needed").view).toBe("focus");
    expect(classifyIntent("what needs me").view).toBe("focus");
  });

  it("routes finished-work asks to today's completed activity", () => {
    const i = classifyIntent("What did you finish today?");
    expect(i.view).toBe("completed");
    expect(intentHref(i)).toBe("/app/activity?status=executed&range=today");
  });

  it("routes state, blocked, watch, missions, activity", () => {
    expect(classifyIntent("What's happening?").view).toBe("state");
    expect(classifyIntent("what changed").view).toBe("state");
    expect(classifyIntent("What's blocked?").view).toBe("blocked");
    expect(classifyIntent("show my watches").view).toBe("watch");
    expect(classifyIntent("show my missions").view).toBe("missions");
    expect(classifyIntent("activity").view).toBe("activity");
  });

  it("'show me the launch' opens that environment", () => {
    const i = classifyIntent("Show me the launch");
    expect(i.view).toBe("environment");
    expect(i.query).toBe("launch");
    expect(intentHref(i)).toBe("/app/missions?q=launch");
    expect(classifyIntent("what's happening with the summer launch").query).toBe("summer launch");
  });

  it("anything else is a delegation, never a dead end", () => {
    const i = classifyIntent("prepare everything for my investor meeting tomorrow");
    expect(i.view).toBe("delegate");
    expect(intentHref(i)).toContain("/app?handle=");
  });
});
