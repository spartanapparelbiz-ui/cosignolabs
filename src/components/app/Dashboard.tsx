"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useDisplayName } from "@/lib/theme";
import { ArrowRight, Check, Loader2, ShieldQuestion, X } from "lucide-react";
import type { ActionRecord, AutomationRecord, MissionRecord, MissionStepRecord } from "@/lib/types";
import { ConnectorLogo } from "@/components/integrations/ConnectorLogo";
import { SourceComposer } from "@/components/app/SourceComposer";
import { DecisionInbox } from "@/components/app/DecisionInbox";
import { todayDigest } from "@/lib/missions/today";

/**
 * The home dashboard — one calm place that answers four questions:
 *   1. what can I ask cosigno to do?   (the ask box + examples)
 *   2. what is cosigno working on?     (in progress)
 *   3. what needs my approval?         (needs your approval)
 *   4. what has cosigno finished?      (recently completed)
 * Everything is read from real data (missions, approvals, automations,
 * connections). No charts, no fake progress, no technical words.
 */


/**
 * Time-of-day greeting. Uses the browser's clock, which is the user's own —
 * a server-side hour would greet someone in Sydney with "good evening" at
 * breakfast.
 */
function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name.trim() ? `${part}, ${name.trim()}` : `${part}`;
}

/**
 * Starting points, phrased as things a person would actually say. Shown only
 * when nothing is running — once there is real work on the page, suggestions
 * are noise competing with it.
 */
const PROMPTS = [
  "Prepare tomorrow's meeting",
  "Review my unread email",
  "Research the best option",
  "Follow up on unanswered threads",
] as const;

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
  const [automation, setAutomation] = useState<AutomationRecord | null>(null);
  const [connections, setConnections] = useState<ConnectionView[]>([]);


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

  /** Put a suggestion into the ask box rather than starting it silently. */
  function askFor(text: string) {
    window.dispatchEvent(new CustomEvent("cosigno:compose", { detail: { text } }));
  }

  const working = digest.lines.filter((l) => l.kind === "doing");
  const waiting = digest.lines.filter((l) => l.kind === "waiting");
  const finished = digest.lines.filter((l) => l.kind === "done" || l.kind === "failed");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10 sm:pt-16">
      {/* ------------------------------ the ask ------------------------------ */}
      {/* The page opens on the thing it is for. Everything else is a
          consequence of what you type here, so it comes after. */}
      <header className="text-center">
        <p className="text-sm font-bold text-ink-soft">{greeting(displayName)}</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          What would you like Cosigno to do?
        </h1>
      </header>

      <div className="mt-6">
        <SourceComposer
          onStarted={load}
          suggestions={
            connections.some((c) => c.provider_key.startsWith("google"))
              ? ["prepare tomorrow's meeting", "review my unread emails", "follow up on unanswered threads", "research the best option"]
              : undefined
          }
        />
      </div>

      {/* Prompt cards, not chips — something you actually want to click. */}
      {working.length === 0 && waiting.length === 0 && (
        <section className="mt-6">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-ink-soft">
            Try asking
          </p>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => askFor(p)}
                className="group rounded-card border border-line bg-surface px-4 py-3 text-left text-sm font-semibold shadow-soft transition-all hover:-translate-y-0.5 hover:border-signal hover:shadow-depth"
              >
                {p}
                <ArrowRight
                  size={13}
                  className="ml-1.5 inline text-ink-soft transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* --------------------------- working now --------------------------- */}
      {working.length > 0 && (
        <Section title="Working right now" tone="live">
          {working.map((l) => (
            <Row key={l.missionId} href={`/app/missions/${l.missionId}`} icon={<Loader2 size={14} className="animate-spin text-ink" />}>
              {l.text}
            </Row>
          ))}
        </Section>
      )}

      {/* ------------------------- needs your approval ------------------------- */}
      {/* Only ever rendered when something is genuinely waiting. An empty
          "nothing is waiting" panel is a row of furniture that says nothing. */}
      {approvals.length > 0 && (
        <Section title="Needs your approval" tone="attention">
          <DecisionInbox initial={approvals} compact emptyFallback={null} />
        </Section>
      )}
      {approvals.length === 0 && waiting.length > 0 && (
        <Section title="Needs your approval" tone="attention">
          {waiting.map((l) => (
            <Row key={l.missionId} href={`/app/missions/${l.missionId}`} icon={<ShieldQuestion size={14} className="text-signal" />}>
              {l.text}
            </Row>
          ))}
        </Section>
      )}

      {/* --------------------------- completed today --------------------------- */}
      {finished.length > 0 && (
        <Section title="Completed today">
          {finished.map((l) => (
            <Row
              key={l.missionId}
              href={`/app/missions/${l.missionId}`}
              icon={
                l.kind === "failed" ? (
                  <X size={14} className="text-ink-soft" />
                ) : (
                  <Check size={14} className="text-signal" />
                )
              }
            >
              {l.text}
            </Row>
          ))}
        </Section>
      )}

      {/* Nothing running, nothing waiting, nothing finished today. Say what
          the product is for rather than reporting an absence. */}
      {working.length === 0 && waiting.length === 0 && finished.length === 0 && missions !== null && (
        <p className="mt-10 text-center text-sm font-semibold text-ink-soft">
          Cosigno is ready.
        </p>
      )}
    </div>
  );
}

/** A titled band of rows. The only section shape on this page. */
function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "live" | "attention";
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 animate-rise-in border-t border-line/60 pt-5">
      <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest text-ink-soft">
        {tone === "live" && (
          <span className="h-1.5 w-1.5 animate-orb-pulse rounded-pill bg-signal" aria-hidden="true" />
        )}
        {tone === "attention" && (
          <span className="h-1.5 w-1.5 rounded-pill bg-signal" aria-hidden="true" />
        )}
        {title}
      </p>
      <div className="mt-2.5 flex flex-col gap-1">{children}</div>
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
      className="group flex items-start gap-2.5 rounded-btn px-2 py-2 transition-colors hover:bg-cream-deep/50"
    >
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-sm font-semibold leading-snug group-hover:underline underline-offset-2">
        {children}
      </span>
      <ArrowRight
        size={13}
        className="mt-1 shrink-0 text-ink-soft opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden="true"
      />
    </Link>
  );
}
