import { describe, expect, it } from "vitest";
import {
  affectedApps,
  approvalBrief,
  confidenceOf,
  durationOf,
  reasonOf,
  riskOf,
  rollbackOf,
} from "../src/lib/approvals/brief";
import type { ActionRecord } from "../src/lib/types";

/**
 * The decision brief is the text someone reads immediately before authorising
 * something irreversible. Everything in it therefore has to be derived from
 * the action itself and has to be pessimistic where it is uncertain — an
 * approval that feels cheaper than it is, is the failure mode this whole
 * surface exists to prevent.
 */

function act(over: Partial<ActionRecord> = {}): ActionRecord {
  return {
    id: "a1",
    session_id: "s",
    user_id: "u",
    category: "send_email",
    tier: 2,
    status: "proposed",
    summary: "Send the investor update to katie@example.com",
    payload: {},
    result: null,
    veto_reason: null,
    injection_flag: false,
    tier_note: null,
    created_at: "2026-08-10T09:00:00Z",
    resolved_at: null,
    ...over,
  };
}

describe("risk names the actual consequence", () => {
  it("a sent email is external and says it can't be recalled", () => {
    const r = riskOf("send_email", 2);
    expect(r.level).toBe("external");
    expect(r.detail).toMatch(/can't be recalled/);
  });

  it("money and deletion are permanent, never merely external", () => {
    expect(riskOf("payment", 2).level).toBe("permanent");
    expect(riskOf("refund", 2).level).toBe("permanent");
    expect(riskOf("spend", 2).level).toBe("permanent");
    expect(riskOf("delete", 3).level).toBe("permanent");
  });

  it("reading is contained", () => {
    expect(riskOf("search", 1).level).toBe("contained");
    expect(riskOf("summarize", 1).level).toBe("contained");
  });

  it("a draft is contained — it says nothing is sent", () => {
    expect(riskOf("draft", 1).detail).toMatch(/nothing is sent/);
  });
});

describe("rollback takes the pessimistic reading of every tie", () => {
  it("refuses to promise an undo cosigno cannot perform", () => {
    expect(rollbackOf(act({ category: "send_email" })).possible).toBe(false);
    expect(rollbackOf(act({ category: "delete" })).possible).toBe(false);
    expect(rollbackOf(act({ category: "payment" })).possible).toBe(false);
    expect(rollbackOf(act({ category: "webhook" })).possible).toBe(false);
  });

  it("an update is only restorable when the previous values were captured", () => {
    const withBefore = rollbackOf(
      act({ category: "update_record", payload: { before: { status: "open" } } })
    );
    expect(withBefore.possible).toBe(true);

    const without = rollbackOf(act({ category: "update_record", payload: { status: "closed" } }));
    expect(without.possible).toBe(false);
    expect(without.detail).toMatch(/weren't captured/);
  });

  it("an unknown category assumes the worst", () => {
    expect(rollbackOf(act({ category: "connection_call" })).possible).toBe(false);
  });
});

describe("confidence measures specification, and never predicts success", () => {
  it("is high only when every required detail is present", () => {
    const c = confidenceOf(
      act({ payload: { to: "katie@example.com", subject: "Update", body: "Hi" } })
    );
    expect(c.level).toBe("high");
    expect(c.score).toBe(1);
    expect(c.gaps).toHaveLength(0);
  });

  it("names what is missing rather than just scoring lower", () => {
    const c = confidenceOf(act({ payload: { to: "katie@example.com" } }));
    expect(c.level).toBe("low");
    expect(c.gaps).toContain("a subject is missing");
    expect(c.gaps).toContain("the message body is missing");
  });

  it("flagged content floors confidence at low however complete the payload", () => {
    const c = confidenceOf(
      act({
        injection_flag: true,
        payload: { to: "katie@example.com", subject: "Update", body: "Hi" },
      })
    );
    expect(c.level).toBe("low");
    expect(c.gaps[0]).toMatch(/outside content/);
  });

  it("a tier the model argued with costs a step of confidence", () => {
    const c = confidenceOf(
      act({
        tier_note: "model requested tier 1",
        payload: { to: "k@example.com", subject: "s", body: "b" },
      })
    );
    expect(c.level).toBe("medium");
  });

  it("a category with nothing required is fully specified by definition", () => {
    expect(confidenceOf(act({ category: "search", payload: {} })).level).toBe("high");
  });
});

describe("affected apps never guess a connector", () => {
  it("recognises an app the payload names", () => {
    const apps = affectedApps(act({ payload: { integration: "gmail" } }));
    expect(apps[0]).toEqual({ name: "Gmail", providerKey: "google" });
  });

  it("falls back to the surface, not to an invented connector", () => {
    const apps = affectedApps(act({ category: "send_email", payload: {} }));
    expect(apps).toEqual([{ name: "your email", providerKey: null }]);
  });

  it("keeps an unrecognised destination verbatim rather than mapping it", () => {
    const apps = affectedApps(act({ payload: { destination: "acme-crm" } }));
    expect(apps[0].name).toBe("acme-crm");
    expect(apps[0].providerKey).toBeNull();
  });
});

describe("the reason answers 'why am I being asked'", () => {
  it("a locked category says no setting can lower it", () => {
    expect(reasonOf(act({ tier: 3, category: "delete" }))).toMatch(/no setting can lower/);
  });

  it("flagged content outranks every other reason", () => {
    expect(reasonOf(act({ tier: 3, injection_flag: true }))).toMatch(/outside tried to direct/);
  });

  it("money says so plainly", () => {
    expect(reasonOf(act({ category: "payment", tier: 2 }))).toMatch(/moves money/);
  });
});

describe("duration is a band, never a fake countdown", () => {
  it("stays coarse", () => {
    expect(durationOf(act({ category: "send_email", payload: {} }))).toBe("a few seconds");
    expect(durationOf(act({ category: "payment" }))).toMatch(/provider/);
  });

  it("grows with the amount of work actually described", () => {
    expect(durationOf(act({ category: "draft", payload: { count: 20 } }))).toBe("under a minute");
  });
});

describe("the assembled brief", () => {
  it("carries every field the card renders", () => {
    const b = approvalBrief(act({ payload: { to: "k@example.com", subject: "s", body: "b" } }));
    expect(b.purpose).toBe("Send the investor update to katie@example.com");
    expect(b.reason).toBeTruthy();
    expect(b.risk.level).toBe("external");
    expect(b.confidence.level).toBe("high");
    expect(b.apps.length).toBeGreaterThan(0);
    expect(b.rollback.possible).toBe(false);
    expect(b.duration).toBeTruthy();
  });

  it("is deterministic — the same action always briefs the same way", () => {
    const a = act({ payload: { to: "k@example.com" } });
    expect(approvalBrief(a)).toEqual(approvalBrief(a));
  });
});
