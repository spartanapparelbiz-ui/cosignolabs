import { resolveTier } from "@/lib/tiers";
import { signRequired } from "@/lib/sign";
import type { TemporaryAuthorityRecord, Tier, TierSettingRecord } from "@/lib/types";
import {
  assessBlastRadius,
  maxAuthority,
  type Authority,
  type BlastAssessment,
  type BlastContext,
} from "./blastRadius";
import { isRegistered, resolveActionType } from "./registry";

/**
 * The decision function.
 *
 *   required_authority = max(policy_floor, blast_radius, novelty)
 *
 * `max` over the authority ladder is the whole safety argument: every input
 * can only ever RAISE the requirement. No signal — not a trust score, not a
 * temporary grant, not a blast radius of zero — can lower the floor the server
 * already assigns to a category. That is what makes the layer safe to make
 * mandatory.
 */

export interface DecisionInput {
  actor: string;
  action: string;
  resource: string;
  context?: BlastContext;
  /** Existing per-category user settings (the policy floor). */
  settings?: TierSettingRecord[];
  /** Live temporary-authority grants. */
  grants?: TemporaryAuthorityRecord[];
  /** Prior clean executions for this (actor, action) pair. */
  priorClean?: number;
  /** Org-wide hold: "external" blocks outside-effecting work, "all" blocks everything. */
  hold?: "none" | "external" | "all";
  now?: Date;
}

export interface PolicyStep {
  rule: string;
  effect: Authority;
  detail: string;
}

export interface Decision {
  authority: Authority;
  status: "approved" | "pending" | "denied";
  tier: Tier;
  blast: BlastAssessment;
  /** Ordered, human-readable evaluation trace — the auditability requirement. */
  policy_trace: PolicyStep[];
  registered: boolean;
}

/** Tier → the authority the existing product model already demands. */
function tierAuthority(tier: Tier, category: string, signNeeded: boolean): Authority {
  if (signNeeded) return "sign";
  if (tier === 3) return "sign";
  if (tier === 2) return "approve";
  return category === "connection_call" ? "approve" : "auto";
}

export function decide(input: DecisionInput): Decision {
  const now = input.now ?? new Date();
  const meta = resolveActionType(input.action);
  const registered = isRegistered(input.action);
  const trace: PolicyStep[] = [];

  // 1. Policy floor — the server's own category tier. Never lowered below this.
  const tier = resolveTier(meta.category, input.settings ?? [], input.grants ?? [], now);
  const signNeeded = signRequired(meta.category, tier);
  let authority = tierAuthority(tier, meta.category, signNeeded);
  trace.push({
    rule: "policy_floor",
    effect: authority,
    detail: `${meta.category} resolves to tier ${tier}${signNeeded ? " and requires a signature" : ""}`,
  });

  // 2. Unregistered actions never auto-clear.
  if (!registered) {
    authority = maxAuthority(authority, "approve");
    trace.push({
      rule: "unregistered_action",
      effect: "approve",
      detail: `"${input.action}" is not in the action registry — approval required`,
    });
  }

  // 3. Blast radius, with facts implied by the action type unless overridden.
  const ctx: BlastContext = { ...meta.implies, ...(input.context ?? {}) };
  const blast = assessBlastRadius(ctx);
  authority = maxAuthority(authority, blast.required_authority);
  trace.push({
    rule: "blast_radius",
    effect: blast.required_authority,
    detail: `${blast.level} blast radius — ${blast.dimensions
      .filter((d) => d.score === blast.score && d.score > 0)
      .map((d) => d.reason)
      .join("; ") || "no consequential dimensions"}`,
  });

  // 4. Novelty. Trust is EARNED per (actor, action) and only ever removes a
  //    step of friction the blast radius already allowed — it cannot cross
  //    into "auto" for anything the floor holds at approve-or-higher.
  const prior = Math.max(0, input.priorClean ?? 0);
  if (prior < 5 && authority === "auto" && blast.score > 0) {
    authority = maxAuthority(authority, "approve");
    trace.push({
      rule: "novelty",
      effect: "approve",
      detail: `only ${prior} prior clean run${prior === 1 ? "" : "s"} for this actor and action`,
    });
  } else if (prior >= 5) {
    trace.push({
      rule: "novelty",
      effect: "auto",
      detail: `${prior} prior clean runs — established pattern, no escalation`,
    });
  }

  // 5. Org-wide hold — the brake. Applied last so nothing can undo it.
  const hold = input.hold ?? "none";
  const externalReaching =
    (ctx.external_recipients ?? 0) > 0 || (ctx.amount_cents ?? 0) > 0 || ctx.production === true;
  if (hold === "all" || (hold === "external" && externalReaching)) {
    authority = "deny";
    trace.push({
      rule: "cosigno_hold",
      effect: "deny",
      detail: hold === "all" ? "org-wide hold: everything paused" : "org-wide hold on external actions",
    });
  }

  const status: Decision["status"] =
    authority === "auto" ? "approved" : authority === "deny" ? "denied" : "pending";

  return { authority, status, tier, blast, policy_trace: trace, registered };
}
