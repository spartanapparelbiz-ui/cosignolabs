import { NextRequest, NextResponse } from "next/server";
import { supabaseAuthConfigured, supabaseServer } from "@/lib/supabaseAuth/server";
import { safeRedirect } from "@/components/auth/authRedirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth (e.g. Google) redirect target: exchanges the auth code for a session
 * (cookies set on the redirect) and forwards to the intended destination —
 * validated against our internal-path allowlist.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeRedirect(url.searchParams.get("next") ?? undefined);

  if (supabaseAuthConfigured() && code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, req.url));
  }
  const signIn = new URL("/sign-in", req.url);
  signIn.searchParams.set("redirect_url", next);
  return NextResponse.redirect(signIn);
}
