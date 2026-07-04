"use client";

import { useEffect, useState } from "react";

const COMMAND = "clear my inbox of newsletters";

/**
 * The above-the-fold looping demo: one command → an action card appears →
 * Approve is pressed → executed. Pure CSS/React animation (~16s loop),
 * autoplays everywhere including mobile, no video download.
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
        await wait(800);
        for (let i = 1; i <= COMMAND.length && alive; i++) {
          setTyped(COMMAND.slice(0, i));
          await wait(45);
        }
        await wait(400);
        setPhase(1); // thinking
        await wait(1600);
        setPhase(2); // card slides in
        await wait(2600);
        setPhase(3); // approve pressed
        await wait(900);
        setPhase(4); // executed
        await wait(3800);
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
      className="w-full max-w-lg rounded-card border border-ink bg-cream p-4 shadow-[0_8px_0_0_#141414]"
      aria-label="Demo: a command becomes an action card, and nothing executes until it's approved"
    >
      {/* command line */}
      <div className="rounded-lg border border-line bg-white/70 px-4 py-3">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-ink-soft">
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
            <span className="text-xs font-bold text-ink-soft">
              operator planning…
            </span>
          </>
        )}
        {phase >= 2 && (
          <span className="text-xs font-bold text-ink-soft">
            1 action proposed — waiting for your signature
          </span>
        )}
      </div>

      {/* the card */}
      <div
        className={`mt-2 rounded-card border border-ink bg-white/80 p-4 transition-all duration-300 ${
          phase >= 2 ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="rounded-pill border border-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            Tier 2 · Approve
          </span>
          <span
            className={`rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              phase >= 4 ? "bg-accent text-cream" : "bg-cream-deep text-ink-soft"
            }`}
          >
            {phase >= 4 ? "Executed" : "Awaiting sign-off"}
          </span>
        </div>
        <p className="mt-2.5 text-sm font-semibold">
          Archive 47 newsletter emails and label them &quot;newsletters&quot;.
        </p>
        <p className="mt-1 text-[11px] text-ink-soft">
          payload: archive+label · 47 matches · reversible
        </p>

        {phase < 4 ? (
          <div className="mt-3 flex gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-pill bg-accent px-4 py-1.5 text-xs font-extrabold text-cream transition-transform ${
                phase === 3 ? "scale-90" : ""
              }`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4.5 12.5 10 18 20 6.5"
                  stroke="currentColor"
                  strokeWidth="3.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Approve
            </span>
            <span className="rounded-pill border border-ink px-4 py-1.5 text-xs font-bold">
              Veto
            </span>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-1.5 text-accent">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              className="animate-check-pop"
            >
              <circle cx="12" cy="12" r="11" fill="currentColor" />
              <path
                d="M6.5 12.5 10.5 16.5 17.5 8.5"
                stroke="#FBF4EA"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-xs font-extrabold uppercase tracking-wide">
              Signed &amp; executed — 47 emails archived
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
