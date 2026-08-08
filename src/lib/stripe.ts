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

/**
 * Where this deployment lives. Load-bearing: OAuth redirect URIs are built
 * from it, and a provider rejects the whole flow if the URI it receives isn't
 * the one registered — before any of our code runs.
 *
 * It used to fall back to a hardcoded domain, so every deploy that wasn't
 * cosignolabs.com sent people to cosignolabs.com and connecting failed with
 * nothing to see. Netlify already publishes the correct answer on every
 * build, so read that before guessing:
 *
 *   URL              the production domain of the site
 *   DEPLOY_PRIME_URL the branch/preview address of THIS deploy
 *
 * DEPLOY_PRIME_URL comes first so a deploy preview points at itself instead of
 * bouncing people to production. Both are set by the platform, not by anyone
 * making a request, so neither can be spoofed by a Host header.
 */
export function appUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.URL ||
    "https://cosignolabs.com";
  // A trailing slash would produce "…//api/connections/x/callback", which is a
  // different string to the provider and fails the exact-match check.
  return raw.trim().replace(/\/+$/, "");
}
