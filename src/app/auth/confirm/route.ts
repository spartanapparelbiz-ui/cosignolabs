import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseAuthConfigured, supabaseServer } from "@/lib/supabaseAuth/server";
import { safeRedirect } from "@/components/auth/authRedirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where Supabase's email links land: signup confirmation, password recovery,
 * email change. Verifies the token server-side (session cookies are set on
 * the redirect) and forwards to the intended destination — validated against
 * our internal-path allowlist, never an external URL.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirect(url.searchParams.get("next") ?? undefined);

  if (!supabaseAuthConfigured() || !tokenHash || !type) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    // Expired/used link: land on sign-in with the destination preserved —
    // signing in normally still gets them where they were headed.
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set("redirect_url", next);
    return NextResponse.redirect(signIn);
  }
  // Recovery links continue to the set-new-password screen.
  const dest = type === "recovery" ? "/auth/reset" : next;
  return NextResponse.redirect(new URL(dest, req.url));
}
