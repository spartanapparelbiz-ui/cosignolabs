"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, ChevronRight, Eye, PenLine, Repeat, X } from "lucide-react";
import type { ActionRecord, AutomationRecord, MissionRecord, MissionStepRecord } from "@/lib/types";
import type { AutonomyOffer, CosignoState } from "@/lib/state";
import { signRequired } from "@/lib/sign";
import { useDisplayName } from "@/lib/theme";
import { useToast } from "@/components/Toast";
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

/* ------------------------------------------------------------- briefing */

const BRIEFING_SEEN_KEY = "cosigno_briefing_seen";

/**
 * The briefing: what happened while you were away, in a few honest lines —
 * then straight into the decisions. Derived entirely from the state stream
 * since the last dismissal; no invented urgency.
 */
function BriefingCard({ state }: { state: CosignoState }) {
  const [displayName] = useDisplayName();
  const [dismissed, setDismissed] = useState(false);
  const [lastSeen] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(BRIEFING_SEEN_KEY);
    if (!raw) {
      // First visit: start the clock quietly; the briefing begins next time.
      localStorage.setItem(BRIEFING_SEEN_KEY, String(Date.now()));
      return null;
    }
    return Number(raw);
  });

  if (dismissed || lastSeen === null) return null;
  const away = state.stream.filter((e) => Date.parse(e.at) > lastSeen);
  const completed = away.filter((e) => e.kind === "executed").length;
  const moved = away.filter((e) => !e.needs_you && e.kind !== "executed").length;
  if (away.length === 0 && state.need_you === 0) return null;

  const hour = new Date().getHours();
  const daypart = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  function close() {
    localStorage.setItem(BRIEFING_SEEN_KEY, String(Date.now()));
    setDismissed(true);
  }

  return (
    <section className={`${CARD} mb-6 p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold">
            {daypart}
            {displayName.trim() ? `, ${displayName.trim()}` : ""}.
          </p>
          <p className="mt-1 text-sm font-semibold text-ink-soft">
            While you were away:
            {moved > 0 && ` ${moved} thing${moved === 1 ? "" : "s"} moved forward.`}
            {completed > 0 && ` ${completed} completed.`}
            {state.need_you > 0 &&
              ` ${state.need_you} decision${state.need_you === 1 ? "" : "s"} need${state.need_you === 1 ? "s" : ""} you.`}
            {moved === 0 && completed === 0 && state.need_you === 0 && " nothing meaningful changed."}
            {state.blocked === 0 && " Nothing urgent is blocked."}
          </p>
        </div>
        <button
          onClick={close}
          className="shrink-0 rounded-btn p-1 text-ink-soft hover:bg-cream-deep hover:text-ink"
          aria-label="dismiss briefing"
        >
          <X size={15} />
        </button>
      </div>
      {state.need_you > 0 && (
        <Link
          href="/app/focus"
          onClick={close}
          className="mt-3 inline-flex items-center gap-1 rounded-btn bg-ink px-4 py-2 text-sm font-extrabold text-cream"
        >
          Start briefing <ChevronRight size={14} />
        </Link>
      )}
    </section>
  );
}

/* -------------------------------------------------------- earned autonomy */

/**
 * Earned autonomy — cosigno noticed repeated one-click approvals and OFFERS
 * to take the category over. Explicit, scoped, reversible (settings →
 * permissions); declining is remembered and never re-asked for the category.
 */
function AutonomyOfferCard({ offer, onResolved }: { offer: AutonomyOffer; onResolved(): void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(`cosigno_autonomy_declined_${offer.category}`) === "1";
  });

  if (hidden) return null;

  async function accept() {
    setBusy(true);
    try {
      const res = await fetch("/api/settings/tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: offer.category, tier: 1 }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "couldn't expand that.");
      toast("success", `expanded — cosigno now handles ${offer.label} automatically. reversible in settings.`);
      setHidden(true);
      onResolved();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "couldn't expand that.");
    } finally {
      setBusy(false);
    }
  }

  function decline() {
    localStorage.setItem(`cosigno_autonomy_declined_${offer.category}`, "1");
    setHidden(true);
  }

  return (
    <div className={CARD}>
      <p className="text-sm font-extrabold">
        You&apos;ve approved {offer.label} {offer.count} times.
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        Should cosigno handle these automatically from now on? Signed and locked actions are
        never included, and you can reverse this any time in settings.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={accept}
          disabled={busy}
          className="rounded-btn bg-ink px-4 py-2 text-sm font-extrabold text-cream disabled:opacity-50"
        >
          {busy ? "Expanding…" : "Yes, expand permission"}
        </button>
        <button
          onClick={decline}
          disabled={busy}
          className="rounded-btn px-4 py-2 text-sm font-bold ring-1 ring-inset ring-ink hover:bg-cream-deep"
        >
          No, keep asking
        </button>
      </div>
    </div>
  );
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
  const [state, setState] = useState<CosignoState | null>(null);

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
    // Current State is enrichment — the dashboard renders without it.
    jsonFetch("/api/state")
      .then((d) => setState(d.state ?? null))
      .catch(() => setState(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = (missions ?? []).filter((m) => ACTIVE_STATES.has(m.state)).slice(0, 4);
  const completed = (missions ?? []).filter((m) => m.state === "completed" || m.state === "partial").slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      {/* ---------- briefing: what happened while you were away ---------- */}
      {state && <BriefingCard state={state} />}

      {/* ---------- delegation: the biggest, clearest thing ---------- */}
      <section className={`${CARD} p-6 sm:p-8`}>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">What should cosigno handle?</h1>
        <p className="mt-1.5 text-sm font-semibold text-ink-soft">
          Give cosigno responsibility for an outcome — it handles the work between your
          decisions and returns only when your authority is actually needed.
        </p>
        <SourceComposer onStarted={load} />
        {state && (
          <p className="mt-4 border-t border-line/50 pt-3 text-[11px] font-extrabold uppercase tracking-widest text-ink-soft">
            Current state
            <span className="ml-3 normal-case tracking-normal">
              <span className="font-extrabold text-ink">{state.moving} Moving</span>
              <span className="mx-1.5">·</span>
              <Link href="/app/focus" className={`font-extrabold ${state.need_you > 0 ? "text-signal" : "text-ink"} hover:underline`}>
                {state.need_you} Need You
              </Link>
              <span className="mx-1.5">·</span>
              <span className="font-extrabold text-ink">{state.watching} Watching</span>
              <span className="mx-1.5">·</span>
              <span className="font-extrabold text-ink">{state.blocked} Blocked</span>
            </span>
          </p>
        )}
      </section>

      {/* ---------- two columns on desktop, stacked on mobile ---------- */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]">
        {/* LEFT: now (what cosigno is handling) + completed */}
        <div className="flex flex-col gap-8">
          <section>
            <div className="flex items-center justify-between">
              <h2 className={SECTION_TITLE}>
                Now
                {state && state.moving + state.watching > 0 && (
                  <span className="ml-2 normal-case tracking-normal text-ink-soft">
                    · cosigno is handling {state.moving + state.watching} thing
                    {state.moving + state.watching === 1 ? "" : "s"}
                  </span>
                )}
              </h2>
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
          <section>
            <h2 className={SECTION_TITLE}>
              You&apos;re needed
              {approvals.length > 0 && (
                <span className="ml-2 normal-case tracking-normal text-ink-soft">
                  · for {approvals.length} thing{approvals.length === 1 ? "" : "s"}
                </span>
              )}
            </h2>
            <div className="mt-3 flex flex-col gap-3">
              {state && state.autonomy.length > 0 && (
                <AutonomyOfferCard offer={state.autonomy[0]} onResolved={load} />
              )}
              {approvals.length === 0 ? (
                <div className={CARD}>
                  <p className="text-sm font-extrabold">Nothing needs you right now</p>
                  <p className="mt-1 text-sm text-ink-soft">
                    cosigno will return the moment your authority is required.
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
                        href="/app/focus"
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

          {state && state.stream.length > 0 && (
            <section>
              <div className="flex items-center justify-between">
                <h2 className={SECTION_TITLE}>State stream</h2>
                <Link href="/app/autopilot" className="text-xs font-bold text-ink-soft hover:text-ink">
                  autopilot brief
                </Link>
              </div>
              <div className={`${CARD} mt-3`}>
                <ol className="flex flex-col gap-2.5">
                  {state.stream.slice(0, 5).map((e) => (
                    <li key={e.key} className="flex items-start gap-2.5">
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          e.needs_you ? "bg-signal" : e.kind === "working" ? "animate-orb-pulse bg-ink" : "bg-ink/30"
                        }`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug">{e.text}</p>
                        <p className="text-[10px] font-bold text-ink-soft">
                          {timeAgo(e.at)}
                          {e.needs_you && (
                            <Link href="/app/focus" className="ml-2 text-signal hover:underline">
                              needs you →
                            </Link>
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )}

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
