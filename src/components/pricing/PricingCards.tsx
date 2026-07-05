"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { PLAN_ORDER, PLANS, type Interval, type PlanId } from "@/lib/plans";

/**
 * Pricing cards + monthly/annual toggle. Feature lists come straight from
 * plans.ts so they can't drift from enforcement. Pro is visually featured.
 * CTAs: free → sign up; pro/max → checkout (sign-up-then-checkout when logged
 * out, preserving intent via the redirect target).
 */
export function PricingCards() {
  const [interval, setInterval] = useState<Interval>("monthly");
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function choose(plan: PlanId) {
    setError(null);
    if (plan === "free") {
      router.push("/app");
      return;
    }
    setBusy(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval }),
      });
      if (res.status === 401) {
        // logged out → sign in, then resume intent
        router.push(`/app?checkout=${plan}&interval=${interval}`);
        return;
      }
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "couldn't start checkout — try again.");
      if (body.url) window.location.href = body.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't start checkout — try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {/* toggle */}
      <div className="mx-auto flex w-fit items-center gap-1 rounded-pill bg-cream-deep p-1">
        {(["monthly", "annual"] as Interval[]).map((iv) => (
          <button
            key={iv}
            onClick={() => setInterval(iv)}
            aria-pressed={interval === iv}
            className={`rounded-pill px-4 py-1.5 text-sm font-bold lowercase transition-all duration-base ease-brand-out ${
              interval === iv ? "bg-ink text-cream shadow-soft" : "text-ink-soft"
            }`}
          >
            {iv}
            {iv === "annual" && (
              <span className={interval === iv ? "text-signal" : "text-ink-soft"}>
                {" "}· 2 months free
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <p className="mx-auto mt-4 w-fit rounded-btn bg-cream-deep px-3 py-2 text-sm font-semibold" role="alert">
          {error}
        </p>
      )}

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id];
          const featured = id === "pro";
          const amount =
            plan.price.monthly === 0
              ? "$0"
              : interval === "annual"
                ? `$${plan.price.annual}`
                : `$${plan.price.monthly}`;
          const suffix = plan.price.monthly === 0 ? "" : interval === "annual" ? "/yr" : "/mo";

          return (
            <div
              key={id}
              className={`relative flex flex-col rounded-card bg-white/70 p-6 shadow-soft transition-shadow hover:shadow-lift ${
                featured ? "ring-2 ring-signal" : ""
              }`}
            >
              {featured && (
                <span className="absolute -top-3 left-6 rounded-pill bg-signal px-3 py-1 text-[11px] font-extrabold lowercase text-ink">
                  most popular
                </span>
              )}
              <h3 className="text-lg font-extrabold lowercase">{plan.name}</h3>
              <p className="mt-1 text-sm text-ink-soft">{plan.tagline}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span
                  key={amount}
                  className="animate-fade-through text-4xl font-extrabold tabular-nums"
                >
                  {amount}
                </span>
                <span className="text-sm text-ink-soft">{suffix}</span>
              </div>
              <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check size={16} strokeWidth={2.6} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => choose(id)}
                disabled={busy === id}
                className={`group relative mt-6 overflow-hidden rounded-btn px-5 py-3 text-sm font-extrabold lowercase transition-transform duration-fast active:scale-95 disabled:opacity-60 ${
                  featured ? "bg-signal text-ink" : "bg-ink text-cream"
                }`}
              >
                {!featured && (
                  <span className="absolute inset-0 origin-left scale-x-0 bg-signal transition-transform duration-[280ms] ease-brand-out group-hover:scale-x-100" />
                )}
                <span className={`relative ${!featured ? "transition-colors group-hover:text-ink" : ""}`}>
                  {busy === id ? "starting…" : id === "free" ? "start free" : `choose ${plan.name}`}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
