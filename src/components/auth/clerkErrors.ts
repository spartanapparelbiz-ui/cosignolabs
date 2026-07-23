/**
 * Map a Clerk failure to calm, brand-voice copy. We read only the stable error
 * CODE — never the provider's raw message — so nothing internal leaks and the
 * tone stays ours. Pure and total: any shape in, a safe sentence out. Kept
 * separate from the client flow so it's unit-testable without Clerk loaded.
 */

interface ClerkApiError {
  errors?: { code?: string; message?: string }[];
}

/** The stable provider error code, for diagnostics (never shown to users). */
export function clerkErrorCode(err: unknown): string {
  return (err as ClerkApiError)?.errors?.[0]?.code ?? "";
}

/** The email is already taken in this Clerk instance (real account OR a
 *  half-finished signup that reserved it) — the flow can try to recover. */
export function isIdentifierExists(err: unknown): boolean {
  return clerkErrorCode(err) === "form_identifier_exists";
}

/** The visitor already has an active session — signing up/in is moot; the
 *  right move is going to the app, not an "already exists" style error. */
export function isSessionExists(err: unknown): boolean {
  return clerkErrorCode(err) === "session_exists";
}

export function friendlyClerkError(
  err: unknown,
  mode: "sign-in" | "sign-up"
): string {
  const code = clerkErrorCode(err);
  switch (code) {
    case "form_identifier_not_found":
      return "we couldn't find an account with that email.";
    case "form_password_incorrect":
    case "form_password_validation_failed":
      return "that password doesn't match — try again.";
    case "form_identifier_exists":
      return "that email is already registered — sign in instead.";
    case "session_exists":
      return "you're already signed in on this device.";
    case "form_param_format_invalid":
      return "that email doesn't look right.";
    case "form_password_length_too_short":
      return "check your password — make it a little longer.";
    case "form_password_pwned":
      return "that password showed up in a breach — pick a stronger one.";
    case "form_code_incorrect":
    case "verification_failed":
    case "verification_expired":
      return "that code isn't right — check it and try again.";
    case "too_many_requests":
      return "a lot of tries just now — give it a moment.";
    // Bot-protection failures (production instances run a smart CAPTCHA on
    // sign-up). If these appear, the page's captcha element or the CSP is
    // broken — surfaced honestly instead of a generic shrug.
    case "captcha_invalid":
    case "captcha_unavailable":
    case "captcha_not_enabled":
      return "our robot check couldn't run — refresh the page and try once more.";
    case "sign_up_restricted":
    case "not_allowed_access":
    case "identifier_not_allowed":
      return "sign-ups are currently limited — you may need an invitation.";
    default:
      return mode === "sign-in"
        ? "we couldn't sign you in — check your details and try again."
        : "we couldn't create your account — try again.";
  }
}
