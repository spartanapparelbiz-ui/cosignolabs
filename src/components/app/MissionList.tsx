"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActionRecord, SessionRecord } from "@/lib/types";
import { EmptyIllustration } from "@/components/EmptyIllustration";
import { SkeletonRows } from "@/components/Skeleton";
import { EmptyState } from "@/components/ui/Page";
import { badge, btn, dot, type BadgeTone } from "@/components/ui/styles";

/**
 * Missions — every goal you've delegated, as a persistent unit of work (one
 * mission = one session + its action cards). Status is derived from the real
 * action states: decisions waiting → "needs you"; work executed and nothing
 * pending → "complete"; otherwise "in progress". Pending decisions deep-link
 * into the Decision Inbox. Loading / error / empty states included.
 */

async function jsonFetch(url: string) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || "Something went wrong.");
  return body;
}

interface MissionRow {
  session: SessionRecord;
  proposed: number;
  executed: number;
  vetoed: number;
  failed: number;
  total: number;
}

function statusOf(m: MissionRow): { label: string; tone: BadgeTone } {
  if (m.proposed > 0) return { label: `needs you · ${m.proposed}`, tone: "signal" };
  if (m.total === 0) return { label: "planning", tone: "neutral" };
  if (m.failed > 0) return { label: "blocked", tone: "danger" };
  return { label: "complete", tone: "positive" };
}

export function MissionList() {
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [actions, setActions] = useState<ActionRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, a] = await Promise.all([
        jsonFetch("/api/sessions"),
        jsonFetch("/api/actions?limit=1000"),
      ]);
      setSessions(s.sessions ?? []);
      setActions(a.actions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your missions.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const missions = useMemo<MissionRow[] | null>(() => {
    if (!sessions || !actions) return null;
    const bySession = new Map<string, ActionRecord[]>();
    for (const a of actions) {
      const list = bySession.get(a.session_id) ?? [];
      list.push(a);
      bySession.set(a.session_id, list);
    }
    return sessions.map((session) => {
      const list = bySession.get(session.id) ?? [];
      return {
        session,
        proposed: list.filter((a) => a.status === "proposed").length,
        executed: list.filter((a) => a.status === "executed").length,
        vetoed: list.filter((a) => a.status === "vetoed").length,
        failed: list.filter((a) => a.status === "failed").length,
        total: list.length,
      };
    });
  }, [sessions, actions]);

  if (error) {
    return (
      <EmptyState
        title="That didn't load"
        description={error}
        action={
          <button onClick={load} className={btn("secondary", "md")}>
            Try again
          </button>
        }
      />
    );
  }

  if (missions === null) {
    return <SkeletonRows rows={3} />;
  }

  if (missions.length === 0) {
    return (
      <EmptyState
        illustration={<EmptyIllustration kind="workspace" />}
        title="No threads yet"
        description="Every goal you hand over becomes a thread here, decision by decision."
      />
    );
  }

  return (
    <div className="-mx-3 flex flex-col">
      {missions.map((m, i) => {
        const s = statusOf(m);
        return (
          <div
            key={m.session.id}
            style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
            className="group flex animate-fade-through flex-wrap items-center gap-x-4 gap-y-1.5 rounded-btn px-3 py-3 transition-colors duration-fast hover:bg-ink/[0.035]"
          >
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[1rem]" title={m.session.title}>
                {m.session.title}
              </h3>
              <p className="t-caption tabular-nums">
                {m.executed} executed · {m.vetoed} vetoed · {m.failed} failed ·{" "}
                {new Date(m.session.created_at).toLocaleDateString()}
              </p>
            </div>
            <span className={badge(s.tone)}>
              <span className={dot(s.tone)} aria-hidden="true" />
              {s.label}
            </span>
            {m.proposed > 0 && (
              <Link href="/app/approvals" prefetch className={btn("secondary", "sm")}>
                Review
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
