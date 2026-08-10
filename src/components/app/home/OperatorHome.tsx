"use client";

import { useCallback, useEffect, useState } from "react";
import type { HomeModel } from "@/lib/home/model";
import { useDisplayName } from "@/lib/theme";
import { SourceComposer } from "@/components/app/SourceComposer";
import { DecisionInbox } from "@/components/app/DecisionInbox";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTiles } from "@/components/Skeleton";
import { Briefing } from "./Briefing";
import { OperatorStatusBar } from "./OperatorStatusBar";
import { TodayOverview } from "./TodayOverview";
import { SuggestionCards } from "./SuggestionCards";
import { LiveMissionCard } from "./LiveMissionCard";
import { ConnectedApps } from "./ConnectedApps";
import { OperatorFeed } from "./OperatorFeed";

/**
 * Home — the operator's workspace, useful before anything is typed.
 *
 * The page it replaced was a headline, an input, and four suggestion chips: a
 * chat box with a logo above it, which is exactly what cosigno is not. This
 * one opens on the state of the work — what is running, what needs a
 * signature, what finished, what cosigno is connected to — with the ask box
 * still the first thing your hands land on.
 *
 * Everything below the composer is a consequence of real records, and every
 * section vanishes rather than rendering an empty shell. A band titled
 * "running missions" with nothing under it is furniture that says nothing.
 *
 * Data flow: the server renders `initial` (see loadHome), so first paint is
 * real work rather than skeletons. This component then revalidates in the
 * background and re-polls while anything is live, so a mission advancing
 * server-side shows up here without a refresh.
 */

/** How often home refreshes while work is genuinely moving. */
const LIVE_POLL_MS = 8_000;

function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? "good morning" : h < 18 ? "good afternoon" : "good evening";
  return name.trim() ? `${part}, ${name.trim()}` : part;
}

export function OperatorHome({ initial }: { initial?: HomeModel }) {
  const [home, setHome] = useState<HomeModel | null>(initial ?? null);
  const [displayName] = useDisplayName();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/home", { cache: "no-store" });
      if (!res.ok) return;
      setHome((await res.json()) as HomeModel);
    } catch {
      // Home keeps whatever it last had rather than blanking. A failed
      // revalidate is not new information about the workspace.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll only while something is actually in flight — a workspace at rest
  // has no reason to talk to the server every eight seconds. Polling also
  // pauses with the tab, so a backgrounded workspace costs nothing.
  const live = home?.status.state === "working" || (home?.missions.length ?? 0) > 0;
  useEffect(() => {
    if (!live) return;
    const tick = () => document.visibilityState === "visible" && load();
    const id = setInterval(tick, LIVE_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [live, load]);

  const loading = home === null;
  const missions = home?.missions ?? [];
  const apps = home?.apps ?? [];
  const feed = home?.feed ?? [];
  const approvals = home?.approvalsCount ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:pt-12">
      {/* ------------------------------- the ask ------------------------------- */}
      {/* The page opens on the thing it is for. Everything under it is a
          consequence of what gets typed here, so it comes after. */}
      <header className="flex flex-col items-center gap-4 text-center">
        {home && <OperatorStatusBar status={home.status} />}

        {/* The briefing replaces the positioning line the moment there is
            anything to report. A tagline is what you show someone who has
            never seen the product; someone opening it for the fortieth time
            wants to know what happened overnight. With nothing to report it
            falls back to the tagline itself — see Briefing. */}
        <Briefing
          greeting={greeting(displayName)}
          headline={home?.briefing.headline ?? ""}
          lines={home?.briefing.lines ?? []}
        />
      </header>

      <div className="mt-6">
        {/* Home shows the starting points as cards below, so the composer's
            own example chips would be the same four prompts twice. */}
        <SourceComposer onStarted={load} showExamples={false} />
      </div>

      {/* Suggestions are for a workspace with room for them. Once real work is
          on the page, a row of ideas is noise competing with it. */}
      {home && missions.length === 0 && approvals === 0 && (
        <section className="mt-8">
          <SectionHeader title="start here" />
          <div className="mt-3">
            <SuggestionCards suggestions={home.suggestions} />
          </div>
        </section>
      )}

      {/* ------------------------------- today ------------------------------- */}
      <section className="mt-10">
        <SectionHeader
          title="today"
          href="/app/activity"
          hrefLabel="full history"
          tone={home?.status.state === "working" ? "live" : undefined}
        />
        <div className="mt-3">
          {loading ? <SkeletonTiles tiles={8} /> : <TodayOverview tiles={home.tiles} />}
        </div>
      </section>

      {/* --------------------------- work in flight --------------------------- */}
      {missions.length > 0 && (
        <section className="mt-10">
          <SectionHeader
            title="in flight"
            tone="live"
            count={missions.length}
            href="/app/missions"
          />
          <div className="mt-3 flex flex-col gap-3">
            {missions.map((m, i) => (
              <LiveMissionCard key={m.id} mission={m} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* ------------------------- waiting on your call ------------------------ */}
      {approvals > 0 && (
        <section className="mt-10">
          <SectionHeader
            title="waiting on you"
            tone="attention"
            count={approvals}
            href="/app/approvals"
          />
          <div className="mt-3">
            <DecisionInbox compact emptyFallback={null} />
          </div>
        </section>
      )}

      {/* ---------------------------- the two columns --------------------------- */}
      <div className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_1fr]">
        <section>
          <SectionHeader title="operator feed" href="/app/activity" />
          <div className="mt-3">
            {feed.length > 0 ? (
              <OperatorFeed lines={feed} />
            ) : (
              !loading && (
                <EmptyState
                  compact
                  kind="activity"
                  title="nothing has happened yet."
                  body="give cosigno a job and every step it takes shows up here — including the ones it stopped to ask you about."
                  actions={[{ label: "review my email", compose: "review my unread email" }]}
                />
              )
            )}
          </div>
        </section>

        <section>
          <SectionHeader
            title="connected apps"
            count={apps.length}
            href="/app/connections"
            hrefLabel="manage"
          />
          <div className="mt-3">
            {apps.length > 0 ? (
              <ConnectedApps apps={apps} />
            ) : (
              !loading && (
                <EmptyState
                  compact
                  kind="integrations"
                  title="no apps connected yet."
                  body="cosigno can only work where you let it. connect one app and it can start doing real work in it today."
                  actions={[{ label: "connect an app", href: "/app/connections" }]}
                />
              )
            )}
          </div>
        </section>
      </div>

      {/* The quiet value line. Rendered only when it's non-zero — a zero here
          reinforces nothing. */}
      {home && home.opsThisCycle > 0 && (
        <p className="mt-12 text-center text-[11px] font-bold lowercase tracking-wide text-ink-soft">
          {home.opsThisCycle.toLocaleString()} operation
          {home.opsThisCycle === 1 ? "" : "s"} completed this cycle
        </p>
      )}
    </div>
  );
}
