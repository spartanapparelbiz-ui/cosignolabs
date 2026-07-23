import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { approveAction, autoExecute, proposeAction } from "../../src/lib/actions/engine";
import { runAutomation } from "../../src/lib/automations";
import { tickMissions } from "../../src/lib/missions/engine";
import { createMeetingPrepMission } from "../../src/lib/missions/meetingPrep";
import type { ActionInsert } from "../../src/lib/store";

/**
 * Emergency Stop is SERVER state, not a UI switch. With hold scope "all",
 * nothing executes — approvals, auto tier-1 work, scheduled mission ticks,
 * and automation runs all halt at the boundary. Proven end-to-end.
 */

vi.mock("@/lib/auth", () => ({
  clerkConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "user-a"),
}));

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
});

function insert(overrides: Partial<ActionInsert> = {}): ActionInsert {
  return {
    session_id: "s1",
    user_id: "user-a",
    category: "send_email",
    tier: 2,
    summary: "send it",
    payload: { to: "x@y.com" },
    injection_flag: false,
    tier_note: null,
    ...overrides,
  };
}

describe("emergency stop (hold: all)", () => {
  it("blocks approval of a tier-2 card", async () => {
    await store.setHold("user-a", "all");
    const action = await proposeAction(insert());
    await expect(approveAction("user-a", action.id)).rejects.toMatchObject({ code: "on_hold" });
    expect((await store.getAction("user-a", action.id))!.status).toBe("proposed");
    expect(await store.listReceipts("user-a")).toHaveLength(0);
  });

  it("blocks auto-execution of a tier-1 card", async () => {
    await store.setHold("user-a", "all");
    const action = await proposeAction(insert({ tier: 1, category: "search" }));
    const result = await autoExecute("user-a", action);
    expect(result.status).toBe("proposed"); // held at the boundary
  });

  it("scheduled mission ticks skip a held user's missions", async () => {
    const { mission } = await createMeetingPrepMission("user-a");
    await store.setHold("user-a", "all");
    const { advanced, skipped } = await tickMissions(5);
    expect(advanced).toBe(0);
    expect(skipped).toBeGreaterThanOrEqual(1);
    // The mission did not move.
    const steps = await store.listMissionSteps("user-a", mission.id);
    expect(steps.every((s) => s.state !== "completed" || s.tool === "")).toBeTruthy();
  });

  it("automations are skipped while held", async () => {
    const automation = await store.createAutomation({
      user_id: "user-a",
      name: "daily",
      command: "check the inbox",
      interval_hours: 24,
      mode: "prepare",
      next_run_at: new Date().toISOString(),
    });
    await store.setHold("user-a", "all");
    const run = await runAutomation(automation);
    expect(run.status).toBe("ok");
    expect(run.detail).toMatch(/on hold/i);
    expect(run.session_id).toBeNull(); // the command never ran
  });

  it("external hold still allows tier-1 but blocks tier-2", async () => {
    await store.setHold("user-a", "external");
    const t1 = await proposeAction(insert({ tier: 1, category: "search" }));
    expect((await autoExecute("user-a", t1)).status).toBe("executed");
    const t2 = await proposeAction(insert());
    await expect(approveAction("user-a", t2.id)).rejects.toMatchObject({ code: "on_hold" });
  });
});
