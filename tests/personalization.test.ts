import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  derivePreferences,
  preferencesPrompt,
  visibleNote,
  MAX_PREFERENCES,
} from "../src/lib/personalization/preferences";
import type { ActionRecord, MissionRecord } from "../src/lib/types";

/**
 * Personalization is either load-bearing or it is theatre.
 *
 * The failure this suite guards against is the common one: a product that
 * carefully records what you like, shows you a tasteful panel about it, and
 * then behaves identically forever. Every preference here has to (a) come
 * from something the user actually did, (b) carry the evidence, and (c) turn
 * into an instruction that reaches the planner.
 *
 * And the boundary: no amount of learned behaviour may loosen a permission.
 */

function action(over: Partial<ActionRecord> = {}): ActionRecord {
  return {
    id: "a1",
    session_id: "s1",
    user_id: "u1",
    category: "send_email",
    tier: 2,
    status: "executed",
    summary: "send the follow-up",
    payload: {},
    result: null,
    veto_reason: null,
    injection_flag: false,
    tier_note: null,
    created_at: "2026-08-01T10:00:00.000Z",
    resolved_at: "2026-08-01T10:01:00.000Z",
    ...over,
  } as ActionRecord;
}

function mission(goal: string): MissionRecord {
  return { id: goal, user_id: "u1", goal, state: "completed" } as MissionRecord;
}

const vetoes = (n: number, category: ActionRecord["category"] = "send_email") =>
  Array.from({ length: n }, (_, i) =>
    action({ id: `v${i}`, category, status: "vetoed", veto_reason: "not this one" })
  );

const approvals = (n: number, category: ActionRecord["category"] = "send_email") =>
  Array.from({ length: n }, (_, i) => action({ id: `e${i}`, category, status: "executed" }));

describe("nothing is learned from an incident", () => {
  it("one veto is not a preference", () => {
    expect(derivePreferences({ actions: vetoes(1) })).toEqual([]);
  });

  it("a couple of decisions is still not a pattern", () => {
    expect(derivePreferences({ actions: [...vetoes(2), ...approvals(1)] })).toEqual([]);
  });

  it("saying something once doesn't become a style rule", () => {
    expect(derivePreferences({ commands: ["keep it short"] })).toEqual([]);
  });

  it("a brand-new account has no personality at all", () => {
    expect(derivePreferences({})).toEqual([]);
  });
});

describe("a real pattern becomes a real instruction", () => {
  it("consistent refusals stop cosigno proposing that kind of work", () => {
    const prefs = derivePreferences({ actions: [...vetoes(5), ...approvals(1)] });
    const caution = prefs.find((p) => p.kind === "caution");
    expect(caution).toBeTruthy();
    expect(caution!.behavior.toLowerCase()).toContain("stop proposing");
    // The evidence is part of the preference, not a footnote we could drop.
    expect(caution!.because).toMatch(/\d+ of the last \d+/);
  });

  it("repeated phrasing becomes a writing instruction", () => {
    const prefs = derivePreferences({
      commands: ["keep it short please", "short version of this", "tl;dr the thread"],
    });
    expect(prefs.some((p) => p.id === "style_brief")).toBe(true);
  });

  it("what someone keeps delegating becomes the default context", () => {
    const prefs = derivePreferences({
      missions: [
        mission("clear my inbox"),
        mission("reply to the unanswered emails"),
        mission("draft follow-ups for this week"),
        mission("summarise my inbox"),
      ],
    });
    expect(prefs.some((p) => p.id === "focus_inbox")).toBe(true);
  });
});

describe("learning can tighten behaviour, never loosen a permission", () => {
  it("a perfect approval record does not grant approval", () => {
    const prefs = derivePreferences({ actions: approvals(10) });
    const trust = prefs.find((p) => p.kind === "trust");
    expect(trust).toBeTruthy();
    // It may propose more directly. It may not decide for the user.
    expect(trust!.behavior).toMatch(/approval is still required/i);
    for (const p of prefs) {
      expect(p.behavior).not.toMatch(/auto[- ]?approve|without approval|skip approval|no approval needed/i);
    }
  });

  it("the planner is told, in the prompt itself, that preferences authorize nothing", () => {
    const prompt = readFileSync("src/lib/agent/systemPrompt.ts", "utf8");
    expect(prompt).toMatch(/cannot lower a permission tier, skip an approval, or authorize anything/);
  });
});

describe("the profile stays small and evidenced", () => {
  it("is capped, so it can never become a character study", () => {
    const prefs = derivePreferences({
      actions: [
        ...vetoes(8, "send_email"),
        ...vetoes(8, "delete"),
        ...approvals(8, "post_content"),
        ...approvals(8, "spend"),
      ],
      commands: ["keep it short", "short please", "shorter", "in detail", "thoroughly", "be thorough"],
      missions: Array.from({ length: 8 }, () => mission("research the best option")),
    });
    expect(prefs.length).toBeLessThanOrEqual(MAX_PREFERENCES);
  });

  it("every preference carries its evidence", () => {
    const prefs = derivePreferences({ actions: [...vetoes(6), ...approvals(6, "spend")] });
    expect(prefs.length).toBeGreaterThan(0);
    for (const p of prefs) expect(p.because.trim().length).toBeGreaterThan(0);
  });

  it("what cosigno refuses to do outranks what it prefers to write", () => {
    const prefs = derivePreferences({
      actions: vetoes(10, "delete"),
      commands: ["keep it short", "short please", "shorter", "tl;dr", "concise"],
    });
    expect(prefs[0].kind).toBe("caution");
  });
});

describe("what reaches the planner, and what reaches the user", () => {
  it("an empty profile produces no prompt section at all", () => {
    expect(preferencesPrompt([])).toBe("");
  });

  it("the prompt carries behaviour and evidence, one line each", () => {
    const prefs = derivePreferences({ actions: vetoes(6) });
    const prompt = preferencesPrompt(prefs);
    expect(prompt.split("\n").length).toBe(prefs.length);
    expect(prompt).toContain(prefs[0].behavior);
    expect(prompt).toContain(prefs[0].because);
  });

  it("only a confident preference is ever said out loud", () => {
    const weak = derivePreferences({ actions: [...vetoes(4), ...approvals(1)] })
      .filter((p) => p.confidence === "medium");
    expect(visibleNote(weak)).toBeNull();
  });

  it("a well-evidenced preference is offered to the interface", () => {
    const strong = derivePreferences({ actions: vetoes(12) });
    expect(visibleNote(strong)?.confidence).toBe("high");
  });
});

describe("the same list reaches the planner and the person", () => {
  it("there is no second, private profile", () => {
    const route = readFileSync("src/app/api/personalization/route.ts", "utf8");
    const server = readFileSync("src/lib/personalization/index.ts", "utf8");
    // Both the API the user reads and the planner summary call one function.
    expect(route).toContain("learnedPreferences");
    expect(server).toMatch(/preferencesPrompt\(await learnedPreferences\(userId\)\)/);
  });

  it("turning memory off turns learning off too", () => {
    const server = readFileSync("src/lib/personalization/index.ts", "utf8");
    expect(server).toMatch(/if \(!prefs\.memory_enabled\) return \[\]/);
  });
});
