import { getStore, type ActionInsert } from "../store";
import { getUserPlan } from "../billing";
import { effectiveActionLimit, usageLimitMessage } from "../enforcement";
import { logSecurity } from "../log";
import { executeAction } from "./executor";
import { ActionRecord } from "../types";

export class EngineError extends Error {
  constructor(
    public code:
      | "not_found"
      | "invalid_state"
      | "confirmation_required"
      | "confirmation_mismatch"
      | "usage_limit"
      | "forbidden"
      | "injection_blocked",
    message: string
  ) {
    super(message);
  }
}

/**
 * The approval state machine. Every status change in the product flows
 * through these functions — API routes call them, nothing else mutates
 * status. Guarantees:
 *  - Tier 2/3 actions execute only from an explicit approve call, which
 *    writes an `approved` audit event before execution starts.
 *  - Tier 3 additionally requires a typed confirmation matching the
 *    action's category name.
 *  - Usage limits are checked before execution; a blocked action stays
 *    `proposed` and the block is logged.
 */

export async function proposeAction(input: ActionInsert): Promise<ActionRecord> {
  const store = getStore();
  const action = await store.createAction(input);
  await store.logEvent(input.user_id, action.id, "proposed", "agent", {
    tier: action.tier,
    category: action.category,
  });
  if (action.injection_flag) {
    logSecurity("injection_flagged", {
      actionId: action.id,
      category: action.category,
    });
    await store.logEvent(input.user_id, action.id, "flagged", "system", {
      reason: "External content attempted to direct the agent.",
    });
  }
  return action;
}

/**
 * Tier-1 (auto) actions: execute immediately, but still log every step.
 * Never called for tier 2/3 — the caller must check the SERVER-resolved tier.
 */
export async function autoExecute(
  userId: string,
  action: ActionRecord
): Promise<ActionRecord> {
  if (action.tier !== 1) {
    throw new EngineError("forbidden", "only tier-1 actions can auto-execute.");
  }
  // Injection-flagged content never auto-executes, regardless of tier.
  if (action.injection_flag) return action;
  const store = getStore();
  const usage = await store.getUsage(userId);
  if (usage.actions_executed >= (await effectiveActionLimit(userId))) return action;

  await store.transitionAction(userId, action.id, "approved");
  await store.logEvent(userId, action.id, "approved", "system", {
    auto: true,
    note: "Tier 1 — auto-approved (read-only/reversible).",
  });
  return runExecution(userId, action.id);
}

export interface ApproveOptions {
  /** Required for tier-3 actions: must equal the action's category. */
  confirmation?: string;
  /** Optional edited payload applied at approval time. */
  payload?: Record<string, unknown>;
}

export async function approveAction(
  userId: string,
  actionId: string,
  opts: ApproveOptions = {}
): Promise<ActionRecord> {
  const store = getStore();
  const action = await store.getAction(userId, actionId);
  if (!action) throw new EngineError("not_found", "we couldn't find that action.");
  if (action.status !== "proposed") {
    throw new EngineError(
      "invalid_state",
      `only proposed actions can be approved — this one is already ${action.status}.`
    );
  }

  // Injection containment: flagged cards can never be approved into
  // execution, regardless of tier or how many times approval is attempted.
  // (The store layer and the Postgres trigger enforce this again.)
  if (action.injection_flag) {
    logSecurity("injection_approval_blocked", { actionId, tier: action.tier });
    await store.logEvent(userId, actionId, "blocked", "system", {
      reason: "injection_flag",
    });
    throw new EngineError(
      "injection_blocked",
      "this card was held: external content attempted to direct the agent. it can't be executed — re-issue the command yourself if you want this done."
    );
  }

  if (action.tier === 3) {
    if (!opts.confirmation) {
      throw new EngineError(
        "confirmation_required",
        `this is a locked action. type its name to approve: "${action.category}".`
      );
    }
    if (opts.confirmation.trim().toLowerCase() !== action.category.toLowerCase()) {
      throw new EngineError(
        "confirmation_mismatch",
        `that didn't match. type "${action.category}" exactly to approve.`
      );
    }
  }

  const usage = await store.getUsage(userId);
  const { planId, plan } = await getUserPlan(userId);
  if (usage.actions_executed >= plan.actionLimit) {
    await store.logEvent(userId, actionId, "blocked", "system", {
      reason: "usage_limit",
      executed: usage.actions_executed,
      limit: plan.actionLimit,
    });
    throw new EngineError("usage_limit", usageLimitMessage(planId));
  }

  if (opts.payload) {
    await store.updateActionProposal(userId, actionId, { payload: opts.payload });
    await store.logEvent(userId, actionId, "edited", "user", {
      at: "approval",
    });
  }

  // The approval row — written BEFORE any execution can begin.
  await store.transitionAction(userId, actionId, "approved");
  await store.logEvent(userId, actionId, "approved", "user", {
    tier: action.tier,
    confirmed: action.tier === 3 ? action.category : undefined,
  });

  return runExecution(userId, actionId);
}

export async function vetoAction(
  userId: string,
  actionId: string,
  reason: string
): Promise<ActionRecord> {
  const store = getStore();
  const action = await store.getAction(userId, actionId);
  if (!action) throw new EngineError("not_found", "we couldn't find that action.");
  if (action.status !== "proposed") {
    throw new EngineError(
      "invalid_state",
      `only proposed actions can be vetoed — this one is already ${action.status}.`
    );
  }
  const updated = await store.transitionAction(userId, actionId, "vetoed", {
    veto_reason: reason || "no reason given",
  });
  await store.logEvent(userId, actionId, "vetoed", "user", { reason });
  return updated;
}

export async function editAction(
  userId: string,
  actionId: string,
  patch: { payload?: Record<string, unknown>; summary?: string }
): Promise<ActionRecord> {
  const store = getStore();
  const updated = await store.updateActionProposal(userId, actionId, patch);
  await store.logEvent(userId, actionId, "edited", "user", {
    fields: Object.keys(patch),
  });
  return updated;
}

async function runExecution(userId: string, actionId: string): Promise<ActionRecord> {
  const store = getStore();
  const approved = await store.transitionAction(userId, actionId, "executing");
  await store.logEvent(userId, actionId, "executing", "system", {});
  try {
    const result = await executeAction(approved.category, approved.payload, { userId });
    if (!result.ok) throw new Error(result.summary);
    const executed = await store.transitionAction(userId, actionId, "executed", {
      result: { summary: result.summary, ...result.detail },
    });
    await store.logEvent(userId, actionId, "executed", "system", {
      summary: result.summary,
    });
    await store.incrementUsage(userId);
    return executed;
  } catch (err) {
    const failed = await store.transitionAction(userId, actionId, "failed", {
      result: { error: err instanceof Error ? err.message : "execution failed" },
    });
    await store.logEvent(userId, actionId, "failed", "system", {
      error: err instanceof Error ? err.message : String(err),
    });
    return failed;
  }
}
