// The ONE canonical list of cosigno's environment services. Consumed by:
//   - scripts/check-env.mjs   (npm run check:env — build-time table)
//   - src/instrumentation.ts  (runtime startup log, one line per missing service)
//   - scripts/verify-deploy.mjs (context for failures)
// Values are NEVER printed anywhere — names + presence only.
//
// `gatesApp: true` means: if this service is incomplete in production, /app
// and the real API routes fail closed to a branded 503. Optional services
// degrade gracefully instead.

export const SERVICES = [
  {
    name: "PLANNER",
    vars: ["PLANNER_API_KEY"],
    // legacy names still accepted for one release
    legacy: ["ANTHROPIC_API_KEY"],
    gatesApp: true,
    breaks: "the operator can't plan — /app gates behind a 503",
    where: "your LLM provider dashboard",
  },
  {
    name: "SUPABASE",
    vars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
    gatesApp: true,
    breaks: "no database — /app gates behind a 503",
    where: "Supabase → Project Settings → API",
  },
  {
    name: "CLERK",
    vars: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"],
    gatesApp: true,
    breaks: "no sign-in — /app gates behind a 503",
    where: "Clerk → API Keys",
  },
  {
    name: "UPSTASH",
    vars: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    gatesApp: false,
    breaks: "rate limits fall back to in-memory (per-instance) — fine at low traffic",
    where: "Upstash → Redis → REST API",
  },
  {
    name: "TURNSTILE",
    vars: ["NEXT_PUBLIC_TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"],
    gatesApp: false,
    breaks: "the beta form skips the captcha (still validated server-side)",
    where: "Cloudflare → Turnstile",
  },
  {
    name: "STRIPE",
    vars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    gatesApp: false,
    breaks: "billing/checkout disabled — everyone stays on free",
    where: "Stripe → Developers → API keys (+ Webhooks)",
  },
  {
    name: "STRIPE_PUBLISHABLE",
    vars: ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
    gatesApp: false,
    breaks: "the embedded card checkout is unavailable — falls back to hosted Checkout",
    where: "Stripe → Developers → API keys (publishable)",
  },
  {
    name: "STRIPE_PRICES",
    vars: [
      "STRIPE_PRICE_PRO_MONTHLY",
      "STRIPE_PRICE_PRO_ANNUAL",
      "STRIPE_PRICE_MAX_MONTHLY",
      "STRIPE_PRICE_MAX_ANNUAL",
    ],
    gatesApp: false,
    breaks: "paid plans can't be purchased — generate with scripts/stripe-setup.ts",
    where: "created by `npx tsx scripts/stripe-setup.ts`",
  },
];

/** present = every var in the service has a non-empty value (or a legacy fallback). */
export function serviceStatus(env = process.env) {
  return SERVICES.map((s) => {
    const missing = s.vars.filter((v) => !env[v]);
    const legacyFilled =
      missing.length > 0 && s.legacy && s.legacy.some((v) => env[v]);
    const present = missing.length === 0 || Boolean(legacyFilled);
    return { ...s, present, missing, legacyFilled: Boolean(legacyFilled) };
  });
}

/** In production, /app fails closed if any app-gating service is incomplete. */
export function appGated(env = process.env) {
  return serviceStatus(env).some((s) => s.gatesApp && !s.present);
}
