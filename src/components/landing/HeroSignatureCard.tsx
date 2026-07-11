"use client";

import { useEffect, useRef, useState } from "react";

/**
 * THE OWNABLE VISUAL — the signature as a motif.
 *
 * A live-feeling action card mid-approval. On sign, an ACTUAL signature that
 * spells "cosigno" writes itself out pen-stroke by pen-stroke — c, o, s, i,
 * the g's bowl then its descender hook, n, o — then a sweeping underline
 * flourish, the brand's ORANGE DOT landing on the i, and finally a circular
 * seal stamping top-right like a notary's mark. The card settles to
 * "executed". Approval is made physical: a signed thing, not a toggled state.
 *
 * Every stroke is a hand-drawn SVG path animated with stroke-dashoffset
 * (compositor-friendly), sequenced with per-path transition delays so the pen
 * visibly travels the word. Reduced motion: the card renders already-signed
 * and still — full signature, dot, seal, no loop. With JS disabled it is a
 * legible, already-signed card (the default markup state).
 */

type Phase = "awaiting" | "signing" | "executed";

/**
 * The signature, letter by letter, in drawing order. viewBox 0 0 240 64,
 * baseline y≈40. Durations/delays choreograph the pen: gaps between letters
 * read as the pen lifting. The flourish is last and longest.
 */
const STROKES: { d: string; dur: number; delay: number }[] = [
  // c
  { d: "M 22 27 C 15 24, 9 29, 9 33.5 C 9 38, 15 42, 21.5 38.5", dur: 240, delay: 0 },
  // o
  { d: "M 33.5 26.5 C 27.5 25.5, 24.5 30.5, 25.5 34.8 C 26.7 39.3, 33 40.8, 36.2 37 C 39.2 33.4, 38 28, 33.5 26.5", dur: 280, delay: 300 },
  // s
  { d: "M 47.5 27.5 C 43 25.5, 39.5 27.5, 40 30 C 40.5 32.5, 46.5 33, 47 36 C 47.4 38.8, 42.5 40.5, 38.5 38.3", dur: 260, delay: 640 },
  // i (stem — the dot lands later, after the flourish)
  { d: "M 55 27 C 54.6 31, 54.3 35.5, 54.5 39", dur: 150, delay: 960 },
  // g (bowl)
  { d: "M 71 27.5 C 65.5 25.8, 62 30, 62.8 34 C 63.6 38, 69 39.6, 72 36.5", dur: 220, delay: 1170 },
  // g (stem + descender hook)
  { d: "M 72.5 27 C 72.3 34, 72.8 44, 71 50 C 69.5 54.5, 63.5 54.5, 62.5 50.5", dur: 260, delay: 1440 },
  // n
  { d: "M 83.2 27 C 82.7 31, 82.3 35, 82.2 39.3 C 83.5 33.5, 86 28.5, 89.8 27.3 C 92.6 26.5, 93.4 29.5, 93.2 33 C 93.1 35.2, 93 37.4, 93 39.3", dur: 300, delay: 1760 },
  // o (final)
  { d: "M 106 26.5 C 100 25.5, 97 30.5, 98 34.8 C 99.2 39.3, 105.5 40.8, 108.7 37 C 111.7 33.4, 110.5 28, 106 26.5", dur: 280, delay: 2120 },
  // the sweeping underline flourish
  { d: "M 112 33 C 124 40, 146 40.5, 168 34 C 178 31, 183 33, 175 38 C 158 47, 100 48, 60 45.5", dur: 560, delay: 2460 },
];

/** When the orange i-dot pops, relative to the start of signing. */
const DOT_DELAY = 3080;
/** Cycle timing: sign starts, seal stamps, loop restarts. */
const SIGN_AT = 1100;
const EXECUTE_AT = SIGN_AT + 3450;
const RESTART_AT = 9200;

const EASE = "cubic-bezier(0.22,1,0.36,1)";
// The signal accent, resolved through the CSS var so it tracks theme + tokens.
const SIGNAL = "rgb(var(--c-signal))";

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
      timers.current.push(setTimeout(() => setPhase("signing"), SIGN_AT));
      timers.current.push(setTimeout(() => setPhase("executed"), EXECUTE_AT));
      timers.current.push(setTimeout(run, RESTART_AT));
    };
    run();
    return clear;
  }, []);

  const signed = phase === "signing" || phase === "executed";
  const executed = phase === "executed";
  const still = reduced.current;

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
            {executed ? "signed" : signed ? "signing…" : "sign to execute"}
          </span>
          <svg
            viewBox="0 0 240 64"
            fill="none"
            aria-hidden="true"
            className="absolute inset-x-0 bottom-1 mx-auto h-[4.5rem] w-[92%] overflow-visible"
          >
            {/* the signature: cosigno, written stroke by stroke */}
            {STROKES.map((s, i) => (
              <path
                key={i}
                d={s.d}
                stroke="rgb(var(--c-ink))"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                style={{
                  strokeDashoffset: still || signed ? 0 : 1,
                  opacity: still || signed ? 0.92 : 0,
                  transition: still
                    ? undefined
                    : `stroke-dashoffset ${s.dur}ms ${EASE} ${s.delay}ms`,
                }}
              />
            ))}

            {/* the brand's orange dot lands on the i, last stroke of the name */}
            <circle
              cx="55.6"
              cy="20.5"
              r="2.6"
              fill={SIGNAL}
              style={{
                transformOrigin: "55.6px 20.5px",
                transform: still || signed ? "scale(1)" : "scale(0)",
                opacity: still || signed ? 1 : 0,
                transition: still
                  ? undefined
                  : `transform 300ms cubic-bezier(0.34,1.56,0.64,1) ${DOT_DELAY}ms, opacity 120ms ease ${DOT_DELAY}ms`,
              }}
            />

            {/* the seal — a circular signal stamp landing top-right, clear of
                the lettering (letters end x≈112, flourish crests y≥31) */}
            <g
              style={{
                transformOrigin: "204px 15px",
                transform:
                  still || executed ? "scale(1) rotate(-8deg)" : "scale(0.4) rotate(-8deg)",
                opacity: still || executed ? 1 : 0,
                transition: still
                  ? undefined
                  : "transform 420ms cubic-bezier(0.34,1.56,0.64,1) 80ms, opacity 160ms ease 80ms",
              }}
            >
              <circle cx="204" cy="15" r="13" fill={SIGNAL} />
              <path
                d="M 197.5 15.5 L 202 20 L 210.5 10"
                stroke="rgb(var(--c-cream))"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
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
