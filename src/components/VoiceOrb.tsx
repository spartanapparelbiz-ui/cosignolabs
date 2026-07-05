"use client";

import { CREAM } from "@/lib/brand";

export type OrbState = "idle" | "listening" | "thinking" | "awaiting-approval";

const LABELS: Record<OrbState, string> = {
  idle: "idle",
  listening: "listening",
  thinking: "thinking",
  "awaiting-approval": "awaiting your approval",
};

/**
 * Layered voice orb: two soft blurred blobs (one ink, one signal) counter-
 * rotating around the center. Idle rotates slowly; listening breathes;
 * thinking speeds the rotation; awaiting-approval swaps to a signal pulse
 * with a soft glow ring — the signature moment. Four fixed elements,
 * transform/opacity only, idles well below 1% CPU. Reduced motion freezes
 * the rotation (globals.css) leaving a static, still-legible orb.
 */
export function VoiceOrb({ state }: { state: OrbState }) {
  const awaiting = state === "awaiting-approval";
  const spin = state === "thinking" ? "[animation-duration:3.2s]" : "";

  return (
    <div
      className="flex items-center gap-2.5"
      role="status"
      aria-label={`operator status: ${LABELS[state]}`}
    >
      <div className="relative h-9 w-9">
        {awaiting ? (
          <>
            <span className="absolute inset-0 animate-orb-pulse rounded-full bg-signal/25" />
            <span className="absolute inset-[6px] flex animate-orb-pulse items-center justify-center rounded-full bg-signal shadow-[0_0_12px_rgba(255,75,31,0.5)]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4.5 12.5 10 18 20 6.5"
                  stroke={CREAM}
                  strokeWidth="3.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </>
        ) : (
          <div
            className={`absolute inset-0 ${
              state === "listening" ? "animate-orb-breathe" : ""
            }`}
          >
            {/* counter-rotating blurred blobs */}
            <div className={`absolute inset-0 animate-orb-spin-slow ${spin}`}>
              <span className="absolute left-1/2 top-0 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-signal/60 blur-[3px]" />
            </div>
            <div className={`absolute inset-0 animate-orb-spin-rev ${spin}`}>
              <span className="absolute bottom-0 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-ink/70 blur-[3px]" />
            </div>
            <span className="absolute inset-[11px] rounded-full bg-ink" />
          </div>
        )}
      </div>
      <span className="hidden text-xs font-bold lowercase tracking-widest text-ink-soft sm:block">
        {LABELS[state]}
      </span>
    </div>
  );
}
