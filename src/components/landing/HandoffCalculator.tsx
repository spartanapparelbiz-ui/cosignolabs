"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PLANS, PLAN_ORDER, type PlanId } from "@/lib/plans";
import { track } from "@/lib/analytics";
import { useCountUp } from "@/lib/useCountUp";

/**
 * "What would you hand off?" — the visitor sizes their own week and sees the
 * plan that fits and the hours it buys back. All math is client-side and
 * reads plan limits straight from plans.ts, so the answer can never disagree
 * with the pricing page. Output links to /pricing?plan=<fit> to carry the
 * estimate across. Chips + native range slider = keyboard-accessible.
 */

interface Task {
  id: string;
  label: string;
  /** typical actions per delegated task */
  perTask: number;
}

const TASKS: Task[] = [
  { id: "inbox", label: "inbox triage", perTask: 2 },
  { id: "followups", label: "follow-ups", perTask: 2 },
  { id: "orders", label: "order updates", perTask: 2 },
  { id: "scheduling", label: "scheduling", perTask: 1 },
  { id: "reporting", label: "reporting", perTask: 3 },
];

const WEEKS_PER_MONTH = 4.33;
const MINUTES_PER_ACTION = 2;

/** Smallest plan whose monthly action limit covers the estimate. */
function fitPlan(actionsPerMonth: number): PlanId {
  for (const id of PLAN_ORDER) {
    if (actionsPerMonth <= PLANS[id].actionLimit) return id;
  }
  return "max";
}

export default function HandoffCalculator() {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(["inbox", "followups"])
  );
  const [perWeek, setPerWeek] = useState(25);

  const { actionsPerMonth, plan, hours } = useMemo(() => {
    const chosen = TASKS.filter((t) => selected.has(t.id));
    const avgPerTask =
      chosen.length === 0
        ? 0
        : chosen.reduce((s, t) => s + t.perTask, 0) / chosen.length;
    const perMonth = Math.round(perWeek * avgPerTask * WEEKS_PER_MONTH);
    return {
      actionsPerMonth: perMonth,
      plan: PLANS[fitPlan(perMonth)],
      hours: Math.round((perMonth * MINUTES_PER_ACTION) / 60),
    };
  }, [selected, perWeek]);

  const shownActions = useCountUp(actionsPerMonth);
  const shownHours = useCountUp(hours);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    track("calc_toggle", { task: id });
  }

  const empty = selected.size === 0;

  return (
    <div className="mx-auto w-full max-w-2xl rounded-card bg-surface/70 p-5 shadow-lift sm:p-6">
      {/* task chips */}
      <p className="text-xs font-extrabold lowercase tracking-widest text-ink-soft">
        what would you delegate?
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {TASKS.map((t) => {
          const on = selected.has(t.id);
          return (
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              aria-pressed={on}
              className={`min-h-[44px] rounded-pill px-4 py-2 text-sm font-bold lowercase transition-all duration-fast ease-brand-out ${
                on
                  ? "bg-ink text-cream shadow-soft"
                  : "bg-cream-deep text-ink-soft hover:-translate-y-px"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* volume slider */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <label htmlFor="calc-week" className="text-xs font-extrabold lowercase tracking-widest text-ink-soft">
            tasks per week
          </label>
          <span className="font-mono text-sm font-bold">{perWeek}</span>
        </div>
        <input
          id="calc-week"
          type="range"
          min={5}
          max={120}
          step={5}
          value={perWeek}
          onChange={(e) => setPerWeek(Number(e.target.value))}
          onPointerUp={() => track("calc_slider", { perWeek })}
          className="mt-2 h-11 w-full cursor-pointer accent-signal"
        />
      </div>

      {/* output */}
      <div className="mt-6 rounded-card bg-cream-deep p-4">
        {empty ? (
          <p className="text-sm font-semibold text-ink-soft">
            pick at least one task to size your week.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-3xl font-extrabold tabular-nums">
                  ~{shownActions.toLocaleString()}
                </p>
                <p className="text-xs font-bold lowercase text-ink-soft">
                  actions / month
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-extrabold tabular-nums text-signal">
                  {shownHours}h
                </p>
                <p className="text-xs font-bold lowercase text-ink-soft">
                  reclaimed / month
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm font-semibold">
              that&apos;s ~{actionsPerMonth.toLocaleString()} actions —{" "}
              <span className="font-extrabold">{plan.name}</span>{" "}
              {plan.id === "free"
                ? "covers you free."
                : `covers you (${plan.actionLimit.toLocaleString()}/mo).`}
            </p>
            <Link
              href={`/pricing?plan=${plan.id}`}
              prefetch
              onClick={() => track("calc_cta", { plan: plan.id, actionsPerMonth })}
              className="mt-4 inline-flex min-h-[44px] items-center rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink shadow-soft transition-transform duration-fast ease-brand-out hover:-translate-y-px active:scale-95"
            >
              see {plan.name} pricing →
            </Link>
          </>
        )}
      </div>
      <p className="mt-2 text-[11px] text-ink-soft">
        estimate only · 2 min saved per action · limits from our live plans.
      </p>
    </div>
  );
}
