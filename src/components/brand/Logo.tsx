import { SIGNAL } from "@/lib/brand";

/**
 * The cosigno mark: a thick ORANGE C opening to the right, and a chunky check
 * whose short tail overlaps inside the C's mouth and whose long arm extends
 * up-right past the outer edge — the check completes the C. A small orange
 * accent dot floats above the opening (the signal dot, echoed over the "i"
 * in the wordmark). The check is theme-aware ink → cream on dark surfaces.
 * Geometry mirrors scripts/logo-geometry.mjs (viewBox 0 0 100 100). Reads at 16px.
 *
 * `mono` renders the whole mark in a single ink color (the monochrome
 * lockup) — used where a one-color mark is required.
 */
export function CosignoMark({
  size = 28,
  checkClassName = "",
  mono = false,
}: {
  size?: number;
  /** Applied to the check path — used by the living-logo breath. */
  checkClassName?: string;
  /** Single-ink monochrome variant (C, check, and dot all ink). */
  mono?: boolean;
}) {
  const cColor = mono ? "rgb(var(--c-ink))" : SIGNAL;
  // The check is theme-aware ink in every variant (ink on light, cream on dark).
  const checkColor = "rgb(var(--c-ink))";
  const dotColor = mono ? "rgb(var(--c-ink))" : SIGNAL;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M 76.0 66.9 A 31 31 0 1 1 76.0 33.1"
        stroke={cColor}
        strokeWidth={26}
        strokeLinecap="round"
      />
      {/* Theme-aware check: ink on light surfaces, cream on dark — so it never
          disappears into the background. */}
      <path
        d="M 38 51 L 53 65 L 83 29"
        stroke={checkColor}
        strokeWidth={17}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={checkClassName}
      />
      <circle cx={72} cy={18} r={7} fill={dotColor} />
    </svg>
  );
}

/** Lowercase wordmark with the signal i-dot. */
export function CosignoWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-extrabold lowercase tracking-tight text-ink ${className}`}
    >
      cos
      <span className="relative inline-block">
        <span className="relative">
          ı
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-[0.04em] h-[0.15em] w-[0.15em] -translate-x-1/2 rounded-full bg-signal"
          />
        </span>
      </span>
      gno
    </span>
  );
}

export function LogoLockup({
  size = 28,
  textClass = "text-2xl",
}: {
  size?: number;
  textClass?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <CosignoMark size={size} />
      <CosignoWordmark className={textClass} />
    </span>
  );
}
