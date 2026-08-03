import { describe, expect, it } from "vitest";
import { simulate, parseRule, applyRule, ruleMatches } from "@/lib/authz/simulate";
import type { DecisionRecord } from "@/lib/authz/store";

/**
 * Simulation is what stands between a draft policy and thousands of agents.
 * Its one non-negotiable property: a rule can only ever TIGHTEN. If a
 * simulation could ever show a rule loosening the system, the whole review
 * step would be worthless.
 */

function dec(over: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: `dec_${Math.random().toString(16).slice(2, 10)}`,
    org: "org_1",
    actor: "agent:finance",
    action: "refund.issue",
    resource: "ord_1",
    payload_hash: "h",
    status: "approved",
    authority: "auto",
    tier: 1,
    blast_level: "low",
    blast_score: 1,
    policy_trace: [{ rule: "blast_radius", effect: "auto", detail: "low blast radius — $50.00" }],
    token_jti: null,
    executed_at: null,
    created_at: new Date().toISOString(),
    ...over,
  };
}

describe("a rule can only tighten", () => {
  it("applyRule never returns a weaker authority", () => {
    const ladder = ["auto", "approve", "sign", "deny"] as const;
    for (const cur of ladder) {
      for (const req of ladder) {
        const out = applyRule(cur, req);
        expect(ladder.indexOf(out)).toBeGreaterThanOrEqual(ladder.indexOf(cur));
      }
    }
  });

  it("a permissive rule cannot loosen an already-strict decision", () => {
    const r = simulate({ requirement: "auto" }, [dec({ authority: "sign" })]);
    expect(r.decisions[0].after).toBe("sign");
    expect(r.decisions[0].changed).toBe(false);
    expect(r.newly_held).toBe(0);
  });
});

describe("scoping", () => {
  it("matches on action, actor, blast level, and amount", () => {
    const d = dec({ action: "refund.issue", actor: "agent:finance", blast_level: "high" });
    expect(ruleMatches({ requirement: "sign", action: "refund.issue" }, d)).toBe(true);
    expect(ruleMatches({ requirement: "sign", action: "payment.send" }, d)).toBe(false);
    expect(ruleMatches({ requirement: "sign", actor: "agent:marketing" }, d)).toBe(false);
    expect(ruleMatches({ requirement: "sign", min_blast_level: "severe" }, d)).toBe(false);
    expect(ruleMatches({ requirement: "sign", min_amount_cents: 10_000 }, d)).toBe(false); // $50 < $100
    expect(ruleMatches({ requirement: "sign", min_amount_cents: 1_000 }, d)).toBe(true);
  });

  it("a decision with no recorded amount never matches an amount rule", () => {
    const d = dec({ policy_trace: [{ rule: "blast_radius", effect: "auto", detail: "no money moves" }] });
    expect(ruleMatches({ requirement: "sign", min_amount_cents: 1 }, d)).toBe(false);
  });
});

describe("simulation reporting", () => {
  it("counts held, blocked, and untouched decisions", () => {
    const r = simulate({ requirement: "sign", action: "refund.issue" }, [
      dec({ authority: "auto" }),
      dec({ authority: "auto" }),
      dec({ authority: "sign" }), // already strict
      dec({ action: "data.search", authority: "auto" }), // out of scope
    ]);
    expect(r.evaluated).toBe(4);
    expect(r.matched).toBe(3);
    expect(r.newly_held).toBe(2);
    expect(r.unchanged).toBe(1);
    expect(r.newly_blocked).toBe(0);
  });

  it("surfaces actions that ALREADY RAN and would have been stopped", () => {
    const r = simulate({ requirement: "deny", action: "refund.issue" }, [
      dec({ authority: "auto", executed_at: new Date().toISOString() }),
      dec({ authority: "auto" }),
    ]);
    expect(r.newly_blocked).toBe(2);
    expect(r.would_have_stopped).toHaveLength(1);
    expect(r.would_have_stopped[0].already_executed).toBe(true);
  });

  it("explains every decision, in or out of scope", () => {
    const r = simulate({ requirement: "sign", action: "refund.issue" }, [
      dec(),
      dec({ action: "data.search" }),
    ]);
    expect(r.decisions[0].reason).toContain("raised from auto to sign");
    expect(r.decisions[1].reason).toBe("outside this rule's scope");
  });
});

describe("natural-language parsing is deterministic and admits uncertainty", () => {
  it("reads a forbid rule", () => {
    const { rule } = parseRule("Never allow deleting production databases.");
    expect(rule.requirement).toBe("deny");
    expect(rule.action).toBe("record.delete");
  });

  it("reads amounts, including k-suffixed", () => {
    expect(parseRule("Require approval for refunds over $500").rule.min_amount_cents).toBe(50_000);
    expect(parseRule("Only Nick can approve payments over $5k").rule.min_amount_cents).toBe(500_000);
  });

  it("maps a department to an actor", () => {
    const { rule } = parseRule("Finance can issue refunds up to $500 with approval.");
    expect(rule.actor).toBe("agent:finance");
    expect(rule.action).toBe("refund.issue");
  });

  it("escalates two-approver language to a signature", () => {
    expect(parseRule("Require two approvals for deployments").rule.requirement).toBe("sign");
  });

  it("reports LOW confidence rather than guessing", () => {
    const { confidence } = parseRule("do the thing with the stuff");
    expect(confidence).toBe("low");
  });

  it("defaults to approve — never to auto — when the verb is unclear", () => {
    const { rule } = parseRule("something about refunds");
    expect(rule.requirement).toBe("approve");
    expect(["auto"]).not.toContain(rule.requirement);
  });
});
