import { describe, expect, it } from "vitest";
import { planHash, canonicalize, idempotencyKey } from "../src/lib/planHash";
import { buildCosignCard } from "../src/lib/cosignCard";
import { integrationOf, operationOf, undoOf } from "../src/lib/receipts";
import type { ActionRecord } from "../src/lib/types";

/**
 * The Proof layer primitives: the plan hash is the binding between approval
 * and execution, so it MUST be sensitive to every consequential field
 * (recipient, amount, tool) and stable across key ordering. The CoSign Card
 * projects the required fields; receipts derive honest integration/operation/
 * reversibility metadata.
 */

function action(overrides: Partial<ActionRecord> = {}): ActionRecord {
  return {
    id: "a1",
    session_id: "s1",
    user_id: "user-a",
    category: "send_email",
    tier: 2,
    status: "proposed",
    summary: "email the report",
    payload: { to: "finance@acme.com", amount: "100", subject: "Q3" },
    result: null,
    veto_reason: null,
    injection_flag: false,
    tier_note: null,
    created_at: new Date().toISOString(),
    resolved_at: null,
    ...overrides,
  };
}

describe("plan hash binding sensitivity", () => {
  it("is stable across key ordering", () => {
    expect(planHash({ a: 1, b: 2 })).toBe(planHash({ b: 2, a: 1 }));
    expect(JSON.stringify(canonicalize({ b: 1, a: 2 }))).toBe('{"a":2,"b":1}');
  });

  it("changes when the RECIPIENT changes (changed-recipient-after-approval)", () => {
    const before = planHash({ to: "finance@acme.com", amount: "100" });
    const after = planHash({ to: "attacker@evil.com", amount: "100" });
    expect(after).not.toBe(before);
  });

  it("changes when the AMOUNT changes (changed-amount-after-approval)", () => {
    const before = planHash({ to: "finance@acme.com", amount: "100" });
    const after = planHash({ to: "finance@acme.com", amount: "9999" });
    expect(after).not.toBe(before);
  });

  it("gives a stable, distinct idempotency key per action", () => {
    expect(idempotencyKey("a1")).toBe(idempotencyKey("a1"));
    expect(idempotencyKey("a1")).not.toBe(idempotencyKey("a2"));
  });
});

describe("CoSign Card projection", () => {
  it("surfaces every required field for a consequential send", () => {
    const card = buildCosignCard(action(), "Send the finance report");
    expect(card.goal).toBe("Send the finance report");
    expect(card.recipients).toContain("finance@acme.com");
    expect(card.risk_level).toBe("consequential");
    expect(card.requires_signature).toBe(true); // send_email is a SIGN category
    expect(card.reversibility.reversible).toBe(false);
    // A send_email doesn't move money — direction is "none" even with a stray
    // amount field (only spend/payment/refund register a money direction).
    expect(card.monetary_impact?.direction).toBe("none");
    expect(card.permission_scope).toMatch(/send mail/i);
    expect(card.plan_hash).toBe(planHash(action().payload));
    // Controls include edit / reject / sign.
    expect(card.controls.map((c) => c.action).sort()).toEqual(["edit", "reject", "sign"]);
  });

  it("marks a locked (tier-3) action and demands typed confirmation control", () => {
    const card = buildCosignCard(action({ category: "payment", tier: 3 }));
    expect(card.risk_level).toBe("locked");
    expect(card.requires_signature).toBe(true);
    // A payment DOES register money moving out.
    expect(card.monetary_impact?.direction).toBe("out");
  });

  it("a flagged card is projected as unapprovable", () => {
    const card = buildCosignCard(action({ injection_flag: true }));
    expect(card.flagged).toBe(true);
  });

  it("a read-only tier-1 action is honestly low-risk", () => {
    const card = buildCosignCard(action({ category: "search", tier: 1 }));
    expect(card.risk_level).toBe("read_only");
    expect(card.requires_signature).toBe(false);
    expect(card.reversibility.reversible).toBe(true);
  });
});

describe("receipt metadata is honest", () => {
  it("labels internal vs connected-app operations", () => {
    expect(integrationOf(action({ category: "send_email" }))).toBe("internal");
    const conn = action({
      category: "connection_call",
      payload: { provider_key: "gmail", action: "send" },
    });
    expect(integrationOf(conn)).toBe("gmail");
    expect(operationOf(conn)).toBe("gmail:send");
  });

  it("never claims a send is reversible", () => {
    expect(undoOf({ category: "send_email" }).undo_available).toBe(false);
    expect(undoOf({ category: "payment" }).undo_available).toBe(false);
    expect(undoOf({ category: "draft" }).undo_available).toBe(true);
  });
});
