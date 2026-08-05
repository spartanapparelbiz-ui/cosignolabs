"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, ChevronRight, Repeat } from "lucide-react";
import type { ActionRecord, AutomationRecord, MissionRecord, MissionStepRecord } from "@/lib/types";
import { ConnectorLogo } from "@/components/integrations/ConnectorLogo";
import { SourceComposer } from "@/components/app/SourceComposer";
import { StarterJobs } from "@/components/app/StarterJobs";
import { actionRisk, requiredApproval, type RiskLevel } from "@/lib/risk";
import { statusLabel, statusOfMission } from "@/lib/status";
import { LiveFlow } from "@/components/app/LiveFlow";
import { WorkspaceDesks } from "@/components/app/WorkspaceDesks";
import type { Desk } from "@/lib/workspaceDesks";

/**
 * The dashboard answers ONE question: what needs my attention?
 *
 * So the page opens with exactly that — the actions waiting on a human, each
 * with its risk in one word — and everything else (give cosigno a task, what's
 * in progress, what finished, what's scheduled, which apps are connected) sits
 * below it as context. Approvals appear once, at the top; the same list twice
 * on one screen is how a calm page becomes a busy one.
 *
 * Everything is read from real data (missions, approvals, automations,
 * connections). No charts, no fake progress, no technical words.
 */

/** Risk, in the same four words the approval card and the ledger use. */
const DASH_RISK_STYLE: Record<RiskLevel, string> = {
  low: "bg-cream-deep text-ink-soft",
  medium: "bg-ink/5 text-ink ring-1 ring-inset ring-ink/20",
  high: "bg-signal/20 text-ink ring-1 ring-inset ring-signal/50",
  critical: "bg-ink text-cream",
};

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || "something went wrong.");
  return body;
}

/**
 * Mission state is shown in the SAME five words as everything else — the
 * mapping lives in lib/status so "working" can't mean one thing here and
 * something else on a card.
 */
const STATUS_TONE: Record<string, string> = {
  working: "bg-ink text-cream",
  waiting: "bg-cream-deep text-ink-soft",
  needs_approval: "bg-signal text-ink",
  failed: "ring-1 ring-inset ring-ink/40 text-ink",
  finished: "bg-signal/20 text-ink",
};

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

function providerKeysFor(steps: MissionStepRecord[]): string[] {
  const keys = new Set<string>();
  for (const s of steps) {
    const p = TOOL_PROVIDER[s.tool];
    if (p) keys.add(p);
  }
  return [...keys];
}

const PROVIDER_NAME: Record<string, string> = {
  google: "Gmail",
  "google-calendar": "Google Calendar",
  "google-drive": "Google Drive",
  github: "GitHub",
  outlook: "Outlook",
  slack: "Slack",
  notion: "Notion",
};

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

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
  const [desks, setDesks] = useState<{ desks: Desk[]; summary: string } | null>(null);

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
    // The glass wall — refreshed on the same beat as everything else.
    jsonFetch("/api/workspace/desks")
      .then((d) => setDesks({ desks: d.desks ?? [], summary: d.summary ?? "" }))
      .catch(() => setDesks(null));

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

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      {/* ---------- the one question this page answers: what needs me? ------- */}
      <section className={`${CARD} p-6 sm:p-8`}>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          {approvals.length === 0
            ? "Nothing needs you right now"
            : approvals.length === 1
              ? "1 action is waiting for you"
              : `${approvals.length} actions are waiting for you`}
        </h1>
        <p className="mt-1.5 text-sm font-semibold text-ink-soft">
          {approvals.length === 0
            ? "cosigno asks before anything consequential happens. everything it has already done is on your activity log."
            : "AI has asked to do these. nothing runs until you decide."}
        </p>

        {approvals.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {approvals.slice(0, 4).map((a) => {
              const level = actionRisk(a).level;
              return (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-btn border border-line bg-cream/40 px-3.5 py-2.5"
                >
                  <span
                    className={`rounded-pill px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${DASH_RISK_STYLE[level]}`}
                  >
                    {level}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{a.summary}</span>
                  <span className="text-xs text-ink-soft">{requiredApproval(a)}</span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href="/app/approvals"
            className={`inline-flex items-center justify-center rounded-btn px-5 py-2.5 text-sm font-extrabold transition-transform active:scale-95 ${
              approvals.length > 0 ? "bg-signal text-ink shadow-soft" : "text-ink-soft ring-1 ring-inset ring-line hover:text-ink"
            }`}
          >
            {approvals.length > 0 ? "Review approvals" : "Open approvals"}
          </Link>
          <Link
            href="/app/activity"
            className="inline-flex items-center justify-center rounded-btn px-4 py-2.5 text-sm font-bold text-ink-soft transition-colors hover:text-ink"
          >
            See what AI has done
          </Link>
        </div>
      </section>

      {/* ---------- the glass wall: who is working, and where ---------- */}
      {desks && desks.desks.length > 0 && (
        <section className="mt-8">
          <h2 className={SECTION_TITLE}>Your apps right now</h2>
          <div className="mt-3">
            <WorkspaceDesks desks={desks.desks} summary={desks.summary} />
          </div>
        </section>
      )}

      {/* ---------- give cosigno something to do ---------- */}
      <section className={`${CARD} mt-6 p-6 sm:p-8`}>
        <h2 className="font-display text-xl font-bold">What should Cosigno handle?</h2>
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

      {/* ---------- two columns on desktop, stacked on mobile ---------- */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]">
        {/* LEFT: in progress + recently completed */}
        <div className="flex flex-col gap-8">
          <section>
            <div className="flex items-center justify-between">
              <h2 className={SECTION_TITLE}>In progress</h2>
              {active.length > 0 && (
                <Link href="/app/missions" className="text-xs font-bold text-ink-soft hover:text-ink">
                  see all
                </Link>
              )}
            </div>
            <div className="mt-3 flex flex-col gap-3">
              {missions === null ? (
                <div className="h-24 animate-pulse rounded-card bg-cream-deep" aria-hidden="true" />
              ) : active.length === 0 ? (
                <div className={`${CARD} text-center`}>
                  <p className="text-sm font-extrabold">Nothing is in progress</p>
                  <p className="mt-1 text-sm text-ink-soft">Tell cosigno what you need handled.</p>
                </div>
              ) : (
                active.map((m) => {
                  const ms = steps[m.id] ?? [];
                  const status = statusOfMission(m.state);
                  const apps = providerKeysFor(ms);
                  return (
                    <div key={m.id} className={CARD}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-base font-extrabold">{m.goal}</p>
                        <span className={`shrink-0 rounded-pill px-2.5 py-0.5 text-[11px] font-bold ${STATUS_TONE[status]}`}>
                          {statusLabel(status)}
                        </span>
                      </div>
                      {/* Watch it move, rather than read that it moved. */}
                      <LiveFlow steps={ms} />
                      {ms.length > 0 && (
                        <p className="mt-1.5 text-xs text-ink-soft">
                          running {timeAgo(m.created_at).replace(" ago", "")}
                        </p>
                      )}
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                          {apps.map((k) => (
                            <ConnectorLogo key={k} kind="app" providerKey={k} displayName={PROVIDER_NAME[k] ?? k} size={22} />
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          {m.state !== "paused" && !["completed", "partial", "failed", "stopped"].includes(m.state) && (
                            <button
                              onClick={() => pauseMission(m.id)}
                              disabled={pausing === m.id}
                              className="rounded-btn px-3 py-1.5 text-sm font-bold text-ink-soft ring-1 ring-inset ring-ink/20 hover:bg-cream-deep hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {pausing === m.id ? "Pausing…" : "Pause"}
                            </button>
                          )}
                          <Link
                            href={`/app/missions/${m.id}`}
                            className="inline-flex items-center gap-1 rounded-btn px-3.5 py-1.5 text-sm font-bold ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep"
                          >
                            Open Mission <ChevronRight size={14} />
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section>
            <h2 className={SECTION_TITLE}>Recently completed</h2>
            <div className="mt-3 flex flex-col gap-3">
              {missions !== null && completed.length === 0 ? (
                <div className={`${CARD} text-center`}>
                  <p className="text-sm text-ink-soft">Finished missions will appear here.</p>
                </div>
              ) : (
                completed.map((m) => {
                  const receipt = m.receipt as Record<string, unknown> | null;
                  const deliverables = Array.isArray(receipt?.deliverables) ? (receipt!.deliverables as unknown[]).length : 0;
                  const stepsDone = Array.isArray(receipt?.completed_steps) ? (receipt!.completed_steps as unknown[]).length : 0;
                  const result =
                    deliverables > 0
                      ? `${deliverables} deliverable${deliverables === 1 ? "" : "s"} created${stepsDone ? ` across ${stepsDone} steps` : ""}`
                      : m.state === "partial"
                        ? "Finished — some steps didn't run"
                        : "Completed";
                  return (
                    <div key={m.id} className={`${CARD} flex items-center gap-3`}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-signal/15">
                        <Check size={16} className="text-signal" strokeWidth={3} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-extrabold">{m.goal}</p>
                        <p className="text-xs text-ink-soft">
                          {result} · {timeAgo(m.completed_at ?? m.updated_at)}
                        </p>
                      </div>
                      <Link
                        href="/app/files"
                        className="shrink-0 rounded-btn px-3 py-1.5 text-sm font-bold text-ink-soft hover:bg-cream-deep hover:text-ink"
                      >
                        View result
                      </Link>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        {/* RIGHT: coming up + connected apps. Approvals live at the top of the
            page, once — the same list in two places is how a dashboard starts
            feeling busy instead of calm. */}
        <div className="flex flex-col gap-8">
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

          <section>
            <h2 className={SECTION_TITLE}>Connected apps</h2>
            <div className={`${CARD} mt-3`}>
              {connections.length === 0 ? (
                <div className="text-center">
                  <p className="text-sm font-extrabold">Connect your apps</p>
                  <p className="mt-1 text-sm text-ink-soft">
                    Let cosigno work with your email, calendar, and files.
                  </p>
                  <Link
                    href="/app/connections"
                    className="mt-3 inline-flex rounded-btn bg-ink px-4 py-2 text-sm font-bold text-cream"
                  >
                    Connect an app
                  </Link>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    {connections.slice(0, 6).map((c) => (
                      <ConnectorLogo key={c.provider_key} kind="app" providerKey={c.provider_key} displayName={c.display_name} size={30} />
                    ))}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">
                      {connections.length} app{connections.length === 1 ? "" : "s"} connected
                    </p>
                    <Link href="/app/connections" className="text-xs font-bold text-ink-soft hover:text-ink">
                      Manage
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
