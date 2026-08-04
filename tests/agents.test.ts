import { describe, expect, it } from "vitest";
import { buildRoster, summarizeAgents } from "@/lib/agents";
import type { DecisionRecord } from "@/lib/authz/store";

function decision(over: Partial<DecisionRecord>): DecisionRecord {
  return {
    id: `dec_${Math.random().toString(16).slice(2)}`,
    org: "org_demo",
    actor: "agent:claude",
    action: "data.search",
    resource: "res_1",
    payload_hash: "hash",
    status: "approved",
    authority: "auto",
    tier: 1,
    blast_level: "minimal",
    blast_score: 0,
    policy_trace: [],
    token_jti: null,
    executed_at: null,
    created_at: "2026-01-01T10:00:00.000Z",
    ...over,
  };
}

describe("agent roster", () => {
  it("lists an assistant only because it actually asked for something", () => {
    expect(summarizeAgents([])).toEqual([]);
  });

  it("groups the ledger by principal", () => {
    const agents = summarizeAgents([
      decision({ actor: "agent:claude" }),
      decision({ actor: "agent:claude", action: "record.update", tier: 2 }),
      decision({ actor: "agent:cursor" }),
    ]);
    expect(agents.map((a) => a.actor).sort()).toEqual(["agent:claude", "agent:cursor"]);
    expect(agents.find((a) => a.actor === "agent:claude")?.requested).toBe(2);
  });

  it("counts what happened, and says it in one sentence", () => {
    const [agent] = summarizeAgents([
      decision({ status: "approved", authority: "auto" }),
      decision({ status: "pending", authority: "sign", created_at: "2026-01-01T11:00:00.000Z" }),
      decision({ status: "denied", authority: "deny", created_at: "2026-01-01T12:00:00.000Z" }),
      decision({ status: "approved", authority: "approve", executed_at: "2026-01-01T13:00:00.000Z", created_at: "2026-01-01T13:00:00.000Z" }),
    ]);
    expect(agent.auto_cleared).toBe(1);
    expect(agent.held).toBe(1);
    expect(agent.denied).toBe(1);
    expect(agent.executed).toBe(1);
    expect(agent.summary).toBe(
      "asked 4 times · 1 cleared automatically · 1 waited for a person · 1 blocked by policy."
    );
  });

  it("reports the riskiest thing it ever asked for, not the average", () => {
    const [agent] = summarizeAgents([
      decision({ blast_level: "minimal" }),
      decision({ blast_level: "severe", created_at: "2026-01-01T11:00:00.000Z" }),
      decision({ blast_level: "low", created_at: "2026-01-01T12:00:00.000Z" }),
    ]);
    expect(agent.peak_risk).toBe("critical");
  });

  it("labels action types in plain language, most recent first", () => {
    const [agent] = summarizeAgents([
      decision({ action: "data.search", created_at: "2026-01-01T10:00:00.000Z" }),
      decision({ action: "refund.issue", created_at: "2026-01-01T11:00:00.000Z" }),
    ]);
    expect(agent.actions[0].label).toBe("Issue a refund");
    expect(agent.actions.map((a) => a.id)).toEqual(["refund.issue", "data.search"]);
  });

  it("orders the roster by who is active right now", () => {
    const agents = summarizeAgents([
      decision({ actor: "agent:old", created_at: "2026-01-01T10:00:00.000Z" }),
      decision({ actor: "agent:recent", created_at: "2026-01-02T10:00:00.000Z" }),
    ]);
    expect(agents[0].actor).toBe("agent:recent");
  });

  it("totals the roster for the header", () => {
    const roster = buildRoster([
      decision({ actor: "a", status: "pending" }),
      decision({ actor: "b", status: "denied" }),
      decision({ actor: "b" }),
    ]);
    expect(roster.total_requests).toBe(3);
    expect(roster.awaiting_people).toBe(1);
    expect(roster.blocked).toBe(1);
  });

  it("survives a ledger that arrives out of order", () => {
    const [agent] = summarizeAgents([
      decision({ created_at: "2026-01-03T10:00:00.000Z" }),
      decision({ created_at: "2026-01-01T10:00:00.000Z" }),
    ]);
    expect(agent.first_seen).toBe("2026-01-01T10:00:00.000Z");
    expect(agent.last_seen).toBe("2026-01-03T10:00:00.000Z");
  });
});
