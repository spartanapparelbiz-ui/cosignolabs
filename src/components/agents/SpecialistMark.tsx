"use client";

import { specialistFor, type SpecialistIdentity } from "@/lib/agents/identity";

/**
 * A specialist, as a mark.
 *
 * Each symbol is drawn from what the work actually is rather than from a
 * stock icon set, so the six read as one family: same 24-unit grid, same
 * stroke weight, same rounded caps as the cosigno check. They are deliberately
 * geometric — a cartoon avatar would make a real execution boundary look like
 * a mascot, and these marks stand for something the engine genuinely enforces.
 *
 * Legibility rules this component keeps:
 *  · the mark is never the only label; every caller pairs it with the name
 *  · `working` adds that specialist's motion signature, and only then
 *  · everything survives greyscale, reduced motion, and 200% zoom
 */

const STROKE = {
  fill: "none",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** The symbol geometry, one per specialist. */
function Symbol({ symbol }: { symbol: SpecialistIdentity["symbol"] }) {
  switch (symbol) {
    // Inbox — a tray with a message settling into it.
    case "inbox":
      return (
        <>
          <path d="M3.5 13.5h4l1.5 2.5h6l1.5-2.5h4" {...STROKE} />
          <path d="M5 13.5 7 5.5h10l2 8v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18z" {...STROKE} />
        </>
      );
    // Schedule — a month grid with today marked.
    case "schedule":
      return (
        <>
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" {...STROKE} />
          <path d="M3.5 10h17M8 3.5v3M16 3.5v3" {...STROKE} />
          <rect x="7" y="13" width="4" height="3.5" rx="1" fill="currentColor" stroke="none" />
        </>
      );
    // Research — concentric evidence, converging on one finding.
    case "research":
      return (
        <>
          <circle cx="11" cy="11" r="6.5" {...STROKE} />
          <circle cx="11" cy="11" r="2.5" {...STROKE} />
          <path d="m16 16 4.5 4.5" {...STROKE} />
        </>
      );
    // Documents — sheets, offset the way a real stack sits.
    case "files":
      return (
        <>
          <path d="M7.5 6.5h6l4 4v9a1.5 1.5 0 0 1-1.5 1.5H7.5A1.5 1.5 0 0 1 6 19.5v-11.5A1.5 1.5 0 0 1 7.5 6.5z" {...STROKE} />
          <path d="M13.5 6.5v4h4M9.5 3.5h5l3.5 3.5" {...STROKE} />
        </>
      );
    // Web — a globe's meridians, flattened to a scan.
    case "web":
      return (
        <>
          <circle cx="12" cy="12" r="8.5" {...STROKE} />
          <path d="M3.5 12h17M12 3.5c2.5 2.4 3.8 5.4 3.8 8.5s-1.3 6.1-3.8 8.5c-2.5-2.4-3.8-5.4-3.8-8.5S9.5 5.9 12 3.5z" {...STROKE} />
        </>
      );
    // Engineering — brackets around a precise centre.
    case "code":
      return (
        <>
          <path d="m8.5 7.5-5 4.5 5 4.5M15.5 7.5l5 4.5-5 4.5" {...STROKE} />
          <path d="M12 9.5v5" {...STROKE} />
        </>
      );
    // cosigno itself — the brand check.
    case "chief":
    default:
      return <path d="M4.5 12.5 10 18 20 6.5" {...STROKE} strokeWidth={2.8} />;
  }
}

/** The per-specialist motion signature, applied ONLY while it is working. */
const SIGNATURE_CLASS: Record<SpecialistIdentity["signature"], string> = {
  snap: "animate-sig-snap",
  sweep: "animate-sig-sweep",
  breathe: "animate-orb-breathe",
  shuffle: "animate-sig-shuffle",
  steady: "",
};

export function SpecialistMark({
  operatorKey,
  size = 26,
  working = false,
  className = "",
}: {
  operatorKey: string;
  size?: number;
  /** Adds this specialist's motion signature. Only true while it really is. */
  working?: boolean;
  className?: string;
}) {
  const s = specialistFor(operatorKey);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-btn ${
        working ? "bg-signal/15 text-signal" : "bg-cream-deep text-ink-soft"
      } ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        width={Math.round(size * 0.62)}
        height={Math.round(size * 0.62)}
        stroke="currentColor"
        className={working ? SIGNATURE_CLASS[s.signature] : ""}
      >
        <Symbol symbol={s.symbol} />
      </svg>
    </span>
  );
}

/**
 * The mark plus the name. The default way to attribute work, because a mark
 * alone is a puzzle for anyone who hasn't already learned the set — and a
 * legend the user has to memorise is not an identity system, it is homework.
 */
export function SpecialistChip({
  operatorKey,
  working = false,
  detail,
}: {
  operatorKey: string;
  working?: boolean;
  /** Optional second line: what it is doing or did. */
  detail?: string;
}) {
  const s = specialistFor(operatorKey);
  return (
    <span className="inline-flex items-center gap-2">
      <SpecialistMark operatorKey={operatorKey} working={working} size={24} />
      <span className="min-w-0">
        <span className="block text-[11px] font-extrabold leading-tight">{s.name}</span>
        {detail && (
          <span className="block text-[11px] font-semibold leading-tight text-ink-soft">
            {detail}
          </span>
        )}
      </span>
    </span>
  );
}
