import { describe, expect, it } from "vitest";
import { heroFromReceipt, heroFromSteps, heroResult, todayDigest } from "../src/lib/missions/today";
import type { MissionRecord, MissionRunState, MissionStepRecord } from "../src/lib/types";

/**
 * The five-second screen. Someone comes back after lunch and reads this before
 * anything else, which makes it the most expensive place in the product to be
 * wrong — a confident sentence here is believed and acted on without checking.
 *
 * So: every line comes from a recorded outcome, nothing is summarised into
 * existence, and yesterday's wins never appear on today's list.
 */

const now = new Date("2026-08-05T15:00:00Z");
const todayIso = "2026-08-05T10:00:00Z";
const yesterdayIso = "2026-08-04T10:00:00Z";

function step(over: Partial<MissionStepRecord> = {}): MissionStepRecord {
  return {
    id: "s1",
    mission_id: "m1",
    user_id: "u",
    idx: 0,
    purpose: "Read your repositories",
    operator: "code",
    tool: "github.list_repos",
    state: "completed",
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
    completed_at: todayIso,
    created_at: todayIso,
    updated_at: todayIso,
    ...over,
  } as MissionStepRecord;
}

function mission(over: Partial<MissionRecord> = {}): MissionRecord {
  return {
    id: "m1",
    user_id: "u",
    session_id: "s",
    goal: "fix the checkout bug",
    state: "completed" as MissionRunState,
    plan_version: 1,
    pending_question: null,
    receipt: null,
    error: null,
    lease_owner: null,
    lease_expires_at: null,
    tool_calls: 0,
    browser_actions: 0,
    budget_cents: 100,
    created_at: todayIso,
    updated_at: todayIso,
    completed_at: todayIso,
    ...over,
  } as MissionRecord;
}

describe("the hero sentence is the one thing a mission is remembered by", () => {
  it("takes the LAST recorded outcome — missions build toward their result", () => {
    const hero = heroFromSteps([
      step({ id: "a", idx: 0, output: { summary: "found 3 repositories" } }),
      step({ id: "b", idx: 1, output: { summary: "opened issue #7 in cosignolabs" } }),
    ]);
    expect(hero).toBe("Opened issue #7 in cosignolabs.");
  });

  it("skips bookkeeping", () => {
    // "mission receipt written" is the least interesting true statement
    // cosigno can make about a day's work.
    const hero = heroFromSteps([
      step({ id: "a", idx: 0, output: { summary: "opened issue #7" } }),
      step({ id: "b", idx: 1, tool: "mission.receipt", output: { summary: "mission receipt written: 2 steps" } }),
    ]);
    expect(hero).toBe("Opened issue #7.");
  });

  it("ignores steps that never completed", () => {
    const hero = heroFromSteps([
      step({ id: "a", idx: 0, output: { summary: "found 3 repositories" } }),
      step({ id: "b", idx: 1, state: "failed", output: { summary: "would have opened an issue" } }),
    ]);
    expect(hero).toBe("Found 3 repositories.");
  });

  it("returns nothing when nothing was recorded, rather than inventing a win", () => {
    expect(heroFromSteps([step({ output: null })])).toBeNull();
    expect(heroFromSteps([])).toBeNull();
  });

  it("reads a finished mission's receipt when its steps aren't loaded", () => {
    const m = mission({
      receipt: {
        completed_steps: [
          { purpose: "read", summary: "found 3 repositories" },
          { purpose: "write", summary: "opened issue #7" },
        ],
      },
    });
    expect(heroFromReceipt(m)).toBe("Opened issue #7.");
  });

  it("never lets the receipt's own bookkeeping become the hero", () => {
    const m = mission({
      receipt: {
        completed_steps: [
          { purpose: "read", summary: "opened issue #7" },
          { purpose: "receipt", summary: "mission receipt written: 2 steps completed" },
        ],
      },
    });
    expect(heroFromReceipt(m)).toBe("Opened issue #7.");
  });

  it("prefers live steps but falls back to the receipt", () => {
    const m = mission({ receipt: { completed_steps: [{ summary: "from the receipt" }] } });
    expect(heroResult(m, [step({ output: { summary: "from the steps" } })])).toBe("From the steps.");
    expect(heroResult(m, [])).toBe("From the receipt.");
  });
});

describe("today reads as sentences, in the order that matters", () => {
  it("puts what needs a decision first", () => {
    const d = todayDigest(
      [
        mission({ id: "done", state: "completed", receipt: { completed_steps: [{ summary: "opened issue #7" }] } }),
        mission({ id: "wait", state: "awaiting_approval" }),
        mission({ id: "run", state: "running" }),
      ],
      { run: [step({ state: "running", purpose: "Draft the issue" })] },
      5,
      now
    );
    // Anything waiting is the only thing that costs the reader something by
    // being missed.
    expect(d.lines.map((l) => l.kind)).toEqual(["waiting", "doing", "done"]);
  });

  it("says what a running mission is actually doing", () => {
    const d = todayDigest(
      [mission({ id: "run", state: "running" })],
      { run: [step({ state: "running", purpose: "Draft the issue" })] },
      5,
      now
    );
    expect(d.lines[0].text).toBe("Drafting the issue");
  });

  it("does not claim a queued mission is doing something", () => {
    const d = todayDigest([mission({ id: "q", state: "queued" })], {}, 5, now);
    expect(d.lines[0].text).toMatch(/^Starting:/);
  });

  it("names what a waiting mission wants", () => {
    const d = todayDigest(
      [mission({ id: "w", state: "awaiting_approval" })],
      { w: [step({ state: "awaiting_approval", purpose: "Send the customer emails" })] },
      5,
      now
    );
    expect(d.lines[0].text).toMatch(/send the customer emails/i);
  });
});

describe("today means today", () => {
  it("leaves yesterday's finished work off", () => {
    // Carrying wins forward quietly inflates every day after a busy one.
    const d = todayDigest(
      [mission({ id: "old", state: "completed", completed_at: yesterdayIso, updated_at: yesterdayIso })],
      {},
      5,
      now
    );
    expect(d.empty).toBe(true);
  });

  it("keeps work that finished today", () => {
    const d = todayDigest(
      [mission({ id: "new", state: "completed", receipt: { completed_steps: [{ summary: "opened issue #7" }] } })],
      {},
      5,
      now
    );
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].text).toBe("Opened issue #7.");
  });

  it("still lists work that is waiting or running, whenever it started", () => {
    // An unanswered decision from yesterday is still unanswered.
    const d = todayDigest(
      [mission({ id: "w", state: "awaiting_approval", updated_at: yesterdayIso, completed_at: null })],
      {},
      5,
      now
    );
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].kind).toBe("waiting");
  });
});

describe("nothing is summarised into existence", () => {
  it("falls back to the goal when a finished mission recorded no outcome", () => {
    const d = todayDigest([mission({ id: "bare", state: "completed" })], {}, 5, now);
    expect(d.lines[0].text).toBe("Finished: fix the checkout bug");
  });

  it("says a failed mission didn't finish, rather than dressing it up", () => {
    const d = todayDigest([mission({ id: "f", state: "failed" })], {}, 5, now);
    expect(d.lines[0].kind).toBe("failed");
    expect(d.lines[0].text).toMatch(/^Didn't finish/);
  });

  it("is empty when nothing happened, rather than padded", () => {
    expect(todayDigest([], {}, 5, now).empty).toBe(true);
  });

  it("holds to five lines — the screen has a five-second budget", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      mission({ id: `m${i}`, state: "completed", receipt: { completed_steps: [{ summary: `did thing ${i}` }] } })
    );
    expect(todayDigest(many, {}, 5, now).lines).toHaveLength(5);
  });
});
