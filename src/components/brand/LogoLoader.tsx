"use client";

import { CosignoMark } from "./Logo";

/**
 * The cosigno loading indicator — never a generic spinner. The mark breathes
 * in place (transform/opacity only; static under reduced motion via
 * globals.css) with an optional label. Unlike ambient marks it always
 * breathes: a loader signals active work, so it's exempt from the
 * single-breather coordinator (there's only ever one loader on screen anyway).
 */
export function LogoLoader({
  size = 32,
  label,
  className = "",
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center gap-3 ${className}`}
    >
      <span className="inline-flex [transform-origin:center] motion-safe:animate-logo-breath">
        <CosignoMark size={size} checkClassName="motion-safe:animate-logo-check" />
      </span>
      {label ? (
        <span className="text-xs font-bold lowercase tracking-widest text-ink-soft">
          {label}
        </span>
      ) : null}
      <span className="sr-only">{label ?? "loading"}</span>
    </div>
  );
}
