"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { EventStream, type ActivityEvent, type ActivityKind } from "@/components/app/EventCard";
import { SkeletonRows } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useNewItems } from "@/lib/useNewItems";

// The signed receipt — loaded the first time one is opened, not in this
// route's initial chunk.
const ReceiptModal = dynamic(() =>
  import("@/components/sign/ReceiptModal").then((m) => m.ReceiptModal)
);

/**
 * The whole history of the workspace, from the one activity model.
 *
 * The filters below are exactly that — filters. They narrow the same list this
 * page already has rather than asking the server for a different shaped
 * history, which is what let the old timelines drift apart in the first place.
 */

const FILTERS: Array<{ label: string; kinds: ActivityKind[] }> = [
  { label: "Everything", kinds: [] },
  { label: "Work", kinds: ["work"] },
  { label: "Decisions", kinds: ["decision"] },
  { label: "Apps", kinds: ["connection"] },
  { label: "Rules", kinds: ["policy", "safety"] },
];

export function ActivityStream() {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [active, setActive] = useState(0);
  const [receiptFor, setReceiptFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch("/api/activity/stream?limit=120", { cache: "no-store" });
      if (!r.ok) throw new Error("couldn't load your activity.");
      const d = await r.json();
      setEvents(Array.isArray(d.events) ? d.events : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't load your activity.");
    }
  }, []);

  useEffect(() => {
    load();
    // The timeline is the record of a workspace that is still working, so it
    // keeps itself current. Polling pauses entirely while the tab is hidden
    // (nobody is reading a background tab) and catches up on return.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 15_000);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Above the early returns: hooks run in the same order on every render.
  // Only events that arrived while this page was open animate in.
  const fresh = useNewItems((events ?? []).map((e) => e.id));

  if (error) {
    return (
      <div className="mt-6 rounded-card border border-line bg-surface p-6">
        <p className="text-sm font-semibold">{error}</p>
        <button
          onClick={load}
          className="mt-3 rounded-btn px-4 py-2 text-sm font-bold ring-1 ring-inset ring-ink hover:bg-cream-deep"
        >
          Retry
        </button>
      </div>
    );
  }

  if (events === null) return <SkeletonRows />;

  const kinds = FILTERS[active].kinds;
  const visible = kinds.length === 0 ? events : events.filter((e) => kinds.includes(e.kind));

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f, i) => (
          <button
            key={f.label}
            onClick={() => setActive(i)}
            aria-pressed={i === active}
            className={`rounded-pill px-3 py-1 text-xs font-bold transition-colors ${
              i === active ? "bg-ink text-cream" : "bg-cream-deep text-ink-soft hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <EventStream
          events={visible}
          freshIds={fresh}
          onSelect={(e) => e.actionId && setReceiptFor(e.actionId)}
          empty={
            // Every empty state says what would put something here — and the
            // whole-workspace case gets the full treatment, because "your
            // workspace has been quiet" is a state worth showing calmly
            // rather than a gap worth apologising for.
            kinds.length === 0 ? (
              <EmptyState
                kind="quiet"
                title="Your workspace has been quiet."
                body="Every job cosigno runs, every decision you make, and every change to what it may touch is recorded here — newest first."
                action={{ label: "Give cosigno a job", href: "/app" }}
              />
            ) : (
              `Nothing under ${FILTERS[active].label.toLowerCase()} yet — try another filter.`
            )
          }
        />
      </div>

      {receiptFor && (
        <ReceiptModal actionId={receiptFor} onClose={() => setReceiptFor(null)} />
      )}
    </div>
  );
}
