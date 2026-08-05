"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Cpu, Radio, X } from "lucide-react";

/**
 * Mission Control — one live node per running agent, with a click-through
 * inspector.
 *
 * Every value is read from real mission state. Uses the existing dashboard
 * vocabulary only (rounded-card, line borders, soft shadow, signal for
 * attention) so it reads as the same product, not a new console.
 */

const POLL_MS = 4000;

interface Node {
  id: string;
  operator: string;
  goal: string;
  state: string;
  current_task: string | null;
  current_tool: string | null;
  tool_calls: number;
  browser_actions: number;
  changes_made: number;
  changes_allowed: number | null;
  steps_total: number;
  steps_done: number;
  queue_size: number;
  retries: number;
  runtime_ms: number;
  updated_ms_ago: number;
  worker_attached: boolean;
  health_score: number;
  health: "healthy" | "degraded" | "stalled" | "failed";
  risk: string | null;
  connectors: string[];
  last_action: string | null;
  blocked_on: string | null;
}

interface Snapshot {
  generated_at: string;
  live_count: number;
  nodes: Node[];
  not_instrumented: string[];
}

const HEALTH_TONE: Record<Node["health"], string> = {
  healthy: "bg-signal/15 text-ink",
  degraded: "text-ink ring-1 ring-inset ring-ink/30",
  stalled: "bg-ink text-cream",
  failed: "bg-ink text-cream",
};

function dur(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-ink-soft">
          {label}
        </span>
        <span className="text-xs font-bold tabular-nums">{value}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-cream-deep">
        <div
          className={`h-full transition-[width] duration-base ease-brand-out ${
            value >= 75 ? "bg-signal" : value >= 40 ? "bg-signal/50" : "bg-ink"
          }`}
          style={{ width: `${Math.max(2, value)}%` }}
        />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2 last:border-0">
      <span className="text-[11px] font-black uppercase tracking-[0.14em] text-ink-soft">
        {label}
      </span>
      <span className="min-w-0 text-right text-sm font-semibold">{value}</span>
    </div>
  );
}

export function MissionControl() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/mission-control", { cache: "no-store" });
      if (!res.ok) throw new Error(`mission control unavailable (${res.status})`);
      setSnap(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't reach mission control.");
    }
  }, []);

  useEffect(() => {
    load();
    const tick = () => {
      timer.current = setTimeout(async () => {
        await load();
        tick();
      }, POLL_MS);
    };
    tick();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  // Esc closes the inspector — keyboard parity with the rest of the app.
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  const nodes = snap?.nodes ?? [];
  const open = nodes.find((n) => n.id === openId) ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-signal">
            mission control
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold lowercase tracking-tight sm:text-4xl">
            every agent, live.
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold text-ink-soft">
            One node per running agent, refreshed every {POLL_MS / 1000} seconds. Select a node to
            inspect it.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-btn border border-line bg-surface px-3.5 py-2 text-sm font-bold">
          <span className="h-2 w-2 animate-orb-pulse rounded-pill bg-signal" aria-hidden="true" />
          {snap?.live_count ?? 0} live
        </span>
      </header>

      {error && (
        <p className="mt-6 rounded-card border border-line bg-surface p-4 text-sm font-semibold">
          {error}{" "}
          <button onClick={load} className="underline decoration-signal underline-offset-2">
            retry
          </button>
        </p>
      )}

      {!snap && !error ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[210px] animate-pulse rounded-card border border-line bg-surface" />
          ))}
        </div>
      ) : nodes.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-line bg-surface/60 p-10 text-center">
          <Radio size={22} className="mx-auto text-ink-soft" aria-hidden="true" />
          <p className="mt-3 text-sm font-bold">No agents running</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
            Delegate a task and its agent appears here as a live node — current step, tools in use,
            queue depth, and health.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {nodes.map((n) => {
            const progress = n.steps_total
              ? Math.round((n.steps_done / n.steps_total) * 100)
              : 0;
            return (
              <button
                key={n.id}
                onClick={() => setOpenId(n.id)}
                aria-label={`inspect ${n.operator}`}
                className="group rounded-card border border-line bg-surface p-4 text-left shadow-soft transition-all duration-base ease-brand-out hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-ink-soft">{n.operator}</p>
                    <p className="truncate font-bold">{n.goal}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${HEALTH_TONE[n.health]}`}
                  >
                    {n.health}
                  </span>
                </div>

                <p className="mt-3 min-h-[32px] text-sm text-ink-soft">
                  {n.blocked_on ? (
                    <span className="font-bold text-ink">waiting on {n.blocked_on}</span>
                  ) : n.current_task ? (
                    <>
                      {n.current_task}
                      {n.current_tool && (
                        <span className="ml-1 font-mono text-[11px]">· {n.current_tool}</span>
                      )}
                    </>
                  ) : (
                    <span className="italic">idle</span>
                  )}
                </p>

                <div className="mt-3 flex flex-col gap-2">
                  <Meter value={progress} label="progress" />
                  <Meter value={n.health_score} label="health" />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-soft">
                  <span className="tabular-nums">{dur(n.runtime_ms)} runtime</span>
                  <span className="tabular-nums">{n.tool_calls} tool calls</span>
                  <span className="tabular-nums">queue {n.queue_size}</span>
                  {n.risk && <span>{n.risk} risk</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-10 text-center text-[11px] text-ink-soft">
        Process CPU, memory, token counts, and cost-per-minute are not collected by the runtime, so
        they are not shown. Every value above is read from live mission state.
      </p>

      {/* live inspector */}
      {open && (
        <div
          className="fixed inset-0 z-30 flex justify-end bg-ink/30 backdrop-blur-sm"
          onClick={() => setOpenId(null)}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`${open.operator} inspector`}
            onClick={(e) => e.stopPropagation()}
            className="h-full w-full max-w-md animate-modal-in overflow-y-auto border-l border-line bg-cream p-5 shadow-lift"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-ink-soft">{open.operator}</p>
                <h2 className="font-display text-xl font-bold">{open.goal}</h2>
              </div>
              <button
                onClick={() => setOpenId(null)}
                aria-label="close inspector"
                className="shrink-0 rounded-btn p-2 text-ink-soft transition-colors hover:bg-cream-deep hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <Meter
                value={open.steps_total ? Math.round((open.steps_done / open.steps_total) * 100) : 0}
                label="progress"
              />
              <Meter value={open.health_score} label="health" />
            </div>

            <div className="mt-5 rounded-card border border-line bg-surface px-4 py-1">
              <Field label="state" value={open.state.replace(/_/g, " ")} />
              <Field
                label="current task"
                value={open.current_task ?? <span className="text-ink-soft">idle</span>}
              />
              <Field label="worker" value={open.worker_attached ? "attached" : "not attached"} />
              <Field label="runtime" value={dur(open.runtime_ms)} />
              <Field label="last update" value={`${dur(open.updated_ms_ago)} ago`} />
              <Field label="steps" value={`${open.steps_done} / ${open.steps_total}`} />
              <Field label="queue size" value={open.queue_size} />
              <Field label="retries" value={open.retries} />
              <Field label="tool calls" value={open.tool_calls} />
              <Field label="browser actions" value={open.browser_actions} />
              <Field
                label="execution budget"
                value={
                  open.changes_allowed === null || !Number.isFinite(open.changes_allowed)
                    ? `${open.changes_made} used · no limit`
                    : `${open.changes_made} / ${open.changes_allowed} actions used`
                }
              />
              <Field label="risk" value={open.risk ?? <span className="text-ink-soft">no decisions yet</span>} />
              <Field
                label="last action"
                value={open.last_action ?? <span className="text-ink-soft">none yet</span>}
              />
            </div>

            <div className="mt-5">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-ink-soft">
                active connectors
              </p>
              {open.connectors.length === 0 ? (
                <p className="mt-2 text-sm text-ink-soft">None used yet.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {open.connectors.map((c) => (
                    <span
                      key={c}
                      className="rounded-pill bg-cream-deep px-2.5 py-1 font-mono text-[11px] font-bold"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-ink-soft">
              <Cpu size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              CPU, memory, and token usage aren&apos;t collected by the runtime — showing estimates
              here would be a guess, so they&apos;re left out.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
