import { getStore } from "./store";
import { logError, logSecurity, newRequestId, type SecurityEvent } from "./log";
import type { SecurityEventSeverity } from "./types";

/**
 * Durable, user-visible security events — the data behind the Security
 * Center. Complements (never replaces) the structured console security log.
 *
 * FAIL-SAFE BY DESIGN: recording an event can never block, break, or bypass
 * the operation being recorded. A storage failure is logged server-side and
 * swallowed. Callers must not await-and-branch on this function's success.
 *
 * NEVER put in `detail`: passwords, session tokens, API keys, OAuth tokens,
 * full message bodies, or payload dumps. Bounded, factual context only.
 */

export type UserSecurityEvent =
  | "approval_created"
  | "approval_signed"
  | "approval_revoked"
  | "approval_expired"
  | "execution_succeeded"
  | "execution_failed"
  | "execution_rejected"
  | "plan_hash_mismatch"
  | "room_created"
  | "room_approval"
  | "room_rejection"
  | "room_changes_requested"
  | "room_approval_revoked"
  | "room_reapproval_required"
  | "room_expired"
  | "hold_engaged"
  | "hold_released"
  | "emergency_stop_engaged"
  | "emergency_stop_released"
  | "scheduled_run_skipped_on_hold"
  | "oauth_connected"
  | "oauth_disconnected"
  | "oauth_state_rejected"
  | "session_revoked"
  | "all_sessions_revoked"
  | "rate_limited"
  | "webhook_verification_failed"
  | "webhook_replay_blocked"
  | "injection_flagged"
  | "injection_approval_blocked"
  | "ssrf_blocked"
  | "permission_rule_changed"
  | "tier_changed"
  | "standing_order_changed"
  | "data_exported"
  | "account_deleted";

const HIGH_RISK: ReadonlySet<UserSecurityEvent> = new Set([
  "plan_hash_mismatch",
  "webhook_verification_failed",
  "injection_approval_blocked",
  "ssrf_blocked",
  "emergency_stop_engaged",
  "execution_rejected",
  "oauth_state_rejected",
] as UserSecurityEvent[]);

const SEVERITY_DEFAULT: Partial<Record<UserSecurityEvent, SecurityEventSeverity>> = {
  plan_hash_mismatch: "critical",
  webhook_verification_failed: "warning",
  injection_approval_blocked: "warning",
  injection_flagged: "warning",
  ssrf_blocked: "warning",
  emergency_stop_engaged: "notice",
  execution_rejected: "warning",
  oauth_state_rejected: "warning",
  approval_expired: "notice",
  account_deleted: "notice",
  data_exported: "notice",
  all_sessions_revoked: "notice",
};

export interface RecordEventOptions {
  severity?: SecurityEventSeverity;
  correlationId?: string | null;
  detail?: Record<string, unknown>;
}

/**
 * Record a durable security event for a user. Returns the correlation id so
 * callers can stamp it onto receipts/logs. Never throws.
 */
export async function recordSecurityEvent(
  userId: string,
  event: UserSecurityEvent,
  opts: RecordEventOptions = {}
): Promise<string> {
  const correlationId = opts.correlationId ?? newRequestId();
  try {
    await getStore().recordSecurityEvent({
      user_id: userId,
      event,
      severity: opts.severity ?? SEVERITY_DEFAULT[event] ?? "info",
      correlation_id: correlationId,
      detail: opts.detail ?? {},
    });
  } catch (err) {
    // Fail safe: never block the guarded operation; keep the console signal.
    logError(correlationId, err, { at: "recordSecurityEvent", event });
  }
  if (HIGH_RISK.has(event)) {
    void alertHighRisk(userId, event, correlationId);
  }
  return correlationId;
}

/**
 * Optional operator alerting hook: POST a minimal summary of high-risk events
 * to SECURITY_ALERT_WEBHOOK (an operator-controlled HTTPS endpoint). Contains
 * event name, severity class, correlation id, and a hashed-down user marker —
 * never secrets, tokens, payloads, or message content. Absent env → no-op.
 * Best-effort with a hard timeout; failures are logged and swallowed.
 */
async function alertHighRisk(
  userId: string,
  event: UserSecurityEvent,
  correlationId: string
): Promise<void> {
  const url = process.env.SECURITY_ALERT_WEBHOOK;
  if (!url || !url.startsWith("https://")) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "cosigno",
        event,
        correlation_id: correlationId,
        // A stable but non-reversible user marker (first 12 hex of sha-256).
        user: (await import("crypto"))
          .createHash("sha256")
          .update(userId)
          .digest("hex")
          .slice(0, 12),
        at: new Date().toISOString(),
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  } catch (err) {
    logError(correlationId, err, { at: "alertHighRisk" });
  }
}

/** Mirror a console-level security signal into the durable log when it maps. */
export function mirrorSecuritySignal(
  userId: string | null,
  event: SecurityEvent,
  fields: Record<string, unknown> = {}
): void {
  logSecurity(event, fields);
  if (!userId) return;
  const mapped: Partial<Record<SecurityEvent, UserSecurityEvent>> = {
    rate_limited: "rate_limited",
    injection_flagged: "injection_flagged",
    injection_approval_blocked: "injection_approval_blocked",
    ssrf_blocked: "ssrf_blocked",
  };
  const durable = mapped[event];
  if (durable) void recordSecurityEvent(userId, durable, { detail: fields });
}
