"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Circle, PenLine } from "lucide-react";
import { WorkingPip } from "@/components/brand/WorkingPip";

/**
 * The hero visual — a real product composition, not a floating card: the
 * command at top, the three-step mission plan, the expanded approval card,
 * and the receipt arriving. It cycles Command → Working → Needs signature →
 * Completed in ~9.5s and stays fully legible as a static frame. The content
 * mirrors the ACTUAL inbox-cleanup job (its sandbox run finds 3 newsletters
 * and 2 waiting threads) — nothing here shows behavior the product doesn't
 * have. Reduced motion: a still frame at the signature moment, no loop.
 */

type Phase = "command" | "working" | "signature" | "done";

const PHASE_AT: [Phase, number][] = [
  ["command", 0],
  ["working", 1400],
  ["signature", 4400],
  ["done", 7400],
];
const RESTART_AT = 9800;

const STEPS = [
  { text: "scan the inbox — read-only", doneIn: ["working", "signature", "done"] },
  { text: "draft 2 replies — drafts can't send", doneIn: ["signature", "done"] },
  { text: "archive the clutter — needs your signature", doneIn: ["done"] },
];

export function HeroMissionDemo() {
  const [phase, setPhase] = useState<Phase>("signature");
  const [live, setLive] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return; // stay on the static signature frame
    setLive(true);
    const clear = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    const run = () => {
      for (const [p, at] of PHASE_AT) timers.current.push(setTimeout(() => setPhase(p), at));
      timers.current.push(setTimeout(run, RESTART_AT));
    };
    // The loop runs only while the tab is visible — a backgrounded landing
    // page burns zero timers/renders and resumes cleanly on return.
    const onVisibility = () => {
      clear();
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    run();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clear();
    };
  }, []);

  const working = phase !== "command";
  const awaiting = phase === "signature";
  const done = phase === "done";

  return (
    <div className="relative w-full max-w-md">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 translate-x-3 translate-y-3 rounded-card bg-ink/[0.04]"
      />
      <div className="rounded-card bg-surface p-4 shadow-lift ring-1 ring-inset ring-ink/10 sm:p-5">
        {/* the command + honest demo label */}
        <div className="flex items-center gap-2">
          <div
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-btn bg-cream-deep/70 px-3 py-2 transition-opacity duration-base ${
              live && phase === "command" ? "opacity-100" : "opacity-100"
            }`}
          >
            <PenLine size={13} className="shrink-0 text-ink-soft" aria-hidden="true" />
            <span className="truncate text-[13px] font-bold lowercase">clean up my inbox</span>
          </div>
          <span className="rounded-pill bg-ink/5 px-2 py-0.5 text-[9px] font-bold lowercase tracking-wide text-ink-soft ring-1 ring-inset ring-ink/15">
            demo
          </span>
        </div>

        {/* connected apps the job really uses */}
        <div className="mt-2.5 flex items-center gap-1.5">
          {["gmail", "calendar"].map((app) => (
            <span
              key={app}
              className="flex items-center gap-1 rounded-pill bg-cream-deep px-2 py-0.5 text-[10px] font-bold lowercase text-ink-soft"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-pill bg-signal" aria-hidden="true" />
              {app}
            </span>
          ))}
          <span
            className={`ml-auto rounded-pill px-2.5 py-0.5 text-[10px] font-bold lowercase tracking-wide transition-colors duration-base ${
              done
                ? "bg-signal text-cream"
                : awaiting
                  ? "bg-signal/15 text-signal"
                  : working
                    ? "bg-cream-deep text-ink"
                    : "bg-cream-deep text-ink-soft"
            }`}
          >
            {done ? "completed" : awaiting ? "waiting for you" : working ? "working…" : "mission created"}
          </span>
        </div>

        {/* the plan — three real steps */}
        <ol className="mt-3 flex flex-col gap-1.5">
          {STEPS.map((s, i) => {
            const stepDone = (s.doneIn as string[]).includes(phase);
            const active = !stepDone && working && STEPS.slice(0, i).every((p) => (p.doneIn as string[]).includes(phase));
            return (
              <li key={s.text} className="flex items-center gap-2 text-[12px] font-semibold">
                {stepDone ? (
                  <Check size={13} className="shrink-0 text-signal" aria-hidden="true" />
                ) : active && live ? (
                  <WorkingPip size={8} />
                ) : (
                  <Circle size={13} className="shrink-0 text-line" aria-hidden="true" />
                )}
                <span className={stepDone ? "text-ink" : "text-ink-soft"}>{s.text}</span>
              </li>
            );
          })}
        </ol>

        {/* the approval card — the product's center of gravity */}
        <div
          className={`mt-3 rounded-btn border p-3 transition-all duration-base ${
            awaiting ? "border-signal/60 bg-signal/[0.06] shadow-soft" : "border-line/70 bg-cream-deep/40"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="rounded-pill bg-ink/5 px-2 py-0.5 text-[9px] font-bold lowercase tracking-wide ring-1 ring-inset ring-ink/20">
              gmail · tier 2 · approve
            </span>
            <span className={`ml-auto text-[10px] font-bold lowercase ${done ? "text-signal" : "text-ink-soft"}`}>
              {done ? "signed ✓" : "awaiting sign-off"}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] font-semibold leading-snug">
            archive 3 newsletter messages out of the inbox
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-ink-soft">
            archive only · nothing deleted · reversible
          </p>
        </div>

        {/* the receipt, landing on completion */}
        <div
          className={`mt-3 flex items-center gap-1.5 transition-opacity duration-base ${
            done || !live ? "opacity-100" : "opacity-40"
          }`}
        >
          <span
            className={`inline-block h-2 w-2 rounded-pill transition-colors duration-base ${done ? "bg-signal" : "bg-line"}`}
            aria-hidden="true"
          />
          <span className="text-[11px] font-bold lowercase tracking-wide text-ink-soft">
            {done
              ? "receipt: archived 3 · verified by read-back · 2 drafts saved, nothing sent"
              : "nothing moves without your signature"}
          </span>
        </div>
      </div>
    </div>
  );
}
