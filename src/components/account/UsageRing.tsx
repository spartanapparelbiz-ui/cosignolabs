"use client";

import { useEffect, useState } from "react";

/**
 * Animated usage ring — the SVG stroke fills to the current fraction on
 * mount (stroke-dashoffset transition). Turns signal orange in the final
 * 20%. Hover / focus / tap surfaces a tooltip with the exact numbers and the
 * days left in the cycle.
 */
export function UsageRing({
  used,
  limit,
  size = 132,
  daysLeft,
  resetLabel,
}: {
  used: number;
  limit: number;
  size?: number;
  daysLeft?: number;
  resetLabel?: string;
}) {
  const frac = limit > 0 ? Math.min(1, used / limit) : 0;
  const [progress, setProgress] = useState(0);
  const [tip, setTip] = useState(false);
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const nearLimit = frac >= 0.8;
  const remaining = Math.max(0, limit - used);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return setProgress(frac);
    const id = requestAnimationFrame(() => setProgress(frac));
    return () => cancelAnimationFrame(id);
  }, [frac]);

  const tipText =
    `${used.toLocaleString()} of ${limit.toLocaleString()} used · ${remaining.toLocaleString()} left` +
    (typeof daysLeft === "number" ? ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : "");

  return (
    <div className="relative inline-flex flex-col items-center">
      <button
        type="button"
        onMouseEnter={() => setTip(true)}
        onMouseLeave={() => setTip(false)}
        onFocus={() => setTip(true)}
        onBlur={() => setTip(false)}
        onClick={() => setTip((v) => !v)}
        aria-label={tipText}
        className="relative inline-flex cursor-help rounded-pill focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--c-cream-deep))" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={nearLimit ? "rgb(var(--c-signal))" : "rgb(var(--c-ink))"}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - progress)}
            style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)" }}
          />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold">{used}</span>
          <span className="text-[0.75rem] text-ink-soft">of {limit}</span>
        </span>
      </button>

      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute -top-2 left-1/2 z-10 w-max max-w-[220px] -translate-x-1/2 -translate-y-full rounded-btn bg-ink px-3 py-2 text-center text-[0.75rem] font-semibold leading-snug text-cream shadow-raise animate-fade-through"
        >
          {remaining.toLocaleString()} of {limit.toLocaleString()} AI operations left
          {typeof daysLeft === "number" && (
            <>
              <br />
              {daysLeft} day{daysLeft === 1 ? "" : "s"} left{resetLabel ? ` · resets ${resetLabel}` : ""}
            </>
          )}
        </div>
      )}
    </div>
  );
}
