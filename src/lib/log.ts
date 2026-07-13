import { randomUUID } from "crypto";

/**
 * Structured logging. Security events are the attack signals — auth
 * failures, rate-limit hits, rejected privileged writes, tier clamps,
 * injection flags — and are emitted as single-line JSON for ingestion.
 */

export type SecurityEvent =
  | "auth_failure"
  | "serving_blocked"
  | "rate_limited"
  | "rejected_privileged_field"
  | "rejected_status_write"
  | "tier_clamped"
  | "injection_flagged"
  | "injection_approval_blocked"
  | "source_injection_detected"
  | "executor_category_denied"
  | "ssrf_blocked"
  | "usage_limit_hit"
  | "upgrade_required"
  | "global_budget_hit"
  | "turnstile_failed"
  | "invalid_input"
  | "account_deleted"
  | "refund_issued"
  | "refund_failed";

export function newRequestId(): string {
  return randomUUID().slice(0, 18);
}

export function logSecurity(
  event: SecurityEvent,
  fields: Record<string, unknown> = {}
): void {
  console.warn(
    JSON.stringify({
      level: "security",
      event,
      ts: new Date().toISOString(),
      ...fields,
    })
  );
}

export function logInfo(event: string, fields: Record<string, unknown> = {}): void {
  console.log(
    JSON.stringify({ level: "info", event, ts: new Date().toISOString(), ...fields })
  );
}

export function logError(
  requestId: string,
  err: unknown,
  fields: Record<string, unknown> = {}
): void {
  console.error(
    JSON.stringify({
      level: "error",
      requestId,
      ts: new Date().toISOString(),
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      ...fields,
    })
  );
}
