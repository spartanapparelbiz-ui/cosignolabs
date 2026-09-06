import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../src/lib/store/memory";
import { advanceMission } from "../src/lib/missions/engine";
import { instantiateCompiledMission } from "../src/lib/missions/create";
import { compileMission } from "../src/lib/missions/compiler";
import { buildCapabilityManifest } from "../src/lib/missions/capabilities";
import { approveAction } from "../src/lib/actions/engine";
import { CATEGORIES } from "../src/lib/types";
import { OBSERVATION_KINDS, isConsequentialComputerAction } from "../src/lib/computer/provider";
import { resetComputerSandboxForTests } from "../src/lib/computer/sandbox";
import {
  parseComputeCommand,
  runComputeCommand,
  tableOf,
} from "../src/lib/missions/computeTools";
import type { FileRecord } from "../src/lib/types";

/**
 * Computer use, and the compute tool.
 *
 * The load-bearing claim for computer use is that LOOKING is free and
 * TOUCHING is not — on a desktop the same gesture opens a document or empties
 * a bin, and nothing in the pixels says which. So: observation runs freely,
 * every input reaches the machine only through a signed card listing all of
 * them, and the screen is read back afterwards.
 *
 * The load-bearing claim for compute is that it is an interpreter, not an
 * evaluator: there is no path from a string to execution, so the worst a
 * hostile command achieves is an error message.
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
  resetComputerSandboxForTests();
});
afterEach(() => {
  delete process.env.COSIGNO_COMPUTER_SANDBOX;
});

async function drive(id: string, passes = 10) {
  let last = null;
  for (let i = 0; i < passes; i++) {
    last = await advanceMission("user-a", id);
    if (!last) break;
    if (
      ["completed", "partial", "failed", "stopped", "awaiting_input", "awaiting_approval", "paused", "blocked"].includes(
        last.mission.state
      )
    ) {
      break;
    }
  }
  return last!;
}

const COMPUTER_GOAL = 'use my computer to type "hello from cosigno" and click Save';

describe("with no computer connected, cosigno says so", () => {
  it("withholds the computer tools from the manifest entirely", async () => {
    const manifest = await buildCapabilityManifest("user-a");
    expect(manifest.computer.available).toBe(false);
    expect(manifest.tools.some((t) => t.id.startsWith("computer."))).toBe(false);
  });

  it("refuses the goal, naming the real reason, and never fakes a screen", async () => {
    const r = await compileMission("user-a", COMPUTER_GOAL);
    expect(r.shape).toBe("computer");
    expect(r.blocked).toBe(true);
    expect(r.plan.steps).toHaveLength(0);
    expect(r.understood.boundary.toLowerCase()).toMatch(/no computer is connected/);
    // The point of the refusal: it must not claim to have done it.
    expect(r.understood.boundary.toLowerCase()).toMatch(/won't report having done so/);
  });
});

describe("looking is free, touching needs a signature", () => {
  beforeEach(() => {
    // The loop is exercisable through the labeled test environment. Nothing a
    // user can reach turns this on — it is read from the environment only.
    process.env.COSIGNO_COMPUTER_SANDBOX = "1";
  });

  it("classifies every input kind as consequential, and only observation as free", () => {
    expect([...OBSERVATION_KINDS].every((k) => !isConsequentialComputerAction(k))).toBe(true);
    // Scroll and focus are input, however harmless they usually are.
    for (const kind of ["click", "type", "pressKey", "scroll", "focusWindow", "openApp"] as const) {
      expect(isConsequentialComputerAction(kind), kind).toBe(true);
    }
  });

  it("can never be set to run automatically", () => {
    // Pinned means the engine fixes the tier at approval — a user cannot
    // lower it, so "cosigno clicks on my machine unattended" has no setting.
    expect(CATEGORIES.computer_use.pinned).toBe(true);
    expect(CATEGORIES.computer_use.defaultTier).toBe(2);
  });

  it("observes freely, then stops at a card listing every input", async () => {
    const compiled = await compileMission("user-a", COMPUTER_GOAL);
    expect(compiled.blocked).toBe(false);
    const { mission } = await instantiateCompiledMission("user-a", compiled.plan);
    const result = await drive(mission.id);

    expect(result.mission.state).toBe("awaiting_approval");

    // The observation step ran without asking anybody.
    const steps = await store.listMissionSteps("user-a", mission.id);
    const observe = steps.find((s) => s.tool === "computer.observe")!;
    expect(observe.state).toBe("completed");

    // The card carries the whole sequence, in order, each with a reason.
    const [action] = await store.listActions("user-a", { status: "proposed", limit: 5 });
    expect(action.category).toBe("computer_use");
    const inputs = action.payload.inputs as { kind: string; why: string }[];
    expect(inputs.length).toBeGreaterThan(0);
    for (const i of inputs) {
      expect(isConsequentialComputerAction(i.kind as never)).toBe(true);
      expect(i.why).toBeTruthy();
    }
    expect(action.summary).toContain("use your computer");
  });

  it("makes exactly the approved inputs, then reads the screen back", async () => {
    const compiled = await compileMission("user-a", COMPUTER_GOAL);
    const { mission } = await instantiateCompiledMission("user-a", compiled.plan);
    await drive(mission.id);

    const [action] = await store.listActions("user-a", { status: "proposed", limit: 5 });
    const expected = (action.payload.inputs as unknown[]).length;
    const executed = await approveAction("user-a", action.id);
    expect(executed.status).toBe("executed");
    expect(executed.result?.inputs_made).toBe(expected);

    const final = await drive(mission.id);
    expect(final.mission.state).toBe("completed");
    const step = (await store.listMissionSteps("user-a", mission.id)).find(
      (s) => s.tool === "computer.operate"
    )!;
    // Verified by looking again, not by trusting the provider's own "ok".
    expect(step.verification).toMatchObject({ ok: true });
    expect(String(step.verification?.detail)).toMatch(/read the screen back/);
  });

  it("carries the session on durable state, not in the worker's memory", async () => {
    // The session first lived in a module-level Map. That passes a test where
    // everything shares a process, and fails the product: approving a card is
    // a separate request and often a separate worker, which found an empty
    // Map and reported that the session had ended. So the invariant is not
    // "approval works here" — it is that the handle is written somewhere a
    // different process can read.
    const compiled = await compileMission("user-a", COMPUTER_GOAL);
    const { mission } = await instantiateCompiledMission("user-a", compiled.plan);
    await drive(mission.id);

    const steps = await store.listMissionSteps("user-a", mission.id);
    const observe = steps.find((s) => s.tool === "computer.observe")!;
    const onStep = observe.output?.computer_session as { providerRef?: string } | undefined;
    expect(onStep?.providerRef).toBeTruthy();

    const [action] = await store.listActions("user-a", { status: "proposed", limit: 5 });
    const onCard = action.payload.session as { providerRef?: string } | undefined;
    expect(onCard?.providerRef).toBe(onStep?.providerRef);

    // And the executor's entry point works from the card alone, with nothing
    // else in scope.
    const { runApprovedComputerInputs } = await import("../src/lib/missions/computerTools");
    const replayed = await runApprovedComputerInputs(onCard, [{ kind: "click", target: "Save" }]);
    expect(replayed.ok).toBe(true);
    expect(replayed.ran).toBe(1);

    // A card with no session says so rather than silently doing nothing.
    const orphan = await runApprovedComputerInputs(undefined, [{ kind: "click", target: "Save" }]);
    expect(orphan.ok).toBe(false);
    expect(orphan.ran).toBe(0);
  });

  it("makes no input at all when any entry on the card is malformed", async () => {
    const compiled = await compileMission("user-a", COMPUTER_GOAL);
    const { mission } = await instantiateCompiledMission("user-a", compiled.plan);
    await drive(mission.id);
    const [action] = await store.listActions("user-a", { status: "proposed", limit: 5 });
    const session = action.payload.session;

    const { runApprovedComputerInputs } = await import("../src/lib/missions/computerTools");
    // Checking entries as it went meant a card whose LAST entry was bad had
    // already made the earlier inputs — the machine left half-changed, in a
    // state nobody approved. The sequence is all-or-nothing now.
    for (const malformed of [
      [{ kind: "click", target: "Save" }, { kind: "definitelyNotAKind" }],
      // An observation on an approval card is a card that doesn't say what it
      // does, so it is refused rather than quietly skipped.
      [{ kind: "click", target: "Save" }, { kind: "screenshot" }],
      [{ kind: "screenshot" }, { kind: "click", target: "Save" }],
    ]) {
      const result = await runApprovedComputerInputs(session, malformed);
      expect(result.ok).toBe(false);
      expect(result.ran).toBe(0);
      expect(result.summary).toMatch(/isn't something cosigno can do/);
    }

    // The well-formed sequence still runs in full.
    const good = await runApprovedComputerInputs(session, [
      { kind: "click", target: "Save" },
      { kind: "type", value: "x" },
    ]);
    expect(good.ok).toBe(true);
    expect(good.ran).toBe(2);
  });

  it("clicks nothing when it can't find the control the step named", async () => {
    const compiled = await compileMission(
      "user-a",
      "use my computer to click the Export To Ledger button"
    );
    const { mission } = await instantiateCompiledMission("user-a", compiled.plan);
    const result = await drive(mission.id);

    // No card, no guessed coordinates — it says what it saw instead.
    expect(await store.listActions("user-a", { status: "proposed", limit: 5 })).toHaveLength(0);
    expect(result.mission.state).toBe("completed");
    const step = (await store.listMissionSteps("user-a", mission.id)).find(
      (s) => s.tool === "computer.operate"
    )!;
    expect(String(step.output?.summary)).toMatch(/couldn't find the controls/);
    expect(step.output?.found).toBe(false);
  });
});

describe("the compute tool is an interpreter, not a shell", () => {
  const file = (name: string, content: string): FileRecord => ({
    id: "f", user_id: "u", session_id: null, name, mime: "text/markdown",
    content, version: 1, created_at: "", updated_at: "",
  });

  const TABLE = file(
    "rents",
    ["| option | rent |", "| --- | --- |", "| a | $1,200 |", "| b | $800 |", "| c | not stated |"].join("\n")
  );

  it("refuses anything that isn't one of its verbs", () => {
    for (const hostile of [
      "rm -rf /",
      "cat /etc/passwd",
      "node -e process.exit()",
      "sum; rm -rf /",
      "$(whoami)",
      "../../secrets",
    ]) {
      const parsed = parseComputeCommand(hostile);
      expect("error" in parsed, hostile).toBe(true);
    }
  });

  it("treats shell punctuation as ordinary text, because there is nothing to chain to", () => {
    const parsed = parseComputeCommand("lines report; rm -rf /");
    // It parses as a filename. No file is named that, so it simply finds
    // nothing — the punctuation never means anything.
    expect("error" in parsed).toBe(false);
    if (!("error" in parsed)) expect(parsed.file).toBe("report; rm -rf /");
  });

  it("computes from the rows that actually carry a number, and says how many", () => {
    const sum = runComputeCommand({ verb: "sum", file: "rents", column: "rent" }, TABLE);
    expect(sum.ok).toBe(true);
    expect(sum.value).toBe(2000);
    expect(sum.used).toBe(2);
    expect(sum.skipped).toBe(1);
    // The count is in the answer, so an average over 2 of 3 rows can't read
    // as an average over 3.
    expect(sum.answer).toMatch(/from 2 rows \(1 had no number/);
  });

  it("names the columns that exist rather than guessing at the one asked for", () => {
    const bad = runComputeCommand({ verb: "avg", file: "rents", column: "price" }, TABLE);
    expect(bad.ok).toBe(false);
    expect(bad.answer).toContain("option, rent");
  });

  it("says there is nothing to calculate rather than returning zero", () => {
    const empty = file("notes", "| a | b |\n| --- | --- |\n| x | y |");
    const r = runComputeCommand({ verb: "sum", file: "notes", column: "b" }, empty);
    expect(r.ok).toBe(false);
    expect(r.value).toBeUndefined();
    expect(r.answer).toMatch(/nothing to calculate/);
  });

  it("reads both shapes this app writes", () => {
    expect(tableOf(TABLE.content).rows).toHaveLength(3);
    expect(tableOf("name,cost\na,1\nb,2").header).toEqual(["name", "cost"]);
  });
});
