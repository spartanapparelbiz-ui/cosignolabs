import type { ConfirmFailure } from "./confirmFlow";

/**
 * SERVER ONLY. The operator-facing cause of a failed confirmation.
 *
 * These sentences name configuration — dashboard fields, template variables,
 * environment variables — which is exactly what a customer must never be shown
 * and what the rest of this codebase works hard to keep out of the browser
 * (see tests/no-config-names-reach-users.test.ts). Keeping them in their own
 * module, imported only from route handlers and server components, means they
 * cannot be pulled into a client bundle by accident.
 *
 * Where they surface: the server log on every failure, and — in a development
 * build only — a collapsed "what to check" note on /auth/problem.
 */
export function confirmDiagnosis(reason: ConfirmFailure): string {
  switch (reason) {
    case "expired":
      return (
        "Token expired, already used, or consumed by a mail scanner that followed " +
        "the link before the recipient did. Raise the expiry under Authentication → " +
        "Providers → Email, and include {{ .Token }} in the template so the typed " +
        "6-digit code stays available as a fallback."
      );
    case "no_credential":
      return (
        "The confirmation URL carried no token_hash, no code, no token, and no " +
        "fragment. The Supabase email template is almost certainly still the " +
        "default {{ .ConfirmationURL }}. Point it at " +
        "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup, and " +
        "check that Site URL begins with https:// — a scheme-less Site URL sends " +
        "the link to <project-ref>.supabase.co/<your-domain> instead."
      );
    case "access_denied":
      return (
        "The auth provider rejected the request (access_denied). Usually a reused " +
        "link, or a redirect target missing from the Redirect URLs allow-list — " +
        "Supabase discards an unlisted destination silently and falls back to Site URL."
      );
    case "not_configured":
      return (
        "This deployment has no Supabase auth credentials, so no confirmation can " +
        "be verified. Check the two public Supabase values in the environment."
      );
    case "verify_failed":
    default:
      return (
        "verifyOtp / exchangeCodeForSession rejected the credential. If this happens " +
        "for every user, check that the template's type= matches the flow (signup vs " +
        "recovery vs email_change), and that Site URL and the Redirect URLs " +
        "allow-list are both correct."
      );
  }
}
