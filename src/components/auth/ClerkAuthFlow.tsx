"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSignIn, useSignUp } from "@clerk/nextjs";
import { AuthForm } from "./AuthForm";
import {
  clerkErrorCode,
  friendlyClerkError,
  isIdentifierExists,
  isSessionExists,
} from "./clerkErrors";

/**
 * Surface a calm message to the user, but keep the STABLE provider error code
 * findable (browser console) so a broken flow is diagnosable — a swallowed
 * error is how "sign-up is broken" goes unnoticed. Codes only, never raw
 * provider messages or user data.
 */
function describeAuthError(err: unknown, mode: "sign-in" | "sign-up"): string {
  const code = clerkErrorCode(err);
  // eslint-disable-next-line no-console
  console.warn(`[cosigno auth] ${mode} failed`, code ? `code=${code}` : err);
  return friendlyClerkError(err, mode);
}

/**
 * The real engine: Clerk stays fully in charge of security, session, and
 * validation — we only drive it through headless hooks so the surface can be
 * ours. Email/password + email-code verification (sign-up) + Google OAuth, all
 * surfaced through the branded <AuthForm>. Provider errors are mapped to calm,
 * brand-voice copy; the raw cause never reaches the user.
 */
export function ClerkAuthFlow({
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
  const signInHook = useSignIn();
  const signUpHook = useSignUp();

  const [phase, setPhase] = useState<"credentials" | "verify">("credentials");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<{ href: string; label: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stamped, setStamped] = useState(false);

  const loaded = signInHook.isLoaded && signUpHook.isLoaded;

  function succeed(sessionId: string | null | undefined, setActive: SetActive) {
    setStamped(true);
    setBusy(true);
    // let the mark stamp its check, then hand off to the app
    window.setTimeout(async () => {
      if (sessionId) await setActive({ session: sessionId });
      router.push(dest);
    }, 550);
  }

  async function handleSignIn(email: string, password: string) {
    const { signIn, setActive } = signInHook;
    if (!signIn) return;
    const res = await signIn.create({ identifier: email, password });
    if (res.status === "complete") {
      succeed(res.createdSessionId, setActive);
    } else {
      // Any additional factor isn't wired into this surface yet.
      setError("we couldn't finish signing you in — try again.");
    }
  }

  /**
   * "Already registered" recovery: Clerk reserves an email the moment a
   * sign-up attempt is created — including attempts abandoned before the
   * 6-digit code was entered. So `form_identifier_exists` does NOT always
   * mean a real account; it can be the user's own half-finished signup. The
   * graceful path: quietly try signing in with the credentials they just
   * typed. If that works, they're in — no error at all. Only when the email
   * truly belongs to an account with a different password do we say so, with
   * a direct link to sign-in.
   */
  async function recoverExistingIdentifier(email: string, password: string) {
    const { signIn, setActive } = signInHook;
    if (signIn) {
      try {
        const res = await signIn.create({ identifier: email, password });
        if (res.status === "complete") {
          succeed(res.createdSessionId, setActive);
          return;
        }
      } catch {
        // fall through to the honest message
      }
    }
    setError("that email is already registered — sign in instead.");
    setErrorAction({ href: switchHref, label: "go to sign in" });
  }

  async function handleSignUp(email: string, password: string) {
    const { signUp, setActive } = signUpHook;
    if (!signUp) return;
    let res;
    try {
      // The form only reaches here once the Terms + Privacy checkbox is ticked,
      // so we stamp the consent onto the user record for our records.
      res = await signUp.create({
        emailAddress: email,
        password,
        unsafeMetadata: {
          termsAcceptedAt: new Date().toISOString(),
          termsVersion: "2026-07-08",
          privacyVersion: "2026-07-09",
        },
      });
    } catch (err) {
      if (isSessionExists(err)) {
        // Already signed in — signing up is moot; go to the app.
        router.push(dest);
        return;
      }
      if (isIdentifierExists(err)) {
        await recoverExistingIdentifier(email, password);
        return;
      }
      throw err;
    }
    if (res.status === "complete") {
      // The instance didn't require verification — the account exists NOW.
      // Ignoring this and pushing into the code phase is how a retry turns
      // into a bogus "already exists".
      succeed(res.createdSessionId, setActive);
      return;
    }
    await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
    setNotice(`we sent a 6-digit code to ${email}.`);
    setPhase("verify");
  }

  async function submitCredentials(email: string, password: string) {
    if (!loaded || busy) return;
    setError(null);
    setErrorAction(null);
    setBusy(true);
    try {
      if (mode === "sign-in") await handleSignIn(email, password);
      else await handleSignUp(email, password);
    } catch (err) {
      if (isSessionExists(err)) {
        router.push(dest);
        return;
      }
      setError(describeAuthError(err, mode));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(code: string) {
    const { signUp, setActive } = signUpHook;
    if (!loaded || busy || !signUp) return;
    setError(null);
    setBusy(true);
    try {
      const res = await signUp.attemptEmailAddressVerification({ code });
      if (res.status === "complete") {
        succeed(res.createdSessionId, setActive);
      } else {
        setError("that code isn't right — check it and try again.");
      }
    } catch (err) {
      setError(describeAuthError(err, mode));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    if (!loaded || busy) return;
    setError(null);
    setBusy(true);
    try {
      const flow = mode === "sign-in" ? signInHook.signIn : signUpHook.signUp;
      if (!flow) return;
      await flow.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: dest,
      });
      // redirect leaves the page; nothing after this runs on success
    } catch (err) {
      setError(describeAuthError(err, mode));
      setBusy(false);
    }
  }

  return (
    <AuthForm
      mode={mode}
      phase={phase}
      busy={busy || !loaded}
      error={error}
      errorAction={errorAction}
      notice={notice}
      googleEnabled={googleEnabled}
      stamped={stamped}
      switchHref={switchHref}
      onSubmitCredentials={submitCredentials}
      onSubmitCode={submitCode}
      onGoogle={handleGoogle}
    />
  );
}

type SetActive = (opts: { session: string | null }) => Promise<void>;
