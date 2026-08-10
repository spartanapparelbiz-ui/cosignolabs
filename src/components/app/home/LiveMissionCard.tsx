"use client";

import Link from "next/link";
import { ArrowRight, Check, Minus, PenLine, TriangleAlert, X } from "lucide-react";
import type { HomeMission, HomeMissionStep } from "@/lib/home/model";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Surface } from "@/components/ui/Surface";
import { staggerDelay, STAGGER_MS } from "@/lib/motion";

/**
 * A mission in flight, with its work visible.
 *
 * The design problem this solves: a spinner and the word "working" tell you
 * that time is passing, which you already knew. What you want to know is what
 * it is doing, what it has finished, and whether it is about to need you. So
 * every step is on screen with its own state, the running one carries a
 * travelling bar (indeterminate — nobody knows how long a Gmail search takes),
 * and finished ones carry the brand check.
 *
 * The overall bar is the only number here, and it is counted from step states,
 * never from elapsed time. A progress bar that advances because seconds went
 * by is a claim about work that isn't happening.
 */

const STEP_STYLE: Record<
  HomeMissionStep["state"],
  { label: string; tone: "done" | "live" | "wait" | "idle" | "stop" }
> = {
  ready: { label: "queued", tone: "idle" },
  running: { label: "running", tone: "live" },
  verifying: { label: "checking the result", tone: "live" },
  retrying: { label: "hit a problem — retrying", tone: "live" },
  awaiting_input: { label: "needs your answer", tone: "wait" },
  awaiting_approval: { label: "needs your approval", tone: "wait" },
  completed: { label: "done", tone: "done" },
  failed: { label: "didn't complete", tone: "stop" },
  vetoed: { label: "you stopped this", tone: "stop" },
  skipped: { label: "skipped", tone: "idle" },
  canceled: { label: "canceled", tone: "idle" },
};

function StepMarker({ state }: { state: HomeMissionStep["state"] }) {
  const { tone } = STEP_STYLE[state];
  if (tone === "done") {
    return (
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-pill bg-signal text-on-signal"
        aria-hidden="true"
      >
        <Check size={10} strokeWidth={3.4} />
      </span>
    );
  }
  if (tone === "wait") {
    return (
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-pill bg-signal/15 text-signal ring-1 ring-inset ring-signal/40"
        aria-hidden="true"
      >
        <PenLine size={9} strokeWidth={3} />
      </span>
    );
  }
  if (tone === "stop") {
    return (
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-pill text-ink-soft ring-1 ring-inset ring-ink/30"
        aria-hidden="true"
      >
        <X size={9} strokeWidth={3} />
      </span>
    );
  }
  if (tone === "live") {
    return (
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
        <span className="absolute h-4 w-4 animate-step-live rounded-pill bg-signal/30" />
        <span className="relative h-2 w-2 rounded-pill bg-signal" />
      </span>
    );
  }
  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-pill text-ink-soft/50 ring-1 ring-inset ring-line"
      aria-hidden="true"
    >
      <Minus size={8} strokeWidth={3} />
    </span>
  );
}

export function LiveMissionCard({ mission, index }: { mission: HomeMission; index: number }) {
  const { progress } = mission;
  const pct = progress && progress.total > 0 ? progress.done / progress.total : null;

  return (
    <Surface
      elevation="raised"
      index={index}
      step={STAGGER_MS.cards}
      attention={mission.waiting}
      className="overflow-hidden p-4"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-pretty text-[15px] font-extrabold leading-snug">{mission.goal}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
            {mission.waiting ? (
              <>
                <TriangleAlert size={12} className="shrink-0 text-signal" aria-hidden="true" />
                waiting on you
              </>
            ) : mission.doing ? (
              <>
                <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
                  <span className="absolute inset-0 animate-status-ping rounded-pill bg-signal" />
                  <span className="relative h-1.5 w-1.5 rounded-pill bg-signal" />
                </span>
                {mission.doing}
              </>
            ) : (
              "queued — starting shortly"
            )}
          </p>
        </div>
        <Link
          href={`/app/missions/${mission.id}`}
          prefetch
          className="group/link inline-flex shrink-0 items-center gap-1 rounded-btn px-2 py-1 text-[11px] font-bold text-ink-soft transition-colors duration-fast hover:bg-cream-deep hover:text-ink"
        >
          open
          <ArrowRight
            size={11}
            className="transition-transform duration-fast group-hover/link:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      </div>

      {progress && (
        <div className="mt-3 flex items-center gap-2.5">
          <ProgressBar
            value={pct}
            label={`${mission.goal}: ${progress.done} of ${progress.total} steps done`}
          />
          <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums text-ink-soft">
            {progress.done}/{progress.total}
          </span>
        </div>
      )}

      {mission.steps.length > 0 && (
        <ol className="mt-3 flex flex-col gap-1.5">
          {mission.steps.map((s, i) => {
            const style = STEP_STYLE[s.state];
            const live = style.tone === "live";
            return (
              <li
                key={s.idx}
                style={staggerDelay(i, STAGGER_MS.rows)}
                className="flex animate-feed-in items-start gap-2.5"
              >
                <span className="mt-0.5">
                  <StepMarker state={s.state} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-xs font-semibold leading-snug ${
                      style.tone === "done"
                        ? "text-ink-soft"
                        : style.tone === "idle"
                          ? "text-ink-soft/70"
                          : "text-ink"
                    }`}
                  >
                    {s.purpose}
                  </span>
                  {live && (
                    <span className="mt-1 block max-w-[220px]">
                      <ProgressBar value={null} label={`${s.purpose} — running`} size="sm" />
                    </span>
                  )}
                </span>
                <span className="shrink-0 pt-px text-[10px] font-bold lowercase tracking-wide text-ink-soft">
                  {style.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Surface>
  );
}
