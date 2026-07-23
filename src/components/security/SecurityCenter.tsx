"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  Download,
  LogOut,
  MonitorSmartphone,
  Pause,
  Play,
  ShieldAlert,
} from "lucide-react";

/**
 * Security & Control — the real control surface, not a wall of shield icons.
 * Everything here is backed by server state: Emergency Stop and Pause write
 * the user's hold (enforced by the engine AND every scheduled tick), session
 * revocation goes through the auth provider, export/delete are the real data
 * routes. Security is shown through precise language and working controls.
 */

type HoldScope = "none" | "external" | "all";

interface SessionView {
  id: string;
  last_active_at: string | null;
  city: string | null;
  device: string | null;
}

interface SecurityEvent {
  id: string;
  event: string;
  severity: "info" | "notice" | "warning" | "critical";
  correlation_id: string | null;
  created_at: string;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-well">
      <h2 className="font-display text-lg font-bold lowercase">{title}</h2>
      {desc && <p className="mt-0.5 mb-3 text-sm font-semibold text-ink-soft">{desc}</p>}
      <div className={desc ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

export function SecurityCenter() {
  const [hold, setHold] = useState<HoldScope>("none");
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [sessionsConfigured, setSessionsConfigured] = useState(true);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [h, s, e] = await Promise.allSettled([
      fetch("/api/hold").then((r) => r.json()),
      fetch("/api/security/sessions").then((r) => r.json()),
      fetch("/api/security/events").then((r) => r.json()),
    ]);
    if (h.status === "fulfilled" && h.value.hold) setHold(h.value.hold.scope);
    if (s.status === "fulfilled") {
      setSessionsConfigured(s.value.configured !== false);
      setSessions(s.value.sessions ?? []);
    }
    if (e.status === "fulfilled") setEvents(e.value.events ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setHoldScope(scope: HoldScope) {
    setBusy("hold");
    try {
      const res = await fetch("/api/hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      if (res.ok) {
        setHold(scope);
        setNote(
          scope === "all"
            ? "Emergency Stop engaged. Nothing executes — including scheduled work — until you resume."
            : scope === "external"
              ? "Cosigno paused: external actions wait at the boundary."
              : "Resumed. Cosigno operates normally again."
        );
        load();
      }
    } finally {
      setBusy(null);
    }
  }

  async function revokeAllSessions() {
    if (!confirm("Sign out of every device? You'll need to sign in again everywhere.")) return;
    setBusy("sessions");
    try {
      const res = await fetch("/api/security/sessions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (res.ok) setNote("Signed out of all devices.");
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {note && (
        <p className="rounded-btn bg-cream-deep px-4 py-2.5 text-sm font-semibold text-ink">{note}</p>
      )}

      {/* Emergency Stop + Pause — server-enforced holds */}
      <Section
        title="pause & emergency stop"
        desc="server-enforced brakes. these write your hold state, which the engine and every scheduled run check before anything executes — they are not visual switches."
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 rounded-btn border border-line px-4 py-3">
            <div className="flex items-start gap-2.5">
              <Pause size={18} className="mt-0.5 text-ink" aria-hidden />
              <div>
                <p className="font-bold text-ink">Pause external actions</p>
                <p className="text-xs font-semibold text-ink-soft">
                  Research and drafting continue; anything that leaves your workspace waits for you.
                </p>
              </div>
            </div>
            <button
              onClick={() => setHoldScope(hold === "external" ? "none" : "external")}
              disabled={busy === "hold"}
              className={`shrink-0 rounded-btn px-3.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                hold === "external" ? "bg-ink text-cream" : "border border-ink text-ink hover:bg-ink hover:text-cream"
              }`}
            >
              {hold === "external" ? "Resume" : "Pause"}
            </button>
          </div>

          <div
            className={`flex items-center justify-between gap-3 rounded-btn border px-4 py-3 ${
              hold === "all" ? "border-danger bg-danger/8" : "border-danger/40"
            }`}
          >
            <div className="flex items-start gap-2.5">
              <AlertOctagon size={18} className="mt-0.5 text-danger" aria-hidden />
              <div>
                <p className="font-bold text-ink">Emergency Stop</p>
                <p className="text-xs font-semibold text-ink-soft">
                  Halts ALL execution, including scheduled missions and automations, server-side.
                </p>
              </div>
            </div>
            <button
              onClick={() => setHoldScope(hold === "all" ? "none" : "all")}
              disabled={busy === "hold"}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-btn px-3.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                hold === "all" ? "bg-ink text-cream" : "bg-danger text-cream hover:opacity-90"
              }`}
            >
              {hold === "all" ? (
                <>
                  <Play size={13} aria-hidden /> Resume
                </>
              ) : (
                <>
                  <AlertOctagon size={13} aria-hidden /> Stop everything
                </>
              )}
            </button>
          </div>
        </div>
      </Section>

      {/* Active sessions */}
      <Section title="active sessions" desc="devices with a live sign-in. revoke any you don't recognize.">
        {!sessionsConfigured ? (
          <p className="text-sm font-semibold text-ink-soft">
            Session management is available once the hosted auth provider is configured.
          </p>
        ) : sessions === null ? (
          <p className="text-sm font-semibold text-ink-soft">loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm font-semibold text-ink-soft">No other active sessions.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-2.5 rounded-btn border border-line px-3 py-2 text-sm">
                <MonitorSmartphone size={16} className="text-ink-soft" aria-hidden />
                <span className="font-semibold text-ink">{s.device ?? "Unknown device"}</span>
                <span className="text-ink-soft">{s.city ?? ""}</span>
                <span className="ml-auto text-xs text-ink-soft">active {fmt(s.last_active_at)}</span>
              </li>
            ))}
          </ul>
        )}
        {sessionsConfigured && (
          <button
            onClick={revokeAllSessions}
            disabled={busy === "sessions"}
            className="mt-3 inline-flex items-center gap-1.5 rounded-btn border border-ink px-3.5 py-1.5 text-xs font-bold text-ink transition-colors hover:bg-ink hover:text-cream disabled:opacity-50"
          >
            <LogOut size={13} aria-hidden /> Sign out of all devices
          </button>
        )}
      </Section>

      {/* Connections + scopes live on their own page; link across */}
      <Section
        title="connected apps & permissions"
        desc="every app cosigno can touch, its exact granted scopes, and your standing rules — on the connections page."
      >
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/connections"
            className="rounded-btn border border-ink px-3.5 py-1.5 text-xs font-bold text-ink transition-colors hover:bg-ink hover:text-cream"
          >
            Manage connections & scopes
          </Link>
          <Link
            href="/app/memory"
            className="rounded-btn border border-ink px-3.5 py-1.5 text-xs font-bold text-ink transition-colors hover:bg-ink hover:text-cream"
          >
            Approval rules & standing orders
          </Link>
        </div>
      </Section>

      {/* Recent security events */}
      <Section title="recent security events" desc="the record of sensitive changes on your account. correlation ids tie each event to its receipt.">
        {events.length === 0 ? (
          <p className="text-sm font-semibold text-ink-soft">No security events recorded yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {events.slice(0, 30).map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    e.severity === "critical" || e.severity === "warning"
                      ? "bg-danger"
                      : e.severity === "notice"
                        ? "bg-signal"
                        : "bg-ink-soft/40"
                  }`}
                  aria-hidden
                />
                <span className="font-semibold text-ink">{e.event.replace(/_/g, " ")}</span>
                <span className="ml-auto text-xs text-ink-soft">{fmt(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Data controls */}
      <Section title="your data" desc="export everything cosigno stores about you, or delete your account entirely.">
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/account/export"
            className="inline-flex items-center gap-1.5 rounded-btn border border-ink px-3.5 py-1.5 text-xs font-bold text-ink transition-colors hover:bg-ink hover:text-cream"
          >
            <Download size={13} aria-hidden /> Export my data (JSON)
          </a>
          <Link
            href="/app/account"
            className="inline-flex items-center gap-1.5 rounded-btn border border-danger px-3.5 py-1.5 text-xs font-bold text-danger transition-colors hover:bg-danger hover:text-cream"
          >
            <ShieldAlert size={13} aria-hidden /> Delete account
          </Link>
        </div>
      </Section>

      {/* Security contact */}
      <Section title="security contact">
        <p className="text-sm font-semibold text-ink-soft">
          Found a vulnerability? Email{" "}
          <a href="mailto:security@cosignolabs.com" className="font-bold text-ink underline">
            security@cosignolabs.com
          </a>
          . Our policy and{" "}
          <a href="/.well-known/security.txt" className="font-bold text-ink underline">
            security.txt
          </a>{" "}
          describe responsible disclosure. We never ask researchers to access other users&rsquo; data.
        </p>
      </Section>
    </div>
  );
}
