export function clerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
  );
}

export const DEMO_USER_ID = "demo-user";

/**
 * Resolve the current user id on the server. With Clerk configured this is
 * the authenticated Clerk user (or null → route returns 401). Without Clerk
 * (local development / demo mode) every request maps to a single demo user
 * so the whole approval loop can be exercised out of the box.
 */
export async function getUserId(): Promise<string | null> {
  if (!clerkConfigured()) return DEMO_USER_ID;
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  return userId ?? null;
}
