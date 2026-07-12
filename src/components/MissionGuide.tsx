"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, Circle, CircleDot, OctagonX, ShieldAlert, Square, XCircle } from "lucide-react";
import type { ActionRecord } from "@/lib/types";
import { missionGuide, missionState, missionSteps, type MissionState } from "@/lib/clarity";

/**
 * The live guidance system: one calm panel that always answers what cosigno
 * is doing, why, what it's using, what's next, whether approval is needed,
 * and what has actually changed. Everything is derived from the real action
 * records — no invented progress, no vague "working…".
 */

const STATE_STYLE: Record<MissionState["key"], string> = {
  idle: "bg-cream-deep text-ink-soft",
  planning: "bg-cream-deep text-ink",
  waiting_approval: "bg-signal text-ink",
  executing: "bg-ink text-cream",
  held: "ring-1 ring-inset ring-signal text-signal",
  completed: "bg-signal/20 text-ink",
  partial: "ring-1 ring-inset ring-ink/40 text-ink",
  failed: "ring-1 ring-inset ring-ink/40 text-ink",
  stopped: "bg-cream-deep text-ink-soft",
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
    <span
      title={state.detail}
      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[11px] font-bold lowercase tracking-wide ${STATE_STYLE[state.key]}`}
    >
      {(state.key === "planning" || state.key === "executing") && (
        <span className="h-1.5 w-1.5 animate-orb-pulse rounded-full bg-current" aria-hidden="true" />
      )}
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
    <section className="rounded-card bg-surface/70 shadow-soft" aria-label="what is cosigno doing">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-extrabold lowercase tracking-widest text-ink-soft">
            what is cosigno doing?
          </span>
          <span className="mt-0.5 block truncate text-sm font-semibold">
            {planning
              ? "reading your request and creating the plan — nothing has run yet."
              : guide.current
                ? guide.current.summary
                : state.detail}
          </span>
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-ink-soft transition-transform duration-base ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-line/60 px-4 py-3">
          {guide.current && (
            <div>
              <p className="text-[10px] font-extrabold lowercase tracking-widest text-ink-soft">current step</p>
              <p className="mt-0.5 text-sm font-semibold">{guide.current.summary}</p>
              <p className="mt-1 text-xs text-ink-soft">
                <span className="font-bold">using:</span> {guide.current.source.name} — {guide.current.source.doing}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-ink-soft">{guide.current.approval}</p>
            </div>
          )}

          {guide.next && (
            <div>
              <p className="text-[10px] font-extrabold lowercase tracking-widest text-ink-soft">what happens next</p>
              <p className="mt-0.5 text-sm font-semibold text-ink-soft">{guide.next}</p>
            </div>
          )}

          <div>
            <p className="text-[10px] font-extrabold lowercase tracking-widest text-ink-soft">changes made</p>
            {guide.changes.length === 0 ? (
              <p className="mt-0.5 text-xs font-semibold text-ink-soft">{guide.noChangesLine}</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {guide.changes.map((c, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs font-semibold">
                    <CheckCircle2 size={13} className="mt-px shrink-0 text-signal" aria-hidden="true" />
                    <span className="min-w-0">{c}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {steps.length > 0 && (
            <div>
              <p className="text-[10px] font-extrabold lowercase tracking-widest text-ink-soft">the plan</p>
              <ol className="mt-1 flex flex-col gap-1.5">
                {steps.map((s, i) => {
                  const Icon = STEP_ICON[s.state];
                  return (
                    <li key={s.id} className="flex items-start gap-2 text-xs">
                      <Icon
                        size={14}
                        className={`mt-px shrink-0 ${
                          s.state === "done"
                            ? "text-signal"
                            : s.state === "running"
                              ? "animate-orb-pulse text-ink"
                              : s.state === "held"
                                ? "text-signal"
                                : "text-ink-soft"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className={`font-semibold ${s.state === "vetoed" ? "text-ink-soft line-through" : ""}`}>
                          {i + 1}. {s.title}
                        </span>
                        <span className="block text-[11px] text-ink-soft">
                          {s.operator} operator · {s.note}
                        </span>
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
              className="inline-flex w-fit items-center gap-1.5 rounded-btn px-3.5 py-2 text-xs font-bold lowercase ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep"
            >
              <Square size={13} aria-hidden="true" />
              stop mission — veto the {pendingCount} waiting step{pendingCount === 1 ? "" : "s"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
