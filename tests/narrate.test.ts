import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { narrateMission, toProgressive } from "../src/lib/missions/narrate";
import type { MissionRecord, MissionStepRecord, MissionRunState } from "../src/lib/types";

/**
 * The engine's vocabulary exists to make cosigno trustworthy. None of it helps
 * anyone understand what is happening, and most of it gets in the way. These
 * tests pin the translation — and, more importantly, pin the fact that the
 * architecture never leaks through it.
 */

const WORKSPACE = readFileSync("src/components/app/MissionWorkspace.tsx", "utf8");

function step(over: Partial<MissionStepRecord> = {}): MissionStepRecord {
  return {
    id: "s1",
    mission_id: "m",
    user_id: "u",
    idx: 0,
    purpose: "Read your repositories",
    operator: "code",
    tool: "github.list_repos",
    state: "ready",
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  } as MissionStepRecord;
}

function mission(over: Partial<MissionRecord> = {}): MissionRecord {
  return {
    id: "m",
    user_id: "u",
    session_id: "s",
    goal: "do the thing",
    state: "running" as MissionRunState,
    plan_version: 1,
    pending_question: null,
    receipt: null,
    error: null,
    lease_owner: null,
    lease_expires_at: null,
    tool_calls: 0,
    browser_actions: 0,
    budget_cents: 100,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    ...over,
  } as MissionRecord;
}

describe("the current step says what it is doing", () => {
  it.each([
    ["Read your repositories", "Reading your repositories"],
    ["Write the mission receipt", "Writing the mission receipt"],
    ["Draft the issue and offer it for approval", "Drafting the issue and offer it for approval"],
    ["Run the tests", "Running the tests"],
    ["Create a pull request", "Creating a pull request"],
    ["Analyze the repository", "Analyzing the repository"],
    // Consonant doubling: "scaning the inbox" shipped once. Never again.
    ["Scan the inbox for newsletter clutter", "Scanning the inbox for newsletter clutter"],
    ["Map the dependencies", "Mapping the dependencies"],
  ])("%j reads as %j while running", (purpose, expected) => {
    expect(toProgressive(purpose)).toBe(expected);
  });

  it("leaves an unrecognisable phrase alone rather than mangling it", () => {
    // A slightly stiff label beats a confidently wrong one.
    expect(toProgressive("2FA reset")).toBe("2FA reset");
    expect(toProgressive("")).toBe("");
  });

  it("doesn't double up an already-progressive phrase", () => {
    expect(toProgressive("Waiting for GitHub")).toBe("Waiting for GitHub");
  });

  it("never says just 'Executing'", () => {
    const n = narrateMission(mission(), [step({ state: "running" })]);
    expect(n.current?.headline).toBe("Reading your repositories");
    expect(n.current?.headline).not.toMatch(/^executing$/i);
  });
});

describe("done, current, remaining are all visible", () => {
  const steps = [
    step({ id: "a", idx: 0, state: "completed", purpose: "Read your repositories", output: { summary: "found 3 repositories" } }),
    step({ id: "b", idx: 1, state: "running", purpose: "Draft the issue" }),
    step({ id: "c", idx: 2, state: "ready", purpose: "Write the mission receipt" }),
  ];
  const n = narrateMission(mission(), steps);

  it("classifies each step", () => {
    expect(n.steps.map((s) => s.phase)).toEqual(["done", "current", "upcoming"]);
  });

  it("names what is happening now and what comes next", () => {
    expect(n.current?.headline).toBe("Drafting the issue");
    expect(n.next?.headline).toBe("Write the mission receipt");
  });

  it("counts only genuinely completed work as done", () => {
    expect(n.doneCount).toBe(1);
    expect(n.total).toBe(3);
  });
});

describe("evidence is shown, never invented", () => {
  it("carries the step's own recorded result", () => {
    const n = narrateMission(mission(), [
      step({ state: "completed", output: { summary: "opened issue #7" } }),
    ]);
    expect(n.steps[0].evidence).toBe("opened issue #7");
  });

  it("gives a step that recorded nothing no evidence at all", () => {
    const n = narrateMission(mission(), [step({ state: "completed", output: null })]);
    expect(n.steps[0].evidence).toBeUndefined();
  });

  it("does not treat an empty summary as a result", () => {
    const n = narrateMission(mission(), [step({ state: "completed", output: { summary: "   " } })]);
    expect(n.steps[0].evidence).toBeUndefined();
  });
});

describe("a pause explains itself", () => {
  it("never offers a bare status word as the reason", () => {
    const n = narrateMission(mission({ state: "awaiting_approval" }), [
      step({ state: "awaiting_approval", purpose: "Send the customer emails" }),
    ]);
    expect(n.pausedBecause).toBeTruthy();
    expect(n.pausedBecause).not.toMatch(/^needs approval$/i);
    expect(n.pausedBecause).not.toMatch(/awaiting_approval/);
    // It names the actual thing waiting on a decision.
    expect(n.pausedBecause).toContain("Send the customer emails");
  });

  it("uses the question's own explanation when one was asked", () => {
    const n = narrateMission(
      mission({
        state: "awaiting_input",
        pending_question: {
          step_id: "s1",
          question: "“Send the customer emails” wasn't in the plan you approved. run it?",
          why: "cosigno added this step after you signed, based on what it found while working.",
          options: ["run this step", "skip this step"],
          effect: "",
        },
      }),
      [step({ state: "awaiting_input" })]
    );
    expect(n.pausedBecause).toMatch(/added this step after you signed/);
  });

  it("says nothing about a pause while work is moving", () => {
    expect(narrateMission(mission(), [step({ state: "running" })]).pausedBecause).toBeNull();
  });
});

describe("a partial mission is never described as finished", () => {
  it("says what didn't happen", () => {
    const n = narrateMission(mission({ state: "partial" }), [
      step({ id: "a", idx: 0, state: "completed" }),
      step({ id: "b", idx: 1, state: "failed" }),
    ]);
    expect(n.status).not.toMatch(/^finished/i);
    expect(n.status).toMatch(/didn't finish|couldn't be confirmed/i);
    expect(n.finished).toBe(true);
  });

  it("says finished only when everything is done", () => {
    const n = narrateMission(mission({ state: "completed" }), [step({ state: "completed" })]);
    expect(n.status).toMatch(/^finished/i);
  });
});

describe("the architecture never surfaces", () => {
  const n = narrateMission(
    mission({ state: "awaiting_approval" }),
    [
      step({ id: "a", idx: 0, state: "completed", output: { summary: "done" } }),
      step({ id: "b", idx: 1, state: "awaiting_approval" }),
      step({ id: "c", idx: 2, state: "ready" }),
    ]
  );

  const surfaced = [
    n.status,
    n.pausedBecause ?? "",
    ...n.steps.map((s) => `${s.headline} ${s.evidence ?? ""} ${s.blockedReason ?? ""}`),
  ].join(" ");

  it.each([
    "plan_version",
    "awaiting_approval",
    "awaiting_input",
    "contract",
    "cutoff",
    "scheduler",
    "cron",
    "tool_calls",
    "operator profile",
    "verification record",
    "retry_count",
  ])("never says %j", (term) => {
    expect(surfaced.toLowerCase()).not.toContain(term.toLowerCase());
  });
});

describe("the workspace no longer leaks engine vocabulary", () => {
  it("does not label the step list with internal terms", () => {
    expect(WORKSPACE).not.toMatch(/view payload/i);
    expect(WORKSPACE).not.toMatch(/plan v\{/);
  });
});

describe("the work feed reads as a story, with apps in it", () => {
  const steps = [
    step({
      id: "a",
      idx: 0,
      tool: "github.list_repos",
      state: "completed",
      purpose: "Read your repositories",
      output: { summary: "found 3 repositories" },
      completed_at: new Date().toISOString(),
    }),
    step({
      id: "b",
      idx: 1,
      tool: "github.propose_issue",
      state: "running",
      purpose: "Draft the issue",
      started_at: new Date().toISOString(),
    }),
    // A non-bookkeeping step with no app of its own — cosigno's own analysis.
    step({ id: "c", idx: 2, tool: "analyze.extract", state: "ready", purpose: "Work out what matters" }),
  ];
  const n = narrateMission(mission(), steps);

  it("names the app each piece of work happened in", () => {
    expect(n.feed[0].app.name).toBe("GitHub");
    expect(n.feed[0].app.providerKey).toBe("github");
  });

  it("does not attribute cosigno's own work to somebody else's app", () => {
    // Claiming GitHub did cosigno's bookkeeping is a small lie that makes the
    // whole feed untrustworthy.
    expect(n.feed[2].app.name).toBeNull();
    expect(n.feed[2].app.providerKey).toBeNull();
  });

  it("timestamps work that has happened, and leaves future work untimed", () => {
    expect(n.feed[0].at).toBeTruthy();
    expect(n.feed[1].at).toBeTruthy();
    expect(n.feed[2].at).toBeNull();
  });

  it("pins what is happening now", () => {
    expect(n.nowWorking?.id).toBe("b");
    expect(n.nowWorking?.headline).toBe("Drafting the issue");
  });

  it("shows exactly one next thing", () => {
    expect(n.upNext?.id).toBe("c");
  });

  it("pins the thing waiting on a person when nothing is running", () => {
    const waiting = narrateMission(mission({ state: "awaiting_approval" }), [
      step({ id: "x", state: "awaiting_approval", purpose: "Send it" }),
    ]);
    expect(waiting.nowWorking?.id).toBe("x");
  });

  it("has nothing pinned once the work is over", () => {
    const finished = narrateMission(mission({ state: "completed" }), [
      step({ state: "completed", output: { summary: "done" } }),
    ]);
    expect(finished.nowWorking).toBeNull();
    expect(finished.finished).toBe(true);
  });
});

describe("proof links point at something real, or don't exist", () => {
  it("links to the thing the step actually produced", () => {
    const n = narrateMission(mission(), [
      step({
        tool: "github.propose_issue",
        state: "completed",
        output: { summary: "opened issue #7", url: "https://github.com/o/r/issues/7" },
      }),
    ]);
    expect(n.feed[0].proof).toEqual({
      label: "Open in GitHub",
      href: "https://github.com/o/r/issues/7",
      external: true,
    });
  });

  it("offers no link when the step recorded no destination", () => {
    // A button that leads nowhere turns evidence into decoration.
    const n = narrateMission(mission(), [
      step({ state: "completed", output: { summary: "did a thing" } }),
    ]);
    expect(n.feed[0].proof).toBeUndefined();
  });

  it("ignores a non-http value rather than building a broken link", () => {
    const n = narrateMission(mission(), [
      step({ state: "completed", output: { summary: "x", url: "not-a-url" } }),
    ]);
    expect(n.feed[0].proof).toBeUndefined();
  });

  it("sends a produced file to the files page", () => {
    const n = narrateMission(mission(), [
      step({ state: "completed", output: { summary: "wrote it", file_id: "f1" } }),
    ]);
    expect(n.feed[0].proof).toMatchObject({ href: "/app/files", external: false });
  });
});

describe("the feed reports accomplishments, not mechanics", () => {
  it("a finished entry leads with what it achieved, not what it did", () => {
    const n = narrateMission(mission(), [
      step({
        tool: "github.propose_issue",
        state: "completed",
        purpose: "Draft the issue and offer it for approval",
        output: { summary: "opened issue #7 in spartanapparelbiz-ui/cosignolabs" },
      }),
    ]);
    expect(n.feed[0].headline).toBe("Opened issue #7 in spartanapparelbiz-ui/cosignolabs.");
    // The mechanic is gone entirely, not demoted to a subtitle.
    expect(n.feed[0].headline).not.toMatch(/draft the issue/i);
    expect(n.feed[0].detail).toBeUndefined();
  });

  it("unfinished work keeps its purpose — there is no outcome yet to report", () => {
    const n = narrateMission(mission(), [
      step({ state: "running", purpose: "Read your repositories" }),
    ]);
    expect(n.feed[0].headline).toBe("Reading your repositories");
  });

  it("a finished entry with no recorded outcome falls back rather than inventing one", () => {
    const n = narrateMission(mission(), [
      step({ state: "completed", purpose: "Read your repositories", output: null }),
    ]);
    expect(n.feed[0].headline).toBe("Read your repositories");
  });

  it("reads as one finished sentence", () => {
    const n = narrateMission(mission(), [
      step({ state: "completed", output: { summary: "found 3 repositories" } }),
    ]);
    expect(n.feed[0].headline).toBe("Found 3 repositories.");
  });
});

describe("nothing exists in the feed just because the engine did it", () => {
  it("leaves the mission receipt out", () => {
    const n = narrateMission(mission(), [
      step({ id: "a", idx: 0, state: "completed", output: { summary: "found 3 repositories" } }),
      step({ id: "b", idx: 1, tool: "mission.receipt", state: "completed", purpose: "Write the mission receipt" }),
    ]);
    expect(n.feed).toHaveLength(1);
    expect(n.feed.map((e) => e.headline).join(" ")).not.toMatch(/receipt/i);
  });
});

describe("work is grouped by who did it", () => {
  it("merges consecutive work in the same app into one card", () => {
    const n = narrateMission(mission(), [
      step({ id: "a", idx: 0, tool: "github.list_repos", state: "completed", output: { summary: "found 3 repositories" } }),
      step({ id: "b", idx: 1, tool: "github.list_issues", state: "completed", output: { summary: "read 2 open issues" } }),
      step({ id: "c", idx: 2, tool: "gmail.search_related", state: "completed", output: { summary: "found 4 messages" } }),
    ]);
    expect(n.groups).toHaveLength(2);
    expect(n.groups[0].app.department).toBe("Engineering");
    expect(n.groups[0].entries).toHaveLength(2);
    expect(n.groups[1].app.department).toBe("Inbox");
  });

  it("does not fold finished work together with work that hasn't happened", () => {
    // The boundary between done and still-to-come is what the reader is
    // looking for.
    const n = narrateMission(mission(), [
      step({ id: "a", idx: 0, tool: "github.list_repos", state: "completed", output: { summary: "found 3" } }),
      step({ id: "b", idx: 1, tool: "github.propose_issue", state: "ready", purpose: "Open the issue" }),
    ]);
    expect(n.groups).toHaveLength(2);
  });

  it("keeps the app visible under the department, so nothing is hidden", () => {
    const n = narrateMission(mission(), [
      step({ tool: "github.list_repos", state: "completed", output: { summary: "found 3" } }),
    ]);
    expect(n.groups[0].app.department).toBe("Engineering");
    expect(n.groups[0].app.name).toBe("GitHub");
  });
});
