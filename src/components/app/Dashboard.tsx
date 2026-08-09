"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useDisplayName } from "@/lib/theme";
import { AlertTriangle, ArrowRight, Check, ShieldQuestion, X } from "lucide-react";
import type { ActionRecord, MissionRecord, MissionStepRecord } from "@/lib/types";
import { SourceComposer } from "@/components/app/SourceComposer";
import { DecisionInbox } from "@/components/app/DecisionInbox";
import { todayDigest } from "@/lib/missions/today";
import { useNewItems } from "@/lib/useNewItems";
import { WorkingPip } from "@/components/brand/WorkingPip";
import { invalidate, seedResource, useResource } from "@/lib/client/resource";
import { MISSIONS_KEY, PENDING_APPROVALS_KEY } from "@/lib/client/keys";
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
  // What the server already fetched goes straight into the shared cache, so
  // the client's first render has it and asks for none of it again. Seeding
  // during render (not in an effect) means it lands before the first paint.
  if (initial) {
    seedResource(MISSIONS_KEY, { missions: initial.missions, steps: initial.steps });
    seedResource(PENDING_APPROVALS_KEY, { actions: initial.approvals });
  }

  // Four independent reads. Each section renders the moment ITS data lands —
  // a slow /api/connections can no longer hold up the work you came to see.
  // Two of these keys are the same ones the rail reads, so the network sees
  // one request, not two.
  const missionsRes = useResource<{ missions?: MissionRecord[]; steps?: Record<string, MissionStepRecord[]> }>(
    MISSIONS_KEY
  );
  const approvalsRes = useResource<{ actions?: ActionRecord[] }>(PENDING_APPROVALS_KEY, {
    refreshMs: 30_000,
  });
  const connectionsRes = useResource<{ connections?: ConnectionView[] }>("/api/connections");
  const usageRes = useResource<{ usage?: { actions_executed?: number } }>("/api/usage");

  // The cache is empty on the server AND during the client's hydration render,
  // so both fall through to `initial` and produce identical markup. Once the
  // browser has mounted, the cache takes over and this prop is never read
  // again. (See lib/client/resource.ts — the cache is deliberately inert on
  // the server, because a module-level Map there is shared across users.)
  const missions =
    missionsRes.data?.missions ?? initial?.missions ?? (missionsRes.loading ? null : []);
  const steps = missionsRes.data?.steps ?? initial?.steps ?? {};
  const approvals = (approvalsRes.data?.actions ?? initial?.approvals ?? []).filter(
    (a) => a.status === "proposed"
  );
  const connections = (connectionsRes.data?.connections ?? []).filter((c) => c.kind === "app");
  const opsThisMonth = Number(usageRes.data?.usage?.actions_executed) || 0;

  const [displayName] = useDisplayName();
  // Resolved after mount from the visitor's own clock — never server-guessed.
  const [dayPart, setDayPart] = useState<string | null>(null);
  useEffect(() => {
    setDayPart(partOfDay(new Date().getHours()));
  }, []);

  /** After starting work, the queue and the mission list are both out of date. */
  const reload = useCallback(() => {
    invalidate("/api/missions");
    invalidate("/api/actions");
  }, []);

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

  /**
   * Does anything actually need this person right now? The answer reorders the
   * page, and that reordering is the whole idea: showing someone a big empty
   * text box first, while two signatures are waiting, is an interface that has
   * not looked at its own data. When there IS work, the work leads and the box
   * follows. When there isn't, the box is the only thing that matters.
   */
  const needsYou = approvals.length > 0 || waiting.length > 0;
  const busy = needsYou || working.length > 0 || finished.length > 0;

  const composer = (
    <SourceComposer
      onStarted={reload}
      /* The starting points render below as cards when the page is quiet, so
         the box never shows a second copy of the same four suggestions. */
      suggestions={[]}
    />
  );

  return (
    <div className={`page ${busy ? "" : "flex min-h-[72vh] flex-col justify-center"}`}>
      {/* --------------------- who, and what today is --------------------- */}
      <header className={busy ? "" : "text-center"}>
        <h1
          className={`font-display text-[28px] font-bold tracking-tight transition-opacity duration-base ease-brand-out sm:text-[34px] ${
            dayPart ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* The clock is the visitor's, so the greeting resolves after mount
              and fades in. The space holds the line's height for that one
              frame, so nothing below it ever jumps. */}
          {dayPart ? `${dayPart}${displayName.trim() ? `, ${displayName.trim()}` : ""}.` : " "}
        </h1>
        <p className="mt-2 text-[15px] text-ink-soft">
          {missions === null
            ? " "
            : headline({
                approvals: approvals.length || waiting.length,
                working: working.length,
                finished: finished.length,
              })}
        </p>
        <Attention connections={connections} />
      </header>

      {/* When the box leads it gets room around it, with the suggestions under
          it. For someone with nothing waiting, this is the whole page. */}
      {!busy && (
        <>
          <div className="mx-auto mt-8 w-full max-w-2xl">{composer}</div>
          <section className="mx-auto mt-8 w-full max-w-2xl">
            <p className="section-title">Try asking</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
        </>
      )}

      {/* --------------------------- what needs you --------------------------- */}
      {/* First, because it is the only thing on this page that costs something
          by being missed. Real decision cards, not a link to them. */}
      {approvals.length > 0 && (
        <Section title="Needs you" tone="attention">
          <DecisionInbox initial={approvals} compact emptyFallback={null} />
        </Section>
      )}
      {approvals.length === 0 && waiting.length > 0 && (
        <Section title="Needs you" tone="attention">
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

      {/* ---------------------------- working now ---------------------------- */}
      {working.length > 0 && (
        <Section title="Working now" tone="live">
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

      {/* ----------------------------- done today ----------------------------- */}
      {finished.length > 0 && (
        <Section title="Done today">
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

      {/* With work above, the box comes after it — still one keystroke away, no
          longer competing with the thing that needs a decision. */}
      {busy && (
        <section className="mt-10 border-t border-line/60 pt-7">
          <p className="section-title">Ask for something else</p>
          <div className="mt-3">{composer}</div>
        </section>
      )}

      {/* Nothing running, waiting, or finished today. The greeting already said
          so in plain words; repeating "no missions" here would report the same
          absence twice. What belongs at the bottom of a quiet page is the state
          of the machine, quietly. */}
      {!busy && missions !== null && (
        <p className="mt-14 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs font-bold lowercase tracking-widest text-ink-soft/70">
          <span className="h-1.5 w-1.5 rounded-pill bg-signal/70" aria-hidden="true" />
          ready to work
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

/**
 * The one notification line on home.
 *
 * A connection that has stopped working is the single piece of news that
 * silently breaks everything else: missions that need that app simply stop
 * being possible, with no error anywhere the operator would look. So it gets a
 * line — one sentence naming the app and the fix — rather than a card. When
 * every app is fine it renders nothing, which is the common case and should
 * cost no space at all.
 */
function Attention({ connections }: { connections: ConnectionView[] }) {
  const broken = connections.filter((c) => c.status === "needs_reauth" || c.status === "error");
  if (broken.length === 0) return null;
  const names = broken.map((c) => c.display_name);
  const label =
    names.length === 1
      ? `${names[0]} stopped working`
      : `${names.slice(0, 2).join(" and ")}${
          names.length > 2 ? ` and ${names.length - 2} more` : ""
        } stopped working`;
  return (
    <Link
      href="/app/connections"
      className="mt-3 inline-flex items-center gap-2 rounded-pill bg-signal/12 px-3 py-1.5 text-[13px] font-bold text-ink ring-1 ring-inset ring-signal/30 transition-colors duration-fast hover:bg-signal/20"
    >
      <AlertTriangle size={13} className="shrink-0 text-signal" aria-hidden="true" />
      {label} — reconnect
      <ArrowRight size={12} className="shrink-0 text-ink-soft" aria-hidden="true" />
    </Link>
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
