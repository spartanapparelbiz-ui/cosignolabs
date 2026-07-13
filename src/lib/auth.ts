import { isProduction, publicSandboxActive } from "./env";
import { GUEST_COOKIE, GUEST_HEADER, isGuestId } from "./publicMode";

export function clerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
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
 *  - Clerk configured: the verified Clerk session's user id, or null (→ 401).
 *  - Clerk missing + public sandbox active: a per-visitor guest id (isolated,
 *    in-memory, sandbox-only) so anyone can try cosigno without an account.
 *  - Clerk missing in DEVELOPMENT: a single demo user for the local loop.
 *  - Clerk missing in PRODUCTION without the sandbox: always null (fail closed).
 */
export async function getUserId(): Promise<string | null> {
  if (!clerkConfigured()) {
    if (publicSandboxActive()) return guestUserId();
    return isProduction() ? null : DEMO_USER_ID;
  }
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  return userId ?? null;
}

/**
 * The signed-in user's verified email (lowercased) — used to match workspace
 * invites. Same fail-closed shape as getUserId: demo email in development
 * only, null in production without Clerk.
 */
export async function getUserEmail(): Promise<string | null> {
  if (!clerkConfigured()) {
    if (publicSandboxActive()) {
      const id = await guestUserId();
      return id ? `${id}@guest.cosigno.local` : null;
    }
    return isProduction() ? null : "demo@cosigno.local";
  }
  const { currentUser } = await import("@clerk/nextjs/server");
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;
  return email ? email.toLowerCase() : null;
}
