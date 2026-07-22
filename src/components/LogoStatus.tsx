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

const C_PATH = "M 70.5 16.44 C 57.77 18.37, 48.31 22.33, 38.54 29.81 C 21.17 43.11, 11 66.97, 13.93 87.6 C 15.73 100.3, 20.58 111.26, 28.77 121.1 C 36.28 130.12, 45.93 136.74, 57.35 140.71 C 63.74 142.94, 68.73 143.86, 76.25 144.19 C 98.96 145.2, 120.62 134.14, 133.15 115.13 C 136.96 109.34, 137.35 108.43, 137.09 105.75 C 136.93 104.12, 136.53 103.08, 135.73 102.31 C 134.56 101.17, 120.58 94.48, 119.35 94.48 C 117.11 94.48, 115.46 95.92, 112.37 100.55 C 108.24 106.77, 103.78 110.86, 97.8 113.91 C 91.25 117.27, 87.7 118.24, 80.92 118.55 C 71.49 118.99, 63.88 116.93, 56.43 111.95 C 50.48 107.97, 46.21 103.19, 43.25 97.2 C 40.26 91.14, 39.38 87.93, 39.07 81.86 C 38.53 71.6, 42.24 61.96, 49.83 53.95 C 61.7 41.4, 80.68 37.99, 96.16 45.6 C 98.26 46.63, 100.14 47.48, 100.35 47.48 C 100.55 47.48, 103.39 45.56, 106.65 43.22 C 109.91 40.88, 114.7 37.64, 117.3 36.02 C 119.89 34.4, 122.02 32.92, 122.02 32.72 C 122.02 31.8, 113.87 25.97, 109.22 23.56 C 103.29 20.47, 101.83 19.91, 94.72 17.97 C 89.97 16.68, 88.7 16.54, 80.71 16.39 C 75.88 16.3, 71.29 16.32, 70.5 16.44";
const CHECK_PATH = "M 141.25 35.34 C 124.28 41.92, 104.95 55.37, 86.12 73.71 C 82.43 77.3, 79.24 80.24, 79.03 80.24 C 78.82 80.24, 75.74 77.39, 72.2 73.9 C 65.01 66.83, 63.97 66.25, 59.07 66.56 C 56.67 66.71, 55.63 67.04, 54.02 68.17 C 51.22 70.13, 49.65 73.11, 49.63 76.47 C 49.61 79.78, 50.62 81.43, 57.24 88.87 C 59.87 91.83, 64.17 96.82, 66.8 99.97 C 69.43 103.12, 72.14 106.06, 72.82 106.5 C 75.05 107.97, 78.47 108.48, 81.49 107.8 C 84.76 107.07, 85.83 106.06, 99.03 91.16 C 114.24 73.98, 131.81 54.32, 139.69 45.63 C 143.81 41.08, 147.18 37, 147.18 36.56 C 147.18 35.6, 145.72 34.17, 144.77 34.21 C 144.4 34.22, 142.81 34.73, 141.25 35.34";

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
            <path d={C_PATH} fill="var(--logo-c)" />
            <path
              d={CHECK_PATH}
              fill="var(--logo-check)"
              className={`transition-opacity duration-base [transform-box:fill-box] [transform-origin:center] ${
                state === "executing" ? "animate-check-pop" : ""
              } ${state === "working" ? "animate-orb-pulse" : ""}`}
              style={{
                opacity: "var(--ls-check)",
                filter:
                  state === "awaiting"
                    ? "drop-shadow(0 0 5px rgba(251, 76, 32,0.55))"
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
