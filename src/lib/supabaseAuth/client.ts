"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase AUTH client (anon key only — safe for the bundle;
 * RLS applies to anything it could touch). Used by the auth screens and the
 * sign-out controls. Data access still goes through our API routes.
 */

export function supabaseAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/** Sign out (when live auth is configured) and land back on the homepage. */
export async function signOutEverywhere(): Promise<void> {
  if (supabaseAuthConfigured()) {
    try {
      await supabaseBrowser().auth.signOut();
    } catch {
      // the redirect below still clears the surface
    }
  }
  window.location.href = "/";
}
