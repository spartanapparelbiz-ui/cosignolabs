"use client";

import {
  CalendarClock,
  CheckCheck,
  FileText,
  Inbox,
  Loader2,
  PenLine,
  Plug,
  Repeat2,
  type LucideIcon,
} from "lucide-react";
import type { TileKey, TodayTile } from "@/lib/home/model";
import { StatTile } from "@/components/ui/StatTile";
import { Surface } from "@/components/ui/Surface";
import { staggerDelay, STAGGER_MS } from "@/lib/motion";

/**
 * Today, at a glance.
 *
 * Six counted tiles and two ask-shaped ones. The split is deliberate and it
 * is the honest part of this grid: cosigno can count its own missions,
 * decisions, apps, schedules and files without asking anyone, but it cannot
 * know how much unread mail is sitting in Gmail without calling Gmail. So the
 * inbox and calendar tiles don't print a number — they offer the one tap that
 * would actually answer the question, or the connection that would make it
 * answerable.
 */

const ICON: Record<TileKey, LucideIcon> = {
  running: Loader2,
  approvals: PenLine,
  completed: CheckCheck,
  apps: Plug,
  scheduled: Repeat2,
  files: FileText,
  inbox: Inbox,
  calendar: CalendarClock,
};

export function TodayOverview({ tiles }: { tiles: TodayTile[] }) {
  function compose(text: string) {
    window.dispatchEvent(new CustomEvent("cosigno:compose", { detail: { text } }));
  }

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {tiles.map((t, i) =>
        t.compose ? (
          <AskTile
            key={t.key}
            tile={t}
            Icon={ICON[t.key]}
            index={i}
            onCompose={() => compose(t.compose!)}
          />
        ) : (
          <StatTile
            key={t.key}
            index={i}
            label={t.label}
            value={t.value}
            meta={t.meta}
            unavailable={t.invite}
            href={t.href}
            attention={t.attention}
            Icon={ICON[t.key]}
          />
        )
      )}
    </div>
  );
}

/**
 * A tile whose answer lives behind a mission rather than in a record.
 *
 * It carries the same weight as a counted tile so the grid stays even, but
 * where a number would go it puts the request that produces one. What it must
 * never do is show a zero: the absence of a count here means nobody looked,
 * not that there is nothing there.
 */
function AskTile({
  tile,
  Icon,
  index,
  onCompose,
}: {
  tile: TodayTile;
  Icon: LucideIcon;
  index: number;
  onCompose: () => void;
}) {
  return (
    <Surface
      onClick={onCompose}
      elevation="resting"
      className="flex flex-col gap-2 p-4"
      ariaLabel={`${tile.label} — ${tile.invite ?? ""}`}
    >
      <span style={staggerDelay(index, STAGGER_MS.tiles)} className="contents">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-btn bg-cream-deep text-ink-soft transition-colors duration-fast group-hover:bg-signal/15 group-hover:text-signal"
            aria-hidden="true"
          >
            <Icon size={14} strokeWidth={2.4} />
          </span>
          <p className="min-w-0 flex-1 text-[10px] font-extrabold uppercase leading-tight tracking-[0.08em] text-ink-soft sm:text-[11px] sm:tracking-widest">
            {tile.label}
          </p>
        </div>
        <p className="text-pretty text-sm font-extrabold leading-snug">{tile.invite}</p>
        <p className="text-[11px] font-semibold text-ink-soft">
          cosigno hasn&apos;t looked yet
        </p>
      </span>
    </Surface>
  );
}
