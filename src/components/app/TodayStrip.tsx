"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { badge, btn, card, dot, field } from "@/components/ui/styles";

/**
 * The home command center's "today" strip: what cosigno is working on, what
 * needs you, what completed, what's blocked — all DERIVED from real sessions
 * and action states, never invented. Each tile deep-links to its surface.
 * Silent by design: while loading it shows a slim shimmer; if the fetch fails
 * (or demo mode has nothing) it renders nothing rather than breaking home.
 *
 * Counts come from one aggregate endpoint (DB-side counts) — the strip never
 * transfers or filters a thousand action rows for four numbers.
 */

interface Counts {
  missions: number;
  decisions: number;
  executed: number;
  blocked: number;
}

export function TodayStrip() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Local midnight → "completed today" keeps the user's timezone.
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        const res = await fetch(
          `/api/actions/summary?since=${encodeURIComponent(midnight.toISOString())}`
        );
        if (!res.ok) throw new Error();
        const { summary } = await res.json();
        if (alive)
          setCounts({
            missions: summary?.sessions ?? 0,
            decisions: summary?.proposed ?? 0,
            executed: summary?.executed ?? 0,
            blocked: summary?.failed ?? 0,
          });
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Nothing to show (error) or truly empty account → stay out of the way.
  if (failed) return null;
  if (counts && counts.missions === 0 && counts.decisions === 0) return null;

  const tiles = counts
    ? ([
        { label: counts.missions === 1 ? "mission underway" : "missions underway", value: counts.missions, href: "/app/missions", accent: false },
        { label: counts.decisions === 1 ? "needs your approval" : "need your approval", value: counts.decisions, href: "/app/approvals", accent: counts.decisions > 0 },
        { label: "completed today", value: counts.executed, href: "/app/activity", accent: false },
        ...(counts.blocked > 0
          ? [{ label: "didn't complete", value: counts.blocked, href: "/app/activity", accent: false }]
          : []),
      ] as const)
    : null;

  return (
    <div className="mx-auto w-full max-w-none px-5 pt-5 sm:px-8" aria-label="today">
      {tiles ? (
        <div className="-ml-2 flex flex-wrap items-center gap-x-1">
          {tiles.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              prefetch
              className="inline-flex items-center gap-1.5 rounded-btn px-2 py-1 text-[0.875rem] text-ink-soft transition-colors duration-fast hover:bg-ink/[0.04] hover:text-ink"
            >
              {t.accent && <span className={dot("signal")} aria-hidden="true" />}
              <span className={`tabular-nums ${t.accent ? "text-ink" : ""}`}>{t.value}</span>
              {t.label}
            </Link>
          ))}
        </div>
      ) : (
        <div className="h-6 w-64 animate-shimmer rounded-pill bg-ink/[0.055]" aria-hidden="true" />
      )}
    </div>
  );
}
