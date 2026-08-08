"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Plug,
  ShieldQuestion,
  Sliders,
} from "lucide-react";
import { ConnectorLogo } from "@/components/integrations/ConnectorLogo";

/**
 * The one event card. Every timeline in cosigno renders through this.
 *
 * Four things and nothing else: what happened, where, who did it, and how to go
 * look at it. Every page that shows history is a FILTER over the same list
 * rendered by the same component — so a moment can't appear twice, described
 * two different ways, on two different screens.
 */

export type ActivityKind = "work" | "decision" | "connection" | "policy" | "safety";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  at: string;
  headline: string;
  detail?: string;
  app: string | null;
  providerKey?: string;
  actor: "cosigno" | "you";
  href?: string;
  pinned?: boolean;
  missionId?: string;
  actionId?: string;
}

const KIND_ICON: Record<ActivityKind, typeof Check> = {
  work: Check,
  decision: ShieldQuestion,
  connection: Plug,
  policy: Sliders,
  safety: AlertTriangle,
};

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

export function EventCard({
  event,
  onSelect,
}: {
  event: ActivityEvent;
  /** Opens the signed receipt for events that have one. */
  onSelect?: (event: ActivityEvent) => void;
}) {
  const Icon = KIND_ICON[event.kind];

  const body = (
    <>
      <span className="mt-[3px] shrink-0 text-ink-soft" aria-hidden="true">
        {event.providerKey ? (
          <ConnectorLogo
            kind="app"
            providerKey={event.providerKey}
            displayName={event.app ?? ""}
            size={15}
          />
        ) : (
          <Icon size={14} strokeWidth={1.9} className={event.pinned ? "text-signal" : undefined} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[0.875rem] leading-snug">{event.headline}</span>
        <span className="t-caption mt-0.5 flex flex-wrap items-center gap-x-1.5">
          {/* Who did it — said the way a person would, never "system". */}
          <span>{event.actor === "you" ? "You" : "cosigno"}</span>
          {event.app && <span>· {event.app}</span>}
          <span>· {when(event.at)}</span>
          {event.detail && <span className="w-full">{event.detail}</span>}
        </span>
      </span>

      {event.href && (
        <ArrowUpRight
          size={13}
          strokeWidth={2}
          className="mt-1 shrink-0 -translate-x-1 text-ink-soft opacity-0 transition-all duration-base ease-brand-out group-hover:translate-x-0 group-hover:opacity-100"
          aria-hidden="true"
        />
      )}
    </>
  );

  /* A pinned event is the one thing still waiting on you. It gets a single
     orange rule down its left edge — no tinted background, because a row of
     tinted blocks turns a history into a warning sign. */
  const className = `group flex w-full items-start gap-3 rounded-btn py-2.5 pr-3 text-left transition-colors duration-fast hover:bg-ink/[0.035] ${
    event.pinned ? "border-l-2 border-signal pl-[10px]" : "pl-3"
  }`;

  // A decision carries its signed receipt — the proof of what was authorised
  // and by whom. That takes precedence over navigating away.
  if (onSelect && event.actionId) {
    return (
      <button type="button" onClick={() => onSelect(event)} className={className}>
        {body}
      </button>
    );
  }
  // An event with nowhere to go renders as text rather than a link that lies
  // about being clickable.
  if (!event.href) return <div className={className}>{body}</div>;
  return (
    <Link href={event.href} className={className}>
      {body}
    </Link>
  );
}

/** A stream of events. The only timeline renderer in the product. */
export function EventStream({
  events,
  empty,
  onSelect,
}: {
  events: ActivityEvent[];
  empty?: React.ReactNode;
  onSelect?: (event: ActivityEvent) => void;
}) {
  if (events.length === 0) {
    return (
      <p className="t-caption animate-fade-through px-3 py-16 text-center">
        {empty ?? "Nothing has happened yet."}
      </p>
    );
  }
  return (
    <ol className="-mx-3 flex flex-col">
      {events.map((e) => (
        <li key={e.id}>
          <EventCard event={e} onSelect={onSelect} />
        </li>
      ))}
    </ol>
  );
}
