import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../src/lib/store/memory";
import { advanceMission } from "../src/lib/missions/engine";
import { isConsequentialTool } from "../src/lib/missions/capabilities";

/**
 * Independent work runs at the same time; work that changes something does not.
 *
 * The engine used to take exactly one step per pass, so a mission whose legs
 * had nothing to do with each other — flights, hotels, restaurants — still
 * waited for each in turn. These pin the split that fixes it:
 *
 *  · steps with no dependency between them run together in one pass,
 *  · consequential steps never join a wave, because the action budget is
 *    checked BETWEEN steps and must stop the mission ON its limit rather
 *    than several steps past it.
 *
 * Both are measured through `advanceMission(…, maxRuns)`: with maxRuns = 1 a
 * serial engine can only ever settle one step, so anything more is proof the
 * steps ran together.
 */

vi.mock("@/lib/auth", () => ({
  authConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "user-a"),
}));

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
});

async function missionWith(
  goal: string,
  specs: { purpose: string; operator: string; tool: string }[]
) {
  const session = await store.createSession("user-a", goal);
  const mission = await store.createMission({ user_id: "user-a", session_id: session.id, goal });
  await store.createMissionSteps(
    specs.map((s, idx) => ({
      mission_id: mission.id,
      user_id: "user-a",
      idx,
      purpose: s.purpose,
      operator: s.operator,
      tool: s.tool,
      // No dependencies: every step is ready at once.
      depends_on: [],
    }))
  );
  return mission;
}

/** Four read-only steps, none of which needs anything from the others. */
const INDEPENDENT_READS = [
  { purpose: "find the event", operator: "calendar", tool: "calendar.find_event" },
  { purpose: "search drive", operator: "files", tool: "drive.search_files" },
  { purpose: "scan the inbox", operator: "communication", tool: "inbox.scan" },
  { purpose: "read the calendar", operator: "calendar", tool: "brief.calendar" },
];

describe("independent steps run together", () => {
  it("settles several read-only steps in a single bounded pass", async () => {
    const mission = await missionWith("gather everything at once", INDEPENDENT_READS);

    // maxRuns = 1: a one-step-per-pass engine could settle exactly one.
    await advanceMission("user-a", mission.id, 1);

    const steps = await store.listMissionSteps("user-a", mission.id);
    const settled = steps.filter((s) => s.state === "completed");
    expect(settled.length).toBeGreaterThan(1);
    expect(settled.length).toBe(INDEPENDENT_READS.length);
  });

  it("charges the tool-call budget for every step in the wave, not just one", async () => {
    const mission = await missionWith("gather everything at once", INDEPENDENT_READS);
    await advanceMission("user-a", mission.id, 1);

    const after = await store.getMission("user-a", mission.id);
    // A cap that is only charged for one step of a four-step wave is not a cap.
    expect(after!.tool_calls).toBe(INDEPENDENT_READS.length);
  });

  it("never puts a consequential step in a wave", async () => {
    const specs = [
      { purpose: "reminder one", operator: "calendar", tool: "calendar.propose_reminder" },
      { purpose: "reminder two", operator: "calendar", tool: "calendar.propose_reminder" },
    ];
    expect(specs.every((s) => isConsequentialTool(s.tool))).toBe(true);

    const mission = await missionWith("two changes at once", specs);
    await advanceMission("user-a", mission.id, 1);

    const steps = await store.listMissionSteps("user-a", mission.id);
    const started = steps.filter((s) => s.state !== "ready");
    // Exactly one moved. The other waits for the next pass, where the action
    // budget gets to decide again.
    expect(started).toHaveLength(1);
    expect(await store.getMission("user-a", mission.id).then((m) => m!.tool_calls)).toBe(1);
  });

  it("a step that fails in a wave takes its own retry, and the others still land", async () => {
    // `github.list_repos` needs a GitHub connection, which this user has not
    // got — so it fails while its neighbours succeed.
    const mission = await missionWith("mixed outcomes", [
      ...INDEPENDENT_READS.slice(0, 2),
      { purpose: "read repositories", operator: "code", tool: "github.list_repos" },
    ]);
    await advanceMission("user-a", mission.id, 1);

    const steps = await store.listMissionSteps("user-a", mission.id);
    const failing = steps.find((s) => s.tool === "github.list_repos")!;
    // Failed or retrying — either way it consumed an attempt and said why.
    expect(["retrying", "failed"]).toContain(failing.state);
    expect(failing.error).toBeTruthy();
    // A neighbour's failure never takes down the rest of the wave.
    expect(steps.filter((s) => s.state === "completed").length).toBe(2);
  });
});
