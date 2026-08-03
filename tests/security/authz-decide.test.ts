import { describe, expect, it } from "vitest";
import { decide } from "@/lib/authz/decide";
import { assessBlastRadius, maxAuthority, AUTHORITY_LADDER } from "@/lib/authz/blastRadius";
import { ACTION_TYPES, resolveActionType } from "@/lib/authz/registry";

/**
 * The safety argument of the whole layer is one sentence: every signal can
 * only ever RAISE the required authority. These tests exist to make that
 * sentence impossible to break by accident.
 */

describe("authority ladder", () => {
  it("maxAuthority never returns the weaker of two", () => {
    for (const a of AUTHORITY_LADDER) {
      for (const b of AUTHORITY_LADDER) {
        const m = maxAuthority(a, b);
        expect(AUTHORITY_LADDER.indexOf(m)).toBeGreaterThanOrEqual(
          Math.max(AUTHORITY_LADDER.indexOf(a), AUTHORITY_LADDER.indexOf(b))
        );
      }
    }
  });
});

describe("blast radius is deterministic and does not average risk away", () => {
  it("returns the same assessment for the same facts", () => {
    const ctx = { amount_cents: 500_000, records_affected: 1 };
    expect(assessBlastRadius(ctx)).toEqual(assessBlastRadius(ctx));
  });

  it("a large payment is severe even though only one record is touched", () => {
    const a = assessBlastRadius({ amount_cents: 500_000, records_affected: 1, reversible: false });
    expect(a.level).toBe("severe");
    expect(a.required_authority).toBe("sign");
  });

  it("unknown reversibility is treated as irreversible, never as safe", () => {
    const unknown = assessBlastRadius({ records_affected: 30 });
    const known = assessBlastRadius({ records_affected: 30, reversible: true });
    expect(unknown.score).toBeGreaterThan(known.score);
  });

  it("a pure read has no blast radius", () => {
    expect(assessBlastRadius({ reversible: true }).required_authority).toBe("auto");
  });
});

describe("decide — the floor can never be lowered", () => {
  it("auto-clears a read with an established pattern", () => {
    const d = decide({ actor: "agent:a", action: "data.search", resource: "inbox", priorClean: 50 });
    expect(d.status).toBe("approved");
    expect(d.authority).toBe("auto");
  });

  it("pinned categories demand a signature no matter what else is true", () => {
    const d = decide({
      actor: "agent:a",
      action: "refund.issue",
      resource: "ord_1",
      context: { amount_cents: 1, reversible: true },
      priorClean: 10_000,
      settings: [{ user_id: "u", category: "refund", tier: 1 } as never],
    });
    expect(d.authority).toBe("sign");
    expect(d.tier).toBe(3);
  });

  it("blast radius escalates an otherwise tier-1 action", () => {
    const cheap = decide({ actor: "a", action: "doc.draft", resource: "d", priorClean: 99 });
    expect(cheap.authority).toBe("auto");
    const costly = decide({
      actor: "a",
      action: "doc.draft",
      resource: "d",
      priorClean: 99,
      context: { external_recipients: 5000 },
    });
    expect(costly.authority).not.toBe("auto");
  });

  it("an unregistered action never auto-clears", () => {
    const d = decide({ actor: "a", action: "totally.unknown", resource: "x", priorClean: 9999 });
    expect(d.registered).toBe(false);
    expect(d.status).not.toBe("approved");
  });

  it("novelty escalates a new actor but cannot lower an existing floor", () => {
    const novel = decide({ actor: "a", action: "record.update", resource: "r", priorClean: 0 });
    const seasoned = decide({ actor: "a", action: "record.update", resource: "r", priorClean: 500 });
    expect(AUTHORITY_LADDER.indexOf(novel.authority)).toBeGreaterThanOrEqual(
      AUTHORITY_LADDER.indexOf(seasoned.authority)
    );
    // record.update is tier 2 → approve; trust never takes it to auto.
    expect(seasoned.authority).toBe("approve");
  });

  it("cosigno hold denies, and hold is applied last so nothing can undo it", () => {
    const all = decide({ actor: "a", action: "data.search", resource: "x", priorClean: 999, hold: "all" });
    expect(all.status).toBe("denied");

    const ext = decide({
      actor: "a",
      action: "email.send",
      resource: "x",
      context: { external_recipients: 1 },
      hold: "external",
    });
    expect(ext.status).toBe("denied");
    expect(ext.policy_trace.at(-1)?.rule).toBe("cosigno_hold");
  });

  it("every decision carries an explainable trace", () => {
    const d = decide({ actor: "a", action: "payment.send", resource: "x", context: { amount_cents: 900_000 } });
    expect(d.policy_trace.length).toBeGreaterThan(1);
    for (const step of d.policy_trace) {
      expect(step.rule).toBeTruthy();
      expect(step.detail).toBeTruthy();
    }
  });

  it("no registered action type maps to a missing category", () => {
    for (const t of ACTION_TYPES) {
      expect(resolveActionType(t.id).category).toBe(t.category);
      const d = decide({ actor: "a", action: t.id, resource: "r" });
      expect(["approved", "pending", "denied"]).toContain(d.status);
    }
  });

  it("fuzz: no combination of inputs ever produces auto for a pinned category", () => {
    const pinned = ["record.delete", "refund.issue", "payment.send"];
    for (const action of pinned) {
      for (const priorClean of [0, 5, 100, 10_000]) {
        for (const amount of [0, 1, 100_000]) {
          const d = decide({
            actor: "a",
            action,
            resource: "r",
            priorClean,
            context: { amount_cents: amount, reversible: true },
          });
          expect(d.authority).not.toBe("auto");
        }
      }
    }
  });
});
