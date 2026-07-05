import Stripe from "stripe";

/**
 * Server-only Stripe client. Returns null when STRIPE_SECRET_KEY is absent —
 * callers treat that as "billing disabled" and the app runs with everyone on
 * free (never crashes). Never import this from client components.
 */
let cached: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  cached = key ? new Stripe(key, { apiVersion: "2026-06-24.dahlia" }) : null;
  return cached;
}

export function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://cosignolabs.com"
  );
}
