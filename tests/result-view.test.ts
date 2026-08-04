import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { describeResult } from "../src/lib/results/describe";
import type { ActionEventRecord, ActionRecord } from "../src/lib/types";

/**
 * A result card is read at a glance and believed. That makes every convenience
 * in it a potential lie: an invented "before" value, an undo button that can't
 * undo, a failed action skimmed as a success because it's laid out like one.
 *
 * These tests pin the three places this design could quietly start lying.
 */

const CARD_SRC = readFileSync("src/components/app/ResultCard.tsx", "utf8");

function action(over: Partial<ActionRecord> = {}): ActionRecord {
  return {
    id: "a1",
    session_id: "s1",
    user_id: "u1",
    category: "connection_call",
    tier: 2,
    status: "executed",
    summary: "open issue “cosigno test” in spartanapparelbiz-ui/cosignolabs",
    payload: { action: "create_issue", args: { repo: "spartanapparelbiz-ui/cosignolabs", title: "cosigno test" } },
    result: { summary: "opened issue #7 in spartanapparelbiz-ui/cosignolabs.", url: "https://github.com/x/y/issues/7" },
    veto_reason: null,
    injection_flag: false,
    tier_note: null,
    created_at: new Date().toISOString(),
    resolved_at: new Date().toISOString(),
    ...over,
  } as ActionRecord;
}

function event(over: Partial<ActionEventRecord> = {}): ActionEventRecord {
  return {
    id: "e1",
    action_id: "a1",
    user_id: "u1",
    type: "approved",
    actor: "user",
    detail: {},
    created_at: new Date().toISOString(),
    ...over,
  } as ActionEventRecord;
}

describe("the six questions, from a real executed action", () => {
  const view = describeResult(action(), [event()]);

  it("says what happened in the provider's own plain words", () => {
    expect(view.headline).toContain("opened issue #7");
    expect(view.headline).not.toMatch(/POST|api|payload|201/i);
  });

  it("says where it happened, read from the payload", () => {
    expect(view.app).toBe("GitHub");
    expect(view.objectType).toBe("Repository");
    expect(view.objectName).toBe("spartanapparelbiz-ui/cosignolabs");
  });

  it("says what changed, and links to the real object", () => {
    expect(view.changes).toHaveLength(1);
    expect(view.changes[0].kind).toBe("created");
    expect(view.changes[0].href).toBe("https://github.com/x/y/issues/7");
  });

  it("says it is finished, and that a human approved it", () => {
    expect(view.status).toBe("completed");
    expect(view.approvedBy).toBe("you");
  });
});

describe("the verb comes from the action that ran, not the category envelope", () => {
  it.each([
    ["create_issue", "created"],
    ["send_message", "sent"],
    ["delete_file", "deleted"],
    ["update_record", "updated"],
    ["refund_payment", "refunded"],
  ] as const)("%s reads as %s", (called, kind) => {
    const v = describeResult(
      action({ payload: { action: called, args: { repo: "a/b" } }, result: { summary: "done." } })
    );
    expect(v.changes[0].kind).toBe(kind);
  });

  it("prefers the destructive reading when an id could go either way", () => {
    // "delete_draft_message" contains draft, message AND delete. Calling a
    // deletion something softer is the expensive direction to be wrong in.
    const v = describeResult(
      action({ payload: { action: "delete_draft_message" }, result: { summary: "done." } })
    );
    expect(v.changes[0].kind).toBe("deleted");
  });
});

describe("no invented comparisons", () => {
  it("omits before/after entirely when the provider recorded neither", () => {
    // Opening an issue has no prior value. "before: none → after: created"
    // would dress a fact up as a measurement.
    const [change] = describeResult(action()).changes;
    expect(change.before).toBeUndefined();
    expect(change.after).toBeUndefined();
  });

  it("shows a comparison only when BOTH sides were recorded", () => {
    const both = describeResult(
      action({ category: "update_record", result: { summary: "price updated.", before: "$18", after: "$22" } })
    ).changes[0];
    expect(both.before).toBe("$18");
    expect(both.after).toBe("$22");
  });

  it("drops a half-comparison rather than rendering one side", () => {
    // One side alone invites the reader to supply the other themselves.
    const half = describeResult(
      action({ category: "update_record", result: { summary: "price updated.", after: "$22" } })
    ).changes[0];
    expect(half.before).toBeUndefined();
    expect(half.after).toBeUndefined();
  });

  it("the card only renders a comparison when both are present", () => {
    expect(CARD_SRC).toMatch(/c\.before !== undefined && c\.after !== undefined/);
  });
});

describe("a result that did nothing never reads as done", () => {
  it.each(["failed", "vetoed"] as const)("marks %s as nothing-happened", (status) => {
    const v = describeResult(action({ status, result: null }));
    expect(v.nothingHappened).toBe(true);
    expect(v.changes).toHaveLength(0);
    expect(v.headline).toMatch(/nothing was (changed|done)/i);
  });

  it("reports no changes for an action that hasn't executed yet", () => {
    // Reporting an intention as an outcome is how a card starts lying.
    for (const status of ["proposed", "approved", "executing"] as const) {
      expect(describeResult(action({ status })).changes).toHaveLength(0);
    }
  });

  it("maps a pending card to needs_approval, not to running", () => {
    expect(describeResult(action({ status: "proposed" })).status).toBe("needs_approval");
  });
});

describe("undo is described, never offered", () => {
  it("says how to reverse it in the provider's terms", () => {
    expect(describeResult(action()).howToUndo).toMatch(/can't undo/i);
  });

  it("never claims cosigno can unsend mail or reverse money", () => {
    expect(describeResult(action({ category: "send_email" })).howToUndo).toMatch(/can't be unsent/i);
    expect(describeResult(action({ category: "refund" })).howToUndo).toMatch(/can't be reversed/i);
  });

  it("offers nothing to undo for an action that never ran", () => {
    expect(describeResult(action({ status: "failed" })).howToUndo).toBeNull();
  });

  it("the card has no undo control", () => {
    expect(CARD_SRC).not.toMatch(/onUndo|handleUndo|>\s*Undo\s*</);
  });
});

describe("credit is only given where it is due", () => {
  it("does not claim a human approved an auto-approved action", () => {
    const v = describeResult(action(), [event({ actor: "system", detail: { auto: true } })]);
    expect(v.approvedBy).toBeUndefined();
  });

  it("ignores events belonging to a different action", () => {
    const v = describeResult(action(), [event({ action_id: "someone-else" })]);
    expect(v.approvedBy).toBeUndefined();
  });
});

describe("status is never carried by colour alone", () => {
  it("every state ships an icon and a word", () => {
    // ~1 in 12 men cannot separate the green and red this card would
    // otherwise depend on.
    expect(CARD_SRC).toMatch(/label: "Completed"/);
    expect(CARD_SRC).toMatch(/label: "Failed"/);
    expect(CARD_SRC).toMatch(/Icon:/);
    expect(CARD_SRC).toMatch(/\{s\.label\}/);
  });

  it("hides advanced detail behind an explicit control", () => {
    expect(CARD_SRC).toMatch(/Advanced details/);
    expect(CARD_SRC).toMatch(/aria-expanded=\{open\}/);
  });
});

describe("location is read, never guessed", () => {
  it("omits the location rather than inferring one from prose", () => {
    const v = describeResult(action({ payload: {}, result: { summary: "did a thing." } }));
    expect(v.objectName).toBeUndefined();
    expect(v.objectType).toBeUndefined();
  });
});
