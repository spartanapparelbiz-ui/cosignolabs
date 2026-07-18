"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActionRecord, SessionRecord } from "@/lib/types";
import { EmptyIllustration } from "@/components/EmptyIllustration";

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
  if (!res.ok) throw new Error(body.message || body.error || "something went wrong.");
  return body;
}

interface MissionRow {
  session: SessionRecord;
  list: ActionRecord[];
  proposed: number;
  executed: number;
  vetoed: number;
  failed: number;
  total: number;
}

/**
 * Momentum, not a score: Moving / Needs you / Blocked / Complete — derived
 * only from what the actions actually did.
 */
function statusOf(m: MissionRow): { label: string; key: string; cls: string } {
  if (m.proposed > 0)
    return { label: `needs you · ${m.proposed}`, key: "needs_you", cls: "bg-signal text-cream" };
  if (m.total === 0)
    return { label: "moving", key: "moving", cls: "bg-ink text-cream" };
  if (m.failed > 0)
    return { label: "blocked", key: "blocked", cls: "ring-1 ring-inset ring-ink/40 text-ink" };
  return { label: "complete", key: "complete", cls: "ring-1 ring-inset ring-signal/50 text-signal" };
}

/**
 * The living progress track: one segment per action, in proposal order —
 * filled (executed), signal (waiting on you), hollow (open), muted (vetoed).
 */
function ProgressTrack({ actions }: { actions: ActionRecord[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="mt-2.5 flex items-center gap-1" aria-hidden="true">
      {actions.slice(0, 16).map((a) => (
        <span
          key={a.id}
          className={`h-1.5 flex-1 rounded-pill transition-colors ${
            a.status === "executed"
              ? "bg-ink"
              : a.status === "proposed"
                ? "bg-signal"
                : a.status === "failed"
                  ? "bg-ink/40"
                  : a.status === "vetoed"
                    ? "bg-line"
                    : "bg-cream-deep ring-1 ring-inset ring-ink/15"
          }`}
        />
      ))}
    </div>
  );
}

export function MissionList() {
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [actions, setActions] = useState<ActionRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Adaptive UI: "show me the launch" lands here as ?q=launch; "what's
  // blocked?" as ?filter=blocked — the list becomes the answer.
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const filter = searchParams.get("filter");

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
      setError(e instanceof Error ? e.message : "couldn't load your missions.");
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
    const rows = sessions.map((session) => {
      const list = (bySession.get(session.id) ?? []).sort(
        (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
      );
      return {
        session,
        list,
        proposed: list.filter((a) => a.status === "proposed").length,
        executed: list.filter((a) => a.status === "executed").length,
        vetoed: list.filter((a) => a.status === "vetoed").length,
        failed: list.filter((a) => a.status === "failed").length,
        total: list.length,
      };
    });
    return rows.filter((m) => {
      if (q && !m.session.title.toLowerCase().includes(q)) return false;
      if (filter === "blocked" && statusOf(m).key !== "blocked") return false;
      return true;
    });
  }, [sessions, actions, q, filter]);

  if (error) {
    return (
      <div className="rounded-card bg-surface/60 p-6 text-center shadow-soft">
        <p className="text-sm font-semibold text-ink-soft">{error}</p>
        <button
          onClick={load}
          className="mt-3 rounded-btn px-4 py-2 text-sm font-bold lowercase ring-1 ring-inset ring-ink hover:bg-cream-deep"
        >
          try again
        </button>
      </div>
    );
  }

  if (missions === null) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="loading missions">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-card bg-cream-deep" />
        ))}
      </div>
    );
  }

  if (missions.length === 0 && (q || filter)) {
    return (
      <div className="rounded-card bg-surface/40 px-6 py-10 text-center shadow-soft">
        <p className="text-sm font-extrabold lowercase">
          {filter === "blocked" ? "nothing is blocked." : `nothing matches “${q}”.`}
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          {filter === "blocked"
            ? "every delegated goal is moving, waiting, or complete."
            : "try another name, or ask cosigno to start it."}
        </p>
        <Link href="/app/missions" className="mt-3 inline-block text-xs font-bold underline underline-offset-2">
          show everything
        </Link>
      </div>
    );
  }

  if (missions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card bg-surface/40 px-6 py-12 text-center shadow-soft">
        <EmptyIllustration kind="workspace" />
        <p className="text-sm font-extrabold lowercase">no missions yet.</p>
        <p className="max-w-sm text-xs text-ink-soft">
          give the operator a goal in the workspace — each one becomes a
          mission you can track here, decision by decision.
        </p>
        <Link
          href="/app"
          prefetch
          className="mt-1 rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink shadow-soft"
        >
          start a mission
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {missions.map((m, i) => {
        const s = statusOf(m);
        return (
          <div
            key={m.session.id}
            style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
            className="animate-rise-in rounded-card bg-surface/60 p-4 shadow-soft"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate text-sm font-extrabold" title={m.session.title}>
                {m.session.title}
              </h2>
              <span className={`rounded-pill px-2.5 py-0.5 text-[10px] font-bold lowercase tracking-wide ${s.cls}`}>
                {s.label}
              </span>
            </div>
            <ProgressTrack actions={m.list} />
            <p className="mt-1.5 font-mono text-[11px] text-ink-soft">
              {m.executed} executed · {m.vetoed} vetoed · {m.failed} failed ·{" "}
              {new Date(m.session.created_at).toLocaleDateString()}
            </p>
            {m.proposed > 0 && (
              <Link
                href="/app/focus"
                prefetch
                className="mt-2 inline-block rounded-btn bg-ink px-3.5 py-1.5 text-xs font-bold text-cream transition-transform duration-fast hover:-translate-y-px"
              >
                review {m.proposed} decision{m.proposed === 1 ? "" : "s"}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
