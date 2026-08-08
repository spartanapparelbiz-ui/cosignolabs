import { createClient } from "@supabase/supabase-js";

/**
 * Service-role auth administration — SERVER ONLY. Two uses, both of which
 * need to read or write the sign-in user rather than product data:
 *  - account deletion must also delete the sign-in user so the email frees
 *    up for re-signup;
 *  - resolving a user id back to its verified email for work that runs
 *    OUTSIDE a request (cron, the mission ticker, automations), where there
 *    is no session to read.
 * The service-role key is read here at call time and never leaves the server.
 */

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("auth admin is not configured");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function deleteAuthUser(userId: string): Promise<void> {
  const { error } = await adminClient().auth.admin.deleteUser(userId);
  // Already gone (a retry after partial success) counts as success.
  if (error && error.status !== 404) throw error;
}

/**
 * The verified email on a sign-in user, lowercased, or null.
 *
 * Read-only and fail-closed: an unconfigured deployment, an unknown id, or
 * any error from the auth API all resolve to null rather than throwing, so a
 * caller can treat "we don't know who this is" as the ordinary case.
 */
export async function authUserEmail(userId: string): Promise<string | null> {
  try {
    const { data, error } = await adminClient().auth.admin.getUserById(userId);
    if (error) return null;
    return data.user?.email ? data.user.email.toLowerCase() : null;
  } catch {
    return null;
  }
}
