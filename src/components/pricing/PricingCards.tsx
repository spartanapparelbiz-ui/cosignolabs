"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { PLAN_ORDER, PLANS, type Interval, type PlanId } from "@/lib/plans";
import { useCountUp } from "@/lib/useCountUp";
import { track } from "@/lib/analytics";

/**
 * Pricing cards + monthly/annual toggle + an interactive actions slider.
 * Feature lists and limits come straight from plans.ts so they can't drift
 * from enforcement. Two live interactions:
 *   - the slider probes "which tier covers N actions" — covering tier
 *     highlights, the rest dim;
 *   - arriving from the handoff calculator (/pricing?plan=pro) pre-positions
 *     the slider and badges the recommended plan "based on your estimate".
 * Toggle numbers count between values instead of hard-swapping.
 */

/** A representative monthly volume that lands squarely inside each plan. */
const PLAN_PROBE: Record<PlanId, number> = { free: 20, pro: 500, max: 4000 };

function coveringPlan(actions: number): PlanId {
  for (const id of PLAN_ORDER) {
    if (actions <= PLANS[id].actionLimit) return id;
  }
  return "max";
}

/** One card's price number, animated between monthly/annual values. */
function PriceNumber({ plan, interval }: { plan: (typeof PLANS)[PlanId]; interval: Interval }) {
  const target = plan.price.monthly === 0 ? 0 : interval === "annual" ? plan.price.annual : plan.price.monthly;
  const shown = useCountUp(target, 420);
  const suffix = plan.price.monthly === 0 ? "" : interval === "annual" ? "/yr" : "/mo";
  /* A cent-bearing price must render its cents. The count-up returns a raw
     number, which bypassed priceLabel() and printed "$44.4" — a price nobody
     writes. Whole prices stay whole; only a fractional one grows a second
     decimal, and it keeps it for every frame of the animation. */
  const label = Number.isInteger(target) ? shown.toLocaleString() : shown.toFixed(2);
  return (
    <div className="mt-4 flex items-baseline gap-1">
      <span className="text-4xl font-extrabold tabular-nums">${label}</span>
      <span className="text-sm text-ink-soft">{suffix}</span>
    </div>
  );
}

export function PricingCards() {
  const [interval, setInterval] = useState<Interval>("monthly");
  const [recommended, setRecommended] = useState<PlanId | null>(null);
  const [probe, setProbe] = useState<number>(300);
  const [leaving, setLeaving] = useState<PlanId | null>(null);
  const router = useRouter();

  // Read the ?plan= handoff from the calculator AFTER mount (not via
  // useSearchParams, which would defer the whole render behind Suspense and
  // cause a layout shift). The cards render server-side at their real size;
  // this only adds the recommendation badge + repositions the slider.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("plan");
    if (p && PLAN_ORDER.includes(p as PlanId)) {
      setRecommended(p as PlanId);
      setProbe(PLAN_PROBE[p as PlanId]);
    }
  }, []);

  const covering = coveringPlan(probe);

  function choose(plan: PlanId) {
    track("pricing_choose", { plan, interval });
    if (plan === "free") {
      router.push("/app");
      return;
    }
    // Shared-element feel: the chosen card scales/lifts, then we hand off to
    // the embedded /checkout where its summary "continues" the same card.
    setLeaving(plan);
    setTimeout(() => router.push(`/checkout?plan=${plan}&interval=${interval}`), 250);
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

      {/* interactive actions probe */}
      <div className="mx-auto mt-8 max-w-xl rounded-card bg-surface/60 p-4 shadow-soft">
        <div className="flex items-baseline justify-between">
          <label htmlFor="probe" className="text-xs font-extrabold lowercase tracking-widest text-ink-soft">
            drag: how many AI operations a month?
          </label>
          <span className="font-mono text-sm font-bold tabular-nums">
            {probe.toLocaleString()}
          </span>
        </div>
        <input
          id="probe"
          type="range"
          min={10}
          max={10000}
          step={10}
          value={probe}
          onChange={(e) => setProbe(Number(e.target.value))}
          onPointerUp={() => track("pricing_probe", { actions: probe })}
          className="mt-2 h-11 w-full cursor-pointer accent-signal"
        />
        {/* Name the plan's REAL ceiling, not the number on the slider —
            "pro covers 300 actions / month" read as pro's limit being 300,
            directly contradicting the 1,000 printed on pro's own card. */}
        <p className="mt-1 text-sm font-semibold">
          {/* Name the plan's REAL ceiling, not the number under the thumb —
              "operator covers 300 AI operations / month" read as operator's
              limit being 300, contradicting the 1,000 on operator's own card. */}
          <span className="font-extrabold">{PLANS[covering].name}</span> covers that
          — {PLANS[covering].actionLimit.toLocaleString()} AI operations / month.
        </p>
      </div>

      <p className="mx-auto mt-4 w-fit text-center text-xs font-semibold text-ink-soft">
        14-day money-back guarantee · full refund, one tap · first month of pro is $9.
      </p>

      <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id];
          const featured = id === "pro";
          const isCovering = covering === id;
          const isRecommended = recommended === id;
          const dim = !isCovering;
          const isLeaving = leaving === id;

          return (
            <div
              key={id}
              className={`relative flex flex-col rounded-card bg-surface/70 p-6 shadow-soft transition-all duration-base ${
                isCovering ? "ring-2 ring-signal shadow-lift" : featured ? "ring-1 ring-signal/40" : ""
              } ${dim && !isLeaving ? "opacity-70" : "opacity-100"} ${
                isLeaving ? "z-10 scale-[1.03] shadow-lift" : ""
              }`}
            >
              {isRecommended ? (
                <span className="absolute -top-3 left-6 rounded-pill bg-ink px-3 py-1 text-[11px] font-extrabold lowercase text-cream">
                  based on your estimate
                </span>
              ) : featured ? (
                <span className="absolute -top-3 left-6 rounded-pill bg-signal px-3 py-1 text-[11px] font-extrabold lowercase text-on-signal">
                  most popular
                </span>
              ) : null}
              <h3 className="text-lg font-extrabold lowercase">{plan.name}</h3>
              <p className="mt-1 text-sm text-ink-soft">{plan.tagline}</p>
              <PriceNumber plan={plan} interval={interval} />
              <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check size={16} strokeWidth={2.6} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {plan.examples && (
                <p className="mt-4 border-t border-line/60 pt-3 text-xs font-semibold lowercase text-ink-soft">
                  {plan.examples.join(" · ")}
                </p>
              )}
              <button
                onClick={() => choose(id)}
                disabled={isLeaving}
                className={`group relative mt-6 min-h-[44px] overflow-hidden rounded-btn px-5 py-3 text-sm font-extrabold lowercase transition-transform duration-fast active:scale-95 disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed ${
                  featured || isCovering ? "bg-signal text-on-signal" : "bg-ink text-cream"
                }`}
              >
                {!(featured || isCovering) && (
                  <span className="absolute inset-0 origin-left scale-x-0 bg-signal transition-transform duration-base ease-brand-out group-hover:scale-x-100" />
                )}
                <span className={`relative ${!(featured || isCovering) ? "transition-colors group-hover:text-ink" : ""}`}>
                  {isLeaving ? "opening…" : id === "free" ? "start free" : `choose ${plan.name}`}
                </span>
              </button>
            </div>
          );
        })}

        {/* Enterprise — a conversation, not a checkout. No invented feature
            list: custom terms are exactly that. */}
        <div className="relative flex flex-col rounded-card bg-surface/70 p-6 shadow-soft transition-all duration-base">
          <h3 className="text-lg font-extrabold lowercase">enterprise</h3>
          <p className="mt-1 text-sm text-ink-soft">for organizations with their own rules.</p>
          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-4xl font-extrabold">custom</span>
          </div>
          <ul className="mt-5 flex flex-1 flex-col gap-2.5">
            {[
              "everything in command",
              "your volume, your terms",
              "security review & procurement support",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check size={16} strokeWidth={2.6} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <a
            href="mailto:spartanapparelbiz@gmail.com?subject=cosigno%20enterprise"
            className="mt-6 flex min-h-[44px] items-center justify-center rounded-btn bg-ink px-5 py-3 text-sm font-extrabold lowercase text-cream transition-transform duration-fast hover:-translate-y-px active:scale-95"
          >
            talk to us
          </a>
        </div>
      </div>

      {/* "actions" translated into normal missions — labeled as an estimate */}
      <p className="mx-auto mt-6 max-w-2xl text-center text-xs font-semibold text-ink-soft">
        what an AI operation is: every planning call and every executed action
        counts as one. roughly — free covers a few missions a month, operator
        covers daily use, command covers heavy volume. actual usage depends on
        mission size.
      </p>
    </div>
  );
}
