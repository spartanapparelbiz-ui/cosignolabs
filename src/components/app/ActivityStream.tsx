"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { EventStream, type ActivityEvent, type ActivityKind } from "@/components/app/EventCard";
import { SkeletonRows } from "@/components/Skeleton";
import { EmptyState } from "@/components/ui/Page";
import { btn } from "@/components/ui/styles";

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

  if (events === null) return <SkeletonRows rows={6} />;

  const kinds = FILTERS[active].kinds;
  const visible = kinds.length === 0 ? events : events.filter((e) => kinds.includes(e.kind));

  return (
    <div>
      {/* A segmented control, not five buttons: the selection slides between
          them, so switching filters reads as one list narrowing rather than a
          new page arriving. */}
      <div className="-ml-2.5 flex flex-wrap items-center">
        {FILTERS.map((f, i) => (
          <button
            key={f.label}
            onClick={() => setActive(i)}
            aria-pressed={i === active}
            className={`relative rounded-btn px-2.5 py-1.5 text-[0.8125rem] transition-colors duration-fast ${
              i === active ? "font-semibold text-ink" : "text-ink-soft hover:text-ink"
            }`}
          >
            {f.label}
            {i === active && (
              <span
                className="absolute inset-x-2.5 -bottom-px h-[1.5px] rounded-pill bg-ink"
                aria-hidden="true"
              />
            )}
          </button>
        ))}
      </div>
      <div className="h-px bg-line/50" aria-hidden="true" />

      <div key={active} className="mt-3 animate-fade-through">
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
