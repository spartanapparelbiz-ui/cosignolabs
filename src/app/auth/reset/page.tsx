"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseAuthConfigured, supabaseBrowser } from "@/lib/supabaseAuth/client";
import { friendlyAuthError } from "@/components/auth/supabaseErrors";

/**
 * Password reset, both halves on one branded screen:
 *  - no session → ask for the email and send the recovery link;
 *  - session present (arrived via the emailed link) → set the new password.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const configured = supabaseAuthConfigured();
  const [phase, setPhase] = useState<"loading" | "request" | "set">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) {
      setPhase("request");
      return;
    }
    supabaseBrowser()
      .auth.getSession()
      .then(({ data }) => setPhase(data.session ? "set" : "request"))
      .catch(() => setPhase("request"));
  }, [configured]);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (!configured) {
        setError("Password reset isn't available in the demo workspace.");
        return;
      }
      const { error: err } = await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/confirm?next=/auth/reset`,
      });
      if (err) setError(friendlyAuthError(err, "sign-in"));
      else setNotice(`if an account exists for ${email.trim()}, a reset link is on its way.`);
    } finally {
      setBusy(false);
    }
  }

  async function setNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (busy || password.length < 8) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabaseBrowser().auth.updateUser({ password });
      if (err) {
        setError(friendlyAuthError(err, "sign-in"));
        return;
      }
      router.push("/app");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-btn border border-line/70 bg-surface px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-signal";
  const button =
    "rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink shadow-soft transition-transform active:scale-95 disabled:opacity-40";

  return (
    <main className="flex min-h-screen [min-height:100dvh] flex-col items-center justify-center bg-cream px-5 py-12">
      <Link
        href="/sign-in"
        className="absolute left-5 top-5 text-sm font-bold text-ink-soft transition hover:text-ink sm:left-8 sm:top-8"
      >
        ← back to sign in
      </Link>
      <div className="w-full max-w-sm rounded-card border border-line/70 bg-surface p-6 shadow-soft">
        {phase === "loading" ? (
          <p className="text-sm font-semibold text-ink-soft">one moment…</p>
        ) : phase === "request" ? (
          <>
            <h1 className="font-display text-xl font-bold lowercase">reset your password</h1>
            <p className="mt-1.5 text-sm font-semibold text-ink-soft">
              enter your email and we&apos;ll send a reset link.
            </p>
            <form onSubmit={requestLink} className="mt-4 flex flex-col gap-3">
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className={field}
              />
              {notice && <p className="text-sm font-medium text-ink-soft">{notice}</p>}
              {error && <p className="text-sm font-bold text-signal">{error}</p>}
              <button type="submit" disabled={busy} className={button}>
                {busy ? "sending…" : "send reset link"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="font-display text-xl font-bold lowercase">set a new password</h1>
            <form onSubmit={setNewPassword} className="mt-4 flex flex-col gap-3">
              <input
                type="password"
                required
                autoFocus
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="new password (8+ characters)"
                className={field}
              />
              {error && <p className="text-sm font-bold text-signal">{error}</p>}
              <button type="submit" disabled={busy || password.length < 8} className={button}>
                {busy ? "saving…" : "save and continue"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
