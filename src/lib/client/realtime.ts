"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/**
 * Browser-side Supabase client (anon key) used ONLY for realtime change
 * notifications on the actions table — reads and writes all go through the
 * app's API routes. Returns null when Supabase isn't configured (demo mode),
 * in which case the workspace falls back to polling.
 */
export async function getRealtimeClient(): Promise<SupabaseClient | null> {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    client = null;
    return client;
  }
  const { createClient } = await import("@supabase/supabase-js");
  client = createClient(url, anon);
  return client;
}
