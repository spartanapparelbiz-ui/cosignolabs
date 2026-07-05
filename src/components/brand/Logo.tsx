import { INK, SIGNAL } from "@/lib/brand";

/**
 * The cosigno mark: a bold C with the signal check completing it —
 * approval is the brand. Flat vector version of the 3D logo; reads at 16px.
 */
export function CosignoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M24 4a20 20 0 1 0 14.1 34.2l-6.4-6.4A11 11 0 1 1 35 24h9A20 20 0 0 0 24 4Z"
        fill={INK}
      />
      <path
        d="M23.5 26.5 29 32l11-12"
        stroke={SIGNAL}
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
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
            className="absolute left-1/2 top-[0.06em] h-[0.14em] w-[0.14em] -translate-x-1/2 rounded-full bg-signal"
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
