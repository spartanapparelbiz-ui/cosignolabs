"use client";

import { useEffect, useState } from "react";
import { CREAM, INK } from "@/lib/brand";

const COMMAND = "clear my inbox of newsletters";

/**
 * The above-the-fold looping demo: command typed → card slides in →
 * Approve press (signal fill) → check draws in → executed, hold 2s, loop.
 * Pure CSS/React, eased transitions only, autoplays everywhere including
 * 390px viewports — no video download, no LCP cost.
 */
export function DemoLoop() {
  const [phase, setPhase] = useState(0); // 0 typing, 1 thinking, 2 card, 3 approving, 4 executed
  const [typed, setTyped] = useState("");

  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) =>
      new Promise<void>((r) => timers.push(setTimeout(r, ms)));

    async function loop() {
      while (alive) {
        setPhase(0);
        setTyped("");
        await wait(700);
        for (let i = 1; i <= COMMAND.length && alive; i++) {
          setTyped(COMMAND.slice(0, i));
          await wait(42);
        }
        await wait(400);
        setPhase(1); // thinking
        await wait(1500);
        setPhase(2); // card slides in
        await wait(2400);
        setPhase(3); // approve pressed — signal fill
        await wait(700);
        setPhase(4); // check draws in, executed
        await wait(2000); // hold, then loop
      }
    }
    loop();
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div
      className="relative w-full max-w-lg rounded-card bg-white/70 p-4 shadow-lift"
      aria-label="demo: a command becomes an action card, and nothing executes until it's approved"
    >
      {/* command line */}
      <div className="rounded-btn bg-cream-deep px-4 py-3">
        <p className="text-[10px] font-extrabold lowercase tracking-widest text-ink-soft">
          command
        </p>
        <p className="min-h-[1.5rem] font-semibold">
          {typed}
          {phase === 0 && <span className="animate-pulse">▎</span>}
        </p>
      </div>

      {/* thinking */}
      <div className="mt-3 flex h-5 items-center gap-2 px-1">
        {phase === 1 && (
          <>
            <span className="h-2 w-2 animate-orb-pulse rounded-full bg-ink" />
            <span className="text-xs font-bold lowercase text-ink-soft">
              operator planning…
            </span>
          </>
        )}
        {phase >= 2 && (
          <span className="text-xs font-bold lowercase text-ink-soft">
            1 action proposed — waiting for your signature
          </span>
        )}
      </div>

      {/* the card */}
      <div
        className={`mt-2 rounded-card bg-white/90 p-4 shadow-soft transition-all duration-300 ease-out ${
          phase >= 2 ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="rounded-pill bg-ink/5 px-2 py-0.5 text-[10px] font-bold lowercase tracking-wide ring-1 ring-inset ring-ink/20">
            tier 2 · approve
          </span>
          <span
            className={`rounded-pill px-2 py-0.5 text-[10px] font-bold lowercase tracking-wide transition-colors duration-300 ${
              phase >= 4 ? "bg-signal text-cream" : "bg-cream-deep text-ink-soft"
            }`}
          >
            {phase >= 4 ? "executed" : "awaiting sign-off"}
          </span>
        </div>
        <p className="mt-2.5 text-sm font-semibold">
          archive 47 newsletter emails and label them &quot;newsletters&quot;.
        </p>
        <p className="mt-1 font-mono text-[11px] text-ink-soft">
          payload: archive+label · 47 matches · reversible
        </p>

        {phase < 4 ? (
          <div className="mt-3 flex gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-btn px-4 py-1.5 text-xs font-extrabold transition-all duration-200 ease-out ${
                phase === 3
                  ? "scale-90 bg-signal text-ink shadow-soft"
                  : "bg-signal/90 text-ink"
              }`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4.5 12.5 10 18 20 6.5"
                  stroke="currentColor"
                  strokeWidth="3.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              approve
            </span>
            <span className="rounded-btn px-4 py-1.5 text-xs font-bold ring-1 ring-inset ring-ink">
              veto
            </span>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-1.5 text-signal">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              className="animate-check-pop"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="11" fill="currentColor" />
              <path
                d="M6.5 12.5 10.5 16.5 17.5 8.5"
                stroke={CREAM}
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="24"
                className="animate-check-draw"
              />
            </svg>
            <span className="text-xs font-extrabold lowercase tracking-wide">
              signed &amp; executed — 47 emails archived
            </span>
          </div>
        )}
      </div>

      {/* Faint cursor performing the click — appears as the card lands,
          glides to the approve button, taps at phase 3. Transform/opacity. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute z-10 transition-all duration-500 ease-brand-out"
        style={{
          left: phase >= 3 ? "78px" : "150px",
          bottom: phase >= 3 ? "58px" : "30px",
          opacity: phase >= 2 && phase < 4 ? 1 : 0,
          transform: phase === 3 ? "scale(0.82)" : "scale(1)",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 3l14 7-6 1.6L9.5 18 5 3z"
            fill={INK}
            stroke={CREAM}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
        {phase === 3 && (
          <span className="absolute -left-1 -top-1 h-6 w-6 animate-ping rounded-full bg-signal/30" />
        )}
      </div>
    </div>
  );
}
