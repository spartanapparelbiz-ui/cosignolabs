"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// §8 — three fields, each earning its place by doubling as customer discovery.
const FIELDS = {
  email: { label: "email", hint: "that email doesn't look right — check for typos." },
  workflow: {
    label: "the one task",
    hint: "one sentence is enough — what eats your week?",
  },
  tools: { label: "tools", hint: "pick or name at least one tool it would touch." },
} as const;

type FieldName = keyof typeof FIELDS;

const TOOL_CHIPS = ["gmail", "shopify", "calendar", "slack", "other"] as const;

export function BetaForm() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [tools, setTools] = useState("");
  const [chips, setChips] = useState<Set<string>>(new Set());
  const widgetRef = useRef<HTMLDivElement>(null);

  // Cloudflare Turnstile: rendered only when a site key is configured. The
  // server verifies the token; without it (in production) submits are rejected.
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

  function toggleChip(chip: string) {
    setChips((prev) => {
      const next = new Set(prev);
      if (next.has(chip)) next.delete(chip);
      else next.add(chip);
      return next;
    });
  }

  // The tools value the server sees = selected chips + any free text.
  function toolsValue(): string {
    return [...chips, tools.trim()].filter(Boolean).join(", ");
  }

  function validate(email: string, workflow: string, toolsStr: string): boolean {
    const errors: Partial<Record<FieldName, string>> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = FIELDS.email.hint;
    if (!workflow.trim()) errors.workflow = FIELDS.workflow.hint;
    if (!toolsStr.trim()) errors.tools = FIELDS.tools.hint;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const workflow = String(form.get("workflow") ?? "").trim();
    const toolsStr = toolsValue();
    if (!validate(email, workflow, toolsStr)) return;
    setState("busy");
    setMessage("");
    try {
      const res = await fetch("/api/beta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          workflow,
          tools: toolsStr,
          ...(TURNSTILE_SITE_KEY
            ? { turnstileToken: form.get("cf-turnstile-response") ?? "" }
            : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "that didn't go through — try again in a moment.");
      track("apply_submitted");
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
      <div className="rounded-card bg-surface/70 p-6 text-center shadow-soft">
        <div className="mx-auto flex h-10 w-10 animate-check-pop items-center justify-center rounded-full bg-signal">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4.5 12.5 10 18 20 6.5"
              stroke="rgb(var(--c-cream))"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="24"
              className="animate-check-draw"
            />
          </svg>
        </div>
        <p className="mt-3 font-bold">application received.</p>
        <p className="mt-1 text-sm text-ink-soft">
          reviewed weekly — we build the first integrations around this
          cohort&apos;s workflows. {message}
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-btn bg-surface/80 px-4 py-3 text-sm font-semibold placeholder:text-ink-soft/60 shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="beta-email" className="text-xs font-bold lowercase tracking-wide text-ink-soft">
          email
        </label>
        <input
          id="beta-email"
          name="email"
          type="email"
          placeholder="you@company.com"
          className={`mt-1 ${inputClass}`}
        />
        {fieldErrors.email && (
          <p className="mt-1 text-xs font-semibold text-ink-soft">{fieldErrors.email}</p>
        )}
      </div>

      <div>
        <label htmlFor="beta-workflow" className="text-xs font-bold lowercase tracking-wide text-ink-soft">
          what&apos;s the one task that eats your week?
        </label>
        <textarea
          id="beta-workflow"
          name="workflow"
          rows={2}
          placeholder="e.g. triaging support email and issuing small refunds"
          className={`mt-1 ${inputClass}`}
        />
        {fieldErrors.workflow && (
          <p className="mt-1 text-xs font-semibold text-ink-soft">{fieldErrors.workflow}</p>
        )}
      </div>

      <div>
        <span className="text-xs font-bold lowercase tracking-wide text-ink-soft">
          what tools would it need to touch?
        </span>
        <div className="mt-2 flex flex-wrap gap-2">
          {TOOL_CHIPS.map((chip) => {
            const on = chips.has(chip);
            return (
              <button
                key={chip}
                type="button"
                aria-pressed={on}
                onClick={() => toggleChip(chip)}
                className={`min-h-[36px] rounded-pill px-3.5 py-1.5 text-xs font-bold lowercase transition-colors duration-fast ${
                  on
                    ? "bg-signal text-ink shadow-soft"
                    : "bg-surface/80 text-ink-soft ring-1 ring-inset ring-ink/20 hover:bg-cream-deep"
                }`}
              >
                {chip}
              </button>
            );
          })}
        </div>
        <input
          name="tools-free"
          value={tools}
          onChange={(e) => setTools(e.target.value)}
          placeholder="or name another tool"
          className={`mt-2 ${inputClass}`}
          aria-label="other tools"
        />
        {fieldErrors.tools && (
          <p className="mt-1 text-xs font-semibold text-ink-soft">{fieldErrors.tools}</p>
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
        we shape the first integrations around your workflow. applications reviewed weekly.
      </p>
    </form>
  );
}
