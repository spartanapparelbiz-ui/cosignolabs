"use client";

import { INK, SIGNAL } from "@/lib/brand";

/**
 * The Cosigno mark as the workspace's live status indicator — the logo IS
 * the thing that shows what the operator is doing. Same geometry as
 * CosignoMark; state drives intensity through CSS custom properties
 * (`--ls-hl` highlight presence, `--ls-check` check presence) with opacity
 * transitions, so states MORPH into each other rather than hard-swap.
 *
 *   idle       calm 5s breath (the living-logo token — nothing new)
 *   listening  a subtle highlight travels the C's arc, like taking input
 *   working    the travel speeds up and the check pulses — active work
 *   awaiting   the one attention-drawing state: full-orange check + a soft
 *              expanding ring every 1.6s
 *   executing  the check does a decisive stroke-draw
 *   success    one confident settle-pulse, then back to idle
 *   error      the mark dims briefly and recovers — calm, never red
 *
 * All motion is transform/opacity (+ normalized stroke-dashoffset on the
 * highlight/draw). Under prefers-reduced-motion every animation collapses
 * (globals.css), the travel overlay hides itself, and the label — wired to
 * the same state, aria-live=polite — carries the meaning.
 */

export type LogoStatusState =
  | "idle"
  | "listening"
  | "working"
  | "awaiting"
  | "executing"
  | "success"
  | "error";

const C_PATH = "M 76.0 66.9 A 31 31 0 1 1 76.0 33.1";
const CHECK_PATH = "M 47 53 L 57 63 L 88 28";

/** Label text beside the mark — exported for tests and reuse. */
export function statusLabel(state: LogoStatusState, awaiting: number): string {
  switch (state) {
    case "listening":
      return "listening";
    case "working":
      return "working";
    case "awaiting":
      return `${awaiting} awaiting your approval`;
    case "executing":
      return "executing";
    case "success":
      return "done";
    case "error":
      return "hit a snag — try again";
    default:
      return "idle";
  }
}

/** Per-state intensity: highlight presence, its speed, and check presence. */
const INTENSITY: Record<
  LogoStatusState,
  { hl: number; speed: string; check: number }
> = {
  idle: { hl: 0, speed: "2.4s", check: 0.92 },
  listening: { hl: 0.45, speed: "2.4s", check: 0.92 },
  working: { hl: 0.8, speed: "1.1s", check: 1 },
  awaiting: { hl: 0, speed: "2.4s", check: 1 },
  executing: { hl: 0, speed: "2.4s", check: 1 },
  success: { hl: 0, speed: "2.4s", check: 1 },
  error: { hl: 0, speed: "2.4s", check: 0.92 },
};

export function LogoStatus({
  state,
  awaiting = 0,
  size = 34,
}: {
  state: LogoStatusState;
  /** Count shown in the awaiting label. */
  awaiting?: number;
  size?: number;
}) {
  const t = INTENSITY[state];
  const breathe = state === "idle";
  const travel = state === "listening" || state === "working";

  return (
    <div
      className="flex min-w-0 items-center gap-2.5"
      role="status"
      aria-live="polite"
      aria-label={`operator status: ${statusLabel(state, awaiting)}`}
      style={
        {
          "--ls-hl": t.hl,
          "--ls-check": t.check,
        } as React.CSSProperties
      }
    >
      <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
        {/* soft expanding ring — ONLY while awaiting a signature */}
        {state === "awaiting" && (
          <span
            className="absolute inset-0 animate-orb-ring rounded-full bg-signal/30"
            aria-hidden="true"
          />
        )}

        <span
          className={`inline-flex transition-opacity duration-base [transform-origin:center] ${
            breathe ? "animate-logo-breath" : ""
          } ${state === "success" ? "animate-chip-pulse" : ""} ${
            state === "error" ? "opacity-40" : "opacity-100"
          }`}
        >
          <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            fill="none"
            aria-hidden="true"
          >
            <path
              d={C_PATH}
              stroke={INK}
              strokeWidth={26}
              strokeLinecap="round"
            />
            {/* traveling highlight around the arc — listening/working only.
                Hidden under reduced motion (a frozen dash is noise). */}
            {travel && (
              <path
                d={C_PATH}
                stroke={SIGNAL}
                strokeWidth={10}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="0.22 1.78"
                className="animate-logo-travel transition-opacity duration-base motion-reduce:hidden"
                style={{
                  opacity: "var(--ls-hl)",
                  animationDuration: t.speed,
                }}
              />
            )}
            <path
              d={CHECK_PATH}
              stroke={SIGNAL}
              strokeWidth={17}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              className={`transition-opacity duration-base [transform-box:fill-box] [transform-origin:center] ${
                state === "executing" ? "animate-logo-draw" : ""
              } ${state === "working" ? "animate-orb-pulse" : ""}`}
              style={{
                opacity: "var(--ls-check)",
                strokeDashoffset: 0,
                filter:
                  state === "awaiting"
                    ? "drop-shadow(0 0 5px rgba(255,75,31,0.55))"
                    : undefined,
              }}
            />
          </svg>
        </span>
      </span>

      <span
        className={`min-w-0 truncate text-xs font-bold lowercase tracking-widest ${
          state === "awaiting" ? "text-signal" : "text-ink-soft"
        }`}
      >
        {statusLabel(state, awaiting)}
      </span>
    </div>
  );
}
