"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import type { MissionRecord, MissionStepRecord } from "@/lib/types";
import { buildMissionStory } from "@/lib/missionStory";
import { statusLabel } from "@/lib/status";
import { MissionFlow } from "./MissionFlow";
import { ObjectCards } from "./ObjectCards";

/**
 * One mission, told without opening it.
 *
 * The card carries everything a person needs to know it went well: the goal,
 * the one-word status, the apps it moved through, what it actually did, what
 * changed, how many approvals it needed, and how long it took. "View" is for
 * the detail — not for finding out whether it worked.
 *
 * There is no "time saved" here. cosigno knows how long the work took; it has
 * no idea how long it would have taken you, and inventing that number on a
 * results card would be the most flattering possible lie.
 */

const TONE: Record<string, string> = {
  working: "bg-ink text-cream",
  waiting: "bg-cream-deep text-ink-soft",
  needs_approval: "bg-signal text-ink",
  failed: "ring-1 ring-inset ring-ink/40 text-ink",
  finished: "bg-signal/20 text-ink",
};

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function MissionCard({
  mission,
  steps,
  href,
}: {
  mission: MissionRecord;
  steps: MissionStepRecord[];
  href?: string;
}) {
  const story = buildMissionStory(mission, steps);
  const finishedAt = mission.completed_at ?? mission.updated_at;

  return (
    <article
      className={`rounded-card border border-line bg-surface p-5 shadow-soft transition-shadow duration-fast hover:shadow-lift ${
        story.status === "working" ? "border-signal/40" : ""
      }`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-snug">{story.headline}</h3>
          <p className="mt-1 text-xs text-ink-soft">
            {story.status === "working" || story.status === "needs_approval"
              ? `started ${ago(mission.created_at)}`
              : `finished ${ago(finishedAt)}`}
            {story.took ? ` · took ${story.took}` : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-pill px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${TONE[story.status]}`}
        >
          {statusLabel(story.status)}
        </span>
      </header>

      {/* what is happening right now — the line that makes it feel alive */}
      {story.now && (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold">
          <span className="h-2 w-2 animate-orb-pulse rounded-pill bg-signal" aria-hidden="true" />
          {story.now}
        </p>
      )}

      {/* the apps it moves through, each turning green as it finishes */}
      {story.apps.length > 0 && (
        <div className="mt-3">
          <MissionFlow apps={story.apps} finished={story.status === "finished"} />
        </div>
      )}

      {/* ✓ what happened */}
      {story.done.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {/* Keyed by the line itself: a result that has just arrived is a
              NEW node, so it animates in rather than appearing between two
              renders. Work should look like it is landing. */}
          {story.done.slice(0, 4).map((line) => (
            <li key={line} className="flex animate-card-in items-start gap-2 text-sm">
              <Check size={13} strokeWidth={3} className="mt-0.5 shrink-0 animate-check-pop text-signal" aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
          {story.done.length > 4 && (
            <li className="pl-5 text-xs text-ink-soft">…and {story.done.length - 4} more</li>
          )}
        </ul>
      )}

      {/* what changed, as real objects */}
      {story.changes.length > 0 && (
        <div className="mt-3">
          <ObjectCards view={{ cards: story.changes.slice(0, 2), more: Math.max(0, story.changes.length - 2), empty: false }} />
        </div>
      )}

      <p className="mt-3 text-xs text-ink-soft">{story.outcome}</p>

      <footer className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span>
          {story.apps.length} app{story.apps.length === 1 ? "" : "s"}
        </span>
        {story.files > 0 && (
          <span>
            {story.files} file{story.files === 1 ? "" : "s"}
          </span>
        )}
        <span>
          {story.approvals} approval{story.approvals === 1 ? "" : "s"}
        </span>
        {story.status === "finished" && (
          <span>{story.verified ? "results checked" : "results not checked"}</span>
        )}
        {href && (
          <Link
            href={href}
            className="ml-auto rounded-btn px-3 py-1.5 text-xs font-bold text-ink ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep"
          >
            View
          </Link>
        )}
      </footer>
    </article>
  );
}
