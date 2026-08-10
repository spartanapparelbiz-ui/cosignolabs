"use client";

import { useState } from "react";
import Link from "next/link";
import { supabaseAuthConfigured, supabaseBrowser } from "@/lib/supabaseAuth/client";
import { failureCopy, type ConfirmFailure } from "@/lib/supabaseAuth/confirmFlow";
import { friendlyAuthError } from "./supabaseErrors";
import { AuthShell, AuthCard } from "./AuthShell";
import { withRedirect } from "./authRedirect";

/**
 * What a failed confirmation looks like. Previously this case redirected to
 * /sign-in with nothing said, so a user whose link was expired, reused, or
 * built by a misconfigured template just saw a login form again and assumed
 * they'd done something wrong.
 *
 * Now every failure names itself and offers the one action that fixes it —
 * a fresh link, sent from this screen, without going back to sign-up.
 *
 * The operator-facing cause renders only outside production. It names
 * configuration, and configuration never belongs on a customer's screen; on
 * the live site it goes to the server log instead (see /auth/confirm).
 */
export function ConfirmProblem({
  reason,
  next,
  diagnosis,
}: {
  reason: ConfirmFailure;
  next: string;
  /**
   * Operator-facing cause, supplied by the server ONLY in a development
   * build. It never has a value in production, so the setting names it
   * contains cannot reach a customer — and, being a prop rather than an
   * import, they never enter the client bundle either.
   */
  diagnosis?: string;
}) {
  const copy = failureCopy(reason);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resend(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (!supabaseAuthConfigured()) {
        setError("we can't send links from this workspace yet.");
        return;
      }
      const { error: err } = await supabaseBrowser().auth.resend({
        type: "signup",
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
        },
      });
      // Never confirm whether an address exists — same answer either way.
      if (err && (err as { code?: string }).code === "over_email_send_rate_limit") {
        setError(friendlyAuthError(err, "sign-up"));
        return;
      }
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-btn border border-line/70 bg-surface px-3.5 py-2.5 text-sm font-semibold outline-none transition focus:border-signal";

  return (
    <AuthShell>
      <AuthCard>
        <h1 className="font-display text-xl font-bold lowercase">{copy.title}</h1>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-ink-soft">{copy.body}</p>

        {copy.canResend && !sent && (
          <form onSubmit={resend} className="mt-5 flex flex-col gap-2.5">
            <label htmlFor="resend-email" className="sr-only">
              your email
            </label>
            <input
              id="resend-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className={field}
            />
            {error && <p className="text-sm font-bold text-signal">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink shadow-soft transition-transform active:scale-95 disabled:opacity-40"
            >
              {busy ? "sending…" : "send me a new link"}
            </button>
          </form>
        )}

        {sent && (
          <p className="mt-5 rounded-btn bg-cream px-3.5 py-3 text-sm font-semibold text-ink-soft">
            if an account exists for {email.trim()}, a fresh link is on its way.
          </p>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-line/60 pt-4">
          <Link
            href={withRedirect("/sign-in", next)}
            className="text-sm font-bold text-ink transition hover:text-signal"
          >
            go to sign in →
          </Link>
          <Link href="/" className="text-sm font-bold text-ink-soft transition hover:text-ink">
            home
          </Link>
        </div>

        {diagnosis && (
          <details className="mt-5 border-t border-line/60 pt-4">
            <summary className="cursor-pointer text-xs font-bold lowercase tracking-wide text-ink-soft">
              what to check (development only)
            </summary>
            <p className="mt-2 text-xs font-medium leading-relaxed text-ink-soft">{diagnosis}</p>
          </details>
        )}
      </AuthCard>
    </AuthShell>
  );
}
