import { createHash } from "crypto";

/**
 * Canonical plan representation + hash — the binding between what a user
 * approved and what the dispatcher is allowed to execute.
 *
 * The hash is computed server-side over a canonicalized (sorted-key, stable)
 * serialization of the action payload. It is:
 *   - sealed into the authorization record at approval time,
 *   - re-verified by the execution dispatcher immediately before dispatch,
 *   - the value CoSign Room approvals bind to (any material change produces
 *     a different hash and voids prior approvals).
 *
 * Nothing a client or a model asserts can substitute for it: only the stored
 * payload row feeds this function.
 */

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Stable sha-256 over the canonical form of a plan payload. */
export function planHash(payload: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
}

/**
 * Idempotency key for an external side effect: stable per (action, attempt
 * scope), so a retried dispatch of the same approved plan cannot double-send,
 * while a genuinely new action always gets a fresh key.
 */
export function idempotencyKey(actionId: string, scope = "execute"): string {
  return createHash("sha256")
    .update(`cosigno:${actionId}:${scope}`)
    .digest("hex")
    .slice(0, 40);
}
