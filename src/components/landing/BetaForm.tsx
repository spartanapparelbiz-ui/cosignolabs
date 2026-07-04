"use client";

import { useEffect, useRef, useState } from "react";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function BetaForm() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
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

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
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
      if (!res.ok) throw new Error(body.message || "Something went wrong.");
      setState("done");
      setMessage(body.message);
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-card border border-ink bg-white/70 p-6 text-center">
        <div className="mx-auto flex h-10 w-10 animate-check-pop items-center justify-center rounded-full bg-accent">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M4.5 12.5 10 18 20 6.5"
              stroke="#FBF4EA"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="mt-3 font-bold">{message}</p>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-ink bg-white/80 px-4 py-3 text-sm font-semibold placeholder:text-ink-soft/50";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="name" required placeholder="Your name" className={inputClass} aria-label="Your name" />
        <input
          name="email"
          type="email"
          required
          placeholder="you@company.com"
          className={inputClass}
          aria-label="Email"
        />
      </div>
      <input
        name="tools"
        required
        placeholder="What tools would you connect first? (Gmail, Shopify, Stripe…)"
        className={inputClass}
        aria-label="Tools you'd connect first"
      />
      <textarea
        name="workflow"
        required
        rows={2}
        placeholder="One sentence on the workflow you'd hand to an operator"
        className={inputClass}
        aria-label="Your workflow"
      />
      {TURNSTILE_SITE_KEY && (
        <div
          ref={widgetRef}
          className="cf-turnstile"
          data-sitekey={TURNSTILE_SITE_KEY}
          data-theme="light"
        />
      )}
      {state === "error" && (
        <p className="rounded-lg border border-ink px-3 py-2 text-sm font-semibold">{message}</p>
      )}
      <button
        type="submit"
        disabled={state === "busy"}
        className="rounded-pill bg-ink px-6 py-3.5 text-base font-extrabold text-cream transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-50"
      >
        {state === "busy" ? "Sending…" : "Apply for the founding beta"}
      </button>
      <p className="text-center text-xs text-ink-soft">
        We&apos;re onboarding a small founding cohort. Applications reviewed weekly.
      </p>
    </form>
  );
}
