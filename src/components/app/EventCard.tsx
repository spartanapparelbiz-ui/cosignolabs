"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Plug,
  ShieldQuestion,
  Sliders,
  X,
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
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {event.providerKey ? (
          <ConnectorLogo
            kind="app"
            providerKey={event.providerKey}
            displayName={event.app ?? ""}
            size={18}
          />
        ) : (
          <span
            className={`flex h-[18px] w-[18px] items-center justify-center rounded-btn ${
              event.pinned ? "bg-signal text-on-signal" : "bg-cream-deep text-ink-soft"
            }`}
          >
            <Icon size={11} />
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold leading-snug">{event.headline}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-soft">
          {/* Who did it — said the way a person would, never "system". */}
          <span>{event.actor === "you" ? "you" : "cosigno"}</span>
          {event.app && <span>· {event.app}</span>}
          <span>· {when(event.at)}</span>
          {event.detail && <span className="w-full font-semibold">{event.detail}</span>}
        </span>
      </span>

      {event.href && (
        <ArrowUpRight
          size={13}
          className="mt-0.5 shrink-0 text-ink-soft opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        />
      )}
    </>
  );

  const className = `group flex w-full items-start gap-2.5 rounded-btn px-2.5 py-2 text-left transition-colors ${
    event.pinned ? "bg-signal/10 ring-1 ring-inset ring-signal/30" : "hover:bg-cream-deep/50"
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
      <div className="rounded-card border border-dashed border-line bg-surface/40 px-6 py-10 text-center">
        <p className="text-sm font-semibold text-ink-soft">
          {empty ?? "Nothing has happened yet."}
        </p>
      </div>
    );
  }
  return (
    <ol className="flex flex-col gap-0.5">
      {events.map((e) => (
        <li key={e.id}>
          <EventCard event={e} onSelect={onSelect} />
        </li>
      ))}
    </ol>
  );
}
