"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseAuth/client";
import { AuthForm } from "./AuthForm";
import {
  authErrorCode,
  friendlyAuthError,
  isAlreadyRegistered,
  signUpHitExistingUser,
} from "./supabaseErrors";

/**
 * The live auth engine: Supabase Auth stays fully in charge of security,
 * sessions, and validation — we drive it headlessly so the surface stays
 * ours. Email/password with email confirmation (link, or the 6-digit code if
 * the email shows one) + optional Google OAuth, all through the branded
 * <AuthForm>. Provider errors are mapped to calm copy; the raw cause never
 * reaches the user (the stable code is logged for diagnostics).
 */

function describeAuthError(err: unknown, mode: "sign-in" | "sign-up"): string {
  const code = authErrorCode(err);
  // eslint-disable-next-line no-console
  console.warn(`[cosigno auth] ${mode} failed`, code ? `code=${code}` : err);
  return friendlyAuthError(err, mode);
}

export function SupabaseAuthFlow({
  mode,
  googleEnabled,
  dest,
  switchHref,
}: {
  mode: "sign-in" | "sign-up";
  googleEnabled: boolean;
  dest: string;
  switchHref: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"credentials" | "verify">("credentials");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<{ href: string; label: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stamped, setStamped] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  function succeed() {
    setStamped(true);
    setBusy(true);
    // let the mark stamp its check, then hand off to the app
    window.setTimeout(() => {
      router.push(dest);
      router.refresh();
    }, 550);
  }

  /**
   * "Already registered" recovery: quietly try signing in with the
   * credentials the user just typed — their "new" email may be their own
   * earlier account (or a half-finished signup). If it works, they're in
   * with no error; only a genuinely different password gets the message,
   * with a direct link to sign-in.
   */
  async function recoverExistingUser(email: string, password: string) {
    const { error: signInError } = await supabaseBrowser().auth.signInWithPassword({
      email,
      password,
    });
    if (!signInError) {
      succeed();
      return;
    }
    setError("That email is already registered — sign in instead.");
    setErrorAction({ href: switchHref, label: "go to sign in" });
  }

  async function handleSignIn(email: string, password: string) {
    const { error: err } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    if (err) {
      setError(describeAuthError(err, "sign-in"));
      return;
    }
    succeed();
  }

  async function handleSignUp(email: string, password: string) {
    // The form only reaches here once the Terms + Privacy checkbox is ticked,
    // so we stamp the consent onto the user record for our records.
    const { data, error: err } = await supabaseBrowser().auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(dest)}`,
        data: {
          termsAcceptedAt: new Date().toISOString(),
          termsVersion: "2026-07-08",
          privacyVersion: "2026-07-09",
        },
      },
    });
    if (err) {
      if (isAlreadyRegistered(err)) {
        await recoverExistingUser(email, password);
        return;
      }
      setError(describeAuthError(err, "sign-up"));
      return;
    }
    if (data.session) {
      // The project doesn't require email confirmation — the account exists
      // and the session is live right now.
      succeed();
      return;
    }
    if (signUpHitExistingUser(data.user)) {
      // Anti-enumeration fake success for an existing address — recover
      // instead of waiting for a confirmation email that will never come.
      await recoverExistingUser(email, password);
      return;
    }
    setPendingEmail(email);
    setNotice(
      `we sent a confirmation link to ${email} — click it and you're in. if your email shows a 6-digit code instead, enter it below.`
    );
    setPhase("verify");
  }

  async function submitCredentials(email: string, password: string) {
    if (busy) return;
    setError(null);
    setErrorAction(null);
    setBusy(true);
    try {
      if (mode === "sign-in") await handleSignIn(email, password);
      else await handleSignUp(email, password);
    } catch (err) {
      setError(describeAuthError(err, mode));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(code: string) {
    if (busy || !pendingEmail) return;
    setError(null);
    setBusy(true);
    try {
      const { data, error: err } = await supabaseBrowser().auth.verifyOtp({
        email: pendingEmail,
        token: code.trim(),
        type: "signup",
      });
      if (err || !data.session) {
        setError(err ? describeAuthError(err, "sign-up") : "That code isn't right — check it and try again.");
        return;
      }
      succeed();
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await supabaseBrowser().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(dest)}`,
        },
      });
      if (err) {
        setError(describeAuthError(err, mode));
        setBusy(false);
      }
      // on success the browser navigates away; nothing after this runs
    } catch (err) {
      setError(describeAuthError(err, mode));
      setBusy(false);
    }
  }

  return (
    <AuthForm
      mode={mode}
      phase={phase}
      busy={busy}
      error={error}
      errorAction={errorAction}
      notice={notice}
      googleEnabled={googleEnabled}
      stamped={stamped}
      switchHref={switchHref}
      resetHref="/auth/reset"
      onSubmitCredentials={submitCredentials}
      onSubmitCode={submitCode}
      onGoogle={handleGoogle}
    />
  );
}
