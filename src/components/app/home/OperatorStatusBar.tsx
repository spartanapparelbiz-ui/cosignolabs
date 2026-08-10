"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { OperatorStatus } from "@/lib/home/model";

/**
 * The operator's own status line — the first thing on the page, and the one
 * sentence that answers "is anything happening, and does it need me?"
 *
 * The dot carries the state, so it reads before the words do: it pings while
 * work is moving, sits solid while something waits on you, and goes quiet
 * (ink, not orange) when there is nothing to report. Orange stays reserved
 * for the two states that have earned it — running work and a decision — so
 * a calm workspace has no orange on the strip at all.
 */
export function OperatorStatusBar({ status }: { status: OperatorStatus }) {
  const live = status.state === "working";
  const waiting = status.state === "waiting";
  const held = status.state === "held";

  return (
    <div className="flex items-center justify-center">
      <div className="inline-flex max-w-full items-center gap-2.5 rounded-pill bg-surface/70 px-3.5 py-1.5 shadow-e1 ring-1 ring-inset ring-line/60">
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
          {live && (
            <span className="absolute inset-0 animate-status-ping rounded-pill bg-signal" />
          )}
          <span
            className={`relative h-2 w-2 rounded-pill ${
              live || waiting ? "bg-signal" : held ? "bg-ink" : "bg-ink-soft/50"
            }`}
          />
        </span>
        <p className="min-w-0 truncate text-xs font-extrabold lowercase tracking-wide">
          {status.headline}
        </p>
        {status.detail && (
          <>
            <span className="hidden h-3 w-px bg-line sm:block" aria-hidden="true" />
            <p className="hidden min-w-0 truncate text-xs font-semibold lowercase text-ink-soft sm:block">
              {status.detail}
            </p>
          </>
        )}
        {waiting && (
          <Link
            href="/app/approvals"
            prefetch
            className="group ml-1 inline-flex shrink-0 items-center gap-1 rounded-pill bg-signal px-2.5 py-0.5 text-[11px] font-extrabold lowercase text-on-signal transition-transform duration-fast hover:scale-[1.03] active:scale-95"
          >
            review
            <ArrowRight
              size={11}
              className="transition-transform duration-fast group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        )}
      </div>
    </div>
  );
}
