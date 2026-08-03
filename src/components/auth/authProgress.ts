/**
 * Pure progress math for the fill-as-you-type auth mark. No React, no DOM —
 * these map raw field values to a 0..1 "presence" that the animated Cosigno
 * mark reads. Kept pure (and total: never throws) so they can run on every
 * keystroke and be unit-tested in isolation. NONE of this is a security
 * boundary — the auth engine validates for real on submit. This only drives motion, so
 * it must never block typing or surface an error.
 */

/**
 * A permissive email-shape check — good enough to fully light the mark and
 * matches what most inputs accept: something before the @, an @, and a dotted
 * domain after. Not the real validator.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Email → 0..1. Charges like a battery as the address takes shape:
 *   empty                 → 0
 *   some characters       → 0.25
 *   reached the "@"       → 0.55
 *   started a domain      → 0.70
 *   dotted domain (a.b)   → 0.85
 *   full valid email      → 1
 */
export function emailProgress(email: string): number {
  const v = email.trim();
  if (!v) return 0;
  if (isValidEmail(v)) return 1;
  const at = v.indexOf("@");
  if (at === -1) return 0.25;
  const domain = v.slice(at + 1);
  if (!domain) return 0.55;
  if (!domain.includes(".")) return 0.7;
  return 0.85;
}

/**
 * Password → 0..1 by length toward a comfortable strength. The auth engine enforces the
 * real minimum on submit; here 8+ characters reads as "full presence".
 */
export function passwordProgress(password: string): number {
  if (!password) return 0;
  return Math.max(0, Math.min(1, password.length / 8));
}

/**
 * Ready to submit = a valid-looking email and a password long enough that the
 * mark is fully lit. The submit button saturates in sync with this.
 */
export function isReadyToSubmit(email: string, password: string): boolean {
  return isValidEmail(email) && password.length >= 8;
}
