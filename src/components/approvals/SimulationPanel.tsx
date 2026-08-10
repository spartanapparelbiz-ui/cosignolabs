"use client";

import { useEffect, useState } from "react";
import { CircleAlert, FlaskConical, Lock, TriangleAlert } from "lucide-react";
import type { ActionSimulation } from "@/lib/approvals/simulate";
import { staggerDelay, STAGGER_MS } from "@/lib/motion";

/**
 * "Simulate first" — the dry run, rendered.
 *
 * Two things make this trustworthy rather than theatre. The server runs the
 * REAL boundary functions to produce it (see lib/approvals/simulate), and the
 * panel opens with the sentence that nothing happened, in the same place
 * every time. A preview that has to be inspected to find out whether it was a
 * preview is worse than no preview.
 *
 * The stage where the action stops being recoverable is marked. That is the
 * one thing a person is really looking for when they click simulate, and a
 * flat list of steps buries it among the plumbing.
 */
export function SimulationPanel({ actionId }: { actionId: string }) {
  const [sim, setSim] = useState<ActionSimulation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/actions/${actionId}/simulate`, { method: "POST" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message || "couldn't run the simulation.");
        if (alive) setSim(body.simulation as ActionSimulation);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "couldn't run the simulation.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [actionId]);

  if (error) {
    return (
      <p className="mt-3 rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold" role="alert">
        {error}
      </p>
    );
  }

  if (!sim) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-btn bg-cream-deep/60 px-3 py-2.5">
        <FlaskConical size={13} className="shrink-0 animate-orb-pulse text-ink-soft" aria-hidden="true" />
        <span className="text-xs font-bold text-ink-soft">working out what would happen…</span>
      </div>
    );
  }

  return (
    <div className="mt-3 animate-blur-in rounded-btn bg-cream-deep/60 p-3 ring-1 ring-inset ring-line/60">
      {/* Always first, always the same words. */}
      <p className="flex items-start gap-1.5 text-[11px] font-extrabold lowercase leading-snug text-ink-soft">
        <FlaskConical size={12} className="mt-px shrink-0" aria-hidden="true" />
        {sim.note}
      </p>

      {sim.blocked ? (
        <div className="mt-2.5 flex items-start gap-2 rounded-btn bg-signal/10 px-2.5 py-2 ring-1 ring-inset ring-signal/30">
          <Lock size={13} strokeWidth={2.5} className="mt-px shrink-0 text-signal" aria-hidden="true" />
          <p className="text-pretty text-xs font-bold leading-snug">{sim.blockedReason}</p>
        </div>
      ) : (
        <>
          <p className="mt-2.5 text-[10px] font-extrabold uppercase tracking-widest text-ink-soft">
            what would happen, in order
          </p>
          <ol className="mt-1.5 flex flex-col gap-1.5">
            {sim.steps.map((s, i) => (
              <li
                key={i}
                style={staggerDelay(i, STAGGER_MS.rows)}
                className="flex animate-feed-in items-start gap-2"
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-pill font-mono text-[9px] font-bold ${
                    s.irreversible
                      ? "bg-signal text-on-signal"
                      : "bg-surface text-ink-soft ring-1 ring-inset ring-line"
                  }`}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-pretty text-xs leading-snug ${
                      s.irreversible ? "font-bold text-ink" : "font-semibold text-ink-soft"
                    }`}
                  >
                    {s.text}
                  </span>
                  {s.irreversible && (
                    <span className="mt-0.5 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-signal">
                      <TriangleAlert size={10} strokeWidth={3} aria-hidden="true" />
                      past this point it can&apos;t be taken back
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}

      <dl className="mt-3 grid gap-x-4 gap-y-1.5 border-t border-line/60 pt-2.5 text-[11px] sm:grid-cols-2">
        <Fact label="approving requires" value={sim.requires} />
        <Fact label="takes" value={sim.duration} />
        <Fact label="afterwards" value={sim.rollback} wide />
        {sim.rules.length > 0 && (
          <Fact label="your rules" value={sim.rules.join(" · ")} wide />
        )}
      </dl>

      {!sim.blocked && sim.requires !== "runs immediately" && (
        <p className="mt-2.5 flex items-start gap-1.5 text-[11px] font-semibold text-ink-soft">
          <CircleAlert size={12} className="mt-px shrink-0" aria-hidden="true" />
          none of this has happened. it runs only when you approve below.
        </p>
      )}
    </div>
  );
}

function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[10px] font-extrabold uppercase tracking-widest text-ink-soft">
        {label}
      </dt>
      <dd className="text-pretty font-semibold leading-snug">{value}</dd>
    </div>
  );
}
