import { createClient } from "@supabase/supabase-js";

/**
 * Service-role auth administration — SERVER ONLY. Used exactly once: account
 * deletion must also delete the sign-in user so the email frees up for
 * re-signup. The service-role key is read here at call time and never leaves
 * the server.
 */

export async function deleteAuthUser(userId: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("auth admin is not configured");
  }
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.auth.admin.deleteUser(userId);
  // Already gone (a retry after partial success) counts as success.
  if (error && error.status !== 404) throw error;
}
