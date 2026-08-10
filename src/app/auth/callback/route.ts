import { NextRequest, NextResponse } from "next/server";
import { supabaseAuthConfigured, supabaseServer } from "@/lib/supabaseAuth/server";
import { safeRedirect } from "@/components/auth/authRedirect";
import { failureFromProviderCode, type ConfirmFailure } from "@/lib/supabaseAuth/confirmFlow";
import { confirmDiagnosis } from "@/lib/supabaseAuth/confirmDiagnosis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth (e.g. Google) redirect target: exchanges the auth code for a session
 * (cookies set on the redirect) and forwards to the intended destination —
 * validated against our internal-path allowlist.
 *
 * A failed exchange used to land on /sign-in with nothing said, which looks
 * identical to "you aren't signed in" and told the user nothing. Failures now
 * name themselves on /auth/problem, and the cause is logged for operators.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const next = safeRedirect(url.searchParams.get("next") ?? undefined);

  const fail = (reason: ConfirmFailure) => {
    // eslint-disable-next-line no-console
    console.warn(`[cosigno auth] oauth callback failed (${reason}) — ${confirmDiagnosis(reason)}`);
    const problem = new URL("/auth/problem", req.url);
    problem.searchParams.set("reason", reason);
    if (next !== "/app") problem.searchParams.set("next", next);
    return NextResponse.redirect(problem);
  };

  if (!supabaseAuthConfigured()) return fail("not_configured");

  // The provider can refuse before we ever see a code (consent declined,
  // client misconfigured). It says so in the query string.
  const providerError = url.searchParams.get("error_code") ?? url.searchParams.get("error");
  if (providerError) return fail(failureFromProviderCode(providerError));

  const code = url.searchParams.get("code");
  if (!code) return fail("no_credential");

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const errCode = (error as { code?: string }).code ?? "";
    return fail(errCode === "access_denied" ? "access_denied" : "verify_failed");
  }
  return NextResponse.redirect(new URL(next, req.url));
}
