import { logSecurity } from "./log";

/**
 * The owner override — SERVER ONLY.
 *
 * A small number of accounts (the people who run cosigno) get full access
 * without a Stripe subscription. The override is keyed on the IMMUTABLE
 * Supabase Auth user id, and on nothing else.
 *
 * WHY NOT EMAIL. An email address is not a stable identity in this app, by
 * design and in two separate ways:
 *   1. Account deletion deliberately releases the address back to the signup
 *      pool — api/account/route.ts deletes the auth user precisely "so the
 *      email frees up for re-signup". An email-keyed override would survive
 *      that and hand owner rights to whoever registers the address next.
 *   2. Supabase supports email change, which this app already handles
 *      (auth/confirm/route.ts covers the "email change" link type). An owner
 *      who updates their address would silently lose the override.
 * A Supabase user id is minted once by gen_random_uuid() and is never
 * reissued, so it cannot move between people. That is the whole argument.
 *
 * CONFIGURATION. OWNER_IDS is a comma-separated list of Supabase Auth user
 * ids (UUIDs):
 *   OWNER_IDS=3f9a2c1e-7b0d-4a5f-9c31-2e6b8d4f0a17,8c4d1a90-2f63-4e18-b7aa-51d0c93e6b24
 * Unset or empty means no owners — the correct default on every deployment
 * you have not explicitly configured.
 *
 * NOT A SECRET, and deliberately NOT compared in constant time: a user id is
 * an identifier, not a credential. The credential is the verified session that
 * produced it (supabaseUser() → getUserId() → requireUser()); by the time an
 * id reaches this module it is already authenticated. Timing here reveals
 * nothing an attacker could use without that session, so constant-time
 * comparison would be cargo cult rather than defense.
 */

/**
 * Canonical UUID shape: 8-4-4-4-12 hex. Version and variant nibbles are not
 * pinned — Supabase issues v4 today, and rejecting a future version would be a
 * silent lockout rather than a security gain.
 */
const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Parse OWNER_IDS into the set of owner user ids.
 *
 * Entries that are not UUID-shaped are DROPPED rather than compared. That is
 * what makes "never match on an email again" a property of the code instead of
 * a promise in a comment: an address pasted into OWNER_IDS cannot match a
 * user id, because it can never enter the set in the first place. The same
 * holds for a Clerk-shaped `user_...` id left over from the old provider, and
 * for this app's reserved non-UUID identities (`demo-user`, `guest_<hex>`),
 * which therefore can never be granted owner even by a misconfiguration.
 *
 * A rejected entry is logged by POSITION and reason only — the value is never
 * printed, since an operator may well have pasted something sensitive.
 *
 * Read at call time rather than cached at import, matching how every other
 * env-dependent check in this codebase behaves (servingAllowed, signingKey,
 * the admin-key compare). It keeps the value changeable without a cold start
 * and keeps the function testable; the string is short and the parse trivial.
 */
export function ownerIds(): Set<string> {
  const raw = process.env.OWNER_IDS;
  if (!raw) return new Set();

  const ids = new Set<string>();
  raw.split(",").forEach((entry, index) => {
    const id = entry.trim().toLowerCase();
    if (!id) return;
    if (!USER_ID_RE.test(id)) {
      logSecurity("owner_id_rejected", {
        index,
        reason: id.includes("@") ? "looks_like_an_email" : "not_a_user_id",
      });
      return;
    }
    ids.add(id);
  });
  return ids;
}

/**
 * Is this authenticated user an owner?
 *
 * Pass the value from requireUser() / getUserId() — the verified Supabase
 * session's user id. Never pass anything a client supplied: this function
 * trusts its argument completely, because every caller upstream of it has
 * already proven the session.
 */
export function isOwner(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return ownerIds().has(userId.toLowerCase());
}
