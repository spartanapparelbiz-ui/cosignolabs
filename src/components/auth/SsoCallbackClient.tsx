"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { AuthMark } from "./AuthMark";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * The OAuth return leg. Clerk's headless callback completes the redirect flow
 * (exchanges the code, activates the session) and forwards to the app; we just
 * show the fully lit mark while it happens, so the moment reads as "signing you
 * in", never a blank hosted screen.
 */
export function SsoCallbackClient() {
  const reducedMotion = useReducedMotion();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-cream px-6 text-center">
      <AuthMark
        emailProgress={1}
        passProgress={1}
        ready
        reducedMotion={reducedMotion}
      />
      <p className="text-lg font-extrabold tracking-tight text-ink">
        signing you in…
      </p>
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl="/app"
        signUpForceRedirectUrl="/app"
        signInFallbackRedirectUrl="/app"
        signUpFallbackRedirectUrl="/app"
      />
    </main>
  );
}
