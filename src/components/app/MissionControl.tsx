"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Radio, X } from "lucide-react";
import { missionStatus, STATUS_TONE, type Status } from "@/lib/status";
import { badge, btn, card, dot, field } from "@/components/ui/styles";
import { Page, PageHeader } from "@/components/ui/Page";

/**
 * Mission Control answers exactly one question: what is cosigno doing right
 * now?
 *
 * Only ACTIVE work appears. Finished missions are archived on the missions
 * page, and idle cards answer no question anyone opened this page to ask. A
 * card is the mission, its current step, real progress, what's next, and when
 * it started — the things an owner checks over cosigno's shoulder for.
 *
 * What's deliberately absent: health percentages, queue sizes, tool-call
 * counters, worker/lease state. Those describe the machinery, not the work,
 * and every one of them made a customer read like an SRE. There is also no
 * "estimated completion": the runtime measures no durations, and a made-up
 * ETA that's wrong is worse than none.
 */

const POLL_MS = 4000;

interface Node {
  id: string;
  goal: string;
  state: string;
  current_task: string | null;
  next_step: string | null;
  steps_total: number;
  steps_done: number;
  started_at: string;
  changes_made: number;
  changes_allowed: number | null;
  connectors: string[];
  blocked_on: string | null;
  last_action: string | null;
}

interface Snapshot {
  live_count: number;
  finished_count: number;
  nodes: Node[];
}

function startedAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function MissionControl() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/mission-control", { cache: "no-store" });
      if (!res.ok) throw new Error(`couldn't check on cosigno (${res.status}).`);
      setSnap(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check on cosigno.");
    }
  }, []);

  useEffect(() => {
    load();
    const tick = () => {
      timer.current = setTimeout(async () => {
        if (document.visibilityState !== "hidden") await load();
        tick();
      }, POLL_MS);
    };
    tick();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  const nodes = snap?.nodes ?? [];
  const open = nodes.find((n) => n.id === openId) ?? null;

  return (
    <Page width="work">
      <PageHeader
        title="What's running right now?"
        description={
          nodes.length === 0
            ? "Nothing is running at the moment."
            : nodes.length === 1
              ? "One mission is moving. It refreshes live."
              : `${nodes.length} missions are moving. They refresh live.`
        }
        action={
          (snap?.finished_count ?? 0) > 0 ? (
            <Link href="/app/missions" className={btn("ghost", "sm")}>
              Finished work <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />

      <WorkspaceSummary running={nodes.length} />

      {error && (
        <p className="t-body mt-8 border-l-2 border-danger pl-3.5 text-danger">
          {error}{" "}
          <button onClick={load} className="underline underline-offset-2">
            Retry
          </button>
        </p>
      )}

      {!snap && !error ? (
        <div className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))]" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-[170px] animate-shimmer rounded-card bg-ink/[0.055]" />
          ))}
        </div>
      ) : nodes.length === 0 && !error ? (
        <EmptyState finished={snap?.finished_count ?? 0} />
      ) : (
        <div className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
          {nodes.map((n) => (
            <MissionCard key={n.id} node={n} onOpen={() => setOpenId(n.id)} />
          ))}
        </div>
      )}

      {open && <Inspector node={open} onClose={() => setOpenId(null)} />}
    </Page>
  );
}

/**
 * The workspace at a glance, above the feed. Every number is real and a
 * stat only renders when it has something to say — a row of zeros reinforces
 * nothing, so zeros simply don't appear.
 */
function WorkspaceSummary({ running }: { running: number }) {
  const [connectedApps, setConnectedApps] = useState(0);
  const [opsThisMonth, setOpsThisMonth] = useState(0);

  useEffect(() => {
    fetch("/api/connections")
      .then((r) => r.json())
      .then((d) =>
        setConnectedApps(
          (Array.isArray(d.connections) ? d.connections : []).filter(
            (c: { status?: string }) => c.status === "connected"
          ).length
        )
      )
      .catch(() => undefined);
    fetch("/api/usage")
      .then((r) => r.json())
      .then((d) => setOpsThisMonth(Number(d.usage?.actions_executed) || 0))
      .catch(() => undefined);
  }, []);

  const stats = [
    running > 0 && {
      value: running,
      label: `mission${running === 1 ? "" : "s"} running`,
    },
    connectedApps > 0 && {
      value: connectedApps,
      label: `connected app${connectedApps === 1 ? "" : "s"}`,
    },
    opsThisMonth > 0 && {
      value: opsThisMonth,
      label: "AI operations completed this month",
    },
  ].filter((s): s is { value: number; label: string } => Boolean(s));

  if (stats.length === 0) return null;
  return (
    <div className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-3">
      {stats.map((s) => (
        <div key={s.label}>
          <p className="font-display text-[1.75rem] leading-none tabular-nums">
            {s.value.toLocaleString()}
          </p>
          <p className="t-caption mt-2">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Quiet is a good state, and the page says so — then offers the two things
 * someone actually does from here. Never six grey cards of nothing.
 */
function EmptyState({ finished }: { finished: number }) {
  return (
    <div className="flex animate-fade-through flex-col items-center px-6 py-20 text-center">
      <Radio size={22} strokeWidth={1.6} className="text-ink-soft opacity-70" aria-hidden="true" />
      <h2 className="t-title mt-5">Nothing is running</h2>
      <p className="t-caption mt-2 max-w-[26rem]">
        The moment a mission starts, it appears here live — what cosigno is on, how far
        along, and what comes next.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-1.5">
        <Link href="/app" className={btn("primary", "md")}>
          Start a mission
        </Link>
        <Link href="/app/templates" className={btn("ghost", "md")}>
          Browse templates
        </Link>
      </div>
      {finished > 0 && (
        <p className="mt-5 text-xs text-ink-soft">
          {finished} finished mission{finished === 1 ? "" : "s"} — see{" "}
          <Link href="/app/missions" className="font-semibold underline underline-offset-2">
            missions
          </Link>{" "}
          for what they achieved.
        </p>
      )}
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="t-caption">Progress</span>
        <span className="t-caption tabular-nums">
          {done} of {total} steps
        </span>
      </div>
      <div
        className="mt-2 h-1 overflow-hidden rounded-pill bg-ink/[0.08]"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className="h-full rounded-pill bg-ink transition-[width] duration-slow ease-brand-out"
          style={{ width: `${Math.max(3, pct)}%` }}
        />
      </div>
    </div>
  );
}

function MissionCard({ node: n, onOpen }: { node: Node; onOpen: () => void }) {
  const label = missionStatus(n.state as Parameters<typeof missionStatus>[0]);
  return (
    <button
      onClick={onOpen}
      aria-label={`check on: ${n.goal}`}
      className={`${card(true)} group min-w-0 p-5 text-left focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(var(--c-signal))]`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="t-title min-w-0 truncate">{n.goal}</p>
        <span className={badge(STATUS_TONE[label as Status])}>
          <span className={dot(STATUS_TONE[label as Status])} aria-hidden="true" />
          {label}
        </span>
      </div>

      <p className="mt-2 min-h-[20px] text-sm text-ink-soft">
        {n.blocked_on ? (
          <span className="font-semibold text-ink">waiting on {n.blocked_on}</span>
        ) : (
          (n.current_task ?? "between steps")
        )}
      </p>

      <div className="mt-4">
        <ProgressBar done={n.steps_done} total={n.steps_total} />
      </div>

      {n.next_step && (
        <p className="mt-3 truncate text-xs text-ink-soft">
          <span className="font-semibold">next:</span> {n.next_step}
        </p>
      )}
      <p className="mt-1 text-xs text-ink-soft">started {startedAgo(n.started_at)}</p>
    </button>
  );
}

/**
 * The inspector stays in the same vocabulary: the work, not the machinery.
 * Deep control (pause, stop, approvals, the full feed) lives on the mission
 * page — one click away, not duplicated here.
 */
function Inspector({ node: n, onClose }: { node: Node; onClose: () => void }) {
  const label = missionStatus(n.state as Parameters<typeof missionStatus>[0]);
  const rows: [string, React.ReactNode][] = [
    ["status", label.toLowerCase()],
    ["current step", n.current_task ?? "between steps"],
    ["next step", n.next_step ?? "nothing after this"],
    ["progress", `${n.steps_done} of ${n.steps_total} steps`],
    ["started", startedAgo(n.started_at)],
    [
      "actions used",
      n.changes_allowed === null || !Number.isFinite(n.changes_allowed)
        ? `${n.changes_made} · no limit`
        : `${n.changes_made} of ${n.changes_allowed}`,
    ],
    ["last result", n.last_action ?? "nothing finished yet"],
  ];

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-ink/30 backdrop-blur-sm" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`checking on: ${n.goal}`}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-md animate-modal-in overflow-y-auto bg-cream p-6 shadow-raise"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">{n.goal}</h2>
          <button
            onClick={onClose}
            aria-label="close"
            className="shrink-0 rounded-btn p-2 text-ink-soft transition-colors hover:bg-cream-deep hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4">
          <ProgressBar done={n.steps_done} total={n.steps_total} />
        </div>

        <dl className="mt-5 flex flex-col rounded-card bg-surface px-4 py-1 shadow-rest">
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2.5 last:border-0"
            >
              <dt className="shrink-0 text-[0.75rem] font-semibold text-ink-soft">{k}</dt>
              <dd className="min-w-0 text-right text-sm font-semibold">{v}</dd>
            </div>
          ))}
        </dl>

        {n.connectors.length > 0 && (
          <p className="mt-4 text-xs text-ink-soft">
            working in: <span className="font-semibold">{n.connectors.join(" · ")}</span>
          </p>
        )}

        <Link href={`/app/missions/${n.id}`} className={btn("primary", "md", "mt-7 w-full")}>
          Open this mission <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
        </Link>
      </aside>
    </div>
  );
}
