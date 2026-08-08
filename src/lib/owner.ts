/**
 * THE OWNER OVERRIDE — server-only, and invisible from the outside.
 *
 * WHERE THE OVERRIDE HAPPENS
 * --------------------------
 * This module answers exactly one question — "is this user id an owner?" —
 * and four places act on the answer:
 *
 *   1. `getUserPlan()`  (src/lib/billing.ts)      → the internal Owner plan,
 *      returned BEFORE any subscription row is read. Every plan-driven gate
 *      in the product (actions, missions, connections, custom MCP, CSV
 *      export, model routing, and any future paid feature) reads its limits
 *      from there, so overriding this one function covers all of them at once.
 *   2. `enforceLimit()` (src/lib/ratelimit.ts)    → per-user rate windows are
 *      skipped for owners.
 *   3. `enforceGlobalPlanningBudget()` (same file) → the shared daily planner
 *      ceiling doesn't apply to, and isn't consumed by, owner traffic.
 *   4. `missionBudget()` (src/lib/missions/missionBudget.ts) → owner missions
 *      run with no action budget.
 *
 * THE RULES THIS MODULE KEEPS
 * ---------------------------
 *  - SERVER ONLY. Nothing here is importable from a client component: it
 *    reads `process.env.OWNER_EMAILS` and the server-side Supabase session,
 *    neither of which exists in the browser.
 *  - THE LIST NEVER LEAVES THE SERVER. No function returns an owner address,
 *    no owner address is ever logged, and no API response carries one. The
 *    only value that crosses a boundary is a boolean, and even that stays
 *    server-side (see billing.ts — `isOwner` is never serialized).
 *  - INVISIBLE. The Owner plan presents publicly as the top published plan
 *    (see OWNER_PLAN in plans.ts), so no surface can render the word "owner"
 *    and a normal user has nothing to notice.
 *  - OFF BY DEFAULT. With OWNER_EMAILS unset, every function here short-
 *    circuits to `false` before doing any work, and the product behaves
 *    exactly as it did before this file existed.
 */

/** The owner list, parsed from env at call time so tests can stub it. */
export function ownerEmails(): string[] {
  const raw = process.env.OWNER_EMAILS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** True when an owner list is configured at all. The cheap early exit. */
export function ownerOverrideConfigured(): boolean {
  return ownerEmails().length > 0;
}

/**
 * Is this address an owner address? Comparison is trimmed + lowercased on
 * both sides, so "  Nick@Example.com " in the env var and "nick@example.com"
 * on the session are the same person.
 */
export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = ownerEmails();
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
}

/**
 * userId → email, cached briefly.
 *
 * getUserPlan() and enforceLimit() run on nearly every request, so this must
 * not turn into an auth round-trip per call. Both hits and misses are cached:
 * a normal user's "not an owner" answer is the common case and deserves the
 * same short-circuit an owner gets.
 */
const EMAIL_TTL_MS = 5 * 60_000;
/** Bounded so a long-lived instance can't accumulate an entry per caller. */
const EMAIL_CACHE_MAX = 500;
const emailCache = new Map<string, { email: string | null; at: number }>();

/**
 * A Supabase auth user id, which is a UUID.
 *
 * This gate matters more than it looks. `enforceLimit()` asks the owner
 * question about whatever it keys its window by, and two of those windows are
 * keyed by IP ADDRESS (the anonymous landing sandbox, the beta form). Without
 * this check, every anonymous visitor would send their IP to the auth admin
 * API to be looked up as a user id — a network round trip, per request, that
 * could only ever answer "no". Ids that aren't UUIDs (demo, guest, test) are
 * still resolvable through the session path above, which needs no lookup.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The signed-in user's own email, but ONLY when the id being asked about is
 * the id of the request's own session. A request can never resolve somebody
 * else's identity through this path.
 *
 * Throws harmlessly outside a request scope (background runs, cron, the
 * mission ticker have no cookies) — that's what the catch is for; the
 * service-role lookup below covers those.
 */
async function sessionEmail(userId: string): Promise<string | null> {
  try {
    const { getUserId, getUserEmail } = await import("./auth");
    const current = await getUserId();
    if (!current || current !== userId) return null;
    return await getUserEmail();
  } catch {
    return null;
  }
}

/** Background/cron path: look the user up with the service-role key. */
async function adminEmail(userId: string): Promise<string | null> {
  if (!UUID.test(userId)) return null;
  try {
    const { authUserEmail } = await import("./supabaseAuth/admin");
    return await authUserEmail(userId);
  } catch {
    return null;
  }
}

async function emailForUser(userId: string): Promise<string | null> {
  const cached = emailCache.get(userId);
  if (cached && Date.now() - cached.at < EMAIL_TTL_MS) return cached.email;

  const email = (await sessionEmail(userId)) ?? (await adminEmail(userId));
  if (emailCache.size >= EMAIL_CACHE_MAX) emailCache.clear();
  emailCache.set(userId, { email, at: Date.now() });
  return email;
}

/**
 * THE OWNER CHECK. The single question every override site asks.
 *
 * Fails closed in both directions that matter: no env var → false without
 * touching auth at all; no resolvable email → false. There is no input a
 * client can send that reaches this function — the id comes from a verified
 * session or from a stored row, never from a request body.
 */
export async function isOwnerUser(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  if (!ownerOverrideConfigured()) return false;
  return isOwnerEmail(await emailForUser(userId));
}

/** Test hook: drops the userId → email cache. */
export function resetOwnerCacheForTests(): void {
  emailCache.clear();
}
