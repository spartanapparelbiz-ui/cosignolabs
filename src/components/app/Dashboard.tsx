"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useDisplayName } from "@/lib/theme";
import { ArrowRight, Check, ShieldQuestion, X } from "lucide-react";
import type { ActionRecord, MissionRecord, MissionStepRecord } from "@/lib/types";
import { SourceComposer } from "@/components/app/SourceComposer";
import { DecisionInbox } from "@/components/app/DecisionInbox";
import { todayDigest } from "@/lib/missions/today";
import { useNewItems } from "@/lib/useNewItems";
import { WorkingPip } from "@/components/brand/WorkingPip";
import { headline, partOfDay } from "@/lib/dashboard/greeting";

/**
 * The home dashboard — one calm place that answers four questions:
 *   1. what can I ask cosigno to do?   (the ask box + examples)
 *   2. what is cosigno working on?     (in progress)
 *   3. what needs my approval?         (needs your approval)
 *   4. what has cosigno finished?      (recently completed)
 * Everything is read from real data (missions, approvals, connections). No
 * charts, no fake progress, no technical words.
 */


/**
 * Starting points, phrased as things a person would actually say. Shown only
 * when nothing is running — once there is real work on the page, suggestions
 * are noise competing with it.
 *
 * Two sets: with an inbox and calendar connected, the mail-and-meetings jobs
 * are the ones cosigno can actually finish today; without them, suggesting
 * "review my unread email" is an invitation to a dead end.
 */
const PROMPTS_CONNECTED = [
  "Prepare tomorrow's meeting",
  "Review my unread email",
  "Follow up on unanswered threads",
  "Summarize this week's calendar",
] as const;

const PROMPTS_BASE = [
  "Research the best option",
  "Compare three laptops under $1,000",
  "Draft a plan for next week",
  "Summarize a document I upload",
] as const;

function promptsFor(connections: ReadonlyArray<{ provider_key: string }>): readonly string[] {
  return connections.some((c) => c.provider_key.startsWith("google") || c.provider_key === "outlook")
    ? PROMPTS_CONNECTED
    : PROMPTS_BASE;
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
  // The quiet value line under the greeting — the real usage-meter count.
  // Rendered only when it's non-zero; a zero reinforces nothing.
  const [opsThisMonth, setOpsThisMonth] = useState(0);
  // Resolved after mount from the visitor's own clock — never server-guessed.
  const [dayPart, setDayPart] = useState<string | null>(null);

  useEffect(() => {
    setDayPart(partOfDay(new Date().getHours()));
  }, []);


  const loadSide = useCallback(async () => {
    // The right-column extras (connected apps, the usage meter).
    const [c, u] = await Promise.all([
      jsonFetch("/api/connections").catch(() => ({ connections: [] })),
      jsonFetch("/api/usage").catch(() => ({})),
    ]);
    setOpsThisMonth(Number(u.usage?.actions_executed) || 0);
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

  /** Put a suggestion into the ask box rather than starting it silently. */
  function askFor(text: string) {
    window.dispatchEvent(new CustomEvent("cosigno:compose", { detail: { text } }));
  }

  const working = digest.lines.filter((l) => l.kind === "doing");
  const waiting = digest.lines.filter((l) => l.kind === "waiting");
  const finished = digest.lines.filter((l) => l.kind === "done" || l.kind === "failed");

  // Only genuinely new work animates in; everything already on screen holds
  // still, so motion on this page always means "look, that just changed".
  const fresh = useNewItems([
    ...working.map((l) => l.missionId),
    ...waiting.map((l) => l.missionId),
    ...finished.map((l) => l.missionId),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10 sm:pt-16">
      {/* ------------------------------ the ask ------------------------------ */}
      {/* The page opens by naming the person and the state of their day, then
          gives them the box. Everything below is a consequence of what they
          type into it, so it comes after. */}
      <header className="text-center">
        <h1
          className={`font-display text-3xl font-bold tracking-tight transition-opacity duration-base ease-brand-out sm:text-4xl ${
            dayPart ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* The clock is the visitor's, so the greeting resolves after mount
              and fades in. The non-breaking space holds the line's height for
              that one frame, so nothing below it ever jumps. */}
          {dayPart ? `${dayPart}${displayName.trim() ? `, ${displayName.trim()}` : ""}.` : " "}
        </h1>
        <p className="mt-2 text-sm font-semibold text-ink-soft">
          {missions === null
            ? " "
            : headline({
                approvals: approvals.length || waiting.length,
                working: working.length,
                finished: finished.length,
              })}
        </p>
      </header>

      <div className="mt-7">
        {/* The starting points live below as cards, so the box shows none of
            its own — the same four suggestions twice is clutter. */}
        <SourceComposer onStarted={load} suggestions={[]} />
      </div>

      {/* Prompt cards, not chips — something you actually want to click. They
          name the apps this workspace has actually connected, so nothing here
          suggests work cosigno can't currently do. */}
      {working.length === 0 && waiting.length === 0 && (
        <section className="mt-7">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-ink-soft">
            Try asking
          </p>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {promptsFor(connections).map((p) => (
              <button
                key={p}
                onClick={() => askFor(p)}
                className="group card-lift rounded-card border border-line bg-surface px-4 py-3 text-left text-sm font-semibold shadow-soft hover:border-signal"
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
            <Row
              key={l.missionId}
              href={`/app/missions/${l.missionId}`}
              icon={<WorkingPip className="mt-1.5" />}
              isNew={fresh.has(l.missionId)}
            >
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
            <Row
              key={l.missionId}
              href={`/app/missions/${l.missionId}`}
              icon={<ShieldQuestion size={14} className="text-signal" />}
              isNew={fresh.has(l.missionId)}
            >
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
              isNew={fresh.has(l.missionId)}
              icon={
                l.kind === "failed" ? (
                  <X size={14} className="text-ink-soft" />
                ) : (
                  <Check
                    size={14}
                    className={`text-signal ${fresh.has(l.missionId) ? "animate-check-pop" : ""}`}
                  />
                )
              }
            >
              {l.text}
            </Row>
          ))}
        </Section>
      )}

      {/* Nothing running, nothing waiting, nothing finished today. The
          greeting already said so in plain words; repeating "no missions" here
          would only report the same absence twice. What belongs at the bottom
          of a quiet page is the state of the machine, quietly. */}
      {working.length === 0 && waiting.length === 0 && finished.length === 0 && missions !== null && (
        <p className="mt-12 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs font-bold lowercase tracking-widest text-ink-soft/70">
          <span className="h-1.5 w-1.5 rounded-pill bg-signal/70" aria-hidden="true" />
          ready to work
          {/* The month's real count, kept down here where a quiet number
              belongs. It was competing with the greeting at the top of the
              page, which is the one line that should own that space. */}
          {opsThisMonth > 0 && (
            <span>
              · {opsThisMonth.toLocaleString()} operation{opsThisMonth === 1 ? "" : "s"} this month
            </span>
          )}
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

/**
 * One line of work. Compact, clickable, nothing you cannot act on.
 *
 * `isNew` is set only for a row that has just arrived while the page was
 * already open, so the entrance animation marks a real change instead of
 * replaying every time the dashboard revalidates.
 */
function Row({
  href,
  icon,
  children,
  isNew = false,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isNew?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-start gap-2.5 rounded-btn px-2 py-2 transition-colors duration-fast hover:bg-cream-deep/60 ${
        isNew ? "animate-row-in" : ""
      }`}
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
