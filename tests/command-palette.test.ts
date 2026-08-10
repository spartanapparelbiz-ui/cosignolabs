import { describe, expect, it } from "vitest";
import {
  actionsFor,
  flatten,
  goalFrom,
  groupResults,
  looksLikeRequest,
} from "../src/lib/command/palette";
import type { SearchResult } from "../src/lib/search/global";

/**
 * The palette's one hard rule: it may compose and it may navigate, and it may
 * never authorise. A "quick approve" shortcut would delete the deliberate
 * approval interaction that is the entire product, so a decision found here is
 * opened rather than signed.
 */

function result(over: Partial<SearchResult> = {}): SearchResult {
  return { kind: "mission", title: "Launch", href: "/app/missions/m1", ...over };
}

describe("telling a request from a lookup", () => {
  it("an explicit verb is always a request", () => {
    expect(looksLikeRequest("delegate review my inbox")).toBe(true);
    expect(looksLikeRequest("start the launch plan")).toBe(true);
  });

  it("a short noun is always a lookup — never an offer to delegate it", () => {
    expect(looksLikeRequest("gmail")).toBe(false);
    expect(looksLikeRequest("app")).toBe(false);
    expect(looksLikeRequest("m")).toBe(false);
  });

  it("a request-shaped sentence counts once it is long enough to mean something", () => {
    expect(looksLikeRequest("draft the investor update")).toBe(true);
    expect(looksLikeRequest("draft")).toBe(false);
  });

  it("a long sentence with no request verb stays a lookup", () => {
    expect(looksLikeRequest("the quarterly numbers spreadsheet")).toBe(false);
  });
});

describe("the goal is what gets composed", () => {
  it("strips the command verb so the ask box holds the request itself", () => {
    expect(goalFrom("delegate review my inbox")).toBe("review my inbox");
    expect(goalFrom("have cosigno prepare tomorrow's meeting")).toBe(
      "prepare tomorrow's meeting"
    );
  });

  it("leaves a bare request alone", () => {
    expect(goalFrom("review my inbox")).toBe("review my inbox");
  });
});

describe("the palette composes, it never authorises", () => {
  it("a delegate action opens the ask box rather than starting anything", () => {
    const [a] = actionsFor("draft the investor update");
    expect(a.kind).toBe("delegate");
    expect(a.href).toBe("/app");
    expect(a.compose).toBe("draft the investor update");
    expect(a.subtitle).toMatch(/confirm before anything runs/);
  });

  it("offers no action at all for a plain lookup", () => {
    expect(actionsFor("gmail")).toEqual([]);
    expect(actionsFor("")).toEqual([]);
  });

  it("never produces an approve or execute action", () => {
    for (const q of ["approve everything", "delegate approve the refund", "run the payment"]) {
      for (const a of actionsFor(q)) {
        expect(a.kind).toBe("delegate");
        expect(a.compose).toBeTruthy();
      }
    }
  });

  it("a verb with nothing after it produces no action", () => {
    expect(actionsFor("delegate ")).toEqual([]);
  });
});

describe("grouping makes the palette predictable", () => {
  it("puts what is waiting on you first, and pages last", () => {
    const groups = groupResults([
      result({ kind: "page", title: "Settings" }),
      result({ kind: "decision", title: "Send the update" }),
      result({ kind: "mission", title: "Launch" }),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["decision", "mission", "page"]);
    expect(groups[0].label).toBe("waiting on you");
  });

  it("omits a group with nothing in it rather than showing an empty heading", () => {
    const groups = groupResults([result({ kind: "app", title: "Gmail" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe("app");
  });

  it("handles no results at all", () => {
    expect(groupResults([])).toEqual([]);
  });
});

describe("keyboard order matches what is on screen", () => {
  it("actions come first, then every group in order", () => {
    const actions = actionsFor("draft the investor update");
    const groups = groupResults([
      result({ kind: "page", title: "Settings" }),
      result({ kind: "decision", title: "Send it" }),
    ]);
    const flat = flatten(actions, groups);
    expect(flat).toHaveLength(3);
    expect(flat[0].action?.kind).toBe("delegate");
    expect(flat[1].result?.kind).toBe("decision");
    expect(flat[2].result?.kind).toBe("page");
  });

  it("never skips a visible row", () => {
    const groups = groupResults([
      result({ kind: "mission", title: "A" }),
      result({ kind: "mission", title: "B" }),
      result({ kind: "app", title: "Gmail" }),
    ]);
    const visible = groups.reduce((n, g) => n + g.items.length, 0);
    expect(flatten([], groups)).toHaveLength(visible);
  });
});
