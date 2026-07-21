"use client";


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

const C_PATH = "M112 35C91 17 59 17 37 37C13 59 13 101 37 123C59 143 91 143 112 125";
const CHECK_PATH = "M42 83L68 111L136 42";

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
            viewBox="0 0 160 160"
            fill="none"
            aria-hidden="true"
          >
            <path
              d={C_PATH}
              stroke="var(--logo-c)"
              strokeWidth={22}
              strokeLinecap="round"
            />
            {/* traveling gloss around the arc — listening/working only.
                A light sweep reads on the orange C; hidden under reduced
                motion (a frozen dash is noise). */}
            {travel && (
              <path
                d={C_PATH}
                stroke="#FFFFFF"
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
              stroke="var(--logo-check)"
              strokeWidth={20}
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
