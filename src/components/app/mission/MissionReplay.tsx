"use client";

import { useMemo, useState } from "react";
import {
  Check,
  CircleDot,
  Flag,
  Hourglass,
  PenLine,
  Play,
  Square,
} from "lucide-react";
import type { ActionRecord, MissionRecord, MissionStepRecord } from "@/lib/types";
import {
  buildReplay,
  spanLabel,
  whereTimeWent,
  type ReplayKind,
} from "@/lib/missions/replay";
import { staggerDelay, STAGGER_MS } from "@/lib/motion";

/**
 * The replay — a finished mission's recorded history, scrubbable.
 *
 * The scrubber is proportional to REAL time, and that is the entire point.
 * A list of events with timestamps reads as a sequence of similar-sized
 * things; the scrubber shows that the two-day mission was a dense cluster of
 * work in the first minute and one enormous empty stretch waiting on a
 * decision. Where the time went is visible before a single line is read.
 *
 * Scrubbing filters the ledger to "what had happened by this point" — it
 * re-executes nothing and re-narrates nothing. Every line is a stored
 * timestamp; two viewings can never disagree.
 */

const KIND_META: Record<
  ReplayKind,
  { Icon: typeof Check; tone: "quiet" | "live" | "attention" }
> = {
  accepted: { Icon: Play, tone: "quiet" },
  started: { Icon: CircleDot, tone: "live" },
  finished: { Icon: Check, tone: "live" },
  boundary: { Icon: PenLine, tone: "attention" },
  decided: { Icon: Check, tone: "attention" },
  stalled: { Icon: Hourglass, tone: "attention" },
  ended: { Icon: Flag, tone: "quiet" },
};

function clock(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MissionReplay({
  mission,
  steps,
  actions,
}: {
  mission: MissionRecord;
  steps: MissionStepRecord[];
  actions: ActionRecord[];
}) {
  const replay = useMemo(
    () => buildReplay(mission, steps, actions),
    [mission, steps, actions]
  );
  // The scrub position, 0..1 of the mission's real span. Starts at the end:
  // the default view is the whole story, and scrubbing back is the question.
  const [pos, setPos] = useState(1);

  if (replay.moments.length < 3 || replay.spanMs <= 0) return null;

  const cutoff = replay.spanMs * pos;
  const visible = replay.moments.filter((m) => m.offsetMs <= cutoff);
  const summary = whereTimeWent(replay);

  return (
    <section className="rounded-card border border-line/70 bg-surface p-4 shadow-soft">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">
          Replay
        </h2>
        <span className="text-xs font-bold">{spanLabel(replay.spanMs)} recorded</span>
        {summary && (
          <span className="text-[11px] font-semibold text-ink-soft">{summary}</span>
        )}
      </div>

      {/* The scrubber. Ticks sit at each moment's REAL position, so density is
          visible at a glance: clustered ticks are work, empty track is a wait. */}
      <div className="mt-3">
        <div className="relative h-6">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-pill bg-cream-deep" />
          <div
            className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-pill bg-signal/50 transition-[width] duration-fast"
            style={{ width: `${pos * 100}%` }}
          />
          {replay.moments.map((m, i) => (
            <span
              key={`${m.kind}-${i}`}
              className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-pill ${
                m.kind === "stalled"
                  ? "bg-cream ring-1 ring-signal/60"
                  : m.offsetMs <= cutoff
                    ? "bg-signal"
                    : "bg-line"
              }`}
              style={{ left: `${(m.offsetMs / replay.spanMs) * 100}%` }}
              aria-hidden="true"
            />
          ))}
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(pos * 1000)}
            onChange={(e) => setPos(Number(e.target.value) / 1000)}
            aria-label={`replay position — showing the first ${spanLabel(cutoff || 1)} of ${spanLabel(replay.spanMs)}`}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          />
        </div>
        <p className="mt-1 text-[10px] font-bold lowercase text-ink-soft/80">
          drag to scrub — showing {visible.length} of {replay.moments.length} moments
        </p>
      </div>

      <ol className="mt-3 flex flex-col gap-1">
        {visible.map((m, i) => {
          const meta = KIND_META[m.kind];
          return (
            <li
              key={`${m.kind}-${m.at}-${i}`}
              style={staggerDelay(i, STAGGER_MS.rows)}
              className="flex animate-feed-in items-start gap-2.5 rounded-btn px-2 py-1.5"
            >
              <meta.Icon
                size={13}
                strokeWidth={2.5}
                className={`mt-px shrink-0 ${
                  meta.tone === "attention"
                    ? "text-signal"
                    : meta.tone === "live"
                      ? "text-ink"
                      : "text-ink-soft"
                }`}
                aria-hidden="true"
              />
              <span
                className={`min-w-0 flex-1 text-pretty text-xs leading-snug ${
                  m.kind === "stalled" ? "font-bold text-ink" : "font-semibold text-ink-soft"
                }`}
              >
                {m.text}
              </span>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-soft/70">
                {clock(m.at)}
              </span>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-ink-soft">
            <Square size={12} aria-hidden="true" /> before the beginning — drag right.
          </li>
        )}
      </ol>
    </section>
  );
}
