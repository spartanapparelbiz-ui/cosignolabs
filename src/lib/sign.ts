import type { ActionCategory, Tier } from "./types";

/**
 * Cosigno Sign — the authorization layers behind the product's defining
 * interaction. Three levels, presented everywhere as:
 *
 *   AUTO    (tier 1) — pre-authorized low-risk actions run automatically.
 *   APPROVE (tier 2) — one-click approval for routine writes.
 *   SIGN            — deliberate authorization: the user draws (or applies)
 *                     their signature before anything happens.
 *
 * SIGN is presentation + audit on top of the SAME server state machine: a
 * signed approval travels the identical engine door as a click, with the
 * same tier rules (tier 3 still requires its confirmation contract). The
 * drawn signature is the human interaction; the authenticated, hashed
 * authorization record written server-side is the underlying proof. A saved
 * visual signature is a product interaction — NOT automatically a legally
 * binding e-signature (legally binding flows belong with dedicated
 * e-signature providers).
 */

/** Outward-facing tier-2 categories that deserve the deliberate SIGN gate. */
const SIGN_CATEGORIES: ReadonlySet<ActionCategory> = new Set([
  "send_email",
  "post_content",
  "spend",
  "webhook",
] as ActionCategory[]);

/**
 * Whether an action's approval should use the SIGN interaction. All tier-3
 * (locked) actions sign; tier-2 actions sign when they leave the workspace
 * (external email, publishing, spend, webhooks). Internal tier-2 writes stay
 * one-click APPROVE. Pure presentation — the server contract is unchanged.
 */
export function signRequired(category: ActionCategory, tier: Tier): boolean {
  if (tier === 3) return true;
  return tier === 2 && SIGN_CATEGORIES.has(category);
}

export type AuthorizationMethod = "auto" | "approved" | "signed";
