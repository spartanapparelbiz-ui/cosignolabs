import { NextRequest, NextResponse } from "next/server";
import { supabaseAuthConfigured, supabaseServer } from "@/lib/supabaseAuth/server";
import { safeRedirect } from "@/components/auth/authRedirect";
import {
  classifyConfirm,
  failureFromProviderCode,
  type ConfirmFailure,
} from "@/lib/supabaseAuth/confirmFlow";
import { confirmDiagnosis } from "@/lib/supabaseAuth/confirmDiagnosis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where every Supabase email link lands: signup confirmation, password
 * recovery, email change, magic link, invite.
 *
 * Supabase delivers the credential in one of four shapes depending on the
 * email template and flow type. This route accepts all of them, so the app
 * works whether the project still has Supabase's DEFAULT templates or the
 * custom ones — configuration no longer has to be perfect for sign-up to
 * complete. See src/lib/supabaseAuth/confirmFlow.ts for the decision table.
 *
 * The one shape a server cannot see is the implicit flow's URL fragment
 * (#access_token=…), which browsers never transmit. That case is handed to
 * /auth/continue, which reads it client-side. Browsers preserve the fragment
 * across a redirect, so it survives the hop.
 *
 * Nothing here fails silently. Every unhappy path lands on /auth/problem with
 * a reason the user can act on, and the operator-facing cause is logged.
 */

function problem(req: NextRequest, reason: ConfirmFailure, next: string) {
  // The precise cause names configuration, so it goes to the server log where
  // an operator will find it — never to the customer's screen in production.
  // eslint-disable-next-line no-console
  console.warn(`[cosigno auth] confirmation failed (${reason}) — ${confirmDiagnosis(reason)}`);
  const url = new URL("/auth/problem", req.url);
  url.searchParams.set("reason", reason);
  if (next !== "/app") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const next = safeRedirect(url.searchParams.get("next") ?? undefined);

  if (!supabaseAuthConfigured()) return problem(req, "not_configured", next);

  const flow = classifyConfirm(url.searchParams);
  const supabase = await supabaseServer();

  switch (flow.kind) {
    case "provider_error":
      return problem(req, failureFromProviderCode(flow.code), next);

    case "token_hash": {
      const { error } = await supabase.auth.verifyOtp({
        type: flow.type,
        token_hash: flow.tokenHash,
      });
      if (error) return problem(req, reasonFor(error), next);
      return NextResponse.redirect(new URL(destFor(flow.type, next), req.url));
    }

    case "legacy_token": {
      const { error } = await supabase.auth.verifyOtp({
        type: flow.type,
        token: flow.token,
        email: flow.email,
      });
      if (error) return problem(req, reasonFor(error), next);
      return NextResponse.redirect(new URL(destFor(flow.type, next), req.url));
    }

    case "code": {
      // PKCE. The destination is carried by `next` (the reset flow asks for
      // /auth/reset when it sends the email), so there is no type to branch on.
      const { error } = await supabase.auth.exchangeCodeForSession(flow.code);
      if (error) return problem(req, reasonFor(error), next);
      return NextResponse.redirect(new URL(next, req.url));
    }

    case "none": {
      // Either an implicit-flow fragment the browser still holds, or a link
      // with no credential at all. /auth/continue can tell the two apart; the
      // server cannot.
      const cont = new URL("/auth/continue", req.url);
      if (next !== "/app") cont.searchParams.set("next", next);
      return NextResponse.redirect(cont);
    }
  }
}

/** Recovery always continues to the set-a-new-password screen. */
function destFor(type: string, next: string): string {
  return type === "recovery" ? "/auth/reset" : next;
}

/** Map a verification error to the reason the user sees. */
function reasonFor(err: unknown): ConfirmFailure {
  const code = (err as { code?: string })?.code ?? "";
  if (code === "otp_expired" || code === "otp_disabled") return "expired";
  if (code === "access_denied") return "access_denied";
  return "verify_failed";
}
