"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { MissionRecord, MissionStepRecord } from "@/lib/types";
import { missionBrief } from "@/lib/missions/brief";
import { StatusPill } from "@/components/ui/StatusPill";
import { CardEnter } from "@/components/motion/Enter";
import { useChangeFlash } from "@/components/motion/StateChange";

/**
 * A MISSION, IN TWO SECONDS.
 *
 * One card, five answers, in the order a person needs them: what it is, what
 * it is doing, what it will do next, whether it needs them, and what actually
 * landed. Everything the engine knows — steps, tools, operator profiles, plan
 * versions — stays underneath where it belongs.
 *
 * The card is alive in exactly two ways, both of which carry information:
 * the live line breathes while work is genuinely in flight, and the whole
 * card reacts once when its status changes. Nothing else moves. A card that
 * animates continuously is a card people stop reading.
 *
 * Interaction shape: the title carries a stretched link so the whole card is
 * one big target, and the "needs you" control sits above it. That gives a
 * mouse user a card-sized hit area and a keyboard user exactly two stops —
 * open the mission, or act on it — instead of a card that traps them in a
 * dozen nested links.
 */
export function MissionCard({
  mission,
  steps = [],
  index = 0,
}: {
  mission: MissionRecord;
  steps?: MissionStepRecord[];
  index?: number;
}) {
  const brief = missionBrief(mission, steps);
  const justChanged = useChangeFlash(brief.status);
  const justFinished = justChanged && brief.status === "Finished";
  const pct = brief.progress === null ? null : Math.round(brief.progress * 100);

  return (
    <CardEnter
      as="article"
      index={index}
      className={`group relative rounded-card border bg-surface p-4 shadow-soft transition-[box-shadow,border-color,transform] duration-base ease-brand-out hover:-translate-y-px hover:shadow-depth ${
        brief.you ? "border-signal/50" : "border-line/70"
      } ${justFinished ? "animate-complete-seal" : ""}`}
    >
      {/* WHAT — the goal leads. Nothing above it but the status. */}
      <div className="flex items-start gap-3">
        <h3 className="min-w-0 flex-1 text-sm font-extrabold leading-snug">
          <Link
            href={`/app/missions/${mission.id}`}
            prefetch={false}
            className="after:absolute after:inset-0 after:rounded-card group-hover:underline underline-offset-2"
          >
            {brief.what}
          </Link>
        </h3>
        <StatusPill status={brief.status} size="sm" className="shrink-0" />
      </div>

      {/* NOW — only while something is genuinely running. */}
      {brief.now && (
        <p className="mt-2.5 flex items-start gap-2 text-xs font-semibold">
          <span
            className="mt-1 h-1.5 w-1.5 shrink-0 animate-orb-pulse rounded-pill bg-signal"
            aria-hidden="true"
          />
          <span className="min-w-0">{brief.now}</span>
        </p>
      )}

      {/* NEXT — exactly one. A list of five is a plan, and nobody reads a plan. */}
      {brief.next && (
        <p className="mt-1 pl-3.5 text-xs text-ink-soft">
          <span className="font-bold text-ink">Next:</span> {brief.next}
        </p>
      )}

      {/* DONE — what actually landed, in cosigno's own recorded words. */}
      {brief.settled && brief.done.headline && (
        <p className="mt-2.5 flex items-start gap-2 text-xs font-semibold">
          <Check size={13} strokeWidth={3} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
          <span className="min-w-0">{brief.done.headline}</span>
        </p>
      )}

      {/* YOU — the only thing on the card that is a control, because it is the
          only thing that costs the user something by being missed. */}
      {brief.you && (
        <div className="relative z-10 mt-3 flex flex-wrap items-center gap-2 rounded-btn bg-signal/12 px-3 py-2">
          <p className="min-w-0 flex-1 text-xs font-bold">{brief.you.ask}</p>
          <Link
            href={
              brief.you.kind === "approval"
                ? `/app/missions/${mission.id}#decide`
                : `/app/missions/${mission.id}`
            }
            prefetch={false}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-btn bg-signal px-3 text-xs font-extrabold text-ink transition-transform duration-fast ease-brand-out hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
          >
            {brief.you.cta}
            <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* Progress, only once there is a real plan to measure against. A bar
          at 0% of 0 steps is a decoration pretending to be a measurement. */}
      {pct !== null && !brief.settled && (
        <div className="mt-3 flex items-center gap-2">
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${brief.done.count} of ${brief.done.total} steps finished`}
            className="h-1 flex-1 overflow-hidden rounded-pill bg-cream-deep"
          >
            <div
              className="h-full rounded-pill bg-signal transition-[width] duration-slow ease-brand-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="shrink-0 text-[10px] font-bold tabular-nums text-ink-soft">
            {brief.done.count}/{brief.done.total}
          </span>
        </div>
      )}
    </CardEnter>
  );
}
