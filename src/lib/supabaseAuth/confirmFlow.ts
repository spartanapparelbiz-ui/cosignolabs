import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * What kind of confirmation link just arrived, and what went wrong when one
 * fails. Pure and total — no Supabase client, no cookies, no I/O — so the
 * whole decision table is unit-testable without a browser or a network.
 *
 * Supabase can deliver a confirmation four different ways depending on the
 * email template, the flow type, and the project's age. Only one of them was
 * ever handled here, which made a correct-looking dashboard produce a silent
 * bounce to /sign-in. We now accept all of them:
 *
 *   token_hash + type   custom template ({{ .TokenHash }}) — verified server-side
 *   code                PKCE — exchanged for a session server-side
 *   token + type + email  older templates ({{ .Token }}) — verified server-side
 *   #access_token=…     implicit flow — a FRAGMENT, invisible to the server,
 *                       so the browser has to hand it back to us
 *
 * Anything else is a real misconfiguration rather than a user mistake, and is
 * reported as one instead of redirecting into a loop.
 */

/** The OTP types Supabase can send. Anything else is not a confirmation link. */
const OTP_TYPES = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const;

export function isOtpType(v: string | null | undefined): v is EmailOtpType {
  return Boolean(v && (OTP_TYPES as readonly string[]).includes(v));
}

export type ConfirmFlow =
  /** Supabase itself reported a failure on the link (expired, denied, …). */
  | { kind: "provider_error"; code: string }
  /** Custom template: hashed token verified server-side. */
  | { kind: "token_hash"; tokenHash: string; type: EmailOtpType }
  /** PKCE: an authorization code exchanged for a session. */
  | { kind: "code"; code: string }
  /** Older template shape: the raw 6-digit token plus the address it belongs to. */
  | { kind: "legacy_token"; token: string; type: EmailOtpType; email: string }
  /** Nothing the server can act on — possibly a fragment only the browser sees. */
  | { kind: "none" };

/**
 * Classify an inbound confirmation URL's *query* parameters. Ordered by
 * confidence: an explicit provider error beats a token, and a token beats a
 * bare code, so a link carrying several shapes resolves the same way twice.
 */
export function classifyConfirm(params: URLSearchParams): ConfirmFlow {
  const errorCode =
    params.get("error_code") ?? (params.get("error") ? params.get("error")! : null);
  if (errorCode) return { kind: "provider_error", code: errorCode };

  const type = params.get("type");
  const tokenHash = params.get("token_hash");
  if (tokenHash && isOtpType(type)) return { kind: "token_hash", tokenHash, type };

  const code = params.get("code");
  if (code) return { kind: "code", code };

  // The legacy shape needs the address too — verifyOtp can't look it up.
  const token = params.get("token");
  const email = params.get("email");
  if (token && email && isOtpType(type)) return { kind: "legacy_token", token, type, email };

  return { kind: "none" };
}

/** Why a confirmation failed, in the app's own vocabulary. */
export type ConfirmFailure =
  | "expired"
  | "no_credential"
  | "verify_failed"
  | "access_denied"
  | "not_configured";

/** Map a Supabase error code from the link's query string to our reason. */
export function failureFromProviderCode(code: string): ConfirmFailure {
  switch (code) {
    case "otp_expired":
    case "otp_disabled":
      return "expired";
    case "access_denied":
    case "unauthorized_client":
      return "access_denied";
    default:
      return "verify_failed";
  }
}

export interface FailureCopy {
  /** Brand-voice headline. Lowercase, calm, never blames the user. */
  title: string;
  /** One sentence on what happened. Plain English, no engineering words. */
  body: string;
  /** Offer the "send me a new link" action? */
  canResend: boolean;
}

/**
 * What the person reads. Deliberately free of configuration vocabulary — the
 * operator-facing cause lives in ./confirmDiagnosis (server-only) so setting
 * names never ride into a customer's browser bundle.
 */
export function failureCopy(reason: ConfirmFailure): FailureCopy {
  switch (reason) {
    case "expired":
      return {
        title: "that link has expired",
        body: "confirmation links are single-use and time-limited. send yourself a fresh one and you're in.",
        canResend: true,
      };
    case "no_credential":
      return {
        title: "this link is incomplete",
        body: "it arrived without the code we need to confirm you. that's on us, not you — send yourself a new one and it should work.",
        canResend: true,
      };
    case "access_denied":
      return {
        title: "that link was turned down",
        body: "it may have been used already, or it was meant for a different account. signing in directly usually works.",
        canResend: true,
      };
    case "not_configured":
      return {
        title: "sign-in isn't available yet",
        body: "this workspace hasn't been connected to its account system. nothing you did — try again shortly.",
        canResend: false,
      };
    case "verify_failed":
    default:
      return {
        title: "we couldn't confirm that link",
        body: "it may have already been used. try signing in — if that doesn't work, send yourself a new link.",
        canResend: true,
      };
  }
}
