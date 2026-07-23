import { getStore, type ReceiptInsert } from "./store";
import { logError } from "./log";
import type { ActionRecord, ReceiptRecord } from "./types";

/**
 * Proof Receipts — the immutable record of every attempted external action.
 *
 * Written ONLY by the server-side execution dispatcher (engine.runExecution),
 * for successes, failures, AND dispatch-level rejections. The Postgres table
 * blocks updates for every role; the memory store freezes rows. Account
 * deletion is the single sanctioned removal path.
 *
 * Receipts deliberately contain NO tokens, NO secrets, NO full payloads and
 * NO complete message bodies — only bounded, factual summaries. The payload
 * itself stays on the action row; the receipt binds to it via plan_hash.
 */

const MAX_SUMMARY = 500;

function bounded(v: unknown, max = MAX_SUMMARY): string | null {
  if (typeof v !== "string" || v.length === 0) return null;
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

function str(v: unknown): string | null {
  return typeof v === "string" || typeof v === "number" ? String(v) : null;
}

/** Which integration a payload actually targets (never guessed). */
export function integrationOf(action: Pick<ActionRecord, "category" | "payload">): string {
  if (action.category === "connection_call") {
    return (
      str(action.payload.provider_key) ??
      str(action.payload.connection_name) ??
      "connected-app"
    );
  }
  return "internal";
}

/** Human-readable exact operation, derived from server-known fields only. */
export function operationOf(action: Pick<ActionRecord, "category" | "payload">): string {
  if (action.category === "connection_call") {
    const op = str(action.payload.action) ?? str(action.payload.tool) ?? "call";
    return `${integrationOf(action)}:${op}`;
  }
  return action.category;
}

/**
 * Whether the operation is reversible from Cosigno's side, and how. Honest:
 * most external sends are NOT undoable — we say so instead of pretending.
 */
export function undoOf(action: Pick<ActionRecord, "category">): {
  undo_available: boolean;
  undo_hint: string | null;
} {
  switch (action.category) {
    case "draft":
    case "summarize":
    case "search":
      return { undo_available: true, undo_hint: "Internal only — delete the draft/result." };
    case "update_record":
      return { undo_available: true, undo_hint: "Previous value can be restored manually." };
    case "send_email":
    case "post_content":
    case "webhook":
      return { undo_available: false, undo_hint: "Sent content cannot be recalled." };
    case "spend":
    case "payment":
    case "refund":
      return { undo_available: false, undo_hint: "Money movements need the counterparty to reverse." };
    case "delete":
      return { undo_available: false, undo_hint: "Deletion is destructive — restore from a backup if one exists." };
    default:
      return { undo_available: false, undo_hint: null };
  }
}

export interface ReceiptContext {
  correlationId: string;
  planHash: string;
  approvedBy: string;
  authorizationMethod: string;
  missionId?: string | null;
  planVersion?: number | null;
}

/**
 * Record a receipt for one dispatch attempt. Fail-safe: a receipt-write
 * failure is logged loudly but never converts a completed execution into an
 * error (the action row + events remain authoritative); rejection paths that
 * depend on the receipt still block the execution regardless.
 */
export async function recordActionReceipt(
  action: ActionRecord,
  ctx: ReceiptContext,
  outcome: {
    status: ReceiptRecord["status"];
    resultSummary?: string | null;
    verification?: Record<string, unknown> | null;
    failureReason?: string | null;
    externalRef?: string | null;
  }
): Promise<ReceiptRecord | null> {
  const undo = undoOf(action);
  const insert: ReceiptInsert = {
    user_id: action.user_id,
    correlation_id: ctx.correlationId,
    action_id: action.id,
    mission_id: ctx.missionId ?? null,
    plan_hash: ctx.planHash,
    plan_version: ctx.planVersion ?? null,
    approved_by: ctx.approvedBy,
    authorization_method: ctx.authorizationMethod,
    category: action.category,
    integration: integrationOf(action),
    operation: operationOf(action),
    status: outcome.status,
    result_summary: bounded(outcome.resultSummary),
    verification: outcome.verification ?? null,
    failure_reason: bounded(outcome.failureReason),
    undo_available: undo.undo_available,
    undo_hint: undo.undo_hint,
    external_ref: bounded(outcome.externalRef, 200),
  };
  try {
    return await getStore().recordReceipt(insert);
  } catch (err) {
    logError(ctx.correlationId, err, { at: "recordActionReceipt", actionId: action.id });
    return null;
  }
}
