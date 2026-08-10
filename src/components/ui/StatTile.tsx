"use client";

import type { LucideIcon } from "lucide-react";
import { useCountUp } from "@/lib/useCountUp";
import { Surface } from "./Surface";

/**
 * One number on the overview, with the discipline that makes a number worth
 * printing.
 *
 * The rules, in the order they matter:
 *
 *   1. A tile whose source is not connected shows an INVITATION, not a zero.
 *      "Unread email 0" is a measurement of an inbox cosigno cannot see; it
 *      reads as a fact and is not one. `unavailable` swaps the number for the
 *      reason and points at the fix.
 *   2. A tile whose value has not loaded yet shows a skeleton, never a zero
 *      that then jumps. A number that changes under the reader once is a
 *      number they will check twice forever after.
 *   3. The value counts up. It is the one flourish here, and it exists to
 *      make a change visible: a count that ticks from 3 to 4 is noticed,
 *      one that hard-swaps is not.
 */

export interface StatTileProps {
  label: string;
  /** null = still loading (skeleton). Ignored when `unavailable` is set. */
  value: number | null;
  Icon: LucideIcon;
  /** Where clicking the tile goes. */
  href?: string;
  /** One short line under the number — units, or what the number is of. */
  meta?: string;
  /**
   * Why this number can't be shown, e.g. "connect gmail". Renders instead of
   * the value: an unconnected source produces an invitation, never a metric.
   */
  unavailable?: string;
  /** Draw attention: used for a non-zero pending-approval count. */
  attention?: boolean;
  index?: number;
}

export function StatTile({
  label,
  value,
  Icon,
  href,
  meta,
  unavailable,
  attention = false,
  index,
}: StatTileProps) {
  // Hooks run unconditionally — the count is computed even when the tile
  // ends up rendering an invitation, which costs nothing and keeps the hook
  // order stable across every branch below.
  const shown = useCountUp(value ?? 0);
  const loading = value === null && !unavailable;

  return (
    <Surface
      href={href}
      elevation="resting"
      index={index}
      attention={attention}
      className="flex flex-col gap-2 p-4"
      ariaLabel={href ? `${label}: ${unavailable ?? value ?? "loading"}` : undefined}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-btn transition-colors duration-fast ${
            attention
              ? "bg-signal/15 text-signal"
              : "bg-cream-deep text-ink-soft group-hover:text-ink"
          }`}
          aria-hidden="true"
        >
          <Icon size={14} strokeWidth={2.4} />
        </span>
        {/* The label wraps rather than truncating. At two columns on a phone a
            tile is about 165px wide, and "connected apps" at this tracking
            does not fit — truncating turned four tiles into "CONNECTED A…",
            which is a label that has stopped being one. Grid rows size to the
            tallest tile, so a second line costs nothing but height. */}
        <p className="min-w-0 flex-1 text-[10px] font-extrabold uppercase leading-tight tracking-[0.08em] text-ink-soft sm:text-[11px] sm:tracking-widest">
          {label}
        </p>
      </div>

      {unavailable ? (
        <>
          <p className="font-display text-display-sm font-bold text-ink-soft/70">—</p>
          <p className="text-[11px] font-bold leading-snug text-ink-soft">{unavailable}</p>
        </>
      ) : loading ? (
        <>
          <span
            className="skeleton-sheen relative block h-8 w-14 overflow-hidden rounded-btn bg-cream-deep"
            aria-hidden="true"
          />
          <span className="block h-3 w-20 rounded-pill bg-cream-deep/70" aria-hidden="true" />
          <span className="sr-only">loading {label}</span>
        </>
      ) : (
        <>
          <p className="font-display text-[2rem] font-bold leading-none tracking-tight tabular-nums">
            {shown.toLocaleString()}
          </p>
          {meta && <p className="text-[11px] font-semibold leading-snug text-ink-soft">{meta}</p>}
        </>
      )}
    </Surface>
  );
}
