"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, Plug, Search, ShieldCheck } from "lucide-react";

/**
 * Live Monitoring — the operations view.
 *
 * Polls /api/monitoring on an interval and re-renders in place. Everything
 * shown is counted from real state; metrics the product does not instrument
 * are absent by design rather than estimated.
 *
 * Uses the existing dashboard vocabulary only: rounded-card surfaces, the
 * line/soft-shadow treatment, signal for attention, ink-soft for secondary.
 */

const POLL_MS = 5000;

interface Snapshot {
  generated_at: string;
  activity: Record<string, number | Record<string, number>>;
  services: {
    key: string; name: string; kind: string; status: string;
    auth_type: string; last_health_at: string | null; heartbeat_age_ms: number | null;
  }[];
  approvals: { id: string; summary: string; category: string; tier: number; waiting_ms: number }[];
  events: {
    id: string; at: string; actor: string; action: string; resource: string;
    authority: string; status: string; blast_level: string; executed: boolean;
  }[];
  alerts: { level: "warn" | "critical"; title: string; detail: string }[];
}

function ago(ms: number | null): string {
  if (ms === null) return "never";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

const SERVICE_TONE: Record<string, string> = {
  connected: "bg-signal/15 text-ink",
  needs_reauth: "text-ink ring-1 ring-inset ring-ink/30",
  error: "bg-ink text-cream",
  revoked: "text-ink-soft ring-1 ring-inset ring-line",
};

function Stat({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-ink-soft">{label}</p>
      <p className="mt-1.5 font-display text-3xl font-bold tabular-nums">{value}</p>
      {note && <p className="mt-0.5 text-xs text-ink-soft">{note}</p>}
    </div>
  );
}

function Section({
  title, icon: Icon, count, children,
}: {
  title: string; icon: typeof Activity; count?: number; children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold lowercase">
        <Icon size={17} className="text-ink-soft" aria-hidden="true" />
        {title}
        {typeof count === "number" && (
          <span className="rounded-pill bg-cream-deep px-2 py-0.5 text-xs font-bold tabular-nums text-ink-soft">
            {count}
          </span>
        )}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-card border border-dashed border-line bg-surface/60 p-6 text-center text-sm text-ink-soft">
      {children}
    </p>
  );
}

export function LiveMonitoring() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [q, setQ] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/monitoring", { cache: "no-store" });
      if (!res.ok) throw new Error(`monitoring unavailable (${res.status})`);
      setSnap(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't reach monitoring.");
    }
  }, []);

  useEffect(() => {
    load();
    if (!live) return;
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
  }, [load, live]);

  const a = (snap?.activity ?? {}) as Record<string, number>;
  const match = (s: string) => !q.trim() || s.toLowerCase().includes(q.trim().toLowerCase());
  const services = (snap?.services ?? []).filter((s) => match(`${s.name} ${s.key} ${s.status}`));
  const approvals = (snap?.approvals ?? []).filter((p) => match(`${p.summary} ${p.category}`));
  const events = (snap?.events ?? []).filter((e) =>
    match(`${e.actor} ${e.action} ${e.resource} ${e.authority}`)
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-signal">
            live monitoring
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold lowercase tracking-tight sm:text-4xl">
            what cosigno is doing, right now.
          </h1>
          {/* "Monitoring" implies something watches while you are away. This
              page polls from the browser: it shows the current state every few
              seconds WHILE OPEN, and observes nothing once it is closed. */}
          <p className="mt-2 max-w-2xl text-sm font-semibold text-ink-soft">
            counted from live state, re-read every {POLL_MS / 1000} seconds while this page
            is open. closing it stops the updates — it does not stop the work.
          </p>
        </div>
        <button
          onClick={() => setLive((v) => !v)}
          aria-pressed={live}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-btn border border-line bg-surface px-3.5 py-2 text-sm font-bold transition-colors duration-fast hover:bg-cream-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          <span
            className={`h-2 w-2 rounded-pill ${live ? "animate-orb-pulse bg-signal" : "bg-ink-soft"}`}
            aria-hidden="true"
          />
          {live ? "live" : "paused"}
        </button>
      </header>

      <label className="mt-6 flex items-center gap-2 rounded-btn border border-line bg-surface px-3 py-2.5 focus-within:ring-2 focus-within:ring-signal">
        <Search size={15} className="shrink-0 text-ink-soft" aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter services, approvals, and events"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-soft"
        />
        <span className="sr-only">Filter live monitoring</span>
      </label>

      {error && (
        <p className="mt-4 rounded-card border border-line bg-surface p-4 text-sm font-semibold text-ink">
          {error}{" "}
          <button onClick={load} className="underline decoration-signal underline-offset-2">
            retry
          </button>
        </p>
      )}

      {!snap && !error ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[104px] animate-pulse rounded-card border border-line bg-surface" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="running" value={a.missions_active ?? 0} note={`${a.missions_total ?? 0} total missions`} />
            <Stat label="awaiting you" value={a.approvals_pending ?? 0} note="need your signature" />
            <Stat label="executed" value={a.actions_executed ?? 0} note={`${a.actions_vetoed ?? 0} vetoed`} />
            <Stat label="automations" value={a.automations_enabled ?? 0} note={`${a.automations_total ?? 0} configured`} />
          </div>

          {(snap?.alerts.length ?? 0) > 0 && (
            <Section title="alerts" icon={AlertTriangle} count={snap?.alerts.length}>
              <ul className="flex flex-col gap-2">
                {snap?.alerts.map((al, i) => (
                  <li
                    key={i}
                    className={`rounded-card border bg-surface p-3.5 shadow-soft ${
                      al.level === "critical" ? "border-signal" : "border-line"
                    }`}
                  >
                    <p className="text-sm font-bold">{al.title}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">{al.detail}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="connected services" icon={Plug} count={services.length}>
            {services.length === 0 ? (
              <Empty>
                No connections yet. Connect a tool and its live status, last heartbeat, and auth
                state appear here.
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-separate border-spacing-y-2 text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-black uppercase tracking-[0.14em] text-ink-soft">
                      <th className="px-3">service</th>
                      <th className="px-3">status</th>
                      <th className="px-3">auth</th>
                      <th className="px-3 text-right">last heartbeat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.key + s.name} className="bg-surface shadow-soft">
                        <td className="rounded-l-card border-y border-l border-line px-3 py-3 font-bold">
                          {s.name}
                          <span className="ml-2 font-mono text-[11px] font-normal text-ink-soft">
                            {s.kind}
                          </span>
                        </td>
                        <td className="border-y border-line px-3 py-3">
                          <span
                            className={`inline-flex rounded-pill px-2.5 py-1 text-[11px] font-black uppercase tracking-wider ${
                              SERVICE_TONE[s.status] ?? "bg-cream-deep text-ink-soft"
                            }`}
                          >
                            {s.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="border-y border-line px-3 py-3 font-mono text-xs text-ink-soft">
                          {s.auth_type}
                        </td>
                        <td className="rounded-r-card border-y border-r border-line px-3 py-3 text-right text-xs text-ink-soft">
                          {ago(s.heartbeat_age_ms)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="approval queue" icon={ShieldCheck} count={approvals.length}>
            {approvals.length === 0 ? (
              <Empty>Nothing is waiting on you. Approvals appear here the moment one is raised.</Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {approvals.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-3.5 shadow-soft"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{p.summary}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-ink-soft">
                        {p.category} · tier {p.tier}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-pill bg-cream-deep px-2.5 py-1 text-[11px] font-bold tabular-nums text-ink-soft">
                      waiting {ago(p.waiting_ms)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="event stream" icon={Activity} count={events.length}>
            {events.length === 0 ? (
              <Empty>
                {/* These events come from the in-memory authorization registry,
                    which is cleared when the server restarts. "Permanently" was
                    plainly untrue, and the permanent record is the activity log
                    — so point at the one that actually keeps things. */}
                no authorization events yet. this stream shows agent-API decisions
                held in memory since the server last started — the durable record of
                everything cosigno did is in{" "}
                <a href="/app/activity" className="underline underline-offset-2">
                  activity
                </a>
                .
              </Empty>
            ) : (
              <ol className="relative flex flex-col gap-0 border-l border-line pl-4">
                {events.map((e) => (
                  <li key={e.id} className="relative py-2.5">
                    <span
                      className={`absolute -left-[21px] top-4 h-2 w-2 rounded-pill ${
                        e.executed ? "bg-signal" : "bg-line"
                      }`}
                      aria-hidden="true"
                    />
                    <p className="text-sm">
                      <span className="font-mono text-xs text-ink-soft">{e.actor}</span>{" "}
                      <span className="font-bold">{e.action}</span>{" "}
                      <span className="text-ink-soft">on {e.resource}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-soft">
                      {e.executed ? "executed" : e.status} · {e.authority} · {e.blast_level} blast
                      radius
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <p className="mt-10 text-center text-[11px] text-ink-soft">
            Process-level metrics (CPU, memory, network latency) are not instrumented, so they are
            not shown — cosigno never displays a number it hasn&apos;t measured.
          </p>
        </>
      )}
    </div>
  );
}
