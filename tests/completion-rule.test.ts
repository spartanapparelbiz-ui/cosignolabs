import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../src/lib/store/memory";
import { advanceMission } from "../src/lib/missions/engine";
import type { MissionStepState } from "../src/lib/types";

/**
 * "Completed" is a claim, and it is the claim users act on. It has to mean the
 * work happened AND held up.
 *
 * Two ways it was false:
 *
 *  · A step's verification could come back negative — "the card executed, but
 *    no open issue with that title is visible on the repository" — and the
 *    mission still reported Completed. That is reporting success without
 *    evidence, from the one mechanism built to supply evidence.
 *  · A mission whose steps were ALL skipped reported Completed, because
 *    skipped counted toward the finished tally. "We didn't do this" rendered
 *    as "we did this".
 *
 * The guard has to stay conservative in the other direction too: most steps
 * have no verify hook, and treating absent evidence as failure would invent
 * failures — the same lie, mirrored.
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

/** Build a mission whose steps are already in their final shape. */
async function missionWithSteps(
  specs: Array<{ state: MissionStepState; verification?: Record<string, unknown> | null }>
) {
  const session = await store.createSession(USER, "t");
  const mission = await store.createMission({
    user_id: USER,
    session_id: session.id,
    goal: "do the thing",
  } as never);

  const steps = await store.createMissionSteps(
    specs.map((_, i) => ({
      mission_id: mission.id,
      user_id: USER,
      idx: i,
      purpose: `step ${i}`,
      operator: "chief",
      tool: "mission.receipt",
      depends_on: [],
    })) as never
  );

  for (const [i, spec] of specs.entries()) {
    await store.updateMissionStep(USER, steps[i].id, {
      state: spec.state,
      completed_at: new Date().toISOString(),
      ...(spec.verification !== undefined ? { verification: spec.verification } : {}),
    });
  }
  await store.updateMission(USER, mission.id, { state: "running" });
  return mission;
}

async function stateAfterAdvance(
  specs: Array<{ state: MissionStepState; verification?: Record<string, unknown> | null }>
) {
  const mission = await missionWithSteps(specs);
  await advanceMission(USER, mission.id);
  return (await store.getMission(USER, mission.id))?.state;
}

describe("a failed verification blocks the completion claim", () => {
  it("does not report Completed when a step's verification came back negative", async () => {
    expect(
      await stateAfterAdvance([
        { state: "completed", verification: { verified: true, detail: "confirmed on GitHub." } },
        { state: "completed", verification: { verified: false, detail: "not visible on the repository." } },
      ])
    ).toBe("partial");
  });

  it("reads the {ok:false} shape too, since tools report both", async () => {
    expect(
      await stateAfterAdvance([{ state: "completed", verification: { ok: false, detail: "no." } }])
    ).toBe("partial");
  });

  it("reports Completed when every verification passed", async () => {
    expect(
      await stateAfterAdvance([
        { state: "completed", verification: { verified: true } },
        { state: "completed", verification: { ok: true } },
      ])
    ).toBe("completed");
  });
});

describe("absent evidence is not evidence of failure", () => {
  it.each([null, undefined, {}] as const)(
    "still completes when verification is %j — most steps have no verify hook",
    async (verification) => {
      expect(
        await stateAfterAdvance([
          { state: "completed", verification: verification as Record<string, unknown> | null },
        ])
      ).toBe("completed");
    }
  );

  it("does not treat a verification that merely carries detail as a failure", async () => {
    expect(
      await stateAfterAdvance([{ state: "completed", verification: { detail: "executed." } }])
    ).toBe("completed");
  });
});

describe("skipped work is not done work", () => {
  it("does not report Completed when every step was skipped", async () => {
    expect(await stateAfterAdvance([{ state: "skipped" }, { state: "skipped" }])).toBe("partial");
  });

  it("reports partial when some ran and some were skipped", async () => {
    expect(await stateAfterAdvance([{ state: "completed" }, { state: "skipped" }])).toBe(
      "completed"
    );
  });

  it("still reports failed when nothing ran and nothing was skipped", async () => {
    expect(await stateAfterAdvance([{ state: "failed" }, { state: "failed" }])).toBe("failed");
  });

  it("reports partial when work is genuinely mixed", async () => {
    expect(await stateAfterAdvance([{ state: "completed" }, { state: "failed" }])).toBe("partial");
  });
});

describe("a request received is not a task completed", () => {
  it("a mission with no steps yet is queued, never completed", async () => {
    const session = await store.createSession(USER, "t");
    const mission = await store.createMission({
      user_id: USER,
      session_id: session.id,
      goal: "nothing planned yet",
    } as never);
    await advanceMission(USER, mission.id);
    expect((await store.getMission(USER, mission.id))?.state).not.toBe("completed");
  });
});
