"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, Loader2, Repeat, ShieldQuestion, X } from "lucide-react";
import type { ActionRecord, AutomationRecord, MissionRecord, MissionStepRecord } from "@/lib/types";
import { ConnectorLogo } from "@/components/integrations/ConnectorLogo";
import { SourceComposer } from "@/components/app/SourceComposer";
import { StarterJobs } from "@/components/app/StarterJobs";
import { DecisionInbox } from "@/components/app/DecisionInbox";
import { todayDigest } from "@/lib/missions/today";
import { AdaptiveDashboard } from "@/components/app/AdaptiveDashboard";

/**
 * The home dashboard — one calm place that answers four questions:
 *   1. what can I ask cosigno to do?   (the ask box + examples)
 *   2. what is cosigno working on?     (in progress)
 *   3. what needs my approval?         (needs your approval)
 *   4. what has cosigno finished?      (recently completed)
 * Everything is read from real data (missions, approvals, automations,
 * connections). No charts, no fake progress, no technical words.
 */

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

/** The connected apps a mission touches, derived from its step tools. */
const TOOL_PROVIDER: Record<string, string> = {
  "calendar.find_event": "google-calendar",
  "gmail.search_related": "google",
  "drive.search_files": "google-drive",
};

function timeUntil(iso: string): string {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (mins <= 0) return "due now";
  if (mins < 60) return `in ${mins} minute${mins === 1 ? "" : "s"}`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs} hour${hrs === 1 ? "" : "s"}`;
  const days = Math.round(hrs / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

interface ConnectionView {
  provider_key: string;
  display_name: string;
  kind: "app" | "mcp" | "custom";
  status: string;
}

/* ------------------------------------------------------------------ */

const CARD = "rounded-card border border-line/70 bg-surface p-5 shadow-soft";
const SECTION_TITLE = "text-xs font-extrabold uppercase tracking-widest text-ink-soft";

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
  const [automation, setAutomation] = useState<AutomationRecord | null>(null);
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [unhealthy, setUnhealthy] = useState<ConnectionView[]>([]);
  const [pausing, setPausing] = useState<string | null>(null);

  async function pauseMission(id: string) {
    setPausing(id);
    try {
      await jsonFetch(`/api/missions/${id}/control`, { method: "POST", body: JSON.stringify({ op: "pause" }) });
      await load();
    } catch {
      /* the row keeps its live state; the mission page has full controls */
    } finally {
      setPausing(null);
    }
  }

  const loadSide = useCallback(async () => {
    // The right-column extras (next automation, connected apps).
    const [au, c] = await Promise.all([
      jsonFetch("/api/automations").catch(() => ({ automations: [] })),
      jsonFetch("/api/connections").catch(() => ({ connections: [] })),
    ]);
    const enabled: AutomationRecord[] = (au.automations ?? []).filter((x: AutomationRecord) => x.enabled);
    enabled.sort((x, y) => new Date(x.next_run_at).getTime() - new Date(y.next_run_at).getTime());
    setAutomation(enabled[0] ?? null);
    const appConns = (c.connections ?? []).filter((x: ConnectionView) => x.kind === "app");
    setConnections(appConns.filter((x: ConnectionView) => x.status === "connected"));
    setUnhealthy(appConns.filter((x: ConnectionView) => x.status !== "connected"));
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

  const active = (missions ?? []).filter((m) => ACTIVE_STATES.has(m.state)).slice(0, 4);
  const completed = (missions ?? []).filter((m) => m.state === "completed" || m.state === "partial").slice(0, 3);

  const digest = todayDigest(missions ?? [], steps);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      {/* ---------------------------- today ---------------------------- */}
      {/* The first thing on the page, and deliberately the shortest: someone
          coming back after lunch should understand the day before they read
          anything else. Ordered by what costs them something to miss —
          decisions first, then work in flight, then what got finished. */}
      {!digest.empty && (
        <section className="mb-5">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-ink-soft">Today</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {digest.lines.map((l) => (
              <li key={`${l.missionId}-${l.kind}-${l.text}`}>
                <Link
                  href={`/app/missions/${l.missionId}`}
                  className="group flex items-start gap-2.5 rounded-btn px-1 py-0.5 transition-colors hover:bg-cream-deep/50"
                >
                  <span className="mt-0.5 shrink-0" aria-hidden="true">
                    {l.kind === "done" ? (
                      <Check size={14} className="text-signal" />
                    ) : l.kind === "doing" ? (
                      <Loader2 size={14} className="animate-spin text-ink" />
                    ) : l.kind === "failed" ? (
                      <X size={14} className="text-ink" />
                    ) : (
                      <ShieldQuestion size={14} className="text-signal" />
                    )}
                  </span>
                  <span
                    className={`text-sm leading-snug ${
                      l.kind === "waiting" ? "font-extrabold" : "font-semibold"
                    } group-hover:underline underline-offset-2`}
                  >
                    {l.text}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- this company's own dashboard, built from what it connected ---- */}
      <AdaptiveDashboard />

      {/* ---------- the command composer: the biggest, clearest thing ---------- */}
      <section className={`${CARD} p-6 sm:p-8`}>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">What should Cosigno handle?</h1>
        <p className="mt-1.5 text-sm font-semibold text-ink-soft">
          Tell cosigno what you want done. Add a file or link when it helps explain the task.
        </p>
        <SourceComposer
          onStarted={load}
          suggestions={
            connections.some((c) => c.provider_key.startsWith("google"))
              ? ["prepare tomorrow's meeting", "review my unread emails", "follow up on unanswered threads", "research the best option"]
              : undefined
          }
        />
        <StarterJobs />
      </section>

      {/* quiet connection-health warning — only when an app needs attention */}
      {unhealthy.length > 0 && (
        <p className="mt-4 rounded-btn bg-cream-deep px-3.5 py-2 text-xs font-semibold text-ink-soft">
          {unhealthy.map((c) => c.display_name).join(", ")}{" "}
          {unhealthy.length === 1 ? "needs" : "need"} attention —{" "}
          <Link href="/app/connections" className="font-bold underline underline-offset-2">
            check connections
          </Link>
          .
        </p>
      )}

      {/* Everything below is something Today doesn't already say. "In progress"
          and "Recently completed" repeated it in longer form, and "Connected
          apps" repeated the panels above — three sections that made the page
          heavier without making it clearer. */}
      <div className="mt-8 flex flex-col gap-8">
        <div className="flex flex-col gap-8">
          <section>
            <h2 className={SECTION_TITLE}>Needs your approval</h2>
            {/* The real approval card, inline. Sending people to another page
                to approve made the decision feel far away from the work that
                raised it — and the trip was the only thing standing between an
                operator and the action they had already decided to take. */}
            <div className="mt-3">
              <DecisionInbox
                initial={approvals}
                compact
                emptyFallback={
                  <div className={CARD}>
                    <p className="text-sm font-extrabold">Nothing needs your approval</p>
                    <p className="mt-1 text-sm text-ink-soft">
                      cosigno will ask before anything important happens.
                    </p>
                  </div>
                }
              />
            </div>
          </section>

          <section>
            <h2 className={SECTION_TITLE}>Coming up</h2>
            <div className={`${CARD} mt-3`}>
              {automation ? (
                <div className="flex items-center gap-3">
                  <Repeat size={18} className="shrink-0 text-ink-soft" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{automation.name}</p>
                    <p className="text-xs text-ink-soft">Runs {timeUntil(automation.next_run_at)}</p>
                  </div>
                  <Link href="/app/automations" className="shrink-0 text-xs font-bold text-ink-soft hover:text-ink">
                    Manage
                  </Link>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-ink-soft">
                  <CalendarClock size={18} className="shrink-0" />
                  <p className="text-sm">Nothing scheduled yet.</p>
                </div>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
