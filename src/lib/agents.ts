import type { DecisionRecord } from "./authz/store";
import { resolveActionType } from "./authz/registry";
import { riskFromBlast, maxRisk, type RiskLevel } from "./risk";

/**
 * Agents — "which AI assistants are connected?"
 *
 * An agent is not a thing a user creates in a form. It is a principal that has
 * actually presented a key and asked cosigno for authority, so the roster is
 * derived entirely from the append-only decision ledger: if an assistant has
 * never asked for anything, it is not listed, because listing it would be
 * inventing a connection that doesn't exist.
 *
 * Pure functions over records — no store access, no dates from the clock
 * except what the caller passes — so the whole roster is unit-testable and the
 * page can never disagree with the ledger it came from.
 */

export interface AgentSummary {
  /** The principal id the agent authenticated as. */
  actor: string;
  /** Distinct action types it has asked for, most recent first. */
  actions: { id: string; label: string }[];
  requested: number;
  /** Cleared by policy without a human. */
  auto_cleared: number;
  /** Held for a person to decide. */
  held: number;
  denied: number;
  /** Authorized AND actually spent a token at the tool boundary. */
  executed: number;
  first_seen: string;
  last_seen: string;
  /** The riskiest thing it has ever asked for. */
  peak_risk: RiskLevel;
  /** One plain sentence describing this agent's behaviour so far. */
  summary: string;
}

/**
 * Build the roster. Decisions may arrive in any order; the summary sorts by
 * most recently seen so the page reads as "who is active right now".
 */
export function summarizeAgents(decisions: readonly DecisionRecord[]): AgentSummary[] {
  const byActor = new Map<string, DecisionRecord[]>();
  for (const d of decisions) {
    byActor.set(d.actor, [...(byActor.get(d.actor) ?? []), d]);
  }

  const agents = [...byActor.entries()].map(([actor, records]) => {
    const sorted = [...records].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const actions = new Map<string, string>();
    for (const r of [...sorted].reverse()) {
      if (!actions.has(r.action)) actions.set(r.action, resolveActionType(r.action).label);
    }

    const auto = records.filter((r) => r.status === "approved" && r.authority === "auto").length;
    const held = records.filter((r) => r.status === "pending").length;
    const denied = records.filter((r) => r.status === "denied").length;
    const executed = records.filter((r) => r.executed_at !== null).length;
    const peak = records.reduce<RiskLevel>((acc, r) => maxRisk(acc, riskFromBlast(r.blast_level)), "low");

    return {
      actor,
      actions: [...actions.entries()].map(([id, label]) => ({ id, label })),
      requested: records.length,
      auto_cleared: auto,
      held,
      denied,
      executed,
      first_seen: sorted[0].created_at,
      last_seen: sorted[sorted.length - 1].created_at,
      peak_risk: peak,
      summary: describe({ requested: records.length, auto, held, denied }),
    };
  });

  return agents.sort((a, b) => Date.parse(b.last_seen) - Date.parse(a.last_seen));
}

function describe(counts: { requested: number; auto: number; held: number; denied: number }): string {
  const parts: string[] = [
    `asked ${counts.requested} time${counts.requested === 1 ? "" : "s"}`,
  ];
  if (counts.auto > 0) parts.push(`${counts.auto} cleared automatically`);
  if (counts.held > 0) parts.push(`${counts.held} waited for a person`);
  if (counts.denied > 0) parts.push(`${counts.denied} blocked by policy`);
  return `${parts.join(" · ")}.`;
}

/** Roster-wide totals for the page header. */
export interface AgentRoster {
  agents: AgentSummary[];
  total_requests: number;
  blocked: number;
  awaiting_people: number;
}

export function buildRoster(decisions: readonly DecisionRecord[]): AgentRoster {
  const agents = summarizeAgents(decisions);
  return {
    agents,
    total_requests: agents.reduce((n, a) => n + a.requested, 0),
    blocked: agents.reduce((n, a) => n + a.denied, 0),
    awaiting_people: agents.reduce((n, a) => n + a.held, 0),
  };
}
