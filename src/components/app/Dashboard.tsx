"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, CalendarClock, Check, ChevronRight, Eye, PenLine, Repeat, TrendingDown, TrendingUp } from "lucide-react";
import type { ActionRecord, AutomationRecord, MissionRecord, MissionStepRecord } from "@/lib/types";
import type { AutopilotOverview } from "@/lib/autopilot/types";
import { signRequired } from "@/lib/sign";
import { ConnectorLogo } from "@/components/integrations/ConnectorLogo";
import { SourceComposer } from "@/components/app/SourceComposer";

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

export function Dashboard() {
  const [missions, setMissions] = useState<MissionRecord[] | null>(null);
  const [steps, setSteps] = useState<Record<string, MissionStepRecord[]>>({});
  const [approvals, setApprovals] = useState<ActionRecord[]>([]);
  const [automations, setAutomations] = useState<AutomationRecord[]>([]);
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [autopilot, setAutopilot] = useState<AutopilotOverview | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, a, au, c] = await Promise.all([
        jsonFetch("/api/missions").catch(() => ({ missions: [] })),
        jsonFetch("/api/actions?status=proposed&limit=20").catch(() => ({ actions: [] })),
        jsonFetch("/api/automations").catch(() => ({ automations: [] })),
        jsonFetch("/api/connections").catch(() => ({ connections: [] })),
      ]);
      const ms: MissionRecord[] = m.missions ?? [];
      setMissions(ms);
      setApprovals((a.actions ?? []).filter((x: ActionRecord) => x.status === "proposed"));
      const enabled: AutomationRecord[] = (au.automations ?? []).filter((x: AutomationRecord) => x.enabled);
      enabled.sort((x, y) => new Date(x.next_run_at).getTime() - new Date(y.next_run_at).getTime());
      setAutomations(enabled);
      setConnections((c.connections ?? []).filter((x: ConnectionView) => x.kind === "app" && x.status === "connected"));

      // Fetch steps for the active missions we'll show (up to 4).
      const active = ms.filter((x) => ACTIVE_STATES.has(x.state)).slice(0, 4);
      const stepMap: Record<string, MissionStepRecord[]> = {};
      await Promise.all(
        active.map(async (mi) => {
          try {
            const d = await jsonFetch(`/api/missions/${mi.id}`);
            stepMap[mi.id] = d.steps ?? [];
          } catch {
            stepMap[mi.id] = [];
          }
        })
      );
      setSteps(stepMap);
    } catch {
      setMissions([]);
    }
    // The Autopilot digest is enrichment — the dashboard renders without it.
    jsonFetch("/api/autopilot")
      .then((d) => setAutopilot(d.overview ?? null))
      .catch(() => setAutopilot(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = (missions ?? []).filter((m) => ACTIVE_STATES.has(m.state)).slice(0, 4);
  const completed = (missions ?? []).filter((m) => m.state === "completed" || m.state === "partial").slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      {/* ---------- delegation: the biggest, clearest thing ---------- */}
      <section className={`${CARD} p-6 sm:p-8`}>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">What should cosigno handle?</h1>
        <p className="mt-1.5 text-sm font-semibold text-ink-soft">
          Describe the result you want — a task, a whole mission, or something to watch. cosigno
          figures out the rest and asks before anything important happens.
        </p>
        <SourceComposer onStarted={load} />
      </section>

      {/* ---------- two columns on desktop, stacked on mobile ---------- */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]">
        {/* LEFT: working + completed */}
        <div className="flex flex-col gap-8">
          <section>
            <div className="flex items-center justify-between">
              <h2 className={SECTION_TITLE}>Working</h2>
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
                  <p className="text-sm font-extrabold">Nothing is being worked on</p>
                  <p className="mt-1 text-sm text-ink-soft">Tell cosigno what to handle.</p>
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
                          Step {Math.min(done + 1, ms.length)} of {ms.length}
                          {done > 0 && <span className="font-semibold text-ink-soft"> · {done} done</span>}
                        </p>
                      )}
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                          {apps.map((k) => (
                            <ConnectorLogo key={k} kind="app" providerKey={k} displayName={PROVIDER_NAME[k] ?? k} size={22} />
                          ))}
                        </div>
                        <Link
                          href="/app/missions"
                          className="inline-flex items-center gap-1 rounded-btn px-3.5 py-1.5 text-sm font-bold ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep"
                        >
                          Open Mission <ChevronRight size={14} />
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section>
            <h2 className={SECTION_TITLE}>Completed</h2>
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
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-signal/15">
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

        {/* RIGHT: autopilot digest + approvals + coming up + connected apps */}
        <div className="flex flex-col gap-8">
          {autopilot && (
            <section>
              <div className="flex items-center justify-between">
                <h2 className={SECTION_TITLE}>What changed</h2>
                {autopilot.data_source === "sample" && (
                  <span className="rounded-pill bg-cream-deep px-2 py-0.5 text-[10px] font-bold text-ink-soft">
                    Sample data
                  </span>
                )}
              </div>
              <div className={`${CARD} mt-3`}>
                <ul className="flex flex-col gap-2">
                  {autopilot.changes.slice(0, 3).map((c) => (
                    <li key={c.key} className="flex items-start gap-2">
                      {c.tone === "positive" ? (
                        <TrendingUp size={14} className="mt-0.5 shrink-0 text-ink" />
                      ) : c.tone === "negative" ? (
                        <TrendingDown size={14} className="mt-0.5 shrink-0 text-signal" />
                      ) : (
                        <Activity size={14} className="mt-0.5 shrink-0 text-ink-soft" />
                      )}
                      <span className="text-sm font-semibold leading-snug">{c.text}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between gap-3">
                  {autopilot.attention.length > 0 ? (
                    <p className="text-xs font-bold text-ink-soft">
                      {autopilot.attention.length} item{autopilot.attention.length === 1 ? "" : "s"} need
                      {autopilot.attention.length === 1 ? "s" : ""} your attention
                    </p>
                  ) : (
                    <p className="text-xs font-bold text-ink-soft">Nothing needs your attention</p>
                  )}
                  <Link
                    href="/app/autopilot"
                    className="inline-flex shrink-0 items-center gap-1 rounded-btn px-3 py-1.5 text-sm font-bold ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep"
                  >
                    Open Autopilot <ChevronRight size={14} />
                  </Link>
                </div>
              </div>
            </section>
          )}
          <section>
            <h2 className={SECTION_TITLE}>Needs you</h2>
            <div className="mt-3 flex flex-col gap-3">
              {approvals.length === 0 ? (
                <div className={CARD}>
                  <p className="text-sm font-extrabold">Nothing needs you right now</p>
                  <p className="mt-1 text-sm text-ink-soft">
                    cosigno will ask before anything important happens.
                  </p>
                </div>
              ) : (
                approvals.slice(0, 4).map((a) => {
                  const to = typeof a.payload?.to === "string" ? a.payload.to : typeof a.payload?.recipient === "string" ? a.payload.recipient : null;
                  const provider = typeof a.payload?.provider === "string" ? a.payload.provider : null;
                  const sign = signRequired(a.category, a.tier);
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
                          <p className="mt-0.5 text-xs text-ink-soft">
                            {to ? `Prepared for ${to}.` : "Prepared and ready."}
                          </p>
                        </div>
                      </div>
                      <Link
                        href="/app/decisions"
                        className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-btn px-4 py-2 text-sm font-extrabold shadow-soft transition-transform active:scale-95 ${
                          sign ? "bg-ink text-cream" : "bg-signal text-ink"
                        }`}
                      >
                        {sign && <PenLine size={13} strokeWidth={2.6} aria-hidden="true" />}
                        {sign ? "Sign →" : "Approve →"}
                      </Link>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between">
              <h2 className={SECTION_TITLE}>Watching</h2>
              {automations.length > 0 && (
                <Link href="/app/watch" className="text-xs font-bold text-ink-soft hover:text-ink">
                  manage
                </Link>
              )}
            </div>
            <div className={`${CARD} mt-3`}>
              {automations.length === 0 ? (
                <div className="flex items-center gap-3 text-ink-soft">
                  <CalendarClock size={18} className="shrink-0" />
                  <p className="text-sm">
                    Nothing being watched yet.{" "}
                    <Link href="/app/watch" className="font-bold underline underline-offset-2 hover:text-ink">
                      Set up a watch
                    </Link>
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {automations.slice(0, 4).map((a) => (
                    <li key={a.id} className="flex items-center gap-3">
                      {a.mode === "monitor" ? (
                        <Eye size={16} className="shrink-0 text-ink-soft" />
                      ) : (
                        <Repeat size={16} className="shrink-0 text-ink-soft" />
                      )}
                      <p className="min-w-0 flex-1 truncate text-sm font-bold">{a.name}</p>
                      <span className="shrink-0 text-xs font-bold text-ink-soft">
                        {a.mode === "monitor" ? "Active" : `Runs ${timeUntil(a.next_run_at)}`}
                      </span>
                    </li>
                  ))}
                </ul>
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
                    Let cosigno work with your email, calendar, and files — then{" "}
                    <Link href="/app/skills" className="font-bold underline underline-offset-2 hover:text-ink">
                      install a skill
                    </Link>{" "}
                    to put it to work immediately.
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
