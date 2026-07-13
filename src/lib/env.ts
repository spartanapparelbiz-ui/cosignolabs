/**
 * Production readiness gate. cosigno FAILS CLOSED: demo mode (in-memory
 * store, single dev user, offline planner) exists only for local
 * development and must be unreachable in production. Every entry point
 * (middleware, requireUser, getStore, planner) consults these checks at
 * call time so tests can exercise both modes.
 */

import { plannerConfigured } from "./agent/provider";

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

const REQUIRED_PRODUCTION_KEYS = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export function missingProductionKeys(): string[] {
  const missing: string[] = REQUIRED_PRODUCTION_KEYS.filter((k) => !process.env[k]);
  // The planner key is resolved through the provider (honors the legacy
  // env name for one release) rather than a bare env read.
  if (!plannerConfigured()) missing.push("PLANNER_API_KEY");
  return missing;
}

/** True when every key production requires is present. */
export function productionReady(): boolean {
  return missingProductionKeys().length === 0;
}

/**
 * Public sandbox mode — an OPT-IN way to let anyone try cosigno with no
 * sign-in, safely, on a deployment that isn't fully provisioned yet.
 *
 * It is deliberately a single explicit switch (COSIGNO_PUBLIC_MODE=1), never
 * automatic: a half-configured deployment still fails closed unless the
 * operator turns this on. When on AND the real key set is absent, protected
 * surfaces serve a per-visitor, in-memory, offline-planner, sandbox-only
 * workspace (isolated by a random guest id; no real accounts, data, money, or
 * external actions are ever reachable). The moment the real keys are present
 * (`productionReady()`), the real product takes over and this flag is ignored.
 */
export function publicSandboxEnabled(): boolean {
  return process.env.COSIGNO_PUBLIC_MODE === "1";
}

/** True when the app is actually serving the public sandbox (flag on, real keys absent). */
export function publicSandboxActive(): boolean {
  return publicSandboxEnabled() && !productionReady();
}

/**
 * True when the app may serve authenticated product surfaces:
 *  - development: always (demo mode is allowed)
 *  - production with the full key set: the real product
 *  - production with COSIGNO_PUBLIC_MODE=1: the public sandbox (see above)
 *  - otherwise: fails closed — every protected route serves 503.
 */
export function servingAllowed(): boolean {
  return !isProduction() || productionReady() || publicSandboxEnabled();
}
