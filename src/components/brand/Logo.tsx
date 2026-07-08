import { INK, SIGNAL } from "@/lib/brand";

/**
 * The cosigno mark: a thick near-black C opening to the right, and a chunky
 * orange check whose short tail overlaps inside the C's mouth and whose long
 * arm extends up-right past the outer edge — the check completes the C.
 * Geometry mirrors scripts/logo-geometry.mjs (viewBox 0 0 100 100). Reads at 16px.
 */
export function CosignoMark({
  size = 28,
  checkClassName = "",
}: {
  size?: number;
  /** Applied to the orange check path — used by the living-logo breath. */
  checkClassName?: string;
}) {
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
        stroke={INK}
        strokeWidth={26}
        strokeLinecap="round"
      />
      <path
        d="M 47 53 L 57 63 L 88 28"
        stroke={SIGNAL}
        strokeWidth={17}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={checkClassName}
      />
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
