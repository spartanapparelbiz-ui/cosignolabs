/**
 * Client-safe Stripe config. Only the PUBLISHABLE key and feature flags —
 * never the secret key. The publishable key is safe to ship to the browser
 * (that is its entire purpose). When it's absent, the embedded Elements flow
 * is unavailable and callers fall back to hosted Checkout.
 */

export function publishableKey(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null;
}

/**
 * Feature flag for the embedded Elements checkout. Defaults ON when a
 * publishable key exists; set NEXT_PUBLIC_CHECKOUT_EMBEDDED="0" to force the
 * hosted-Checkout fallback (e.g. for regions/payment methods Elements
 * config doesn't cover).
 */
export function embeddedCheckoutEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_CHECKOUT_EMBEDDED === "0") return false;
  return Boolean(publishableKey());
}
