"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Square } from "lucide-react";
import type { MissionRecord, MissionStepRecord } from "@/lib/types";
import { missionStatus } from "@/lib/status";
import { MissionCard } from "@/components/app/MissionCard";
import { DecisionInbox } from "@/components/app/DecisionInbox";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { useBackgroundExecution } from "./useBackgroundExecution";

/**
 * EVERY MISSION, IN ONE LIST.
 *
 * This surface used to be an accordion: each mission expanded into a full
 * duplicate of the mission workspace — steps, sources, verifications, plan
 * versions, controls — so the "list" was really twelve copies of a detail
 * page stacked on top of each other. Two things were wrong with it. It made
 * the list impossible to scan, which is the only job a list has. And the
 * expanded copy could drift from the real workspace page, so the same mission
 * read differently depending on where you looked at it.
 *
 * Now: one card per mission, five answers each, and the mission's own page for
 * everything else. There is exactly one place that renders mission detail.
 *
 * The one thing that stays inline is a waiting DECISION. Making someone open a
 * page to approve something they have already decided is the friction this
 * product exists to remove — and the inbox here is scoped to that mission's
 * own cards, so approving beside one piece of work can never sign off a
 * neighbouring mission's action that happened to be in the shared queue.
 */

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || "something went wrong.");
  return body;
}

/** Anything still cosigno's problem, or the user's. */
const OPEN_STATES = new Set([
  "queued",
  "running",
  "awaiting_input",
  "awaiting_approval",
  "retrying",
  "verifying",
  "paused",
  "blocked",
]);
const NEEDS_YOU_STATES = new Set(["awaiting_input", "awaiting_approval", "paused", "blocked"]);

type Filter = "all" | "needs_you" | "working" | "finished";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "needs_you", label: "Needs you" },
  { id: "working", label: "Working" },
  { id: "finished", label: "Finished" },
];

export function MissionRunner({ initial }: { initial?: MissionRecord[] }) {
  // Server-prefetched list paints immediately; the mount load() below is a
  // background revalidate (SWR). Without prefetch it's the first load.
  const [missions, setMissions] = useState<MissionRecord[] | null>(initial ?? null);
  const [steps, setSteps] = useState<Record<string, MissionStepRecord[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const bgActive = useBackgroundExecution();

  const load = useCallback(async () => {
    try {
      // include=steps gives the cards their live line and progress in the
      // same round trip the list already makes.
      const data = await jsonFetch("/api/missions?include=steps");
      setMissions(data.missions ?? []);
      setSteps((data.steps ?? {}) as Record<string, MissionStepRecord[]>);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't load your missions.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the list honest while someone is watching it. The engine advances
  // server-side; this only refreshes what is on screen.
  useEffect(() => {
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 10_000);
    return () => clearInterval(tick);
  }, [load]);

  const counts = useMemo(() => {
    const all = missions ?? [];
    const open = all.filter((m) => OPEN_STATES.has(m.state));
    return {
      all: all.length,
      needs_you: open.filter((m) => NEEDS_YOU_STATES.has(m.state)).length,
      working: open.filter((m) => !NEEDS_YOU_STATES.has(m.state)).length,
      finished: all.filter((m) => !OPEN_STATES.has(m.state)).length,
    };
  }, [missions]);

  const visible = useMemo(() => {
    const all = missions ?? [];
    switch (filter) {
      case "needs_you":
        return all.filter((m) => NEEDS_YOU_STATES.has(m.state));
      case "working":
        return all.filter((m) => OPEN_STATES.has(m.state) && !NEEDS_YOU_STATES.has(m.state));
      case "finished":
        return all.filter((m) => !OPEN_STATES.has(m.state));
      default:
        // Open work first — a finished mission from Tuesday should never sit
        // above something waiting on a signature right now.
        return [...all].sort((a, b) => {
          const rank = (m: MissionRecord) =>
            NEEDS_YOU_STATES.has(m.state) ? 0 : OPEN_STATES.has(m.state) ? 1 : 2;
          return rank(a) - rank(b);
        });
    }
  }, [missions, filter]);

  if (error) {
    return (
      <ErrorState
        what="cosigno couldn't load your missions."
        tried="It was reading the list of work you've delegated."
        next="Nothing was lost — every mission is still running or waiting where it was."
        retry={() => void load()}
      />
    );
  }

  if (missions === null) {
    return <LoadingState label="Gathering your missions" rows={3} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* An honest warning, not a configuration note: on a workspace with no
          scheduler, work only moves while a mission is open. */}
      {bgActive === false && (
        <p className="flex items-start gap-2 rounded-card bg-signal/10 p-3 text-xs font-semibold ring-1 ring-inset ring-signal/30">
          <Square size={13} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
          <span>
            A mission moves forward only while you have it open. Background
            running isn&apos;t available for this workspace yet, so closing it
            pauses the work rather than losing it — open the mission again to
            carry on.
          </span>
        </p>
      )}

      {missions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <div role="tablist" aria-label="filter missions" className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(f.id)}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-pill px-3.5 text-xs font-bold transition-[background-color,color,transform] duration-fast ease-brand-out active:scale-[0.98] ${
                    active
                      ? "bg-ink text-cream"
                      : "text-ink-soft ring-1 ring-inset ring-line hover:bg-cream-deep hover:text-ink"
                  }`}
                >
                  {f.label}
                  <span className="tabular-nums opacity-70">{counts[f.id]}</span>
                </button>
              );
            })}
          </div>
          <ButtonLink href="/app" size="sm" className="ml-auto">
            Start something
          </ButtonLink>
        </div>
      )}

      {missions.length === 0 && (
        <EmptyState
          headline="Your workspace is clear."
          body="Every outcome you hand to cosigno shows up here — what it's doing, what it needs from you, and what it finished."
          action={{ label: "Start something", href: "/app" }}
        />
      )}

      {missions.length > 0 && visible.length === 0 && (
        <p className="rounded-card border border-line/60 bg-surface/50 px-4 py-8 text-center text-sm font-semibold text-ink-soft">
          Nothing here right now.
        </p>
      )}

      {visible.map((m, i) => {
        const mySteps = steps[m.id] ?? [];
        const waitingIds = mySteps
          .filter((s) => s.state === "awaiting_approval" && s.action_id)
          .map((s) => s.action_id as string);
        return (
          <div key={m.id} className="flex flex-col gap-2">
            <MissionCard mission={m} steps={mySteps} index={i} />
            {/* Decide right here, scoped to THIS mission's cards. */}
            {missionStatus(m.state) === "Needs approval" && waitingIds.length > 0 && (
              // Indented and rule-joined so it reads as belonging to the card
              // above it. Rendered flush, a decision card is the same width as
              // a mission card and there is nothing to say which mission it
              // came from — which is the one thing you must be sure of before
              // you sign anything.
              <div className="ml-4 border-l-2 border-signal/30 pl-4">
                <DecisionInbox only={waitingIds} compact emptyFallback={null} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
