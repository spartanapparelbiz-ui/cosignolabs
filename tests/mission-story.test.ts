import { describe, expect, it } from "vitest";
import { buildMissionStory, missionApps } from "@/lib/missionStory";
import type { MissionRecord, MissionStepRecord, MissionStepState } from "@/lib/types";

/**
 * A mission has to read as a story — what happened, where, and whether it is
 * really finished — not as a list of step states.
 */

let seq = 0;
function step(over: Partial<MissionStepRecord> & { tool: string; state: MissionStepState }): MissionStepRecord {
  const idx = over.idx ?? seq++;
  return {
    id: `step_${idx}_${over.tool}`,
    mission_id: "m1",
    user_id: "u1",
    idx,
    purpose: over.purpose ?? `do thing ${idx}`,
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

const mission = (state: MissionRecord["state"]) => ({ goal: "Prepare the board pack", state });

describe("the apps a mission moves through", () => {
  it("groups steps into one box per app, in the order work reaches them", () => {
    const apps = missionApps([
      step({ idx: 0, tool: "calendar.find_event", state: "completed" }),
      step({ idx: 1, tool: "gmail.search_related", state: "completed" }),
      step({ idx: 2, tool: "gmail.draft", state: "running" }),
      step({ idx: 3, tool: "drive.search_files", state: "ready" }),
    ]);
    expect(apps.map((a) => a.name)).toEqual(["Calendar", "Email", "Files"]);
    expect(apps[1].steps).toHaveLength(2);
  });

  it("folds cosigno's own thinking into one box, not a fake third-party app", () => {
    const apps = missionApps([
      step({ idx: 0, tool: "analyze.extract", state: "completed" }),
      step({ idx: 1, tool: "mission.receipt", state: "completed" }),
      step({ idx: 2, tool: "gmail.send", state: "completed" }),
    ]);
    expect(apps.map((a) => a.name)).toEqual(["cosigno", "Email"]);
  });

  it("gives an app the worst state of its steps — one app, one status", () => {
    const apps = missionApps([
      step({ idx: 0, tool: "gmail.a", state: "completed" }),
      step({ idx: 1, tool: "gmail.b", state: "failed" }),
    ]);
    expect(apps[0].mark).toBe("stopped");
  });

  it("names an app it doesn't recognize rather than hiding it", () => {
    const apps = missionApps([step({ idx: 0, tool: "acme_crm.push", state: "ready" })]);
    expect(apps[0].name).toBe("Acme crm");
  });
});

describe("the story", () => {
  it("lists what actually happened, with what each step produced", () => {
    const story = buildMissionStory(mission("completed"), [
      step({
        idx: 0,
        tool: "drive.save",
        state: "completed",
        purpose: "Save the board pack",
        output: { file_id: "f1", name: "board-pack.pdf" },
      }),
      step({
        idx: 1,
        tool: "gmail.send",
        state: "completed",
        purpose: "Email the board",
        output: { summary: "sent to 6 people" },
      }),
    ]);
    expect(story.done).toEqual([
      "Save the board pack — saved board-pack.pdf",
      "Email the board — sent to 6 people",
    ]);
    expect(story.files).toBe(1);
  });

  it("never claims time saved — only time actually taken", () => {
    const story = buildMissionStory(mission("completed"), [
      step({
        idx: 0,
        tool: "gmail.send",
        state: "completed",
        started_at: "2026-01-01T10:00:00.000Z",
        completed_at: "2026-01-01T10:02:30.000Z",
      }),
    ]);
    expect(story.took).toBe("3m");
    expect(JSON.stringify(story)).not.toMatch(/saved you|time saved/i);
  });

  it("has no elapsed time until something has actually run", () => {
    expect(buildMissionStory(mission("queued"), [step({ idx: 0, tool: "gmail.a", state: "ready" })]).took).toBeNull();
  });

  it("says what is happening right now", () => {
    const story = buildMissionStory(mission("running"), [
      step({ idx: 0, tool: "gmail.a", state: "completed" }),
      step({ idx: 1, tool: "drive.b", state: "running", purpose: "Reading the files" }),
    ]);
    expect(story.status).toBe("working");
    expect(story.now).toBe("Reading the files");
  });

  it("names the human as the blocker when it's their turn", () => {
    const story = buildMissionStory(mission("awaiting_approval"), [
      step({ idx: 0, tool: "gmail.send", state: "awaiting_approval", purpose: "Send the invoice" }),
    ]);
    expect(story.status).toBe("needs_approval");
    expect(story.now).toBe("Send the invoice — waiting for you");
  });

  it("says where it stopped and that earlier work was kept", () => {
    const story = buildMissionStory(mission("partial"), [
      step({ idx: 0, tool: "drive.a", state: "completed" }),
      step({ idx: 1, tool: "gmail.b", state: "failed", purpose: "Email the board", error: "mailbox full" }),
    ]);
    expect(story.status).toBe("failed");
    expect(story.outcome).toContain("Email the board");
    expect(story.outcome).toContain("mailbox full");
    expect(story.outcome).toMatch(/kept/);
  });

  it("distinguishes a checked result from one that was merely sent", () => {
    const checked = buildMissionStory(mission("completed"), [
      step({ idx: 0, tool: "gmail.send", state: "completed", verification: { ok: true, detail: "found in Sent" } }),
    ]);
    expect(checked.verified).toBe(true);
    expect(checked.unverified).toBe(0);
    expect(checked.outcome).toMatch(/checked afterwards/);

    const unchecked = buildMissionStory(mission("completed"), [
      step({ idx: 0, tool: "gmail.send", state: "completed" }),
    ]);
    expect(unchecked.verified).toBe(false);
    expect(unchecked.outcome).toMatch(/reporting them as sent rather than confirmed/);
  });

  it("counts the approvals a mission needed", () => {
    const story = buildMissionStory(mission("completed"), [
      step({ idx: 0, tool: "gmail.send", state: "completed", action_id: "act_1" }),
      step({ idx: 1, tool: "drive.save", state: "completed" }),
    ]);
    expect(story.approvals).toBe(1);
  });

  it("survives a mission with no steps at all", () => {
    const story = buildMissionStory(mission("queued"), []);
    expect(story.done).toEqual([]);
    expect(story.apps).toEqual([]);
    expect(story.outcome).toBeTruthy();
  });
});
