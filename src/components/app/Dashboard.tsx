"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useDisplayName } from "@/lib/theme";
import { ArrowRight, Check, Loader2, PenLine, X } from "lucide-react";
import type { ActionRecord, MissionRecord, MissionStepRecord } from "@/lib/types";
import { SourceComposer } from "@/components/app/SourceComposer";
import { DecisionInbox } from "@/components/app/DecisionInbox";
import { todayDigest } from "@/lib/missions/today";
import { Page, SectionLabel } from "@/components/ui/Page";
import { dot } from "@/components/ui/styles";

/**
 * Home answers one question: what needs me today?
 *
 * So the page is one column. The ask box, because everything else on it is a
 * consequence of what gets typed there — then, only if they exist, the three
 * states work can be in: moving, waiting on you, finished. Sections that would
 * be empty are not rendered. A panel that says "nothing here" is furniture
 * pretending to be information.
 *
 * Everything is read from real missions and real approvals. No charts, no
 * invented progress, no counters that exist to fill a card.
 */

/**
 * Time-of-day greeting. Uses the browser's clock, which is the user's own —
 * a server-side hour would greet someone in Sydney with "good evening" at
 * breakfast.
 */
function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name.trim() ? `${part}, ${name.trim()}` : part;
}

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || "something went wrong.");
  return body;
}

/* --------- plain-language status (never technical words) --------- */
const ACTIVE_STATES = new Set([
  "queued",
  "running",
  "awaiting_input",
  "awaiting_approval",
  "retrying",
  "verifying",
  "paused",
  "blocked",
]);

interface ConnectionView {
  provider_key: string;
  display_name: string;
  kind: "app" | "mcp" | "custom";
  status: string;
}

/* ------------------------------------------------------------------ */


/** Data the server page prefetches so the first paint already has content. */
export interface DashboardInitial {
  missions: MissionRecord[];
  steps: Record<string, MissionStepRecord[]>;
  approvals: ActionRecord[];
}

export function Dashboard({ initial }: { initial?: DashboardInitial }) {
  const [missions, setMissions] = useState<MissionRecord[] | null>(initial?.missions ?? null);
  const [steps, setSteps] = useState<Record<string, MissionStepRecord[]>>(initial?.steps ?? {});
  const [approvals, setApprovals] = useState<ActionRecord[]>(initial?.approvals ?? []);
  const [displayName] = useDisplayName();
  const [connections, setConnections] = useState<ConnectionView[]>([]);

  const loadSide = useCallback(async () => {
    // Which apps are actually connected — it decides whether the starting
    // points on this page are things cosigno can really do right now.
    const c = await jsonFetch("/api/connections").catch(() => ({ connections: [] }));
    const appConns = (c.connections ?? []).filter((x: ConnectionView) => x.kind === "app");
    setConnections(appConns.filter((x: ConnectionView) => x.status === "connected"));
  }, []);

  const load = useCallback(async () => {
    try {
      // One wave: the missions call piggybacks active-mission steps
      // (include=steps), so there's no second round of per-mission fetches.
      const [m, a] = await Promise.all([
        jsonFetch("/api/missions?include=steps").catch(() => ({ missions: [], steps: {} })),
        jsonFetch("/api/actions?status=proposed&limit=20").catch(() => ({ actions: [] })),
        loadSide(),
      ]);
      const ms: MissionRecord[] = m.missions ?? [];
      setMissions(ms);
      setSteps((m.steps ?? {}) as Record<string, MissionStepRecord[]>);
      setApprovals((a.actions ?? []).filter((x: ActionRecord) => x.status === "proposed"));
    } catch {
      setMissions([]);
    }
  }, [loadSide]);

  useEffect(() => {
    // SWR: when the server prefetched missions/steps/approvals, they're
    // already on screen — this load() is a background revalidate (also
    // covers a router-cache restore). Without prefetch it's the first load.
    load();
  }, [load]);

  const digest = todayDigest(missions ?? [], steps);
  const working = digest.lines.filter((l) => l.kind === "doing");
  const waiting = digest.lines.filter((l) => l.kind === "waiting");
  const finished = digest.lines.filter((l) => l.kind === "done" || l.kind === "failed");
  const quiet = working.length === 0 && waiting.length === 0 && approvals.length === 0;

  return (
    <Page>
      <header>
        <p className="t-caption">{greeting(displayName)}</p>
        <h1 className="t-display mt-1.5">What should cosigno handle?</h1>
      </header>

      <SourceComposer
        onStarted={load}
        showSuggestions={quiet}
        suggestions={
          connections.some((c) => c.provider_key.startsWith("google"))
            ? [
                "Prepare tomorrow's meeting",
                "Review my unread email",
                "Follow up on unanswered threads",
                "Research the best option",
              ]
            : undefined
        }
      />

      {/* --------------------------- working now --------------------------- */}
      {working.length > 0 && (
        <Band label="Working now" live>
          {working.map((l) => (
            <Row
              key={l.missionId}
              href={`/app/missions/${l.missionId}`}
              icon={<Loader2 size={14} strokeWidth={2} className="animate-spin text-ink-soft" />}
            >
              {l.text}
            </Row>
          ))}
        </Band>
      )}

      {/* ------------------------- needs your approval ------------------------- */}
      {/* Only ever rendered when something is genuinely waiting. An empty
          "nothing is waiting" panel is a row of furniture that says nothing. */}
      {approvals.length > 0 && (
        <Band label="Needs you">
          <DecisionInbox initial={approvals} compact emptyFallback={null} />
        </Band>
      )}
      {approvals.length === 0 && waiting.length > 0 && (
        <Band label="Needs you">
          {waiting.map((l) => (
            <Row
              key={l.missionId}
              href={`/app/missions/${l.missionId}`}
              icon={<PenLine size={14} strokeWidth={2} className="text-signal" />}
            >
              {l.text}
            </Row>
          ))}
        </Band>
      )}

      {/* --------------------------- completed today --------------------------- */}
      {finished.length > 0 && (
        <Band label="Done today">
          {finished.map((l) => (
            <Row
              key={l.missionId}
              href={`/app/missions/${l.missionId}`}
              icon={
                l.kind === "failed" ? (
                  <X size={14} strokeWidth={2} className="text-ink-soft" />
                ) : (
                  <Check size={14} strokeWidth={2} className="text-positive" />
                )
              }
            >
              {l.text}
            </Row>
          ))}
        </Band>
      )}
    </Page>
  );
}

/** A titled band of rows. The only section shape on this page. */
function Band({
  label,
  live,
  children,
}: {
  label: string;
  live?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-14 animate-fade-through">
      <SectionLabel className="mb-3">
        <span className="inline-flex items-center gap-2">
          {live && <span className={`${dot("signal")} animate-orb-pulse`} aria-hidden="true" />}
          {label}
        </span>
      </SectionLabel>
      <div className="-mx-3 flex flex-col">{children}</div>
    </section>
  );
}

/** One line of work. Compact, clickable, nothing you cannot act on. */
function Row({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-btn px-3 py-2.5 transition-colors duration-fast hover:bg-ink/[0.035]"
    >
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="t-body min-w-0 flex-1">{children}</span>
      <ArrowRight
        size={14}
        strokeWidth={2}
        className="mt-0.5 shrink-0 -translate-x-1 text-ink-soft opacity-0 transition-all duration-base ease-brand-out group-hover:translate-x-0 group-hover:opacity-100"
        aria-hidden="true"
      />
    </Link>
  );
}
