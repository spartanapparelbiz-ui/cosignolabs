"use client";

import { useEffect, useState } from "react";
import type { CategoryMeta, Tier, UsageRecord } from "@/lib/types";

type CategoryWithTier = CategoryMeta & { tier: Tier };

const INTEGRATIONS = [
  {
    name: "Gmail",
    status: "stub",
    detail: "Read, draft, send — sends are always tier 2+.",
  },
  {
    name: "Generic webhook",
    status: "stub",
    detail: "POST a signed payload to any endpoint you configure.",
  },
];

export function SettingsPanel() {
  const [categories, setCategories] = useState<CategoryWithTier[] | null>(null);
  const [usage, setUsage] = useState<UsageRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/tiers")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => setCategories([]));
    fetch("/api/usage")
      .then((r) => r.json())
      .then((d) => setUsage(d.usage ?? null))
      .catch(() => {});
  }, []);

  async function setTier(category: string, tier: Tier) {
    setError(null);
    const res = await fetch("/api/settings/tiers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, tier }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.message ?? "Could not update tier.");
      return;
    }
    setCategories(
      (cats) =>
        cats?.map((c) => (c.category === category ? { ...c, tier } : c)) ?? null
    );
  }

  const pct = usage
    ? Math.min(100, Math.round((usage.actions_executed / usage.limit) * 100))
    : 0;

  return (
    <div className="mt-6 flex flex-col gap-8">
      {/* Usage meter */}
      <section className="rounded-card border border-line bg-white/60 p-5">
        <h2 className="text-sm font-extrabold uppercase tracking-widest text-ink-soft">
          Usage this cycle
        </h2>
        {usage ? (
          <>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold">
                {usage.actions_executed}
              </span>
              <span className="text-sm text-ink-soft">
                of {usage.limit} actions executed
              </span>
            </div>
            <div
              className="mt-3 h-2.5 overflow-hidden rounded-pill bg-cream-deep"
              role="progressbar"
              aria-valuenow={usage.actions_executed}
              aria-valuemax={usage.limit}
            >
              <div
                className={`h-full rounded-pill ${pct >= 100 ? "bg-ink" : "bg-accent"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {pct >= 100 && (
              <p className="mt-3 rounded-lg border border-ink px-3 py-2 text-sm font-semibold">
                Execution is paused until your next cycle. The operator can
                still plan and propose — upgrade to keep signing.
              </p>
            )}
            <p className="mt-2 text-xs text-ink-soft">
              Executions are blocked server-side past the limit. Proposals stay
              free — you never lose the plan.
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">Loading…</p>
        )}
      </section>

      {/* Tier assignments */}
      <section>
        <h2 className="text-sm font-extrabold uppercase tracking-widest text-ink-soft">
          Permission tiers
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Move categories between Auto and Approve. Locked categories are
          pinned server-side — neither you, the client, nor the agent can
          lower them.
        </p>
        {error && (
          <p className="mt-3 rounded-lg border border-ink px-3 py-2 text-sm font-semibold">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {categories === null ? (
            <p className="text-sm text-ink-soft">Loading…</p>
          ) : (
            categories.map((c) => (
              <div
                key={c.category}
                className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-white/60 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{c.label}</p>
                  <p className="text-xs text-ink-soft">{c.description}</p>
                </div>
                {c.pinned ? (
                  <span className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-3 py-1.5 text-xs font-bold text-cream">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                      <rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor" />
                      <path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="2.4" />
                    </svg>
                    Tier 3 · pinned
                  </span>
                ) : (
                  <div
                    className="flex rounded-pill border border-ink p-0.5"
                    role="radiogroup"
                    aria-label={`Tier for ${c.label}`}
                  >
                    {([1, 2] as Tier[]).map((t) => (
                      <button
                        key={t}
                        role="radio"
                        aria-checked={c.tier === t}
                        onClick={() => setTier(c.category, t)}
                        className={`rounded-pill px-3.5 py-1 text-xs font-bold transition-colors ${
                          c.tier === t ? "bg-ink text-cream" : "text-ink-soft"
                        }`}
                      >
                        {t === 1 ? "Auto" : "Approve"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Integrations */}
      <section>
        <h2 className="text-sm font-extrabold uppercase tracking-widest text-ink-soft">
          Connected integrations
        </h2>
        <div className="mt-4 flex flex-col gap-2">
          {INTEGRATIONS.map((i) => (
            <div
              key={i.name}
              className="flex items-center gap-3 rounded-card border border-line bg-white/60 px-4 py-3"
            >
              <div className="flex-1">
                <p className="font-bold">{i.name}</p>
                <p className="text-xs text-ink-soft">{i.detail}</p>
              </div>
              <span className="rounded-pill border border-line px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                beta stub
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          Real connections land with the founding cohort — tell us what to
          build first.
        </p>
      </section>
    </div>
  );
}
