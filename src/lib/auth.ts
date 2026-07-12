import { isProduction } from "./env";

export function clerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
  );
}

export const DEMO_USER_ID = "demo-user";

/**
 * Resolve the current user id on the server.
 *  - Clerk configured: the verified Clerk session's user id, or null (→ 401).
 *  - Clerk missing in DEVELOPMENT only: a single demo user so the loop can
 *    be exercised locally.
 *  - Clerk missing in PRODUCTION: always null. Never the demo user — the
 *    requireUser gate 503s before this is reached, and even if it didn't,
 *    this fails closed.
 */
export async function getUserId(): Promise<string | null> {
  if (!clerkConfigured()) {
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
