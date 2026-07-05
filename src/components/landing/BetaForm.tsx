"use client";

import { useEffect, useRef, useState } from "react";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const FIELDS = {
  name: { label: "your name", hint: "tell us your name so we know who's applying." },
  email: { label: "email", hint: "that email doesn't look right — check for typos." },
  tools: { label: "tools", hint: "name at least one tool you'd connect." },
  workflow: { label: "workflow", hint: "one sentence is enough — what would you hand off?" },
} as const;

type FieldName = keyof typeof FIELDS;

export function BetaForm() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const widgetRef = useRef<HTMLDivElement>(null);

  // Cloudflare Turnstile: rendered only when a site key is configured.
  // The server verifies the token; without it (in production) the
  // submission is rejected.
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !widgetRef.current) return;
    if (document.querySelector("script[data-cosigno-turnstile]")) return;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.setAttribute("data-cosigno-turnstile", "1");
    document.head.appendChild(script);
  }, []);

  function validate(form: FormData): boolean {
    const errors: Partial<Record<FieldName, string>> = {};
    for (const name of Object.keys(FIELDS) as FieldName[]) {
      const value = String(form.get(name) ?? "").trim();
      if (!value) errors[name] = FIELDS[name].hint;
      else if (name === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors.email = FIELDS.email.hint;
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!validate(form)) return;
    setState("busy");
    setMessage("");
    try {
      const res = await fetch("/api/beta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          tools: form.get("tools"),
          workflow: form.get("workflow"),
          ...(TURNSTILE_SITE_KEY
            ? { turnstileToken: form.get("cf-turnstile-response") ?? "" }
            : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "that didn't go through — try again in a moment.");
      setState("done");
      setMessage(body.message);
    } catch (err) {
      // Error state keeps the form (and the visitor's input) intact.
      setState("error");
      setMessage(
        err instanceof Error ? err.message : "that didn't go through — try again in a moment."
      );
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-card bg-white/70 p-6 text-center shadow-soft">
        <div className="mx-auto flex h-10 w-10 animate-check-pop items-center justify-center rounded-full bg-signal">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4.5 12.5 10 18 20 6.5"
              stroke="#FBF4EA"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="24"
              className="animate-check-draw"
            />
          </svg>
        </div>
        <p className="mt-3 font-bold">application received — we review weekly.</p>
        <p className="mt-1 text-sm text-ink-soft">{message}</p>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-btn bg-white/80 px-4 py-3 text-sm font-semibold placeholder:text-ink-soft/60 shadow-soft";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <input name="name" placeholder="your name" className={inputClass} aria-label="your name" />
          {fieldErrors.name && (
            <p className="mt-1 text-xs font-semibold text-ink-soft">{fieldErrors.name}</p>
          )}
        </div>
        <div>
          <input
            name="email"
            type="email"
            placeholder="you@company.com"
            className={inputClass}
            aria-label="email"
          />
          {fieldErrors.email && (
            <p className="mt-1 text-xs font-semibold text-ink-soft">{fieldErrors.email}</p>
          )}
        </div>
      </div>
      <div>
        <input
          name="tools"
          placeholder="what tools would you connect first? (gmail, shopify, stripe…)"
          className={inputClass}
          aria-label="tools you'd connect first"
        />
        {fieldErrors.tools && (
          <p className="mt-1 text-xs font-semibold text-ink-soft">{fieldErrors.tools}</p>
        )}
      </div>
      <div>
        <textarea
          name="workflow"
          rows={2}
          placeholder="one sentence on the workflow you'd hand to an operator"
          className={inputClass}
          aria-label="your workflow"
        />
        {fieldErrors.workflow && (
          <p className="mt-1 text-xs font-semibold text-ink-soft">{fieldErrors.workflow}</p>
        )}
      </div>
      {TURNSTILE_SITE_KEY && (
        <div
          ref={widgetRef}
          className="cf-turnstile"
          data-sitekey={TURNSTILE_SITE_KEY}
          data-theme="light"
        />
      )}
      {state === "error" && (
        <p className="rounded-btn bg-cream-deep px-3 py-2 text-sm font-semibold" role="alert">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={state === "busy"}
        className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-btn bg-ink px-6 py-3.5 text-base font-extrabold text-cream transition-transform duration-fast active:scale-95 disabled:opacity-60"
      >
        {/* signal sweep fills left-to-right on hover */}
        <span
          aria-hidden="true"
          className="absolute inset-0 origin-left scale-x-0 bg-signal transition-transform duration-[280ms] ease-brand-out group-hover:scale-x-100"
        />
        <span className="relative inline-flex items-center gap-2 transition-colors duration-200 group-hover:text-ink">
          {state === "busy" && (
            <span
              className="h-4 w-4 animate-orb-think rounded-full border-2 border-cream/40 border-t-cream"
              aria-hidden="true"
            />
          )}
          {state === "busy" ? "sending…" : "apply for the founding beta"}
        </span>
      </button>
      <p className="text-center text-xs text-ink-soft">
        we&apos;re onboarding a small founding cohort. applications reviewed weekly.
      </p>
    </form>
  );
}
