"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, Circle, CircleDot, OctagonX, ShieldAlert, Square, XCircle } from "lucide-react";
import type { ActionRecord } from "@/lib/types";
import { missionGuide, missionState, missionSteps, type MissionState } from "@/lib/clarity";
import { badge, btn, card, dot, type BadgeTone } from "@/components/ui/styles";

/**
 * The live guidance system: one calm panel that always answers what cosigno
 * is doing, why, what it's using, what's next, whether approval is needed,
 * and what has actually changed. Everything is derived from the real action
 * records — no invented progress, no vague "working…".
 */

const STATE_TONE: Record<MissionState["key"], BadgeTone> = {
  idle: "neutral",
  planning: "neutral",
  waiting_approval: "signal",
  executing: "neutral",
  held: "signal",
  completed: "positive",
  partial: "signal",
  failed: "danger",
  stopped: "neutral",
};

/** The mission-state chip that sits near the title. */
export function MissionStatus({
  actions,
  planning,
}: {
  actions: ActionRecord[];
  planning: boolean;
}) {
  const state = missionState(actions, planning);
  return (
    <span title={state.detail} className={badge(STATE_TONE[state.key])}>
      <span
        className={`${dot(STATE_TONE[state.key])} ${
          state.key === "planning" || state.key === "executing" ? "animate-orb-pulse" : ""
        }`}
        aria-hidden="true"
      />
      {state.label}
    </span>
  );
}

const STEP_ICON = {
  done: CheckCircle2,
  running: CircleDot,
  waiting: Circle,
  held: ShieldAlert,
  vetoed: XCircle,
  failed: OctagonX,
} as const;

/**
 * "What is cosigno doing?" — the persistent, expandable guide. Collapsed it
 * shows the one-line answer; open it shows current step, source, what's
 * next, changes made, the step list, and the stop control.
 */
export function MissionGuide({
  actions,
  planning,
  onStop,
}: {
  actions: ActionRecord[];
  planning: boolean;
  /** Veto every pending step — the instant stop. */
  onStop?: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (actions.length === 0 && !planning) return null;

  const state = missionState(actions, planning);
  const guide = missionGuide(actions);
  const steps = missionSteps(actions);
  const pendingCount = actions.filter((a) => a.status === "proposed").length;

  return (
    <section className={card()} aria-label="what is cosigno doing">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-card px-5 py-4 text-left transition-colors duration-fast hover:bg-ink/[0.02]"
      >
        <span className="min-w-0 flex-1">
          <span className="t-eyebrow block">What cosigno is doing</span>
          <span className="mt-1 block truncate text-[0.9375rem]">
            {planning
              ? "reading your request and creating the plan — nothing has run yet."
              : guide.current
                ? guide.current.summary
                : state.detail}
          </span>
        </span>
        <ChevronDown
          size={15}
          strokeWidth={2}
          className={`shrink-0 text-ink-soft transition-transform duration-base ease-brand-out ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="flex animate-fade-through flex-col gap-5 border-t border-line/40 px-5 py-4">
          {guide.current && (
            <div>
              <p className="t-eyebrow">current step</p>
              <p className="mt-1 text-[0.9375rem]">{guide.current.summary}</p>
              <p className="t-caption mt-1">
                {guide.current.source.name} — {guide.current.source.doing}
              </p>
              <p className="t-caption">{guide.current.approval}</p>
            </div>
          )}

          {guide.next && (
            <div>
              <p className="t-eyebrow">what happens next</p>
              <p className="t-body mt-1 text-ink-soft">{guide.next}</p>
            </div>
          )}

          <div>
            <p className="t-eyebrow">changes made</p>
            {guide.changes.length === 0 ? (
              <p className="t-caption mt-1">{guide.noChangesLine}</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {guide.changes.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-[0.875rem]">
                    <CheckCircle2 size={13} strokeWidth={2} className="mt-1 shrink-0 text-positive" aria-hidden="true" />
                    <span className="min-w-0">{c}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {steps.length > 0 && (
            <div>
              <p className="t-eyebrow">The plan</p>
              <ol className="mt-1 flex flex-col gap-1.5">
                {steps.map((s, i) => {
                  const Icon = STEP_ICON[s.state];
                  return (
                    <li key={s.id} className="flex items-start gap-2.5 text-[0.875rem]">
                      <Icon
                        size={14}
                        strokeWidth={1.9}
                        className={`mt-1 shrink-0 ${
                          s.state === "done"
                            ? "text-positive"
                            : s.state === "running"
                              ? "animate-orb-pulse text-ink"
                              : s.state === "held"
                                ? "text-signal"
                                : "text-ink-soft"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className={s.state === "vetoed" ? "text-ink-soft line-through" : ""}>
                          {s.title}
                        </span>
                        <span className="t-caption block">{s.note}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {onStop && pendingCount > 0 && (
            <button
              onClick={onStop}
              className={btn("ghost", "sm", "w-fit")}
            >
              <Square size={12} strokeWidth={1.9} aria-hidden="true" />
              Stop — veto the {pendingCount} waiting step{pendingCount === 1 ? "" : "s"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
