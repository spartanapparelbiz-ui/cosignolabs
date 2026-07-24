import { isProduction, publicSandboxActive } from "./env";
import { GUEST_COOKIE, GUEST_HEADER, isGuestId } from "./publicMode";

/** True when live Supabase authentication is configured. */
export function authConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export const DEMO_USER_ID = "demo-user";

/**
 * The current guest's id in the public sandbox, or null. Read from the request
 * header the edge middleware forwards (so the first request already resolves),
 * falling back to the cookie. Validated against the reserved guest namespace —
 * a forged value never becomes a user id.
 */
export async function guestUserId(): Promise<string | null> {
  const { headers, cookies } = await import("next/headers");
  const fromHeader = (await headers()).get(GUEST_HEADER);
  if (isGuestId(fromHeader)) return fromHeader;
  const fromCookie = (await cookies()).get(GUEST_COOKIE)?.value;
  return isGuestId(fromCookie) ? fromCookie : null;
}

/**
 * Resolve the current user id on the server.
 *  - Auth configured: the verified Supabase session's user id (a UUID), or
 *    null (→ 401). The id is also the RLS subject: auth_uid() = jwt sub.
 *  - Auth missing + public sandbox active: a per-visitor guest id (isolated,
 *    in-memory, sandbox-only) so anyone can try cosigno without an account.
 *  - Auth missing in DEVELOPMENT: a single demo user for the local loop.
 *  - Auth missing in PRODUCTION without the sandbox: always null (fail closed).
 */
export async function getUserId(): Promise<string | null> {
  if (!authConfigured()) {
    if (publicSandboxActive()) return guestUserId();
    return isProduction() ? null : DEMO_USER_ID;
  }
  const { supabaseUser } = await import("./supabaseAuth/server");
  const user = await supabaseUser();
  return user?.id ?? null;
}

/**
 * The signed-in user's verified email (lowercased) — used to match workspace
 * invites. Same fail-closed shape as getUserId: demo email in development
 * only, null in production without auth.
 */
export async function getUserEmail(): Promise<string | null> {
  if (!authConfigured()) {
    if (publicSandboxActive()) {
      const id = await guestUserId();
      return id ? `${id}@guest.cosigno.local` : null;
    }
    return isProduction() ? null : "demo@cosigno.local";
  }
  const { supabaseUser } = await import("./supabaseAuth/server");
  const user = await supabaseUser();
  return user?.email ? user.email.toLowerCase() : null;
}
