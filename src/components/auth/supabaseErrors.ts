/**
 * Map a Supabase Auth failure to calm, brand-voice copy. We read only the
 * stable error CODE — never the provider's raw message — so nothing internal
 * leaks and the tone stays ours. Pure and total: any shape in, a safe
 * sentence out. Kept separate from the client flow so it's unit-testable
 * without the auth client loaded.
 */

interface AuthErrorShape {
  code?: string;
  status?: number;
}

/** The stable provider error code, for diagnostics (never shown to users). */
export function authErrorCode(err: unknown): string {
  return (err as AuthErrorShape)?.code ?? "";
}

/** The email is already registered in this project — the flow can recover. */
export function isAlreadyRegistered(err: unknown): boolean {
  return ["user_already_exists", "email_exists"].includes(authErrorCode(err));
}

/**
 * With email confirmation enabled, signing up an EXISTING address returns a
 * fake-success user with no identities (anti-enumeration). Detect it so the
 * flow can recover instead of waiting forever for an email that won't come.
 */
export function signUpHitExistingUser(user: unknown): boolean {
  const u = user as { identities?: unknown[] } | null;
  return Boolean(u && Array.isArray(u.identities) && u.identities.length === 0);
}

export function friendlyAuthError(err: unknown, mode: "sign-in" | "sign-up"): string {
  switch (authErrorCode(err)) {
    case "invalid_credentials":
      return "that email and password don't match — try again.";
    case "user_already_exists":
    case "email_exists":
      return "that email is already registered — sign in instead.";
    case "user_not_found":
      return "we couldn't find an account with that email.";
    case "email_not_confirmed":
      return "confirm your email first — check your inbox for our link.";
    case "weak_password":
      return "make your password a little stronger — longer helps most.";
    case "validation_failed":
    case "email_address_invalid":
      return "that email doesn't look right.";
    case "otp_expired":
    case "otp_disabled":
      return "that code or link has expired — request a fresh one.";
    case "same_password":
      return "pick a password different from your current one.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "a lot of tries just now — give it a minute.";
    case "provider_disabled":
    case "email_provider_disabled":
      return "that sign-in method isn't available right now.";
    case "signup_disabled":
      return "sign-ups are currently limited — you may need an invitation.";
    default:
      return mode === "sign-in"
        ? "we couldn't sign you in — check your details and try again."
        : "We couldn't create your account — try again.";
  }
}
