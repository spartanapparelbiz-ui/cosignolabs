/**
 * Production readiness gate. cosigno FAILS CLOSED: demo mode (in-memory
 * store, single dev user, offline planner) exists only for local
 * development and must be unreachable in production. Every entry point
 * (middleware, requireUser, getStore, planner) consults these checks at
 * call time so tests can exercise both modes.
 */

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

const REQUIRED_PRODUCTION_KEYS = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PLANNER_API_KEY",
] as const;

export function missingProductionKeys(): string[] {
  return REQUIRED_PRODUCTION_KEYS.filter((k) => !process.env[k]);
}

/** True when every key production requires is present. */
export function productionReady(): boolean {
  return missingProductionKeys().length === 0;
}

/**
 * True when the app may serve authenticated product surfaces:
 *  - development: always (demo mode is allowed)
 *  - production: only with the full key set — otherwise every protected
 *    route serves 503 and nothing ever falls back to the demo user.
 */
export function servingAllowed(): boolean {
  return !isProduction() || productionReady();
}
