"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Page, PageHeader, SectionLabel } from "@/components/ui/Page";
import { badge, btn, card, dot, field, type BadgeTone } from "@/components/ui/styles";
import { SkeletonRows } from "@/components/Skeleton";

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

const SERVICE_TONE: Record<string, BadgeTone> = {
  connected: "positive",
  needs_reauth: "signal",
  error: "danger",
  revoked: "neutral",
};

/**
 * A counted fact. Four of these used to be four bordered cards with 30px
 * figures — a scoreboard for numbers that are usually zero. Now they are one
 * row of plain readings, which is what they are.
 */
function Stat({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div>
      <p className="t-eyebrow">{label}</p>
      <p className="mt-1.5 font-display text-[1.75rem] leading-none tabular-nums">{value}</p>
      {note && <p className="t-caption mt-2">{note}</p>}
    </div>
  );
}

function Section({
  title, count, children,
}: {
  title: string; count?: number; children: React.ReactNode;
}) {
  return (
    <section className="mt-14">
      <SectionLabel className="mb-4">
        {title}
        {typeof count === "number" && count > 0 && (
          <span className="ml-2 tabular-nums opacity-60">{count}</span>
        )}
      </SectionLabel>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="t-caption py-6">{children}</p>;
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
      /* The status code is ours to read, not theirs. A founder can act on
         "we couldn't read it" and can do nothing with a 503. */
      if (!res.ok) throw new Error("couldn't read the current state just now.");
      setSnap(await res.json());
      setError(null);
    } catch {
      setError("Couldn't read the current state just now.");
    }
  }, []);

  useEffect(() => {
    load();
    if (!live) return;
    /* Clearing the timeout is not enough on its own: when cleanup runs while a
       tick is already awaiting load(), the handle it clears has already fired,
       and that in-flight callback would schedule a fresh timeout after the
       component is gone. The flag is what actually stops the loop. */
    let stopped = false;
    const tick = () => {
      timer.current = setTimeout(async () => {
        if (stopped) return;
        await load();
        if (stopped) return;
        tick();
      }, POLL_MS);
    };
    tick();
    return () => {
      stopped = true;
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
    <Page width="wide">
      {/* "Monitoring" implies something watches while you are away. This page
          polls from the browser: it shows the current state every few seconds
          WHILE OPEN, and observes nothing once it is closed. */}
      <PageHeader
        title="What is happening right now?"
        description={`Read from live state every ${POLL_MS / 1000} seconds while this page is open. Closing it stops the updates, not the work.`}
        action={
          <button onClick={() => setLive((v) => !v)} aria-pressed={live} className={btn("ghost", "sm")}>
            <span
              className={`h-[5px] w-[5px] rounded-pill ${live ? "animate-orb-pulse bg-signal" : "bg-ink-soft"}`}
              aria-hidden="true"
            />
            {live ? "Live" : "Paused"}
          </button>
        }
      />

      <label className="relative mt-12 block">
        <Search
          size={15}
          strokeWidth={1.9}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
          aria-hidden="true"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter services, approvals and events"
          className={`${field("md")} pl-9`}
        />
        <span className="sr-only">Filter live monitoring</span>
      </label>

      {error && (
        <p className="t-body mt-6 border-l-2 border-danger pl-3.5 text-danger">
          {error}{" "}
          <button onClick={load} className="underline underline-offset-2">
            Retry
          </button>
        </p>
      )}

      {!snap && !error ? (
        <div className="mt-10">
          <SkeletonRows rows={4} />
        </div>
      ) : (
        <>
          <div className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Running" value={a.missions_active ?? 0} note={`${a.missions_total ?? 0} missions in all`} />
            <Stat label="Awaiting you" value={a.approvals_pending ?? 0} note="Need your signature" />
            <Stat label="Executed" value={a.actions_executed ?? 0} note={`${a.actions_vetoed ?? 0} vetoed`} />
            <Stat label="Watching" value={a.automations_enabled ?? 0} note={`${a.automations_total ?? 0} set up`} />
          </div>

          {(snap?.alerts.length ?? 0) > 0 && (
            <Section title="Alerts" count={snap?.alerts.length}>
              <ul className="flex flex-col gap-4">
                {snap?.alerts.map((al, i) => (
                  <li
                    key={i}
                    className={`border-l-2 pl-3.5 ${al.level === "critical" ? "border-danger" : "border-signal"}`}
                  >
                    <p className="text-[1rem] font-semibold">{al.title}</p>
                    <p className="t-caption mt-0.5">{al.detail}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Connected services" count={services.length}>
            {services.length === 0 ? (
              <Empty>
                No connections yet. Connect a tool and its live status, last heartbeat, and auth
                state appear here.
              </Empty>
            ) : (
              <div className="surface-scroll overflow-x-auto">
                <table className="w-full min-w-[560px] text-[0.9375rem]">
                  <thead>
                    <tr className="border-b border-line/50 text-left">
                      <th className="t-eyebrow px-3 pb-2 font-semibold">Service</th>
                      <th className="t-eyebrow px-3 pb-2 font-semibold">Status</th>
                      <th className="t-eyebrow px-3 pb-2 font-semibold">Auth</th>
                      <th className="t-eyebrow px-3 pb-2 text-right font-semibold">Last heartbeat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.key + s.name} className="border-b border-line/30 last:border-0">
                        <td className="px-3 py-3">{s.name}</td>
                        <td className="px-3 py-3">
                          <span className={badge(SERVICE_TONE[s.status] ?? "neutral")}>
                            <span className={dot(SERVICE_TONE[s.status] ?? "neutral")} aria-hidden="true" />
                            {s.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="t-caption px-3 py-3">{s.auth_type}</td>
                        <td className="t-caption px-3 py-3 text-right tabular-nums">
                          {ago(s.heartbeat_age_ms)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Approval queue" count={approvals.length}>
            {approvals.length === 0 ? (
              <Empty>Nothing is waiting on you. Approvals appear here the moment one is raised.</Empty>
            ) : (
              <ul className="-mx-3 flex flex-col">
                {approvals.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-btn px-3 py-3 transition-colors duration-fast hover:bg-ink/[0.035]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[1rem]">{p.summary}</p>
                      <p className="t-caption mt-0.5">{p.category}</p>
                    </div>
                    <span className="t-caption shrink-0 tabular-nums">waiting {ago(p.waiting_ms)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Event stream" count={events.length}>
            {events.length === 0 ? (
              <Empty>
                {/* These events come from the in-memory authorization registry,
                    which is cleared when the server restarts. "Permanently" was
                    plainly untrue, and the permanent record is the activity log
                    — so point at the one that actually keeps things. */}
                nothing here yet. this stream covers work driven through cosigno&apos;s
                API, and it only goes back as far as the last restart — the permanent
                record of everything cosigno has done is in{" "}
                <a href="/app/activity" className="underline underline-offset-2">
                  activity
                </a>
                .
              </Empty>
            ) : (
              <ol className="relative flex flex-col border-l border-line/60 pl-5">
                {events.map((e) => (
                  <li key={e.id} className="relative py-3">
                    <span
                      className={`absolute -left-[23px] top-4 h-[5px] w-[5px] rounded-pill ${
                        e.executed ? "bg-positive" : "bg-ink/25"
                      }`}
                      aria-hidden="true"
                    />
                    <p className="text-[0.9375rem]">
                      <span className="t-caption">{e.actor}</span> {e.action}{" "}
                      <span className="text-ink-soft">on {e.resource}</span>
                    </p>
                    <p className="t-caption mt-0.5">
                      {e.executed ? "executed" : e.status} · {e.authority} · {e.blast_level} blast radius
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <p className="t-caption mt-16">
            CPU, memory and latency are not instrumented, so they are not shown. cosigno
            never displays a number it hasn&apos;t measured.
          </p>
        </>
      )}
    </Page>
  );
}
