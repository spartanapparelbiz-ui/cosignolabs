"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { EventStream, type ActivityEvent, type ActivityKind } from "@/components/app/EventCard";
import { SkeletonRows } from "@/components/Skeleton";

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
  }, [load]);

  if (error) {
    return (
      <div className="mt-6 rounded-card bg-surface p-6 shadow-e1 ring-1 ring-inset ring-line/60">
        <p className="text-sm font-semibold">{error}</p>
        <button
          onClick={load}
          className="mt-3 rounded-btn px-4 py-2 text-sm font-bold ring-1 ring-inset ring-ink transition-transform duration-fast hover:bg-cream-deep active:scale-95"
        >
          try again
        </button>
      </div>
    );
  }

  if (events === null) {
    return (
      <div className="mt-5" aria-busy="true" aria-label="loading your activity">
        <SkeletonRows rows={6} />
      </div>
    );
  }

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
            className={`rounded-pill px-3 py-1.5 text-xs font-bold transition-[background-color,color,transform] duration-fast ease-brand-out active:scale-95 ${
              i === active
                ? "bg-ink text-cream shadow-e1"
                : "bg-cream-deep text-ink-soft hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <EventStream
          events={visible}
          onSelect={(e) => e.actionId && setReceiptFor(e.actionId)}
          empty={
            // Every empty state says what would put something here.
            kinds.length === 0
              ? "Nothing has happened yet. Give cosigno a job and it will show up here."
              : `No ${FILTERS[active].label.toLowerCase()} yet.`
          }
        />
      </div>

      {receiptFor && (
        <ReceiptModal actionId={receiptFor} onClose={() => setReceiptFor(null)} />
      )}
    </div>
  );
}
