"use client";

import { useEffect, useRef, useState } from "react";
import { SIGNAL } from "@/lib/brand";

/**
 * The live "operator is working" narration under the command box. The
 * pipeline is one round-trip (no per-stage streaming), so while the request
 * is in flight the line advances through the real pipeline's phases on
 * short, realistic transitions; the RESOLUTION is always driven by the real
 * response:
 *   - "scanning external content safely…" appears only when the returned
 *     plan actually read suspicious external content (injection flag), and
 *   - the final line reports the true proposal count.
 * Under reduced motion the dot stops pulsing (globals.css) but the text
 * phases still change — the narration is information, not decoration.
 */

export interface PlanResolution {
  /** How many actions the plan proposed. */
  count: number;
  /** True when external content was scanned and flagged during planning. */
  injected: boolean;
}

const PHASES = [
  { at: 0, text: "reading your command…" },
  { at: 750, text: "checking what this would affect…" },
  { at: 1900, text: "drafting proposed actions…" },
  { at: 4500, text: "almost there — shaping the cards…" },
];

export function ThinkingStatus({
  thinking,
  resolution,
}: {
  thinking: boolean;
  /** Set when the last command resolved; null before any command / on error. */
  resolution: PlanResolution | null;
}) {
  const [phase, setPhase] = useState(0);
  // Brief post-response beat: surface the security scan when it happened.
  const [showScan, setShowScan] = useState(false);
  const prevThinking = useRef(false);

  useEffect(() => {
    if (!thinking) return;
    setPhase(0);
    const timers = PHASES.slice(1).map((p, i) =>
      window.setTimeout(() => setPhase(i + 1), p.at)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [thinking]);

  useEffect(() => {
    // thinking → resolved with a scanned plan: hold one short beat on the
    // security step so the user sees it happened, then settle.
    if (prevThinking.current && !thinking && resolution?.injected) {
      setShowScan(true);
      const t = window.setTimeout(() => setShowScan(false), 900);
      prevThinking.current = thinking;
      return () => window.clearTimeout(t);
    }
    prevThinking.current = thinking;
  }, [thinking, resolution]);

  if (!thinking && !showScan && !resolution) return null;

  let text: string;
  let live = true;
  if (thinking) {
    text = PHASES[phase].text;
  } else if (showScan) {
    text = "scanning external content safely…";
  } else {
    live = false;
    const n = resolution!.count;
    text =
      n === 0
        ? "no actions needed — see the operator's note."
        : `proposed ${n} action${n === 1 ? "" : "s"} — your call.`;
  }

  return (
    <p
      role="status"
      className="mt-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-soft"
    >
      {live ? (
        <span
          className="h-1.5 w-1.5 shrink-0 animate-orb-pulse rounded-pill bg-signal"
          aria-hidden="true"
        />
      ) : (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
          <path
            d="M4.5 12.5 10 18 20 6.5"
            stroke={SIGNAL}
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <span key={text} className="animate-fade-through">
        {text}
      </span>
    </p>
  );
}
