"use client";

import { useEffect, useState } from "react";
import { UNLIMITED } from "@/lib/missions/budget";

/**
 * The workspace execution budget — how much work a mission may complete before
 * it checks in.
 *
 * It sits on the trust page because it answers the same question the rows
 * above do: what can this thing do to my business. The rows say WHICH actions;
 * this says HOW MANY, unattended.
 *
 * Counted in actions, never in money. The product used to show a mission's cap
 * as "$2.00", which is cosigno's hosting cost wearing the label of a decision
 * the user made. Infrastructure cost stays internal.
 */
export function BudgetPanel() {
  const [budget, setBudget] = useState<number | null>(null);
  const [choices, setChoices] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/budget")
      .then((r) => r.json())
      .then((d) => {
        setBudget(typeof d.budget === "number" ? d.budget : null);
        setChoices(d.choices ?? []);
      })
      .catch(() => setError("couldn't load your limit."));
  }, []);

  async function choose(value: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget: value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "that limit didn't save.");
      setBudget(body.budget);
    } catch (e) {
      setError(e instanceof Error ? e.message : "that limit didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-ink-soft">
        Execution budget
      </h2>
      <div className="mt-3 rounded-card bg-surface/60 p-5 shadow-soft">
        <p className="text-lg font-extrabold">How much work before it checks in</p>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          a mission stops after this many actions and asks whether to keep going. an action
          is a real change — a message sent, a page published, a record updated. thinking,
          reading, searching and drafting never count.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {choices.map((n) => (
            <button
              key={n}
              onClick={() => choose(n)}
              disabled={busy || budget === null}
              aria-pressed={budget === n}
              className={`rounded-pill px-4 py-2 text-sm font-bold transition-all duration-fast disabled:cursor-not-allowed ${
                budget === n
                  ? "bg-ink text-cream shadow-soft"
                  : "bg-cream-deep text-ink-soft hover:text-ink"
              }`}
            >
              {n === UNLIMITED ? "unlimited" : `${n} actions`}
            </button>
          ))}
        </div>
        {error && (
          <p className="mt-2.5 text-xs font-semibold" role="alert">
            {error}
          </p>
        )}
        <p className="mt-3 text-xs text-ink-soft">
          {budget === UNLIMITED
            ? "missions run to completion. every action still follows the permissions above — unlimited means no count, not no approval."
            : "any mission you've given its own limit keeps it. everything else follows this."}
        </p>
      </div>
    </section>
  );
}
