"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CosignoWordmark } from "@/components/brand/Logo";
import { AuthMark } from "./AuthMark";
import { useReducedMotion } from "@/lib/useReducedMotion";
import {
  emailProgress,
  passwordProgress,
  isReadyToSubmit,
} from "./authProgress";

/**
 * The branded auth surface — zero provider chrome. It owns the field state
 * and the fill-as-you-type math, renders the animated Cosigno mark beside the
 * form, and hands submissions back to whatever engine is driving it (live auth
 * or the local demo). Two phases: "credentials" (email + password, optional
 * Google) and "verify" (the emailed code, for sign-up).
 *
 * It is purely presentational about auth: it never talks to a provider itself,
 * so the same surface backs both the live auth flow and the offline demo.
 */

export interface AuthFormProps {
  mode: "sign-in" | "sign-up";
  phase: "credentials" | "verify";
  busy: boolean;
  /** Calm, brand-voice error text (already user-safe). */
  error: string | null;
  /** Optional action rendered with the error, e.g. a "go to sign in" link. */
  errorAction?: { href: string; label: string } | null;
  /** Neutral status line, e.g. "we sent a 6-digit code to …". */
  notice: string | null;
  googleEnabled: boolean;
  /** Briefly true on success → the mark stamps its check. */
  stamped: boolean;
  onSubmitCredentials: (email: string, password: string) => void;
  onSubmitCode: (code: string) => void;
  onGoogle: () => void;
  /** Href to the opposite mode (sign-in ↔ sign-up), redirect preserved. */
  switchHref: string;
  /** Optional "forgot password?" destination (live auth only). */
  resetHref?: string;
}

const COPY = {
  "sign-in": {
    title: "welcome back",
    sub: "sign in to your cosigno workspace.",
    submit: "sign in",
    switchPrompt: "new to cosigno?",
    switchCta: "create an account",
  },
  "sign-up": {
    title: "make it yours",
    sub: "create your cosigno workspace in a few seconds.",
    submit: "create account",
    switchPrompt: "already have an account?",
    switchCta: "sign in",
  },
} as const;

export function AuthForm(props: AuthFormProps) {
  const {
    mode,
    phase,
    busy,
    error,
    errorAction,
    notice,
    googleEnabled,
    stamped,
    onSubmitCredentials,
    onSubmitCode,
    onGoogle,
    switchHref,
    resetHref,
  } = props;

  const reducedMotion = useReducedMotion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  // Required agreement gate — only meaningful on sign-up.
  const [agreed, setAgreed] = useState(false);
  const [consentError, setConsentError] = useState(false);

  const eProg = useMemo(() => emailProgress(email), [email]);
  const pProg = useMemo(() => passwordProgress(password), [password]);
  // On sign-up the Terms/Privacy agreement is a hard prerequisite.
  const consentOk = mode !== "sign-up" || agreed;
  const ready = isReadyToSubmit(email, password) && consentOk && !busy;
  const copy = COPY[mode];

  const verifying = phase === "verify";
  // In the verify phase the credentials are already in — keep the mark lit.
  const markEmail = verifying ? 1 : eProg;
  const markPass = verifying ? 1 : pProg;
  const markReady = verifying || ready || stamped;

  function requireConsent(): boolean {
    if (consentOk) return true;
    // Block and point the user at the checkbox — never silently submit.
    setConsentError(true);
    return false;
  }

  function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!requireConsent()) return;
    onSubmitCredentials(email, password);
  }

  function handleGoogle() {
    if (busy) return;
    if (!requireConsent()) return;
    onGoogle();
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    onSubmitCode(code.trim());
  }

  return (
    <div className="grid w-full max-w-4xl items-center gap-8 sm:gap-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      {/* ---- signature mark panel ---- */}
      <div className="flex flex-col items-center gap-4 text-center md:items-start md:text-left">
        <AuthMark
          emailProgress={markEmail}
          passProgress={markPass}
          ready={markReady}
          stamped={stamped}
          reducedMotion={reducedMotion}
        />
        <div className="hidden md:block">
          <p className="text-lg font-extrabold tracking-tight text-ink">
            it signs as you do.
          </p>
          <p className="mt-1 max-w-xs text-sm font-medium text-ink-soft">
            fill in your details and watch the mark come to life — that&apos;s
            cosigno getting ready to sign alongside you.
          </p>
        </div>
      </div>

      {/* ---- form card ---- */}
      <div className="w-full rounded-card bg-cream/80 p-6 shadow-soft ring-1 ring-line/70 sm:p-8">
        <div className="mb-6 flex flex-col gap-1.5">
          <CosignoWordmark className="text-2xl" />
          <h1 className="mt-2 text-xl font-extrabold tracking-tight text-ink">
            {copy.title}
          </h1>
          <p className="text-sm font-medium text-ink-soft">{copy.sub}</p>
        </div>

        {verifying ? (
          <form onSubmit={submitCode} className="flex flex-col gap-4" noValidate>
            <Field
              id="auth-code"
              label="verification code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              value={code}
              onChange={setCode}
              autoFocus
            />
            {notice && <p className="text-sm font-medium text-ink-soft">{notice}</p>}
            {error && <ErrorLine>{error}</ErrorLine>}
            <SubmitButton lit={code.trim().length >= 4 && !busy} busy={busy}>
              verify email
            </SubmitButton>
          </form>
        ) : (
          <form
            onSubmit={submitCredentials}
            className="flex flex-col gap-4"
            noValidate
          >
            {googleEnabled && (
              <>
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={busy}
                  className="flex items-center justify-center gap-2.5 rounded-btn border-[1.5px] border-ink/85 bg-transparent px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-ink hover:text-cream disabled:opacity-60"
                >
                  <GoogleGlyph />
                  continue with google
                </button>
                <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-ink-soft/70">
                  <span className="h-px flex-1 bg-line" />
                  or
                  <span className="h-px flex-1 bg-line" />
                </div>
              </>
            )}

            <Field
              id="auth-email"
              label="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={setEmail}
              autoFocus
            />
            <Field
              id="auth-password"
              label="password"
              type="password"
              autoComplete={
                mode === "sign-in" ? "current-password" : "new-password"
              }
              placeholder={mode === "sign-up" ? "at least 8 characters" : "••••••••"}
              value={password}
              onChange={setPassword}
            />

            {mode === "sign-up" && (
              <ConsentCheckbox
                checked={agreed}
                error={consentError}
                onChange={(v) => {
                  setAgreed(v);
                  if (v) setConsentError(false);
                }}
              />
            )}
            {mode === "sign-in" && resetHref && (
              <Link
                href={resetHref}
                className="-mt-1 self-end text-xs font-bold lowercase text-ink-soft underline underline-offset-2 hover:text-ink"
              >
                forgot password?
              </Link>
            )}
            {error && (
              <ErrorLine>
                {error}
                {errorAction && (
                  <>
                    {" "}
                    <Link
                      href={errorAction.href}
                      prefetch
                      className="font-bold underline underline-offset-2"
                    >
                      {errorAction.label}
                    </Link>
                  </>
                )}
              </ErrorLine>
            )}

            <SubmitButton lit={ready} busy={busy}>
              {copy.submit}
            </SubmitButton>
          </form>
        )}

        <p className="mt-6 text-center text-sm font-medium text-ink-soft">
          {copy.switchPrompt}{" "}
          <Link
            href={switchHref}
            className="font-bold text-ink underline decoration-signal decoration-2 underline-offset-4"
          >
            {copy.switchCta}
          </Link>
        </p>
      </div>
    </div>
  );
}

/* ---------- small building blocks ---------- */

/**
 * The required agreement gate. Account creation is blocked until this is
 * checked (the submit button stays un-lit and both submit paths refuse). When
 * the user tries to proceed without it, `error` turns the row signal-orange
 * and nudges the checkbox — never a silent no-op.
 */
function ConsentCheckbox({
  checked,
  error,
  onChange,
}: {
  checked: boolean;
  error: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor="auth-consent"
      className={`flex cursor-pointer items-start gap-2.5 rounded-btn p-0.5 text-xs font-medium leading-relaxed ${
        error ? "text-signal motion-safe:animate-shake-x" : "text-ink-soft"
      }`}
    >
      <input
        id="auth-consent"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-invalid={error}
        aria-describedby={error ? "auth-consent-error" : undefined}
        className={`mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-signal ${
          error ? "outline outline-2 outline-signal" : ""
        }`}
      />
      <span>
        I agree to the{" "}
        <Link
          href="/terms"
          target="_blank"
          className="font-bold text-ink underline decoration-signal decoration-1 underline-offset-2"
        >
          Terms
        </Link>{" "}
        and{" "}
        <Link
          href="/privacy"
          target="_blank"
          className="font-bold text-ink underline decoration-signal decoration-1 underline-offset-2"
        >
          Privacy Policy
        </Link>
        .
        {error && (
          <span id="auth-consent-error" className="mt-0.5 block font-semibold">
            please agree to continue.
          </span>
        )}
      </span>
    </label>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  autoFocus,
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "id"
>) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-xs font-bold lowercase tracking-wide text-ink-soft">
        {label}
      </span>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className="rounded-btn border-[1.5px] border-line bg-cream-deep/60 px-3.5 py-2.5 text-[15px] font-medium text-ink placeholder:text-ink-soft/50 transition focus:border-signal focus:bg-cream"
        {...rest}
      />
    </label>
  );
}

function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="text-sm font-semibold text-signal motion-safe:animate-shake-x"
    >
      {children}
    </p>
  );
}

function SubmitButton({
  lit,
  busy,
  children,
}: {
  lit: boolean;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      aria-busy={busy}
      className={`rounded-btn bg-signal px-4 py-2.5 text-sm font-extrabold text-cream shadow-soft transition duration-base disabled:cursor-progress ${
        lit ? "opacity-100 saturate-100" : "opacity-70 saturate-[0.6]"
      }`}
    >
      {busy ? "one moment…" : children}
    </button>
  );
}

/** Brand-neutral Google glyph (inline so it needs no external asset). */
function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22 22-9.8 22-22c0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 4.1 29.6 2 24 2 16 2 9.1 6.5 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 46c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5c-2 1.5-4.7 2.5-7.6 2.5-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9 41.4 15.9 46 24 46z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.5l6.5 5.5c-.5.4 7.3-5.3 7.3-15 0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
