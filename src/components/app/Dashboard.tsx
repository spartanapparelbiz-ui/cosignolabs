"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, ChevronRight, Repeat } from "lucide-react";
import type { ActionRecord, AutomationRecord, MissionRecord, MissionStepRecord } from "@/lib/types";
import { ConnectorLogo } from "@/components/integrations/ConnectorLogo";
import { SourceComposer } from "@/components/app/SourceComposer";
import { StarterJobs } from "@/components/app/StarterJobs";

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
const STATUS_LABEL: Record<MissionRecord["state"], string> = {
  queued: "Planning",
  running: "Working",
  awaiting_input: "Waiting for you",
  awaiting_approval: "Waiting for you",
  retrying: "Working",
  verifying: "Verifying",
  paused: "Paused",
  completed: "Completed",
  partial: "Needs attention",
  failed: "Needs attention",
  stopped: "Paused",
  blocked: "Needs attention",
};

const STATUS_TONE: Record<string, string> = {
  Planning: "bg-cream-deep text-ink-soft",
  Working: "bg-ink text-cream",
  "Waiting for you": "bg-signal text-ink",
  Verifying: "bg-ink text-cream",
  Paused: "bg-cream-deep text-ink-soft",
  Completed: "bg-signal/20 text-ink",
  "Needs attention": "ring-1 ring-inset ring-ink/40 text-ink",
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

/** What cosigno is doing now, from the real step list (no invented progress). */
function nowDoing(steps: MissionStepRecord[]): string | null {
  const running = steps.find((s) => s.state === "running" || s.state === "verifying" || s.state === "retrying");
  if (running) return running.purpose;
  const waiting = steps.find((s) => s.state === "awaiting_approval" || s.state === "awaiting_input");
  if (waiting) return waiting.purpose;
  return null;
}

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

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
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
                  const done = ms.filter((s) => s.state === "completed" || s.state === "skipped").length;
                  const doing = nowDoing(ms);
                  const label = STATUS_LABEL[m.state];
                  const apps = providerKeysFor(ms);
                  return (
                    <div key={m.id} className={CARD}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-base font-extrabold">{m.goal}</p>
                        <span className={`shrink-0 rounded-pill px-2.5 py-0.5 text-[11px] font-bold ${STATUS_TONE[label]}`}>
                          {label}
                        </span>
                      </div>
                      {doing && <p className="mt-1.5 text-sm text-ink-soft">{doing}</p>}
                      {ms.length > 0 && (
                        <p className="mt-2 text-sm font-bold text-ink">
                          {done} of {ms.length} steps complete
                          <span className="font-semibold text-ink-soft"> · running {timeAgo(m.created_at).replace(" ago", "")}</span>
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

        {/* RIGHT: approvals + coming up + connected apps */}
        <div className="flex flex-col gap-8">
          <section>
            <h2 className={SECTION_TITLE}>Needs your approval</h2>
            <div className="mt-3 flex flex-col gap-3">
              {approvals.length === 0 ? (
                <div className={CARD}>
                  <p className="text-sm font-extrabold">Nothing needs your approval</p>
                  <p className="mt-1 text-sm text-ink-soft">
                    cosigno will ask before anything important happens.
                  </p>
                </div>
              ) : (
                approvals.slice(0, 4).map((a) => {
                  const to = typeof a.payload?.to === "string" ? a.payload.to : typeof a.payload?.recipient === "string" ? a.payload.recipient : null;
                  const provider = typeof a.payload?.provider === "string" ? a.payload.provider : null;
                  return (
                    <div key={a.id} className={`${CARD} border-signal/40`}>
                      <div className="flex items-start gap-3">
                        {provider ? (
                          <ConnectorLogo kind="app" providerKey={provider} displayName={PROVIDER_NAME[provider] ?? provider} size={26} />
                        ) : (
                          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-btn bg-signal/15 text-[13px] font-black text-signal">
                            !
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-extrabold leading-snug">{a.summary}</p>
                          {to && <p className="mt-0.5 text-xs text-ink-soft">Prepared for {to}</p>}
                        </div>
                      </div>
                      <Link
                        href="/app/approvals"
                        className="mt-3 inline-flex w-full items-center justify-center rounded-btn bg-signal px-4 py-2 text-sm font-extrabold text-ink shadow-soft transition-transform active:scale-95"
                      >
                        Review
                      </Link>
                    </div>
                  );
                })
              )}
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
