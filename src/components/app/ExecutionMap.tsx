import Link from "next/link";
import {
  ArrowRight,
  Check,
  Loader2,
  PenLine,
  Repeat2,
  type LucideIcon,
} from "lucide-react";
import type { ExecutionMap as MapData } from "@/lib/workspace/map";
import { mapHeadline } from "@/lib/workspace/map";

/**
 * The execution map — the whole workspace in four lanes, with the bottleneck
 * on top.
 *
 * A server component on purpose: the ages inside it are computed once by the
 * pure map builder, so there is nothing to hydrate and nothing to drift. The
 * live per-mission detail keeps updating in Mission Control directly below
 * it; this strip answers the wider question that view deliberately doesn't —
 * "where is everything, and what is the one thing to do next?"
 *
 * The bottleneck card is the only loud element. Any list can show four
 * columns; the map's job is to rank — and age is the one dimension that
 * worsens entirely by itself, so the oldest waiting decision leads without
 * any judgment call.
 */

function Lane({
  title,
  Icon,
  count,
  children,
}: {
  title: string;
  Icon: LucideIcon;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-card bg-surface/70 p-3 shadow-e1 ring-1 ring-inset ring-line/60">
      <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-ink-soft">
        <Icon size={11} strokeWidth={2.6} aria-hidden="true" />
        {title}
        <span className="ml-auto font-mono tabular-nums">{count}</span>
      </p>
      <div className="mt-2 flex flex-col gap-1">{children}</div>
    </div>
  );
}

function LaneRow({ href, children, meta }: { href: string; children: React.ReactNode; meta: string }) {
  return (
    <Link
      href={href}
      prefetch
      className="group flex items-baseline gap-2 rounded-btn px-1.5 py-1 transition-colors duration-fast hover:bg-cream-deep/60"
    >
      <span className="min-w-0 flex-1 truncate text-xs font-bold">{children}</span>
      <span className="shrink-0 text-[10px] font-semibold lowercase text-ink-soft">{meta}</span>
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1.5 py-1 text-[11px] font-semibold text-ink-soft/70">{children}</p>;
}

export function ExecutionMap({ map, now }: { map: MapData; now: Date }) {
  const relative = (iso: string) => {
    const mins = Math.round((Date.parse(iso) - now.getTime()) / 60_000);
    if (mins <= 0) return "due now";
    if (mins < 60) return `in ${mins}m`;
    const hours = Math.round(mins / 60);
    return hours < 24 ? `in ${hours}h` : `in ${Math.round(hours / 24)}d`;
  };

  return (
    <section aria-label="execution map">
      <p className="text-sm font-extrabold lowercase">{mapHeadline(map)}</p>

      {/* The bottleneck. One card, and only when there is one. */}
      {map.bottleneck && (
        <Link
          href="/app/approvals"
          prefetch
          className="group mt-3 flex items-center gap-3 rounded-card bg-surface/80 p-3.5 shadow-e3 ring-1 ring-inset ring-signal/40 transition-[transform,box-shadow] duration-fast ease-brand-out hover:-translate-y-0.5 hover:shadow-signal-glow motion-reduce:hover:translate-y-0"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-signal/15 text-signal"
            aria-hidden="true"
          >
            <PenLine size={16} strokeWidth={2.5} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-extrabold uppercase tracking-widest text-signal">
              {/* "Bottleneck" claims stacked cost, so it is only said when
                  work is actually stopped behind the queue. A fresh, lone
                  decision is just the next thing to do. */}
              {map.bottleneck.missionsStopped > 0
                ? `the bottleneck — waiting ${map.bottleneck.waitingFor}`
                : `next decision — waiting ${map.bottleneck.waitingFor}`}
            </span>
            <span className="block truncate text-sm font-extrabold">
              {map.bottleneck.summary}
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-extrabold lowercase text-ink-soft transition-colors duration-fast group-hover:text-signal">
            decide
            <ArrowRight size={12} className="transition-transform duration-fast group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </Link>
      )}

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Lane title="moving" Icon={Loader2} count={map.moving.length}>
          {map.moving.length ? (
            map.moving.slice(0, 4).map((m) => (
              <LaneRow key={m.id} href={`/app/missions/${m.id}`} meta={m.age}>
                {m.goal}
              </LaneRow>
            ))
          ) : (
            <Empty>nothing running on its own.</Empty>
          )}
        </Lane>

        <Lane title="stopped on you" Icon={PenLine} count={map.stopped.length}>
          {map.stopped.length ? (
            map.stopped.slice(0, 4).map((m) => (
              <LaneRow key={m.id} href={`/app/missions/${m.id}`} meta={m.age}>
                {m.goal}
              </LaneRow>
            ))
          ) : (
            <Empty>nothing is waiting on a decision.</Empty>
          )}
        </Lane>

        <Lane title="standing" Icon={Repeat2} count={map.standing.length}>
          {map.standing.length ? (
            map.standing.slice(0, 4).map((s) => (
              <LaneRow key={s.id} href="/app/watch" meta={relative(s.nextRunAt)}>
                {s.name}
              </LaneRow>
            ))
          ) : (
            <Empty>no recurring work set up.</Empty>
          )}
        </Lane>

        <Lane title="landed today" Icon={Check} count={map.landedToday.length}>
          {map.landedToday.length ? (
            map.landedToday.slice(0, 4).map((m) => (
              <LaneRow key={m.id} href={`/app/missions/${m.id}`} meta="done">
                {m.goal}
              </LaneRow>
            ))
          ) : (
            <Empty>nothing finished yet today.</Empty>
          )}
        </Lane>
      </div>
    </section>
  );
}
