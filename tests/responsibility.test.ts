import { describe, expect, it } from "vitest";
import { returnCondition } from "../src/lib/delegate";
import { classifyIntent, intentHref } from "../src/lib/intent";
import { autonomyOffers } from "../src/lib/state";
import type { ActionCategory, ActionEventRecord, ActionRecord } from "../src/lib/types";

const USER = "test-user";

/** Synthesize an action + its N one-click (or signed) approval events. */
function approvals(
  category: ActionCategory,
  count: number,
  method: "approved" | "signed" = "approved"
): { actions: ActionRecord[]; events: ActionEventRecord[] } {
  const actions: ActionRecord[] = [];
  const events: ActionEventRecord[] = [];
  for (let i = 0; i < count; i++) {
    const id = `${category}_${i}`;
    actions.push({
      id,
      session_id: "s1",
      user_id: USER,
      category,
      tier: 2,
      status: "executed",
      summary: `${category} ${i}`,
      payload: {},
      result: null,
      veto_reason: null,
      injection_flag: false,
      tier_note: null,
      created_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
    });
    events.push({
      id: `e_${id}`,
      action_id: id,
      user_id: USER,
      type: "approved",
      actor: "user",
      detail: { authorization: { method } },
      created_at: new Date().toISOString(),
    });
  }
  return { actions, events };
}

/* ------------------------------------------------------------ return to me */

describe("return to me (user-defined handback conditions)", () => {
  it("extracts the condition from natural delegation phrasing", () => {
    expect(
      returnCondition("Research these companies and return to me when you've narrowed them to five.")
    ).toBe("you've narrowed them to five");
    expect(returnCondition("Handle this conversation and return to me if they ask about pricing")).toBe(
      "they ask about pricing"
    );
    expect(returnCondition("Prepare the launch and return when everything is ready to publish.")).toBe(
      "everything is ready to publish"
    );
  });

  it("returns null when no condition was stated", () => {
    expect(returnCondition("Prepare tomorrow's meetings")).toBeNull();
    expect(returnCondition("clean up my inbox")).toBeNull();
  });
});

/* ---------------------------------------------------------- earned autonomy */

describe("earned autonomy (cosigno never expands its own authority)", () => {
  it("offers after 5 one-click approvals of a routine category", () => {
    const { actions, events } = approvals("update_record", 5);
    const offers = autonomyOffers(events, actions);
    expect(offers).toHaveLength(1);
    expect(offers[0].category).toBe("update_record");
    expect(offers[0].count).toBe(5);
  });

  it("never offers below the threshold", () => {
    const { actions, events } = approvals("update_record", 4);
    expect(autonomyOffers(events, actions)).toHaveLength(0);
  });

  it("never offers SIGN categories, however often they're approved", () => {
    const { actions, events } = approvals("send_email", 12);
    expect(autonomyOffers(events, actions)).toHaveLength(0);
  });

  it("never offers pinned (tier-3) categories", () => {
    const { actions, events } = approvals("refund", 9);
    expect(autonomyOffers(events, actions)).toHaveLength(0);
  });

  it("signed approvals don't count toward autonomy — only one-click routine", () => {
    const { actions, events } = approvals("update_record", 6, "signed");
    expect(autonomyOffers(events, actions)).toHaveLength(0);
  });

  it("categories the user already moved to auto are not re-offered", () => {
    const { actions, events } = approvals("update_record", 8);
    expect(autonomyOffers(events, actions, { update_record: 1 })).toHaveLength(0);
  });
});

/* ----------------------------------------------------------------- intents */

describe("responsibility-era intents", () => {
  it("'show my delegations' opens the delegations surface", () => {
    expect(classifyIntent("show my delegations").view).toBe("missions");
    expect(classifyIntent("delegations").view).toBe("missions");
  });

  it("'the boundary' goes to where authority sits", () => {
    const i = classifyIntent("show the boundary");
    expect(i.view).toBe("focus");
    expect(intentHref(i)).toBe("/app/focus");
  });

  it("'take this…' phrasing falls through to delegation, never a dead end", () => {
    const i = classifyIntent("take this email thread and handle the follow-up");
    expect(i.view).toBe("delegate");
  });
});
