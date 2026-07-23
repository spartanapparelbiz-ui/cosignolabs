"use client";

import { useState } from "react";
import { GitBranch, Zap, DollarSign, ShieldCheck, Star } from "lucide-react";

/**
 * Mission Forks — prepare the SAME goal several ways and compare the tradeoffs
 * before committing. Selecting a fork does NOT execute it: it compiles that
 * approach into a mission that then flows through the normal approval gate.
 * All plans are server-validated, so no fork is ever a broken plan.
 */

type ForkKey = "recommended" | "fastest" | "cheapest" | "safest";

interface ForkOption {
  key: ForkKey;
  label: string;
  summary: string;
  tradeoffs: string[];
  budget_cents: number;
  step_count: number;
  distinct_plan: boolean;
}

interface ForksResult {
  goal: string;
  blocked: boolean;
  boundary: string | null;
  options: ForkOption[];
}

const ICON: Record<ForkKey, typeof Star> = {
  recommended: Star,
  fastest: Zap,
  cheapest: DollarSign,
  safest: ShieldCheck,
};

export function ForksExplorer() {
  const [goal, setGoal] = useState("");
  const [forks, setForks] = useState<ForksResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function preview() {
    const g = goal.trim();
    if (!g) return;
    setBusy(true);
    setError(null);
    setForks(null);
    try {
      const res = await fetch("/api/missions/forks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal: g }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "couldn't build alternatives.");
      setForks(json.forks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't build alternatives.");
    } finally {
      setBusy(false);
    }
  }

  async function choose(fork: ForkKey) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/missions/forks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal: goal.trim(), fork }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "couldn't start that approach.");
      if (json.mission?.id) window.location.href = `/app/missions/${json.mission.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't start that approach.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-well">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        <GitBranch size={18} className="text-ink" aria-hidden />
        <span className="font-display text-lg font-bold lowercase">compare approaches</span>
        <span className="ml-auto text-xs font-bold text-ink-soft">{open ? "hide" : "show"}</span>
      </button>

      {open && (
        <>
          <p className="mt-1 text-sm font-semibold text-ink-soft">
            see the same goal prepared several ways — recommended, fastest, cheapest, safest — with
            the tradeoffs spelled out. picking one prepares it for your approval; nothing runs yet.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && preview()}
              placeholder="e.g. research the three best laptops under $1200"
              className="flex-1 rounded-btn border border-line bg-cream px-3.5 py-2.5 text-sm font-medium text-ink"
            />
            <button
              onClick={preview}
              disabled={busy || !goal.trim()}
              className="rounded-btn bg-ink px-4 py-2.5 text-sm font-bold text-cream hover:opacity-90 disabled:opacity-50"
            >
              {busy && !forks ? "thinking…" : "Compare"}
            </button>
          </div>

          {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}

          {forks?.blocked && (
            <p className="mt-3 rounded-btn bg-cream-deep px-3 py-2 text-sm font-semibold text-ink">
              {forks.boundary ?? "cosigno can't turn that into a runnable plan yet."}
            </p>
          )}

          {forks && !forks.blocked && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {forks.options.map((opt) => {
                const Icon = ICON[opt.key];
                return (
                  <div key={opt.key} className="flex flex-col rounded-card border border-line bg-cream-deep/30 p-4">
                    <div className="flex items-center gap-2">
                      <Icon size={16} className="text-ink" aria-hidden />
                      <h3 className="font-display text-base font-bold">{opt.label}</h3>
                    </div>
                    <p className="mt-1 text-sm font-medium text-ink">{opt.summary}</p>
                    <ul className="mt-2 flex flex-1 flex-col gap-1">
                      {opt.tradeoffs.map((t, i) => (
                        <li key={i} className="text-xs font-medium text-ink-soft">
                          · {t}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => choose(opt.key)}
                      disabled={busy}
                      className="mt-3 rounded-btn border border-ink px-3 py-1.5 text-xs font-bold text-ink transition-colors hover:bg-ink hover:text-cream disabled:opacity-50"
                    >
                      Prepare this
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
