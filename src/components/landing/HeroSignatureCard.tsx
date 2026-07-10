"use client";

import { useEffect, useRef, useState } from "react";

/**
 * THE OWNABLE VISUAL — the signature as a motif.
 *
 * A single live-feeling action card mid-approval. On sign, a physical ink
 * pen-stroke draws across it (a handwritten checkmark + signature flourish)
 * and the card settles to "executed". This is the one strong art-direction
 * decision, committed: approval is made physical — a signed thing, not a
 * toggled state. The signal accent is reserved for the signed/executed state
 * so the eye learns "signed" has a colour across the page.
 *
 * Motion is the ONLY real animation in the hero, matching the product's
 * promise: nothing else moves. The loop is awaiting → signing → executed →
 * (rest) → reset. Compositor-only (transform/opacity + a stroke draw).
 *
 * Reduced motion: the card renders already-signed and still — the ink is
 * drawn, the checkmark present, no loop. Progressive enhancement: with JS
 * disabled it is a legible, already-signed card (the default state).
 */

type Phase = "awaiting" | "signing" | "executed";

const SIGN_PATH = "M 8 30 C 22 10, 34 40, 50 20 S 78 8, 96 24";
const CHECK_PATH = "M 40 30 L 52 44 L 82 12";

export function HeroSignatureCard() {
  const [phase, setPhase] = useState<Phase>("awaiting");
  const reduced = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    reduced.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) {
      setPhase("executed");
      return;
    }
    const clear = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    const run = () => {
      setPhase("awaiting");
      timers.current.push(setTimeout(() => setPhase("signing"), 1400));
      timers.current.push(setTimeout(() => setPhase("executed"), 2600));
      timers.current.push(setTimeout(run, 6000));
    };
    run();
    return clear;
  }, []);

  const signed = phase === "signing" || phase === "executed";
  const executed = phase === "executed";

  return (
    <div className="relative w-full max-w-md">
      {/* soft depth plate behind the card */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 translate-x-3 translate-y-3 rounded-card bg-ink/[0.04]"
      />

      <div className="rounded-card bg-surface p-5 shadow-lift ring-1 ring-inset ring-ink/10">
        {/* header: tool + tier */}
        <div className="flex items-center gap-2">
          <span className="rounded-pill bg-ink/5 px-2.5 py-0.5 text-[10px] font-bold lowercase tracking-wide ring-1 ring-inset ring-ink/20">
            gmail · tier 2 · approve
          </span>
          <span
            className={`ml-auto rounded-pill px-2.5 py-0.5 text-[10px] font-bold lowercase tracking-wide transition-colors duration-base ${
              executed
                ? "bg-signal text-cream"
                : signed
                  ? "bg-signal/15 text-signal"
                  : "bg-cream-deep text-ink-soft"
            }`}
          >
            {executed ? "executed" : signed ? "signing…" : "awaiting sign-off"}
          </span>
        </div>

        <p className="mt-3 text-[15px] font-semibold leading-snug">
          archive 47 newsletter emails and label them “newsletters”.
        </p>
        <p className="mt-1.5 font-mono text-[11px] text-ink-soft">
          archive+label · 47 matches · reversible
        </p>

        {/* the signature plate — where the ink lands */}
        <div className="relative mt-4 h-24 overflow-hidden rounded-btn bg-cream-deep/60">
          <span className="absolute left-3 top-2 text-[10px] font-bold lowercase tracking-wide text-ink-soft">
            {executed ? "signed" : "sign to execute"}
          </span>
          <svg
            viewBox="0 0 104 52"
            fill="none"
            aria-hidden="true"
            className="absolute inset-x-0 bottom-1 mx-auto h-16 w-[86%] overflow-visible"
          >
            {/* the signature flourish — draws in ink on sign */}
            <path
              d={SIGN_PATH}
              stroke="rgb(var(--c-ink))"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              style={{
                strokeDashoffset: reduced.current ? 0 : signed ? 0 : 1,
                opacity: signed ? 0.9 : 0,
                transition: reduced.current
                  ? undefined
                  : "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1), opacity 200ms ease",
              }}
            />
            {/* the checkmark stamp — the signal-coloured "signed" gesture */}
            <path
              d={CHECK_PATH}
              stroke={SIGN_STROKE}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              style={{
                strokeDashoffset: reduced.current ? 0 : executed ? 0 : 1,
                opacity: executed ? 1 : 0,
                transition: reduced.current
                  ? undefined
                  : "stroke-dashoffset 460ms cubic-bezier(0.22,1,0.36,1) 60ms, opacity 160ms ease",
              }}
            />
          </svg>
        </div>

        {/* footer receipt line, appears once executed */}
        <div className="mt-3 flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 rounded-full transition-colors duration-base ${
              executed ? "bg-signal" : "bg-line"
            }`}
          />
          <span className="text-[11px] font-bold lowercase tracking-wide text-ink-soft">
            {executed
              ? "signed & executed — logged to your audit trail"
              : "nothing moves without your signature"}
          </span>
        </div>
      </div>
    </div>
  );
}

// The signal accent, resolved through the CSS var so it tracks theme + tokens.
const SIGN_STROKE = "rgb(var(--c-signal))";
