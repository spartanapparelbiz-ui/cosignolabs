"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseAuth/client";
import { failureFromProviderCode } from "@/lib/supabaseAuth/confirmFlow";
import { AuthShell, AuthCard } from "./AuthShell";
import { LogoLoader } from "@/components/brand/LogoLoader";

/**
 * The half of confirmation a server can't do.
 *
 * Supabase's implicit flow returns the session in the URL *fragment*
 * (#access_token=…&refresh_token=…), and browsers never send fragments to the
 * server. /auth/confirm redirects here when it finds no credential in the
 * query string; the browser carries the fragment across that redirect, so if
 * one exists it's still in the address bar when this mounts.
 *
 * Three outcomes, all of them explicit:
 *   tokens in the fragment  → establish the session and continue
 *   an error in the fragment → the matching /auth/problem reason
 *   nothing at all           → the link carried no credential (no_credential)
 *
 * The user sees the breathing mark, not a spinner, and never a blank frame.
 */
export function ConfirmContinue({ next }: { next: string }) {
  const router = useRouter();
  const [slow, setSlow] = useState(false);
  // StrictMode double-mounts in development; consuming the fragment twice
  // would turn a good link into a "used" one.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const timer = window.setTimeout(() => setSlow(true), 2200);
    const fail = (reason: string) => {
      const url = new URL("/auth/problem", window.location.origin);
      url.searchParams.set("reason", reason);
      if (next !== "/app") url.searchParams.set("next", next);
      router.replace(url.pathname + url.search);
    };

    (async () => {
      // The fragment starts with "#": strip it before parsing.
      const frag = new URLSearchParams(window.location.hash.replace(/^#/, ""));

      const errorCode = frag.get("error_code") ?? frag.get("error");
      if (errorCode) {
        fail(failureFromProviderCode(errorCode));
        return;
      }

      const accessToken = frag.get("access_token");
      const refreshToken = frag.get("refresh_token");
      if (!accessToken || !refreshToken) {
        // No query credential (the server already checked) and no fragment
        // either — the email template didn't include one.
        fail("no_credential");
        return;
      }

      const { error } = await supabaseBrowser().auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        fail("verify_failed");
        return;
      }

      // Clear the tokens out of the address bar before moving on, so they
      // don't sit in history or leak through a copied URL.
      window.history.replaceState(null, "", window.location.pathname);
      const dest = frag.get("type") === "recovery" ? "/auth/reset" : next;
      router.replace(dest);
      router.refresh();
    })().catch(() => fail("verify_failed"));

    return () => window.clearTimeout(timer);
  }, [next, router]);

  return (
    <AuthShell back={null}>
      <AuthCard>
        <div className="flex flex-col items-center py-4 text-center">
          <LogoLoader size={40} label="confirming" />
          <p className="mt-5 text-sm font-semibold text-ink-soft">
            {slow ? "almost there — finishing up." : "one moment while we verify your link."}
          </p>
        </div>
      </AuthCard>
    </AuthShell>
  );
}
