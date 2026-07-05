"use client";

import { CREAM, INK, LINE } from "@/lib/brand";

export type OrbState = "idle" | "listening" | "thinking" | "awaiting-approval";

const LABELS: Record<OrbState, string> = {
  idle: "idle",
  listening: "listening",
  thinking: "thinking",
  "awaiting-approval": "awaiting your approval",
};

/**
 * The voice orb: cosigno's status heartbeat. Four states —
 * idle (still ink dot), listening (soft bars), thinking (rotating arc),
 * awaiting-approval (signal pulse — the operator holding a pen out to you).
 * Transform/opacity animations only: no layout thrash, 60fps.
 */
export function VoiceOrb({ state }: { state: OrbState }) {
  return (
    <div
      className="flex items-center gap-2.5"
      role="status"
      aria-label={`operator status: ${LABELS[state]}`}
    >
      <div className="relative flex h-9 w-9 items-center justify-center">
        {state === "idle" && (
          <span className="h-3.5 w-3.5 rounded-full bg-ink transition-transform" />
        )}

        {state === "listening" && (
          <span className="flex h-5 items-end gap-[3px]">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="w-[3px] rounded-full bg-ink"
                style={{
                  height: "100%",
                  transformOrigin: "bottom",
                  animation: `orb-listen 1s ease-in-out ${i * 0.15}s infinite`,
                }}
              />
            ))}
          </span>
        )}

        {state === "thinking" && (
          <svg
            width="26"
            height="26"
            viewBox="0 0 26 26"
            className="animate-orb-think"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="13" cy="13" r="10" stroke={LINE} strokeWidth="3" />
            <path
              d="M13 3a10 10 0 0 1 9.4 6.6"
              stroke={INK}
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        )}

        {state === "awaiting-approval" && (
          <>
            <span className="absolute inset-0 animate-orb-pulse rounded-full bg-signal/25" />
            <span className="relative flex h-6 w-6 animate-orb-pulse items-center justify-center rounded-full bg-signal">
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
        )}
      </div>
      <span className="hidden text-xs font-bold lowercase tracking-widest text-ink-soft sm:block">
        {LABELS[state]}
      </span>
    </div>
  );
}
