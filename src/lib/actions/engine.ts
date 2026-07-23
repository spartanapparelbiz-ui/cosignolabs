import { getStore, type ActionInsert } from "../store";
import { getUserPlan } from "../billing";
import { effectiveActionLimit, usageLimitMessage } from "../enforcement";
import { holdBlocks, holdMessage } from "../hold";
import { logSecurity, newRequestId } from "../log";
import { authorizationHash } from "../signRecord";
import { planHash, idempotencyKey } from "../planHash";
import { recordSecurityEvent } from "../securityEvents";
import { recordActionReceipt } from "../receipts";
import { executeAction } from "./executor";
import { ActionRecord, CosignRoomRecord } from "../types";

export class EngineError extends Error {
  constructor(
    public code:
      | "not_found"
      | "invalid_state"
      | "confirmation_required"
      | "confirmation_mismatch"
      | "usage_limit"
      | "forbidden"
      | "injection_blocked"
      | "on_hold"
      | "approval_expired"
      | "room_pending",
    message: string
  ) {
    super(message);
  }
}

/**
 * How long a proposed card stays approvable. After this window an approval
 * attempt is refused server-side (`approval_expired`) and recorded — a stale
 * tab or a replayed request can never execute an old plan. Re-issuing the
 * command produces a fresh card.
 */
export const PROPOSAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function proposalExpired(action: Pick<ActionRecord, "created_at">, now = Date.now()): boolean {
  return now - new Date(action.created_at).getTime() > PROPOSAL_TTL_MS;
}

/**
 * The approval state machine. Every status change in the product flows
 * through these functions — API routes call them, nothing else mutates
 * status. Guarantees:
 *  - Tier 2/3 actions execute only from an explicit approve call, which
 *    writes an `approved` audit event (with a hash-sealed authorization
 *    record and a single-use correlation nonce) before execution starts.
 *  - Tier 3 additionally requires a typed confirmation matching the
 *    action's category name.
 *  - Proposals expire after PROPOSAL_TTL_MS.
 *  - A CoSign Room on an action must be satisfied — against the CURRENT
 *    plan hash — before the owner's approval can execute it.
 *  - The dispatcher re-verifies the plan hash sealed at approval right
 *    before executing; a mismatch is refused, recorded, and receipted.
 *  - Usage limits are checked before execution; a blocked action stays
 *    `proposed` and the block is logged.
 *  - Every dispatch attempt (executed / failed / rejected) writes an
 *    immutable Proof Receipt.
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
    await recordSecurityEvent(input.user_id, "injection_flagged", {
      detail: { action_id: action.id, category: action.category },
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
  // Cosigno Hold: while an "all" hold is active, even tier-1 auto work waits.
  // The card stays proposed and the pause is recorded once, so it's traceable.
  const hold = await store.getHold(userId);
  if (holdBlocks(hold.scope, action)) {
    await store.logEvent(userId, action.id, "blocked", "system", { reason: "on_hold", scope: hold.scope });
    return action;
  }
  const usage = await store.getUsage(userId);
  if (usage.actions_executed >= (await effectiveActionLimit(userId))) return action;

  const authorizedAt = new Date().toISOString();
  const correlationId = newRequestId();
  const approvedHash = planHash(action.payload);
  await store.transitionAction(userId, action.id, "approved");
  await store.logEvent(userId, action.id, "approved", "system", {
    auto: true,
    note: "Tier 1 — auto-approved (read-only/reversible).",
    authorization: {
      method: "auto",
      signed_name: null,
      authorized_at: authorizedAt,
      nonce: correlationId,
      plan_hash: approvedHash,
      record_hash: authorizationHash({
        user_id: userId,
        action_id: action.id,
        category: action.category,
        tier: action.tier,
        method: "auto",
        signed_name: null,
        summary: action.summary,
        payload: action.payload,
        authorized_at: authorizedAt,
      }),
    },
  });
  return runExecution(userId, action.id, {
    correlationId,
    approvedHash,
    approvedBy: "system:auto",
    method: "auto",
  });
}

export interface ApproveOptions {
  /** Required for tier-3 actions: must equal the action's category. */
  confirmation?: string;
  /** Optional edited payload applied at approval time. */
  payload?: Record<string, unknown>;
  /**
   * Set ONLY by the workspace delegation layer (never from a client body):
   * a workspace-mate with approval rights is deciding on the owner's behalf.
   * Recorded verbatim in the audit trail.
   */
  delegate?: { actorId: string; actorEmail: string };
  /**
   * The SIGN interaction, when the user drew (or applied) their signature.
   * Purely additive audit context: the signature is the human interaction;
   * the hashed authorization record written below is the proof. Absence
   * means a one-click APPROVE.
   */
  signature?: { name: string; image?: string };
}

/**
 * CoSign Room gate, consulted inside approveAction. An action wrapped in a
 * room can execute only when the room is SATISFIED — and satisfied against
 * the exact plan hash being approved. Everything else refuses honestly:
 * pending/changes-requested/rejected → room_pending; expired rooms are
 * marked and refused; a hash drift voids all prior approvals server-side.
 */
async function enforceRoomGate(
  userId: string,
  action: ActionRecord,
  effectivePayload: Record<string, unknown>
): Promise<CosignRoomRecord | null> {
  const store = getStore();
  const room = await store.getRoomByAction(userId, action.id);
  if (!room || room.status === "cancelled") return null;

  if (new Date(room.expires_at).getTime() < Date.now() && room.status !== "expired") {
    await store.updateRoom(userId, room.id, { status: "expired" });
    await store.logRoomEvent(room.id, userId, "system", "expired", {});
    await recordSecurityEvent(userId, "room_expired", {
      detail: { room_id: room.id, action_id: action.id },
    });
    throw new EngineError(
      "room_pending",
      "this approval room expired before everyone signed. re-open a room to proceed."
    );
  }

  const currentHash = planHash(effectivePayload);
  if (room.plan_hash !== currentHash) {
    await voidRoomApprovals(userId, room, currentHash, "owner-edit");
    throw new EngineError(
      "room_pending",
      "the plan changed after co-signers approved — their approvals were reset and everyone must re-approve the updated plan."
    );
  }

  if (room.status !== "satisfied") {
    throw new EngineError(
      "room_pending",
      "this action needs its co-signers first — the room isn't fully approved yet."
    );
  }
  return room;
}

/**
 * Material plan change → every prior room approval is void. Decisions are
 * reset to pending (history stays in the append-only room events), the room
 * re-binds to the new plan hash, and reapproval is required. Exported for
 * the rooms module; the engine calls it on every payload edit.
 */
export async function voidRoomApprovals(
  ownerId: string,
  room: CosignRoomRecord,
  newHash: string,
  reason: string
): Promise<void> {
  const store = getStore();
  const approvers = await store.listRoomApprovers(room.id);
  for (const a of approvers) {
    if (a.decision !== "pending") {
      await store.updateRoomApprover(room.id, a.id, {
        decision: "pending",
        decided_plan_hash: null,
        decided_at: null,
        revoked_at: new Date().toISOString(),
      });
    }
  }
  await store.updateRoom(ownerId, room.id, { status: "open", plan_hash: newHash });
  await store.logRoomEvent(room.id, ownerId, "system", "plan_changed", { reason });
  await store.logRoomEvent(room.id, ownerId, "system", "reapproval_required", {});
  await recordSecurityEvent(ownerId, "room_reapproval_required", {
    detail: { room_id: room.id, action_id: room.action_id, reason },
  });
}

/** Invalidate room approvals when an action's payload is edited. */
async function invalidateRoomOnEdit(
  userId: string,
  actionId: string,
  newPayload: Record<string, unknown>
): Promise<void> {
  const store = getStore();
  const room = await store.getRoomByAction(userId, actionId);
  if (!room) return;
  if (!["open", "satisfied", "changes_requested"].includes(room.status)) return;
  const newHash = planHash(newPayload);
  if (room.plan_hash !== newHash) {
    await voidRoomApprovals(userId, room, newHash, "payload-edited");
  }
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

  // Stale proposals are not approvable: a card older than the TTL refuses
  // execution no matter who asks. Recorded as both an audit event and a
  // durable security event (the attempt itself is evidence).
  if (proposalExpired(action)) {
    await store.logEvent(userId, actionId, "blocked", "system", {
      reason: "approval_expired",
      created_at: action.created_at,
    });
    await recordSecurityEvent(userId, "approval_expired", {
      detail: { action_id: actionId, category: action.category },
    });
    throw new EngineError(
      "approval_expired",
      "this card is more than 7 days old and can no longer be approved. ask cosigno again to get a fresh plan."
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
    await recordSecurityEvent(userId, "injection_approval_blocked", {
      detail: { action_id: actionId, category: action.category },
    });
    throw new EngineError(
      "injection_blocked",
      "this card was held: external content attempted to direct the agent. it can't be executed — re-issue the command yourself if you want this done."
    );
  }

  // Cosigno Hold: while active for this action's scope, nothing new crosses
  // the boundary. The card stays proposed; resuming lets it through
  // unchanged. This is the authority brake — the user keeps final control.
  const hold = await store.getHold(userId);
  if (holdBlocks(hold.scope, action)) {
    await store.logEvent(userId, actionId, "blocked", "system", { reason: "on_hold", scope: hold.scope });
    throw new EngineError("on_hold", holdMessage(hold.scope));
  }

  // Delegated approvals are for routine writes only: tier 3 stays personal
  // (the typed confirmation belongs to the action's owner), and a delegate
  // never edits the payload — they sign exactly what the owner saw.
  if (opts.delegate) {
    if (action.tier !== 2) {
      throw new EngineError(
        "forbidden",
        "only tier-2 actions can be approved by a workspace member — locked actions stay with their owner."
      );
    }
    if (opts.payload) {
      throw new EngineError("forbidden", "a delegated approval can't edit the payload.");
    }
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

  const approvedPayload = opts.payload ?? action.payload;

  // CoSign Room gate: with a room attached, the owner's approval only
  // executes once every required co-signer approved THIS exact plan.
  const room = await enforceRoomGate(userId, action, approvedPayload);

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

  // The approval row — written BEFORE any execution can begin. Every
  // approval seals a tamper-evident authorization record: who, what, the
  // exact approved payload (bound by plan hash), when, how (signed vs
  // one-click), and a single-use correlation nonce. The drawn signature
  // (if any) rides along as audit context; the hash is the proof.
  const authorizedAt = new Date().toISOString();
  const correlationId = newRequestId();
  const method = opts.signature ? ("signed" as const) : ("approved" as const);
  const approvedHash = planHash(approvedPayload);
  await store.transitionAction(userId, actionId, "approved");
  await store.logEvent(userId, actionId, "approved", "user", {
    tier: action.tier,
    confirmed: action.tier === 3 ? action.category : undefined,
    ...(opts.delegate
      ? { delegated: true, approved_by: opts.delegate.actorEmail }
      : {}),
    ...(room ? { room_id: room.id, room_satisfied: true } : {}),
    authorization: {
      method,
      signed_name: opts.signature?.name ?? null,
      authorized_at: authorizedAt,
      nonce: correlationId,
      plan_hash: approvedHash,
      record_hash: authorizationHash({
        user_id: userId,
        action_id: actionId,
        category: action.category,
        tier: action.tier,
        method,
        signed_name: opts.signature?.name ?? null,
        summary: action.summary,
        payload: approvedPayload,
        authorized_at: authorizedAt,
      }),
      ...(opts.signature?.image ? { signature_image: opts.signature.image } : {}),
    },
  });
  await recordSecurityEvent(userId, method === "signed" ? "approval_signed" : "approval_created", {
    correlationId,
    detail: {
      action_id: actionId,
      category: action.category,
      tier: action.tier,
      ...(opts.delegate ? { delegated_to: opts.delegate.actorEmail } : {}),
      ...(room ? { room_id: room.id } : {}),
    },
  });

  return runExecution(userId, actionId, {
    correlationId,
    approvedHash,
    approvedBy: opts.delegate ? opts.delegate.actorId : userId,
    method: room ? `${method}:room` : method,
  });
}

export async function vetoAction(
  userId: string,
  actionId: string,
  reason: string,
  delegate?: { actorId: string; actorEmail: string }
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
  await store.logEvent(userId, actionId, "vetoed", "user", {
    reason,
    ...(delegate ? { delegated: true, vetoed_by: delegate.actorEmail } : {}),
  });
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
  // Material plan change: any room approvals collected against the previous
  // payload are void — co-signers must re-approve what actually changed.
  if (patch.payload) {
    await invalidateRoomOnEdit(userId, actionId, updated.payload);
  }
  return updated;
}

interface ExecutionAuth {
  correlationId: string;
  /** Plan hash sealed at approval — dispatch refuses anything else. */
  approvedHash: string;
  approvedBy: string;
  method: string;
}

async function runExecution(
  userId: string,
  actionId: string,
  auth: ExecutionAuth
): Promise<ActionRecord> {
  const store = getStore();
  const approved = await store.transitionAction(userId, actionId, "executing");
  await store.logEvent(userId, actionId, "executing", "system", {
    correlation_id: auth.correlationId,
  });

  // THE BINDING CHECK: the payload about to execute must hash to exactly
  // what was approved. Any drift (a race, a bug, a tampered row) refuses
  // dispatch, records the mismatch, and receipts the rejection. Nothing
  // the model or a client asserts can override this — only stored state.
  const currentHash = planHash(approved.payload);
  if (currentHash !== auth.approvedHash) {
    logSecurity("rejected_status_write", {
      detail: "plan_hash_mismatch",
      actionId,
      correlationId: auth.correlationId,
    });
    await recordSecurityEvent(userId, "plan_hash_mismatch", {
      correlationId: auth.correlationId,
      detail: { action_id: actionId, category: approved.category },
    });
    const failed = await store.transitionAction(userId, actionId, "failed", {
      result: { error: "plan changed between approval and execution — refused." },
    });
    await store.logEvent(userId, actionId, "failed", "system", {
      error: "plan_hash_mismatch",
      correlation_id: auth.correlationId,
    });
    await recordActionReceipt(failed, {
      correlationId: auth.correlationId,
      planHash: auth.approvedHash,
      approvedBy: auth.approvedBy,
      authorizationMethod: auth.method,
    }, {
      status: "rejected",
      failureReason: "plan_hash_mismatch: the payload changed after approval.",
    });
    return failed;
  }

  try {
    const result = await executeAction(approved.category, approved.payload, {
      userId,
      idempotencyKey: idempotencyKey(actionId),
    });
    if (!result.ok) throw new Error(result.summary);
    const executed = await store.transitionAction(userId, actionId, "executed", {
      result: { summary: result.summary, ...result.detail },
    });
    await store.logEvent(userId, actionId, "executed", "system", {
      summary: result.summary,
      correlation_id: auth.correlationId,
    });
    await store.incrementUsage(userId);
    await recordActionReceipt(executed, {
      correlationId: auth.correlationId,
      planHash: auth.approvedHash,
      approvedBy: auth.approvedBy,
      authorizationMethod: auth.method,
    }, {
      status: "executed",
      resultSummary: result.summary,
      verification:
        result.detail && typeof result.detail === "object"
          ? { simulated: Boolean((result.detail as Record<string, unknown>).simulated) }
          : null,
      externalRef:
        result.detail && typeof (result.detail as Record<string, unknown>).external_ref === "string"
          ? String((result.detail as Record<string, unknown>).external_ref)
          : null,
    });
    await recordSecurityEvent(userId, "execution_succeeded", {
      correlationId: auth.correlationId,
      detail: { action_id: actionId, category: approved.category },
    });
    return executed;
  } catch (err) {
    const failed = await store.transitionAction(userId, actionId, "failed", {
      result: { error: err instanceof Error ? err.message : "execution failed" },
    });
    await store.logEvent(userId, actionId, "failed", "system", {
      error: err instanceof Error ? err.message : String(err),
      correlation_id: auth.correlationId,
    });
    await recordActionReceipt(failed, {
      correlationId: auth.correlationId,
      planHash: auth.approvedHash,
      approvedBy: auth.approvedBy,
      authorizationMethod: auth.method,
    }, {
      status: "failed",
      failureReason: err instanceof Error ? err.message : "execution failed",
    });
    await recordSecurityEvent(userId, "execution_failed", {
      correlationId: auth.correlationId,
      detail: { action_id: actionId, category: approved.category },
    });
    return failed;
  }
}
