"use client";

import { Check, X } from "lucide-react";
import { markOfStep, type StepMark } from "@/lib/status";
import type { MissionStepRecord } from "@/lib/types";

/**
 * Live Flow — watching work move, instead of reading that it moved.
 *
 * Done steps are filled and checked. The step happening right now pulses.
 * Steps still ahead are grey outlines. A step that stopped carries a cross.
 * Under the strip, one sentence: what is happening at this exact moment.
 *
 *     ✓──✓──●──○──○
 *     Creating the pull request
 *
 * No logs, no percentages, no spinner without a meaning. A person should be
 * able to glance at this and know where the work is.
 */

const DOT: Record<StepMark, string> = {
  done: "bg-signal text-cream",
  current: "bg-signal text-cream animate-orb-pulse",
  your_turn: "bg-ink text-cream",
  stopped: "bg-transparent text-ink ring-1 ring-inset ring-ink/50",
  upcoming: "bg-cream-deep text-transparent ring-1 ring-inset ring-ink/15",
};

/** The sentence under the strip: where the work actually is. */
export function nowLine(steps: readonly MissionStepRecord[]): string | null {
  const current = steps.find((s) => markOfStep(s.state) === "current");
  if (current) return current.purpose;
  const yourTurn = steps.find((s) => markOfStep(s.state) === "your_turn");
  if (yourTurn) return `${yourTurn.purpose} — waiting for you`;
  const stopped = steps.find((s) => markOfStep(s.state) === "stopped");
  if (stopped) return `${stopped.purpose} — stopped here`;
  const next = steps.find((s) => markOfStep(s.state) === "upcoming");
  if (next) return `next: ${next.purpose}`;
  return null;
}

export function LiveFlow({ steps }: { steps: readonly MissionStepRecord[] }) {
  if (steps.length === 0) return null;

  const ordered = [...steps].sort((a, b) => a.idx - b.idx);
  const done = ordered.filter((s) => markOfStep(s.state) === "done").length;
  const line = nowLine(ordered);

  return (
    <div className="mt-3">
      <ol
        className="flex flex-wrap items-center gap-y-2"
        aria-label={`${done} of ${ordered.length} steps complete`}
      >
        {ordered.map((step, i) => {
          const mark = markOfStep(step.state);
          return (
            <li key={step.id} className="flex items-center">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-pill ${DOT[mark]}`}
                title={step.purpose}
              >
                {mark === "done" && <Check size={11} strokeWidth={3.2} aria-hidden="true" />}
                {mark === "stopped" && <X size={11} strokeWidth={3.2} aria-hidden="true" />}
              </span>
              {i < ordered.length - 1 && (
                <span
                  className={`h-[2px] w-5 ${mark === "done" ? "bg-signal" : "bg-line"}`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
      {line && <p className="mt-2 text-sm font-semibold">{line}</p>}
    </div>
  );
}
