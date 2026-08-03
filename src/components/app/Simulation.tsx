"use client";

import { useState } from "react";
import { AlertTriangle, FlaskConical } from "lucide-react";

/**
 * Simulation — replay a draft policy against real decision history before
 * enabling it. Existing dashboard vocabulary only.
 */

interface SimDecision {
  decision_id: string;
  actor: string;
  action: string;
  resource: string;
  before: string;
  after: string;
  changed: boolean;
  newly_held: boolean;
  newly_blocked: boolean;
  already_executed: boolean;
  reason: string;
}
interface SimResult {
  rule: { text?: string; action?: string; actor?: string; min_amount_cents?: number; requirement: string };
  evaluated: number;
  matched: number;
  unchanged: number;
  tightened: number;
  newly_held: number;
  newly_blocked: number;
  would_have_stopped: SimDecision[];
  decisions: SimDecision[];
  confidence: "high" | "low";
  history_size: number;
}

const EXAMPLES = [
  "Never allow deleting production databases.",
  "Require two approvals for deployments.",
  "Only approve payments over $5,000 with a signature.",
  "Marketing cannot publish campaigns without approval.",
];

const AUTH_TONE: Record<string, string> = {
  auto: "bg-cream-deep text-ink-soft",
  approve: "bg-signal/15 text-ink",
  sign: "bg-signal text-ink",
  deny: "bg-ink text-cream",
};

export function Simulation() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SimResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(value?: string) {
    const t = (value ?? text).trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/v1/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "simulation failed.");
      setRes(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "simulation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.28em] text-signal">simulation</p>
        <h1 className="mt-2 font-display text-3xl font-bold lowercase tracking-tight sm:text-4xl">
          see what a policy would have done.
        </h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold text-ink-soft">
          Write a rule in plain English. Cosigno replays it against every decision already on your
          ledger and reports exactly what it would have caught — before you enable it on anything.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="e.g. Require a signature for refunds over $500"
          aria-label="draft policy rule"
          className="min-h-[48px] flex-1 rounded-btn border border-line bg-surface px-4 text-sm outline-none transition focus:ring-2 focus:ring-signal"
        />
        <button
          onClick={() => run()}
          disabled={busy || !text.trim()}
          className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-btn bg-signal px-6 text-sm font-extrabold text-ink shadow-soft transition-transform active:scale-95 disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
        >
          <FlaskConical size={16} /> {busy ? "Simulating…" : "Simulate"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => (
          <button
            key={e}
            onClick={() => {
              setText(e);
              run(e);
            }}
            className="rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:bg-cream-deep hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            {e}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-card border border-line bg-surface p-4 text-sm font-semibold">{error}</p>
      )}

      {res && (
        <>
          {res.confidence === "low" && (
            <p className="mt-6 flex items-start gap-2 rounded-card border border-signal bg-surface p-4 text-sm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
              <span>
                <b>Read this rule before saving.</b> Cosigno couldn&apos;t confidently parse part of
                it, so it fell back to the stricter reading (
                <span className="font-mono text-xs">{res.rule.requirement}</span>). It never guesses
                in the permissive direction.
              </span>
            </p>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "decisions replayed", value: res.evaluated, note: `${res.matched} in scope` },
              {
                label: "tightened",
                value: res.tightened,
                note: `${res.newly_held} newly need a human`,
              },
              { label: "newly blocked", value: res.newly_blocked, note: "would be refused" },
              { label: "no change", value: res.unchanged, note: "already this strict" },
            ].map((s) => (
              <div key={s.label} className="rounded-card border border-line bg-surface p-4 shadow-soft">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-ink-soft">
                  {s.label}
                </p>
                <p className="mt-1.5 font-display text-3xl font-bold tabular-nums">{s.value}</p>
                <p className="mt-0.5 text-xs text-ink-soft">{s.note}</p>
              </div>
            ))}
          </div>

          {res.would_have_stopped.length > 0 && (
            <div className="mt-6 rounded-card border border-signal bg-surface p-4 shadow-soft">
              <p className="text-sm font-bold">
                This rule would have stopped {res.would_have_stopped.length} action
                {res.would_have_stopped.length === 1 ? "" : "s"} that already ran.
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {res.would_have_stopped.slice(0, 5).map((d) => (
                  <li key={d.decision_id} className="text-xs text-ink-soft">
                    <span className="font-mono">{d.actor}</span>{" "}
                    <span className="font-bold text-ink">{d.action}</span> on {d.resource} —{" "}
                    {d.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <section className="mt-8">
            <h2 className="font-display text-xl font-bold lowercase">what changes</h2>
            {res.decisions.filter((d) => d.changed).length === 0 ? (
              <p className="mt-3 rounded-card border border-dashed border-line bg-surface/60 p-6 text-center text-sm text-ink-soft">
                This rule changes nothing on your current history — every matching decision already
                required at least this much authority.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] border-separate border-spacing-y-2 text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-black uppercase tracking-[0.14em] text-ink-soft">
                      <th className="px-3">actor / action</th>
                      <th className="px-3">before</th>
                      <th className="px-3">after</th>
                      <th className="px-3 text-right">note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.decisions
                      .filter((d) => d.changed)
                      .slice(0, 25)
                      .map((d) => (
                        <tr key={d.decision_id} className="bg-surface shadow-soft">
                          <td className="rounded-l-card border-y border-l border-line px-3 py-3">
                            <p className="font-mono text-[11px] text-ink-soft">{d.actor}</p>
                            <p className="font-bold">{d.action}</p>
                          </td>
                          <td className="border-y border-line px-3 py-3">
                            <span className={`rounded-pill px-2 py-0.5 text-[11px] font-black uppercase ${AUTH_TONE[d.before]}`}>
                              {d.before}
                            </span>
                          </td>
                          <td className="border-y border-line px-3 py-3">
                            <span className={`rounded-pill px-2 py-0.5 text-[11px] font-black uppercase ${AUTH_TONE[d.after]}`}>
                              {d.after}
                            </span>
                          </td>
                          <td className="rounded-r-card border-y border-r border-line px-3 py-3 text-right text-xs text-ink-soft">
                            {d.already_executed ? "already executed" : d.reason}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="mt-8 text-center text-[11px] text-ink-soft">
            A rule can only ever raise the authority an action requires — simulation can never show
            a policy making the system more permissive, because a policy cannot.
          </p>
        </>
      )}
    </div>
  );
}
