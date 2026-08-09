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
    breaks: "no database or sign-in — /app gates behind a 503",
    where: "Supabase → Project Settings → API",
  },
  {
    name: "SCHEDULER",
    vars: ["CRON_SECRET"],
    gatesApp: false,
    // /app still serves without it, so it isn't app-gating — but calling it
    // "optional" undersells it to the point of being wrong. The product's
    // core promise (work continues after you close the tab) needs this.
    note: "required for background work",
    breaks:
      "NOTHING RUNS IN THE BACKGROUND — missions advance only while their owner has the page open, and recurring automations never fire at all. Set any long random string; the deployment's scheduled function reads the same value",
    where: "invent one — e.g. `openssl rand -hex 32`",
  },
  {
    name: "CONNECTORS",
    // Not an all-or-nothing service: each pair independently switches one
    // connector from "coming soon" to connectable. Listed together because a
    // deployment with none of them has an operator that cannot touch anything.
    vars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    gatesApp: false,
    note: "required to connect any tool",
    breaks:
      "every connector shows “coming soon” and its connect button stays disabled — the operator has no tools to act with. GOOGLE_* covers Gmail + Calendar + Drive; GITHUB_*, SLACK_*, NOTION_*, MICROSOFT_* each add one more",
    where: "Google Cloud Console → APIs & Services → Credentials → OAuth client",
  },
  {
    name: "UPSTASH",
    vars: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    gatesApp: false,
    breaks: "rate limits + the global plan budget live in EACH instance's memory — safe on ONE replica, but with 2+ replicas a client hitting different instances multiplies its limit. Set this OR pin to a single replica",
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
    name: "OWNER",
    vars: ["OWNER_IDS"],
    gatesApp: false,
    note: "optional — internal accounts only",
    breaks:
      "nobody gets the owner override, so every account (including yours) is billed like a customer. Set it to a comma-separated list of Supabase Auth user ids — sign in and open /api/whoami to read yours",
    where: "Supabase → Authentication → Users → the UID column",
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

/**
 * Opt-in public sandbox: when COSIGNO_PUBLIC_MODE=1 and the app is otherwise
 * gated, /app serves a per-visitor, in-memory, offline, sandbox-only workspace
 * instead of a 503 — so anyone can try cosigno with no sign-in.
 */
export function publicSandbox(env = process.env) {
  return env.COSIGNO_PUBLIC_MODE === "1";
}
