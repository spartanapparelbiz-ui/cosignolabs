"use client";

import { useEffect, useState } from "react";
import { UNLIMITED } from "@/lib/missions/budget";
import { SectionLabel } from "@/components/ui/Page";

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
      .catch(() => setError("Couldn't load your limit."));
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
      if (!res.ok) throw new Error(body.message || "That limit didn't save.");
      setBudget(body.budget);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That limit didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <SectionLabel className="mb-3">How much before it checks in</SectionLabel>
      <p className="t-body max-w-[42rem]">
        A mission stops after this many actions and asks whether to keep going. An action
        is a real change — a message sent, a page published, a record updated. Thinking,
        reading, searching and drafting never count.
      </p>
      <div className="mt-5 flex flex-wrap gap-0.5 self-start rounded-pill bg-ink/[0.05] p-1">
        {choices.map((n) => (
          <button
            key={n}
            onClick={() => choose(n)}
            disabled={busy || budget === null}
            aria-pressed={budget === n}
            className={`rounded-pill px-3.5 py-1.5 text-[0.875rem] transition-all duration-fast ease-brand-out disabled:cursor-not-allowed ${
              budget === n
                ? "bg-surface font-semibold text-ink shadow-rest"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            {n === UNLIMITED ? "Unlimited" : `${n} actions`}
          </button>
        ))}
      </div>
      {error && (
        <p className="t-body mt-3 border-l-2 border-danger pl-3.5 text-danger" role="alert">
          {error}
        </p>
      )}
      <p className="t-caption mt-3">
        {budget === UNLIMITED
          ? "Missions run to completion. Every action still follows the permissions above — unlimited means no count, not no approval."
          : "A mission you've given its own limit keeps it. Everything else follows this."}
      </p>
    </section>
  );
}
