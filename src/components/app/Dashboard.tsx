"use client";

import { useCallback, useEffect, useState } from "react";
import { useDisplayName } from "@/lib/theme";
import {
  ArrowRight,
  Hammer,
  LineChart,
  ListTodo,
  Search,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ActionRecord, MissionRecord, MissionStepRecord } from "@/lib/types";
import { SourceComposer } from "@/components/app/SourceComposer";
import { DecisionInbox } from "@/components/app/DecisionInbox";
import { MissionCard } from "@/components/app/MissionCard";
import { ProactiveFindings } from "@/components/app/ProactiveFindings";
import { PersonalNote } from "@/components/app/PersonalNote";
import { SignatureStack } from "@/components/motion/Depth";
import { LoadingState } from "@/components/ui/States";

/**
 * HOME — one screen that answers, in this order:
 *
 *   1. what do I want done?      the ask box, and nothing above it
 *   2. what needs me?            approvals and questions, first because they
 *                                are the only things that cost you by waiting
 *   3. what is happening?        work in flight, as living cards
 *   4. what changed?             what actually landed today
 *   5. what should I do next?    only when cosigno has a real finding
 *
 * The ordering is the design. Everything else on the page is a consequence of
 * what you type at the top, so the top is where the page opens — and the one
 * thing that can go wrong (cosigno stopped and is waiting on a human) is never
 * below the fold.
 *
 * Nothing here is invented. Every line comes from a persisted mission, step,
 * or decision; there are no charts, no fake progress, and no metric that is
 * really a zero standing in for "not connected".
 */

/** Time-of-day greeting, from the reader's own clock (not the server's). */
function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name.trim() ? `${part}, ${name.trim()}` : part;
}

/**
 * THE SIX STARTING POINTS.
 *
 * Not required flows, not a menu, and emphatically not a setup step — six
 * shapes of work with one real sentence each, so someone who has never used
 * an operator before can see what "anything" actually means. They put the
 * sentence in the ask box rather than starting it, because the first thing a
 * new person needs is to see that they can edit it.
 *
 * They disappear the moment there is real work on the page: a suggestion
 * competing with a live mission is noise.
 */
const STARTING_POINTS: { icon: LucideIcon; label: string; example: string }[] = [
  { icon: Hammer, label: "Build something", example: "Build me a simple landing page for my business" },
  { icon: Search, label: "Research something", example: "Research the best option and compare the top three" },
  { icon: Wrench, label: "Fix something", example: "Find what's broken on my website and fix it" },
  { icon: ListTodo, label: "Plan something", example: "Prepare tomorrow's meeting" },
  { icon: LineChart, label: "Grow something", example: "Find out why my sales are dropping" },
  { icon: Sparkles, label: "Handle something", example: "Review my unread email and handle what you can" },
];

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || "something went wrong.");
  return body;
}

/** States in which a mission is still cosigno's problem or the user's. */
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

/** Anything that is sitting on the person rather than moving on its own. */
const NEEDS_YOU_STATES = new Set(["awaiting_input", "awaiting_approval", "paused", "blocked"]);

/** Same calendar day, in the reader's timezone. */
function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

interface ConnectionView {
  provider_key: string;
  display_name: string;
  kind: "app" | "mcp" | "custom";
  status: string;
}

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
    const c = await jsonFetch("/api/connections").catch(() => ({ connections: [] }));
    setConnections(
      (c.connections ?? []).filter((x: ConnectionView) => x.kind === "app" && x.status === "connected")
    );
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
      setMissions(m.missions ?? []);
      setSteps((m.steps ?? {}) as Record<string, MissionStepRecord[]>);
      setApprovals((a.actions ?? []).filter((x: ActionRecord) => x.status === "proposed"));
    } catch {
      setMissions([]);
    }
  }, [loadSide]);

  useEffect(() => {
    // SWR: when the server prefetched, this is a background revalidate.
    load();
  }, [load]);

  // Work in flight keeps moving without the tab, but while someone IS looking
  // the page should not go stale under them.
  useEffect(() => {
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 12_000);
    return () => clearInterval(tick);
  }, [load]);

  const all = missions ?? [];
  const active = all.filter((m) => ACTIVE_STATES.has(m.state));
  const needsYou = active.filter((m) => NEEDS_YOU_STATES.has(m.state));
  const working = active.filter((m) => !NEEDS_YOU_STATES.has(m.state));
  const finishedToday = all.filter(
    (m) =>
      ["completed", "partial", "failed"].includes(m.state) &&
      isToday(m.completed_at ?? m.updated_at)
  );

  const loading = missions === null;
  const nothingAtAll =
    !loading && active.length === 0 && finishedToday.length === 0 && approvals.length === 0;

  /** Put a suggestion into the ask box rather than starting it silently. */
  function askFor(text: string) {
    window.dispatchEvent(new CustomEvent("cosigno:compose", { detail: { text } }));
    document.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:pt-14">
      {/* ------------------------------ the ask ------------------------------ */}
      <header className="text-center">
        <p className="text-sm font-bold text-ink-soft">{greeting(displayName)}</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          What do you want to get done?
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-ink-soft">
          Say it the way you&apos;d say it to a colleague. cosigno works out what
          it needs, does the parts it&apos;s allowed to, and asks you before
          anything that matters.
        </p>
      </header>

      <div className="mt-6">
        <SourceComposer
          onStarted={load}
          suggestions={
            connections.some((c) => c.provider_key.startsWith("google"))
              ? [
                  "prepare tomorrow's meeting",
                  "review my unread emails",
                  "follow up on unanswered threads",
                  "research the best option",
                ]
              : undefined
          }
        />
      </div>

      {/* --------------------------- starting points --------------------------- */}
      {/* Only while the page is otherwise quiet. Once real work is here, an
          example is a suggestion competing with the thing it suggested. */}
      {!loading && active.length === 0 && approvals.length === 0 && (
        <section className="mt-8" aria-labelledby="starting-points">
          <h2
            id="starting-points"
            className="text-[11px] font-extrabold uppercase tracking-widest text-ink-soft"
          >
            For example
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {STARTING_POINTS.map(({ icon: Icon, label, example }, i) => (
              <li key={label}>
                <button
                  onClick={() => askFor(example)}
                  style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                  className="group flex w-full animate-card-in items-start gap-3 rounded-card border border-line bg-surface px-4 py-3 text-left shadow-soft transition-[transform,box-shadow,border-color] duration-fast ease-brand-out hover:-translate-y-px hover:border-signal/60 hover:shadow-depth active:translate-y-0 active:scale-[0.99]"
                >
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-btn bg-cream-deep text-ink-soft transition-colors duration-fast group-hover:bg-signal/15 group-hover:text-signal"
                    aria-hidden="true"
                  >
                    <Icon size={15} strokeWidth={2.3} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-extrabold">{label}</span>
                    <span className="mt-0.5 block text-xs font-semibold text-ink-soft">
                      “{example}”
                    </span>
                  </span>
                  <ArrowRight
                    size={13}
                    aria-hidden="true"
                    className="ml-auto mt-1 shrink-0 text-ink-soft opacity-0 transition-[opacity,transform] duration-fast group-hover:translate-x-0.5 group-hover:opacity-100"
                  />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-center text-xs font-semibold text-ink-soft">
            Or type anything at all — these are examples, not a menu.
          </p>
        </section>
      )}

      {loading && (
        <div className="mt-10">
          <LoadingState label="Gathering your work" rows={2} />
        </div>
      )}

      {/* --------------------------- what needs you --------------------------- */}
      {/* First on the page, always. It is the only section where waiting has a
          cost, and it is the one cosigno cannot resolve by itself. */}
      {(approvals.length > 0 || needsYou.length > 0) && (
        <Section title="Needs you" tone="attention" count={approvals.length + needsYou.length}>
          {approvals.length > 0 && <DecisionInbox initial={approvals} compact emptyFallback={null} />}
          {needsYou.map((m, i) => (
            <MissionCard key={m.id} mission={m} steps={steps[m.id] ?? []} index={i} />
          ))}
        </Section>
      )}

      {/* --------------------------- what's happening --------------------------- */}
      {working.length > 0 && (
        <Section title="cosigno is working on" tone="live" count={working.length}>
          {working.map((m, i) => (
            <MissionCard key={m.id} mission={m} steps={steps[m.id] ?? []} index={i} />
          ))}
        </Section>
      )}

      {/* ------------------------- what cosigno noticed ------------------------- */}
      {/* Renders nothing unless there is a real, live finding. */}
      <ProactiveFindings />

      {/* ----------------------------- what changed ----------------------------- */}
      {finishedToday.length > 0 && (
        <Section title="Finished today" count={finishedToday.length}>
          {finishedToday.slice(0, 4).map((m, i) => (
            <MissionCard key={m.id} mission={m} steps={steps[m.id] ?? []} index={i} />
          ))}
        </Section>
      )}

      {/* How cosigno is adapting to this person. Renders nothing until it has
          actually learned something from real decisions. */}
      <PersonalNote />

      {/* Nothing running, nothing waiting, nothing finished. Say what this
          place is for rather than reporting an absence. */}
      {nothingAtAll && (
        <div className="mt-12 flex flex-col items-center text-center">
          <SignatureStack size={124} />
          <p className="mt-2 font-display text-lg font-bold">Your workspace is clear.</p>
          <p className="mt-1 max-w-xs text-sm font-semibold text-ink-soft">
            Nothing is waiting and nothing is running. Give cosigno something to
            work on and it&apos;ll show up here.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * A titled band. The count is part of the heading rather than a badge because
 * "Needs you 3" is a sentence someone can act on, and a floating number is a
 * decoration you have to go and interpret.
 */
function Section({
  title,
  tone,
  count,
  children,
}: {
  title: string;
  tone?: "live" | "attention";
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 animate-rise-in border-t border-line/60 pt-5">
      <h2 className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest text-ink-soft">
        {tone === "live" && (
          <span className="h-1.5 w-1.5 animate-orb-pulse rounded-pill bg-signal" aria-hidden="true" />
        )}
        {tone === "attention" && (
          <span className="h-1.5 w-1.5 rounded-pill bg-signal" aria-hidden="true" />
        )}
        {title}
        {typeof count === "number" && count > 0 && (
          <span className="tabular-nums text-ink-soft/70">· {count}</span>
        )}
      </h2>
      <div className="mt-3 flex flex-col gap-2.5">{children}</div>
    </section>
  );
}
