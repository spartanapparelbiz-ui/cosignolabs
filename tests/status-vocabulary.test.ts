import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { actionStatus, missionStatus, STATUS_TONE, type Status } from "../src/lib/status";
import type { ActionRecord, MissionRecord } from "../src/lib/types";

/**
 * One vocabulary, everywhere.
 *
 * The same state used to read three different ways depending on the page: a
 * failed mission was "Needs attention" on home, "Failed" in the workspace, and
 * "failed safely" in the list. Each was defensible alone; together they taught
 * people that cosigno's words aren't exact — an expensive lesson for a product
 * whose pitch is that it tells you the truth about what happened.
 */

const FILES = [
  "src/components/app/Dashboard.tsx",
  "src/components/app/MissionWorkspace.tsx",
  "src/components/app/MissionRunner.tsx",
  "src/components/ActionCard.tsx",
];

const MISSION_STATES: MissionRecord["state"][] = [
  "queued",
  "running",
  "awaiting_input",
  "awaiting_approval",
  "retrying",
  "verifying",
  "paused",
  "completed",
  "partial",
  "failed",
  "stopped",
  "blocked",
];

const ACTION_STATES: ActionRecord["status"][] = [
  "proposed",
  "approved",
  "executing",
  "executed",
  "vetoed",
  "failed",
];

const ALLOWED: Status[] = [
  "Working",
  "Waiting",
  "Needs approval",
  "Finished",
  "Failed",
  "Stopped",
  "Needs attention",
];

describe("every state resolves to the shared vocabulary", () => {
  it.each(MISSION_STATES)("mission %s", (state) => {
    expect(ALLOWED).toContain(missionStatus(state));
  });

  it.each(ACTION_STATES)("decision %s", (state) => {
    expect(ALLOWED).toContain(actionStatus(state));
  });

  it("every status has a tone, so none can render unstyled", () => {
    for (const s of ALLOWED) expect(STATUS_TONE[s]).toBeTruthy();
  });
});

describe("the words mean what they say", () => {
  it("only a genuinely completed mission reads as Finished", () => {
    expect(missionStatus("completed")).toBe("Finished");
    // Partial did some of the work, or couldn't confirm it.
    expect(missionStatus("partial")).not.toBe("Finished");
    // Stopped never reached an outcome at all.
    expect(missionStatus("stopped")).not.toBe("Finished");
  });

  it("does not report a fault where there was a decision", () => {
    // You stopped it. Nothing went wrong.
    expect(missionStatus("stopped")).toBe("Stopped");
    expect(missionStatus("stopped")).not.toBe("Failed");
    // You declined the card. Nothing went wrong.
    expect(actionStatus("vetoed")).not.toBe("Failed");
  });

  it("does not erase work that really happened", () => {
    // "Failed" on a partial mission would deny the part that landed.
    expect(missionStatus("partial")).toBe("Needs attention");
    expect(missionStatus("partial")).not.toBe("Failed");
  });

  it("separates 'needs your approval' from 'waiting on you' generally", () => {
    expect(missionStatus("awaiting_approval")).toBe("Needs approval");
    expect(missionStatus("awaiting_input")).toBe("Waiting");
    expect(actionStatus("proposed")).toBe("Needs approval");
  });

  it("treats every flavour of in-flight as Working", () => {
    for (const s of ["queued", "running", "retrying", "verifying"] as const) {
      expect(missionStatus(s)).toBe("Working");
    }
    expect(actionStatus("approved")).toBe("Working");
    expect(actionStatus("executing")).toBe("Working");
  });
});

describe("no page keeps its own vocabulary", () => {
  it.each(FILES)("%s defines no local status map", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/const (STATUS_LABEL|STATE_LABEL|STATE_STYLE|STATE_TONE)\s*[:=]/);
  });

  it.each(FILES)("%s uses the shared one", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(/from "@\/lib\/status"/);
  });

  it("none of the old wordings survive anywhere in the workspace", () => {
    const retired = ["failed safely", "partially completed", "awaiting your sign-off", "executing…"];
    for (const file of FILES) {
      const src = readFileSync(file, "utf8");
      for (const word of retired) {
        expect(src.toLowerCase()).not.toContain(word.toLowerCase());
      }
    }
  });
});
