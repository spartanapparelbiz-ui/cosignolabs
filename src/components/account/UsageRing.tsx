"use client";

import { useEffect, useState } from "react";

/**
 * Animated usage ring — the SVG stroke fills to the current fraction on
 * mount (stroke-dashoffset transition, transform/opacity-adjacent but on a
 * single element). Turns signal orange in the final 20%.
 */
export function UsageRing({
  used,
  limit,
  size = 132,
}: {
  used: number;
  limit: number;
  size?: number;
}) {
  const frac = limit > 0 ? Math.min(1, used / limit) : 0;
  const [progress, setProgress] = useState(0);
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const nearLimit = frac >= 0.8;

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return setProgress(frac);
    const id = requestAnimationFrame(() => setProgress(frac));
    return () => cancelAnimationFrame(id);
  }, [frac]);

  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3E9DA" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={nearLimit ? "#FF4B1F" : "#141414"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - progress)}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold">{used}</span>
        <span className="text-[11px] lowercase text-ink-soft">of {limit}</span>
      </div>
    </div>
  );
}
