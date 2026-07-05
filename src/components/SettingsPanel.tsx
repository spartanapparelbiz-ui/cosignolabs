"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import type { CategoryMeta, Tier, UsageRecord } from "@/lib/types";
import { SkeletonRows } from "./Skeleton";

type CategoryWithTier = CategoryMeta & { tier: Tier };

const INTEGRATIONS = [
  {
    name: "Gmail",
    detail: "read, draft, send — sends always wait for your approval.",
  },
  {
    name: "generic webhook",
    detail: "POST a signed payload to an endpoint you configure.",
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
      setError(body.message ?? "the tier didn't update — try again.");
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
      <section className="rounded-card bg-white/60 p-5 shadow-soft">
        <h2 className="text-sm font-extrabold lowercase tracking-widest text-ink-soft">
          usage this cycle
        </h2>
        {usage ? (
          <>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold">
                {usage.actions_executed}
              </span>
              <span className="text-sm text-ink-soft">
                of {usage.limit} actions used
              </span>
            </div>
            <div
              className="mt-3 h-2.5 overflow-hidden rounded-pill bg-cream-deep"
              role="progressbar"
              aria-valuenow={usage.actions_executed}
              aria-valuemax={usage.limit}
              aria-label="actions used this cycle"
            >
              <div
                className={`h-full rounded-pill ${pct >= 100 ? "bg-ink" : "bg-signal"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {pct >= 100 && (
              <p className="mt-3 rounded-btn bg-cream-deep px-3 py-2 text-sm font-semibold">
                you&apos;ve used your plan&apos;s actions for this cycle. the
                operator can still plan and propose — upgrade to keep signing.
              </p>
            )}
            <p className="mt-2 text-xs text-ink-soft">
              past the limit, execution pauses server-side. proposals stay free
              — you never lose the plan.
            </p>
          </>
        ) : (
          <div className="mt-3">
            <SkeletonRows rows={2} />
          </div>
        )}
      </section>

      {/* Tier assignments */}
      <section>
        <h2 className="text-sm font-extrabold lowercase tracking-widest text-ink-soft">
          permission tiers
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          decide how much rope the operator gets. locked categories are pinned
          server-side — neither you, the client, nor the agent can lower them.
        </p>
        {error && (
          <p className="mt-3 rounded-btn bg-cream-deep px-3 py-2 text-sm font-semibold" role="alert">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {categories === null ? (
            <SkeletonRows rows={6} />
          ) : (
            categories.map((c) => (
              <div
                key={c.category}
                className="flex flex-wrap items-center gap-3 rounded-card bg-white/60 px-4 py-3 shadow-soft"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold lowercase">{c.label}</p>
                  <p className="text-xs text-ink-soft">{c.description}</p>
                </div>
                {c.pinned ? (
                  <span className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-3 py-1.5 text-xs font-bold lowercase text-cream">
                    <Lock size={11} strokeWidth={2.5} aria-hidden="true" />
                    tier 3 · pinned
                  </span>
                ) : (
                  <div
                    className="flex rounded-btn bg-cream-deep p-0.5"
                    role="radiogroup"
                    aria-label={`tier for ${c.label}`}
                  >
                    {([1, 2] as Tier[]).map((t) => (
                      <button
                        key={t}
                        role="radio"
                        aria-checked={c.tier === t}
                        onClick={() => setTier(c.category, t)}
                        className={`rounded-btn px-3.5 py-1 text-xs font-bold lowercase transition-colors ${
                          c.tier === t ? "bg-ink text-cream" : "text-ink-soft"
                        }`}
                      >
                        {t === 1 ? "auto" : "approve"}
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
        <h2 className="text-sm font-extrabold lowercase tracking-widest text-ink-soft">
          connected integrations
        </h2>
        <div className="mt-4 flex flex-col gap-2">
          {INTEGRATIONS.map((i) => (
            <div
              key={i.name}
              className="flex items-center gap-3 rounded-card bg-white/60 px-4 py-3 shadow-soft"
            >
              <div className="flex-1">
                <p className="font-bold">{i.name}</p>
                <p className="text-xs text-ink-soft">{i.detail}</p>
              </div>
              <span className="rounded-pill bg-cream-deep px-3 py-1 text-[11px] font-bold lowercase tracking-wide text-ink-soft">
                beta stub
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          real connections land with the founding cohort — tell us what to
          build first.
        </p>
      </section>
    </div>
  );
}
