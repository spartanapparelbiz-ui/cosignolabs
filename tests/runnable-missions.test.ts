import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../src/lib/store/memory";
import { RUNNABLE_MISSION_STATES, type MissionRunState } from "../src/lib/types";

/**
 * "The mission resumes automatically after you decide."
 *
 * That sentence is printed on the mission screen, and it was false in the
 * background. `awaiting_approval` was missing from the scheduler's runnable
 * set, so a mission parked on a signature was invisible to every tick: after
 * approving a card, nothing moved unless its owner happened to have the page
 * open driving the engine by hand — the exact situation background execution
 * exists to remove.
 *
 * It also made the stuck-action recovery unreachable, since that runs inside
 * the same settle pass.
 */

vi.mock("@/lib/auth", () => ({
  authConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "user-a"),
}));

const USER = "user-a";
let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
});

async function missionInState(state: MissionRunState) {
  const session = await store.createSession(USER, "t");
  const m = await store.createMission({
    user_id: USER,
    session_id: session.id,
    goal: `goal ${state}`,
  } as never);
  await store.updateMission(USER, m.id, { state });
  return m;
}

describe("the scheduler picks up missions parked on an approval", () => {
  it("includes awaiting_approval — without it, approving a card does nothing in the background", async () => {
    const m = await missionInState("awaiting_approval");
    const runnable = await store.listRunnableMissions(50);
    expect(runnable.map((r) => r.id)).toContain(m.id);
  });

  it.each(["queued", "running", "retrying", "verifying"] as const)(
    "still picks up %s",
    async (state) => {
      const m = await missionInState(state);
      const runnable = await store.listRunnableMissions(50);
      expect(runnable.map((r) => r.id)).toContain(m.id);
    }
  );

  it.each(["awaiting_input", "paused", "stopped", "completed", "failed", "blocked"] as const)(
    "leaves %s alone",
    async (state) => {
      const m = await missionInState(state);
      const runnable = await store.listRunnableMissions(50);
      expect(runnable.map((r) => r.id)).not.toContain(m.id);
    }
  );

  it("never ticks a mission waiting on a human answer — no amount of ticking produces one", () => {
    expect(RUNNABLE_MISSION_STATES).not.toContain("awaiting_input");
  });

  it("never resumes something a person explicitly stopped", () => {
    expect(RUNNABLE_MISSION_STATES).not.toContain("paused");
    expect(RUNNABLE_MISSION_STATES).not.toContain("stopped");
  });

  it("never re-runs a terminal mission", () => {
    for (const terminal of ["completed", "partial", "failed", "stopped", "blocked"] as const) {
      expect(RUNNABLE_MISSION_STATES).not.toContain(terminal);
    }
  });
});

describe("both stores agree on what is runnable", () => {
  it("is defined once, so the in-memory and Supabase queries cannot drift", () => {
    const memory = readFile("src/lib/store/memory.ts");
    const supabase = readFile("src/lib/store/supabase.ts");
    // A hardcoded list in either store is how these two silently diverge:
    // dev would advance missions that production quietly ignored.
    expect(memory).toContain("RUNNABLE_MISSION_STATES");
    expect(supabase).toContain("RUNNABLE_MISSION_STATES");
    expect(memory).not.toMatch(/\["queued", "running", "retrying", "verifying"\]/);
    expect(supabase).not.toMatch(/\["queued", "running", "retrying", "verifying"\]/);
  });
});

function readFile(p: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("node:fs").readFileSync(p, "utf8");
}
