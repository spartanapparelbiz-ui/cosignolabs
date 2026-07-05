"use client";

import { CREAM, INK, SIGNAL } from "@/lib/brand";

export type OrbState = "idle" | "listening" | "thinking" | "awaiting-approval";

const LABELS: Record<OrbState, string> = {
  idle: "idle",
  listening: "listening",
  thinking: "thinking",
  "awaiting-approval": "awaiting your approval",
};

/**
 * Orb v3 — an SVG core disc with two orbiting blobs (one signal, one ink)
 * counter-rotating around the center. State drives the motion, nothing else:
 *   idle              — blobs drift slowly (14s / 18s counter-orbits)
 *   listening         — the whole orb breathes (2.6s scale)
 *   thinking          — the orbit speeds up (3.2s)
 *   awaiting-approval — the core turns signal-orange, holds the drawn check,
 *                       and emits a soft pulse ring every 1.6s
 * All motion is compositor-only (transform/opacity), so it idles well below
 * 1% CPU with no rAF loop. Reduced motion freezes every orbit (globals.css)
 * leaving a static, still-legible orb.
 */
export function VoiceOrb({ state }: { state: OrbState }) {
  const awaiting = state === "awaiting-approval";
  const spin = state === "thinking" ? "[animation-duration:3.2s]" : "";
  const breathe = state === "listening" ? "animate-orb-breathe" : "";

  return (
    <div
      className="flex items-center gap-2.5"
      role="status"
      aria-label={`operator status: ${LABELS[state]}`}
    >
      <div className="relative h-9 w-9">
        {/* pulse ring — only while awaiting a signature, 1.6s cadence */}
        {awaiting && (
          <span className="absolute inset-0 animate-orb-ring rounded-full bg-signal/30" />
        )}

        <div className={`absolute inset-0 ${breathe}`}>
          {/* orbiting blobs — hidden in the awaiting state, which is a solid disc */}
          {!awaiting && (
            <>
              <div className={`absolute inset-0 animate-orb-spin-slow ${spin}`}>
                <span className="absolute left-1/2 top-0 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-signal/60 blur-[3px]" />
              </div>
              <div className={`absolute inset-0 animate-orb-spin-rev ${spin}`}>
                <span className="absolute bottom-0 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-ink/70 blur-[3px]" />
              </div>
            </>
          )}

          {/* core disc */}
          <svg
            viewBox="0 0 36 36"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <circle
              cx="18"
              cy="18"
              r={awaiting ? 12 : 7}
              fill={awaiting ? SIGNAL : INK}
              className={awaiting ? "animate-orb-pulse [transform-origin:center]" : ""}
              style={
                awaiting
                  ? { filter: "drop-shadow(0 0 6px rgba(255,75,31,0.5))" }
                  : undefined
              }
            />
            {awaiting && (
              <path
                d="M12 18.5 16 22.5 24.5 13"
                stroke={CREAM}
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="24"
                className="animate-check-draw"
              />
            )}
          </svg>
        </div>
      </div>
      <span className="hidden text-xs font-bold lowercase tracking-widest text-ink-soft sm:block">
        {LABELS[state]}
      </span>
    </div>
  );
}
