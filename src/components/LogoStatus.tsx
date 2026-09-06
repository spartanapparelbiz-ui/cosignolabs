"use client";

import { useId } from "react";
import { LOGO_COUNTER_PATH, LOGO_MARK_PATH, LOGO_SHELL_PATH, LOGO_VIEWBOX } from "@/components/brand/Logo";

/**
 * The Cosigno mark as the workspace's live status indicator — the logo IS
 * the thing that shows what the operator is doing. Same geometry as
 * CosignoMark; state drives intensity through CSS custom properties
 * (`--ls-hl` highlight presence, `--ls-core` counter presence) with opacity
 * transitions, so states MORPH into each other rather than hard-swap.
 *
 *   idle       calm 5s breath (the living-logo token — nothing new)
 *   listening  a subtle highlight travels the mark's band, like taking input
 *   working    the travel speeds up and the counter warms — active work
 *   awaiting   the one attention-drawing state: the counter fills solid orange
 *              + a soft expanding ring every 1.6s
 *   executing  the filled counter does a decisive pop
 *   success    one confident settle-pulse, then back to idle
 *   error      the mark dims briefly and recovers — calm, never red
 *
 * All motion is transform/opacity (+ normalized stroke-dashoffset on the
 * travelling highlight). Under prefers-reduced-motion every animation collapses
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

/** Per-state intensity: highlight presence, its speed, and counter presence. */
const INTENSITY: Record<
  LogoStatusState,
  { hl: number; speed: string; core: number }
> = {
  idle: { hl: 0, speed: "2.4s", core: 0 },
  listening: { hl: 0.45, speed: "2.4s", core: 0 },
  working: { hl: 0.8, speed: "1.1s", core: 0.25 },
  awaiting: { hl: 0, speed: "2.4s", core: 1 },
  executing: { hl: 0, speed: "2.4s", core: 1 },
  success: { hl: 0, speed: "2.4s", core: 0.55 },
  error: { hl: 0, speed: "2.4s", core: 0 },
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
  // The travelling highlight is a stroke down the middle of the shell outline,
  // so half of it would spill outside the mark. Clipping it to the mark's own
  // silhouette keeps the highlight inside the orange band where it reads as the
  // band lighting up rather than as a halo around it.
  const clipId = `${useId()}-band`;

  return (
    <div
      className="flex min-w-0 items-center gap-2.5"
      role="status"
      aria-live="polite"
      aria-label={`operator status: ${statusLabel(state, awaiting)}`}
      style={
        {
          "--ls-hl": t.hl,
          "--ls-core": t.core,
        } as React.CSSProperties
      }
    >
      <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
        {/* soft expanding ring — ONLY while awaiting a signature */}
        {state === "awaiting" && (
          <span
            className="absolute inset-0 animate-orb-ring rounded-pill bg-signal/30"
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
            viewBox={LOGO_VIEWBOX}
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <clipPath id={clipId}>
                <path d={LOGO_MARK_PATH} clipRule="evenodd" />
              </clipPath>
            </defs>

            {/* the mark itself — counter knocked out, exactly as it ships */}
            <path d={LOGO_MARK_PATH} fillRule="evenodd" clipRule="evenodd" fill="var(--logo-mark)" />

            {/* the counter fills in as the operator engages, and empties again */}
            <path
              d={LOGO_COUNTER_PATH}
              fill="var(--logo-mark)"
              className={`transition-opacity duration-base [transform-box:fill-box] [transform-origin:center] ${
                state === "executing" ? "animate-check-pop" : ""
              } ${state === "working" ? "animate-orb-pulse" : ""}`}
              style={{
                opacity: "var(--ls-core)",
                filter:
                  state === "awaiting"
                    ? "drop-shadow(0 0 5px rgba(251, 76, 32,0.55))"
                    : undefined,
              }}
            />

            {/* a short highlight travelling the band — listening / working */}
            <g clipPath={`url(#${clipId})`}>
              <path
                d={LOGO_SHELL_PATH}
                fill="none"
                stroke="#FFB199"
                strokeWidth={18}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="0.13 0.87"
                className="motion-reduce:hidden animate-logo-travel transition-opacity duration-base"
                style={{ opacity: "var(--ls-hl)", animationDuration: t.speed }}
              />
            </g>
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
