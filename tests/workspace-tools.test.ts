import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../src/lib/store/memory";
import { advanceMission } from "../src/lib/missions/engine";
import { instantiateCompiledMission } from "../src/lib/missions/create";
import { compileMission } from "../src/lib/missions/compiler";
import { buildCapabilityManifest } from "../src/lib/missions/capabilities";
import { approveAction } from "../src/lib/actions/engine";
import { proposeNames, tidyTitle } from "../src/lib/missions/workspaceTools";
import type { FileRecord } from "../src/lib/types";

/**
 * Organizing the workspace, and writing.
 *
 * Both used to be refused. What makes organizing worth having is that
 * cosigno itself makes the mess: a report is saved under the entire goal
 * sentence, truncated mid-word, so a workspace of real work reads
 * "Research the best apartments near UCF under $1,500 and create a com…".
 *
 * The guarantees these hold: a rename is never applied without an approval
 * card that lists every line of it, the rename is REAL (not a sandbox
 * result), contents are never touched, and the new names are read back from
 * storage as evidence rather than assumed.
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

async function seedMessyFiles() {
  await store.createFile({
    user_id: "user-a",
    session_id: null,
    name: "Research the best apartments near UCF under $1,500 and create a com…",
    mime: "text/markdown",
    content: "# apartments near UCF under $1,500\n\n| option | figure |\n| --- | --- |\n\n## recommendation\n\nnone.",
  });
  await store.createFile({
    user_id: "user-a",
    session_id: null,
    name: "Write a one-page brief on what changed this w…",
    mime: "text/markdown",
    content: "# what changed this week\n\nsome notes about the week.",
  });
}

describe("naming files from what is in them", () => {
  const file = (name: string, content: string): FileRecord => ({
    id: "f", user_id: "u", session_id: null, name, mime: "text/markdown",
    content, version: 1, created_at: "", updated_at: "",
  });

  it("prefers the file's own heading over a truncated goal sentence", () => {
    expect(
      tidyTitle(file("Research the best apartments near UCF under $1,500 and create a com…", "# apartments near UCF\n\nbody"))
    ).toBe("apartments near UCF");
  });

  it("strips the instruction verbs the goal sentence started with", () => {
    expect(tidyTitle(file("x", "# Research the best coworking spaces in Austin\n"))).toBe(
      "best coworking spaces in Austin"
    );
  });

  it("drops the trailing instruction clause, which the file already is", () => {
    expect(tidyTitle(file("x", "# Research coworking spaces in Austin and compare them\n"))).toBe(
      "coworking spaces in Austin"
    );
  });

  it("never ends on a dangling word left by a cut", () => {
    const t = tidyTitle(
      file("x", "# Research the best apartments near UCF under 1500 dollars and create\n")
    );
    expect(t).toBe("best apartments near UCF under 1500 dollars");
    expect(t).not.toMatch(/\b(and|under|near|the|of|for|to)$/);
  });

  it("never truncates mid-word — that is the thing being fixed", () => {
    const long = "# " + "alpha bravo charlie delta echo foxtrot golf hotel india juliet";
    const t = tidyTitle(file("x", long));
    expect(t.length).toBeLessThanOrEqual(48);
    expect(t.endsWith("…")).toBe(false);
    expect(long).toContain(t);
    // The cut landed on a word boundary.
    expect(long.slice(2).startsWith(t)).toBe(true);
  });

  it("never proposes the same name twice", () => {
    const same = "# quarterly notes";
    const names = proposeNames([
      { ...file("a", same), id: "1" },
      { ...file("b", same), id: "2" },
      { ...file("c", same), id: "3" },
    ]).map((p) => p.to);
    expect(new Set(names).size).toBe(3);
  });
});

describe("organizing is proposed, approved, then verified", () => {
  it("compiles to a plan whose only change is approval-gated", async () => {
    const r = await compileMission("user-a", "organize my files so they read consistently");
    expect(r.shape).toBe("organize_files");
    expect(r.blocked).toBe(false);
    expect(r.plan.steps.map((s) => s.tool)).toContain("files.organize");
    expect(r.plan.approvalCheckpoints.length).toBeGreaterThan(0);
    // It is honest about what it can't reach.
    expect(r.plan.unsupported.join(" ")).toMatch(/outside cosigno|connected drive/i);
  });

  it("stops for a signature and changes nothing until it is given", async () => {
    await seedMessyFiles();
    const before = (await store.listFiles("user-a")).map((f) => f.name).sort();

    const compiled = await compileMission("user-a", "organize my files so they read consistently");
    const { mission } = await instantiateCompiledMission("user-a", compiled.plan);
    const result = await drive(mission.id);

    expect(result.mission.state).toBe("awaiting_approval");
    // Nothing moved while the card waits.
    expect((await store.listFiles("user-a")).map((f) => f.name).sort()).toEqual(before);

    // Every rename is on the card, not summarized away.
    const [action] = await store.listActions("user-a", { status: "proposed", limit: 5 });
    expect(action).toBeTruthy();
    const renames = action.payload.renames as { from: string; to: string }[];
    expect(renames.length).toBe(2);
    for (const r of renames) {
      expect(r.from).toBeTruthy();
      expect(r.to).toBeTruthy();
      expect(r.to).not.toContain("…");
    }
  });

  it("really renames on approval — and the rename is not a sandbox result", async () => {
    await seedMessyFiles();
    const originals = await store.listFiles("user-a");
    const contents = new Map(originals.map((f) => [f.id, f.content]));

    const compiled = await compileMission("user-a", "organize my files so they read consistently");
    const { mission } = await instantiateCompiledMission("user-a", compiled.plan);
    await drive(mission.id);

    const [action] = await store.listActions("user-a", { status: "proposed", limit: 5 });
    const executed = await approveAction("user-a", action.id);
    expect(executed.status).toBe("executed");
    // A sandbox stand-in would mark itself; this one is the real thing.
    expect(executed.result?.simulated).not.toBe(true);

    const after = await store.listFiles("user-a");
    for (const f of after) {
      expect(f.name).not.toContain("…");
      expect(f.name).toMatch(/^(comparison|notes|brief|agenda|table) — /);
      // Contents are never touched by a rename.
      expect(f.content).toBe(contents.get(f.id));
    }

    // Verification reads the names back rather than assuming.
    const final = await drive(mission.id);
    expect(final.mission.state).toBe("completed");
    const step = (await store.listMissionSteps("user-a", mission.id)).find(
      (s) => s.tool === "files.organize"
    )!;
    expect(step.verification).toMatchObject({ ok: true });
  });

  it("says so plainly when there is nothing to tidy", async () => {
    const compiled = await compileMission("user-a", "organize my files so they read consistently");
    const { mission } = await instantiateCompiledMission("user-a", compiled.plan);
    const result = await drive(mission.id);
    // No files at all → completes without proposing anything.
    expect(result.mission.state).toBe("completed");
    expect(await store.listActions("user-a", { status: "proposed", limit: 5 })).toHaveLength(0);
  });
});

describe("writing exists only where it can actually be done", () => {
  it("is absent from the manifest with no planner, so no plan can name it", async () => {
    const manifest = await buildCapabilityManifest("user-a");
    expect(manifest.tools.some((t) => t.id === "deliverable.write")).toBe(false);
  });

  it("a writing goal is refused with the real reason rather than researched", async () => {
    const r = await compileMission("user-a", "Write a blog post about what changed this week");
    expect(r.shape).toBe("write");
    expect(r.blocked).toBe(true);
    expect(r.understood.boundary.toLowerCase()).toMatch(/ai operator/);
    // It must not silently fall back to a web search for the words.
    expect(r.plan.steps).toHaveLength(0);
  });
});
