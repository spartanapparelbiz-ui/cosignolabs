import { createHash } from "crypto";
import type { AuthorizationMethod } from "./sign";

/**
 * Server-side half of Cosigno Sign: the tamper-evident authorization record
 * sealed into the audit trail on every approval. Kept separate from
 * src/lib/sign.ts so client components can import signRequired() without
 * pulling node:crypto into the bundle.
 */

/** What gets sealed into every authorization record. */
export interface AuthorizationRecordInput {
  user_id: string;
  action_id: string;
  category: string;
  tier: number;
  method: AuthorizationMethod;
  /** Human display name attached to a signed approval ("Signed by …"). */
  signed_name: string | null;
  summary: string;
  payload: Record<string, unknown>;
  authorized_at: string;
}

/**
 * Tamper-evident hash over the exact scope of the authorization: user,
 * action, category/tier, method, the payload as approved, and the moment of
 * authorization. Stored in the approval event; recomputing it against the
 * stored fields exposes any after-the-fact edit. (Canonicalized key order so
 * the hash is stable across serializers.)
 */
export function authorizationHash(input: AuthorizationRecordInput): string {
  const canonical = JSON.stringify({
    action_id: input.action_id,
    authorized_at: input.authorized_at,
    category: input.category,
    method: input.method,
    payload: canonicalize(input.payload),
    signed_name: input.signed_name,
    summary: input.summary,
    tier: input.tier,
    user_id: input.user_id,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function canonicalize(value: unknown): unknown {
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
