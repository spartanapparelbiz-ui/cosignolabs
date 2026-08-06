import type { PermissionRuleRecord, Tier } from "../types";
import { applyRequirementToTier, applyRules, type RuleContext } from "../rules";
import { serverTier } from "./tiers";
import type { CustomApiConfig, IntegrationProvider } from "./types";

/**
 * Explicit DATA + ACTION boundaries for a connection, in plain English. These
 * are DERIVED — never invented — from what a provider already declares (its
 * scope summary and typed actions) plus the tier the server assigns each
 * action. The effective view then folds the user's permission rules, which can
 * only ever tighten (raise the requirement or forbid an action). Making the
 * boundary explicit is the whole point: the user should see exactly what a
 * connection can touch and what each thing requires, before they rely on it.
 */

export type Requirement = "auto" | "approval" | "signature" | "typed confirmation";

/** Tier → the plain-English requirement to cross the boundary. */
const TIER_REQUIREMENT: Record<Tier, Requirement> = {
  1: "auto",
  2: "signature",
  3: "typed confirmation",
};

export interface ActionBoundaryRow {
  id: string;
  summary: string;
  tier: Tier;
  requirement: Requirement;
  /** Set when a permission rule tightened this action beyond its base tier. */
  ruleEffect?: "raised to signature" | "blocked";
  /** The rule text responsible, for disclosure. */
  ruleText?: string;
}

export interface DataBoundary {
  /** What cosigno can see through this connection (from declared scopes). */
  canAccess: string[];
  /** What it can never see/do — universal, always-true guarantees. */
  cannotAccess: string[];
}

export interface IntegrationBoundary {
  data: DataBoundary;
  actions: ActionBoundaryRow[];
}

/** Universal guarantees that hold for every connection in this system. */
const UNIVERSAL_CANNOT = [
  "nothing until you explicitly connect it",
  "nothing outside the scopes you granted",
  "no outward or destructive action without your approval or signature",
];

function requirementForTier(t: Tier): Requirement {
  return TIER_REQUIREMENT[t];
}

/** Provider-level boundary (no user, no secrets) — safe for the client. */
export function providerBoundary(p: IntegrationProvider): IntegrationBoundary {
  const actions: ActionBoundaryRow[] = p.listActions().map((a) => {
    const tier = serverTier(a);
    return { id: a.id, summary: a.summary, tier, requirement: requirementForTier(tier) };
  });
  return {
    data: {
      canAccess: [p.scopeSummary].filter(Boolean),
      cannotAccess: UNIVERSAL_CANNOT,
    },
    actions,
  };
}

/** Custom API connector boundary, derived from the mapped actions. */
export function customBoundary(cfg: CustomApiConfig): IntegrationBoundary {
  const actions: ActionBoundaryRow[] = (cfg.actions ?? []).map((a) => {
    const tier = { read: 1, write: 2, destructive: 3 }[a.risk] as Tier;
    return {
      id: a.id,
      summary: `${a.method} ${a.path} — ${a.summary}`,
      tier,
      requirement: requirementForTier(tier),
    };
  });
  const reads = (cfg.actions ?? []).filter((a) => a.risk === "read").map((a) => `${a.method} ${a.path}`);
  return {
    data: {
      canAccess: reads.length ? reads : [`the endpoints you mapped on ${cfg.base_url}`],
      cannotAccess: [
        `any endpoint you did not map on ${cfg.base_url}`,
        ...UNIVERSAL_CANNOT,
      ],
    },
    actions,
  };
}

/**
 * Fold the user's permission rules into a base boundary, per action. Rules only
 * ever tighten: an action can be raised to "signature" or "blocked", never
 * loosened. `target` is the connection's provider key / kind, used to match
 * rules; amount/channel conditions can't be evaluated statically (they depend
 * on runtime args), so only unconditioned + target/verb rules show here.
 */
export function effectiveBoundary(
  base: IntegrationBoundary,
  rules: PermissionRuleRecord[],
  target: string
): IntegrationBoundary {
  if (rules.length === 0) return base;
  const actions = base.actions.map((row) => {
    // Normalized identity, same as the live proposal path — the boundary a
    // person reads here is computed exactly the way the door computes it.
    const ctx: RuleContext = { target, actionId: row.id, tier: row.tier, summary: row.summary };
    const decision = applyRules(rules, ctx);
    if (!decision.requirement) return row;
    const folded = applyRequirementToTier(row.tier, decision.requirement);
    if (folded.blocked) {
      return { ...row, requirement: "signature" as Requirement, ruleEffect: "blocked" as const, ruleText: decision.rule?.text };
    }
    if (folded.tier > row.tier) {
      return {
        ...row,
        tier: folded.tier,
        requirement: requirementForTier(folded.tier),
        ruleEffect: "raised to signature" as const,
        ruleText: decision.rule?.text,
      };
    }
    return row;
  });
  return { data: base.data, actions };
}
