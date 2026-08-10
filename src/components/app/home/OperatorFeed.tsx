"use client";

import Link from "next/link";
import { Check, PenLine } from "lucide-react";
import type { FeedLine } from "@/lib/home/model";
import { staggerDelay, STAGGER_MS } from "@/lib/motion";

/**
 * The operator feed: what cosigno has been doing, in the order it matters.
 *
 * Anything waiting on a person sits at the top and keeps the orange, because
 * it is the only kind of line here that costs something by being scrolled
 * past. Finished work is deliberately quiet — a completed action wearing the
 * same weight as a pending one is how a queue of decisions gets missed.
 *
 * Lines slide in from the left, the direction the timeline flows, so an
 * arriving event reads as a stream rather than a repaint.
 */

function when(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const mins = Math.round((Date.now() - t) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
}

function Marker({ kind }: { kind: FeedLine["kind"] }) {
  if (kind === "waiting") {
    return (
      <span
        className="flex h-5 w-5 items-center justify-center rounded-pill bg-signal/15 text-signal ring-1 ring-inset ring-signal/40"
        aria-hidden="true"
      >
        <PenLine size={10} strokeWidth={3} />
      </span>
    );
  }
  if (kind === "live") {
    return (
      <span className="relative flex h-5 w-5 items-center justify-center" aria-hidden="true">
        <span className="absolute h-4 w-4 animate-step-live rounded-pill bg-signal/25" />
        <span className="relative h-2 w-2 rounded-pill bg-signal" />
      </span>
    );
  }
  return (
    <span
      className="flex h-5 w-5 items-center justify-center rounded-pill bg-signal text-on-signal"
      aria-hidden="true"
    >
      <Check size={11} strokeWidth={3.4} />
    </span>
  );
}

export function OperatorFeed({ lines }: { lines: FeedLine[] }) {
  return (
    <ol className="relative flex flex-col">
      {/* The spine. It stops short of the last marker so the timeline reads as
          ending at the newest event rather than trailing off the panel. */}
      <span
        className="pointer-events-none absolute bottom-4 left-[9px] top-4 w-px bg-line/70"
        aria-hidden="true"
      />
      {lines.map((l, i) => {
        const row = (
          <>
            <span className="relative z-10 mt-px shrink-0 bg-cream">
              <Marker kind={l.kind} />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block text-pretty text-[13px] leading-snug ${
                  l.kind === "waiting" ? "font-extrabold" : "font-semibold text-ink-soft"
                }`}
              >
                {l.text}
              </span>
              {l.kind === "waiting" && (
                <span className="mt-0.5 block text-[11px] font-bold text-signal">
                  waiting for your decision
                </span>
              )}
            </span>
            <span className="shrink-0 pt-0.5 font-mono text-[10px] tabular-nums text-ink-soft/80">
              {when(l.at)}
            </span>
          </>
        );

        const className =
          "group flex animate-feed-in items-start gap-2.5 rounded-btn px-1.5 py-2 transition-colors duration-fast hover:bg-cream-deep/60";

        return (
          <li key={l.id} style={staggerDelay(i, STAGGER_MS.rows)}>
            {l.href ? (
              <Link href={l.href} prefetch className={className}>
                {row}
              </Link>
            ) : (
              <div className={className}>{row}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
