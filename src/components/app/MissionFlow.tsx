"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Flag, Play, X } from "lucide-react";
import type { MissionApp } from "@/lib/missionStory";
import type { StepMark } from "@/lib/status";

/**
 * The journey one piece of work takes.
 *
 *     Goal ──✓── cosigno ──✓── Calendar ──●── Email ──○── Finished
 *
 * Not a diagram of systems: a route, with bookends. Each stop lights up as
 * work reaches it, the line between two stops FILLS when the earlier one
 * finishes, and the stop that's happening right now pulses. Replay walks the
 * route again at reading speed — the order is the recorded one, so it is a
 * replay rather than an animation invented for effect.
 *
 * Clicking a stop says exactly what happened there.
 */

const STOP: Record<StepMark, string> = {
  done: "border-signal bg-signal/10",
  current: "border-signal bg-signal/20 shadow-lift",
  your_turn: "border-ink bg-ink/5",
  stopped: "border-ink/50 bg-cream-deep",
  upcoming: "border-line bg-surface/60",
};

const MARK_WORD: Record<StepMark, string> = {
  done: "done",
  current: "working",
  your_turn: "needs you",
  stopped: "stopped",
  upcoming: "not started",
};

export function MissionFlow({ apps, finished }: { apps: MissionApp[]; finished?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  /** During replay, only stops up to this index are shown as reached. */
  const [replayTo, setReplayTo] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  if (apps.length === 0) return null;

  const active = apps.find((a) => a.key === open) ?? null;
  const reached = (i: number) => (replayTo === null ? true : i <= replayTo);

  function replay() {
    if (timer.current) clearInterval(timer.current);
    setReplayTo(-1);
    let i = -1;
    timer.current = setInterval(() => {
      i += 1;
      setReplayTo(i);
      if (i >= apps.length) {
        if (timer.current) clearInterval(timer.current);
        // Settle back to live state so the route never lies about "now".
        setTimeout(() => setReplayTo(null), 700);
      }
    }, 520);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 overflow-x-auto pb-1">
          <ol className="flex min-w-min items-center">
            <Bookend icon={<Flag size={11} strokeWidth={2.8} />} label="Goal" reached />
            <Line filled={reached(0) && apps[0]?.mark !== "upcoming"} />

            {apps.map((app, i) => {
              const shown: StepMark = reached(i) ? app.mark : "upcoming";
              return (
                <li key={app.key} className="flex items-center">
                  <button
                    onClick={() => setOpen(open === app.key ? null : app.key)}
                    aria-expanded={open === app.key}
                    className={`flex shrink-0 items-center gap-1.5 rounded-btn border px-3 py-1.5 text-left transition-all duration-base ease-brand-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal ${STOP[shown]} ${
                      open === app.key ? "ring-2 ring-signal" : ""
                    } ${shown === "current" ? "animate-pulse-glow" : ""}`}
                  >
                    <Mark mark={shown} />
                    <span className="text-xs font-bold">{app.name}</span>
                  </button>
                  <Line filled={reached(i) && app.mark === "done"} />
                </li>
              );
            })}

            <Bookend
              icon={<Check size={11} strokeWidth={3.2} />}
              label="Finished"
              reached={Boolean(finished) && replayTo === null}
            />
          </ol>
        </div>

        <button
          onClick={replay}
          className="inline-flex shrink-0 items-center gap-1 rounded-btn px-2 py-1 text-[11px] font-bold text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          aria-label="replay this journey"
        >
          <Play size={10} strokeWidth={3} aria-hidden="true" />
          replay
        </button>
      </div>

      {active && (
        <div className="mt-2 animate-card-in rounded-btn border border-line/70 bg-cream/40 px-3 py-2.5">
          <p className="text-xs font-bold">
            {active.name} · {MARK_WORD[active.mark]}
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {active.steps.map((s) => (
              <li key={s.id} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 shrink-0">
                  <Mark mark={s.mark} />
                </span>
                <span className="min-w-0">
                  <span className={s.mark === "done" ? "" : "text-ink-soft"}>{s.purpose}</span>
                  {s.detail && <span className="block text-[11px] text-ink-soft">{s.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The connector between two stops. Fills left-to-right as work passes. */
function Line({ filled }: { filled: boolean }) {
  return (
    <span className="relative mx-1 block h-[2px] w-6 shrink-0 overflow-hidden rounded-pill bg-line" aria-hidden="true">
      <span
        className="absolute inset-y-0 left-0 bg-signal transition-[width] duration-base ease-brand-out"
        style={{ width: filled ? "100%" : "0%" }}
      />
    </span>
  );
}

function Bookend({ icon, label, reached }: { icon: React.ReactNode; label: string; reached: boolean }) {
  return (
    <li
      className={`flex shrink-0 items-center gap-1.5 rounded-btn border px-2.5 py-1.5 transition-colors duration-base ${
        reached ? "border-signal bg-signal/10 text-ink" : "border-line bg-surface/60 text-ink-soft"
      }`}
    >
      <span className={reached ? "text-signal" : "text-ink-soft"} aria-hidden="true">
        {icon}
      </span>
      <span className="text-xs font-bold">{label}</span>
    </li>
  );
}

function Mark({ mark }: { mark: StepMark }) {
  if (mark === "done") {
    return (
      <span
        className="flex h-4 w-4 animate-check-pop items-center justify-center rounded-pill bg-signal text-cream"
        aria-hidden="true"
      >
        <Check size={10} strokeWidth={3.4} />
      </span>
    );
  }
  if (mark === "stopped") {
    return (
      <span
        className="flex h-4 w-4 items-center justify-center rounded-pill text-ink ring-1 ring-inset ring-ink/50"
        aria-hidden="true"
      >
        <X size={10} strokeWidth={3.4} />
      </span>
    );
  }
  return (
    <span
      className={`block h-4 w-4 rounded-pill ${
        mark === "current"
          ? "animate-orb-pulse bg-signal"
          : mark === "your_turn"
            ? "bg-ink"
            : "bg-cream-deep ring-1 ring-inset ring-ink/15"
      }`}
      aria-hidden="true"
    />
  );
}
