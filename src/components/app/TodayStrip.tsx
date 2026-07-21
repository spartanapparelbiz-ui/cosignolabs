"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ActionRecord, SessionRecord } from "@/lib/types";

/**
 * The home command center's "today" strip: what cosigno is working on, what
 * needs you, what completed, what's blocked — all DERIVED from real sessions
 * and action states, never invented. Each tile deep-links to its surface.
 * Silent by design: while loading it shows a slim shimmer; if the fetch fails
 * (or demo mode has nothing) it renders nothing rather than breaking home.
 */

interface Counts {
  missions: number;
  decisions: number;
  executed: number;
  blocked: number;
}

export function TodayStrip() {
  const [data, setData] = useState<{ sessions: SessionRecord[]; actions: ActionRecord[] } | null>(
    null
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, a] = await Promise.all([
          fetch("/api/sessions").then((r) => (r.ok ? r.json() : Promise.reject())),
          fetch("/api/actions?limit=1000").then((r) => (r.ok ? r.json() : Promise.reject())),
        ]);
        if (alive) setData({ sessions: s.sessions ?? [], actions: a.actions ?? [] });
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const counts = useMemo<Counts | null>(() => {
    if (!data) return null;
    const proposed = data.actions.filter((a) => a.status === "proposed").length;
    const failedActions = data.actions.filter((a) => a.status === "failed").length;
    const today = new Date().toDateString();
    const executedToday = data.actions.filter(
      (a) => a.status === "executed" && new Date(a.created_at).toDateString() === today
    ).length;
    return {
      missions: data.sessions.length,
      decisions: proposed,
      executed: executedToday,
      blocked: failedActions,
    };
  }, [data]);

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
    <div className="mx-auto w-full max-w-6xl px-4 pt-3" aria-label="today">
      {tiles ? (
        <div className="flex flex-wrap gap-2">
          {tiles.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              prefetch
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-xs font-bold lowercase tracking-wide transition-transform duration-fast hover:-translate-y-px ${
                t.accent
                  ? "bg-signal text-cream shadow-soft"
                  : "bg-surface/70 text-ink-soft ring-1 ring-inset ring-ink/10"
              }`}
            >
              <span className="font-mono text-sm font-extrabold">{t.value}</span>
              {t.label}
            </Link>
          ))}
        </div>
      ) : (
        <div className="h-9 w-64 animate-pulse rounded-pill bg-cream-deep" aria-hidden="true" />
      )}
    </div>
  );
}
