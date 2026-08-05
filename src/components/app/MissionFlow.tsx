"use client";

import { useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import type { MissionApp } from "@/lib/missionStory";
import type { StepMark } from "@/lib/status";

/**
 * The workflow map for one mission: the apps it moves through, left to right,
 * each turning green as its part finishes.
 *
 *     cosigno → Calendar → Email → Files
 *        ✓         ✓         ●       ○
 *
 * Clicking a box says exactly what happened in that app — the steps, and what
 * each one produced. That's the whole interaction: no zoom, no graph, nothing
 * to learn.
 */

const BOX: Record<StepMark, string> = {
  done: "border-signal bg-signal/10",
  current: "border-signal bg-signal/15 animate-orb-pulse",
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

export function MissionFlow({ apps }: { apps: MissionApp[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (apps.length === 0) return null;

  const active = apps.find((a) => a.key === open) ?? null;

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <ol className="flex min-w-min items-center gap-1">
          {apps.map((app, i) => (
            <li key={app.key} className="flex items-center gap-1">
              <button
                onClick={() => setOpen(open === app.key ? null : app.key)}
                aria-expanded={open === app.key}
                className={`flex shrink-0 items-center gap-1.5 rounded-btn border px-3 py-1.5 text-left transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal ${BOX[app.mark]} ${
                  open === app.key ? "ring-2 ring-signal" : ""
                }`}
              >
                <Mark mark={app.mark} />
                <span className="text-xs font-bold">{app.name}</span>
              </button>
              {i < apps.length - 1 && (
                <ArrowRight size={13} className="shrink-0 text-ink-soft" aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
      </div>

      {active && (
        <div className="mt-2 rounded-btn border border-line/70 bg-cream/40 px-3 py-2.5">
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

function Mark({ mark }: { mark: StepMark }) {
  if (mark === "done") {
    return (
      <span
        className="flex h-4 w-4 items-center justify-center rounded-pill bg-signal text-cream"
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
          ? "bg-signal/60"
          : mark === "your_turn"
            ? "bg-ink"
            : "bg-cream-deep ring-1 ring-inset ring-ink/15"
      }`}
      aria-hidden="true"
    />
  );
}
