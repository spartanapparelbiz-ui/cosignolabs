"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { badge, btn, card, dot, field } from "@/components/ui/styles";

interface Health {
  mission_cron_configured: boolean;
  background_execution_active: boolean;
  missions_waiting_for_tick: number;
  database: string;
  planner_configured: boolean;
  browser_provider_configured: boolean;
  browser_live: boolean;
  note: string;
}

/** True/false rows read straight from /api/health/mission. */
function Row({ label, ok, value }: { label: string; ok?: boolean; value?: string }) {
  return (
    <li className="flex items-center gap-2 border-t border-line/50 py-2 text-sm first:border-0">
      {ok === undefined ? (
        <span className="h-4 w-4 shrink-0" />
      ) : ok ? (
        <CheckCircle2 size={15} className="shrink-0 text-signal" aria-hidden="true" />
      ) : (
        <XCircle size={15} className="shrink-0 text-ink-soft" aria-hidden="true" />
      )}
      <span className="font-semibold">{label}</span>
      <span className="ml-auto text-ink-soft">{value ?? (ok ? "yes" : "no")}</span>
    </li>
  );
}

/**
 * Turn a failed health fetch into something a human can act on. A page whose
 * entire job is diagnosing a deployment must never itself fail with "couldn't
 * load" — that just moves the mystery one level up.
 */
function describeFailure(status: number, body: string): string {
  if (status === 401) return "you're signed out — sign in again and reload this page.";
  if (status === 503)
    return "the app is running without its database or AI keys. check the Netlify environment variables.";
  // 5xx bodies are deliberately generic (no schema detail leaves the server),
  // so quoting them back adds nothing. Name the likeliest cause instead: this
  // route's only real work is a `missions` table query.
  if (status >= 500)
    return `the server errored (${status}). the usual cause is a database table this deployment expects but your Supabase project doesn't have yet — open the Supabase SQL editor and run supabase/ALL_MIGRATIONS_SAFE.sql.`;
  return `health check failed (${status}).${body ? ` server said: ${body}` : ""}`;
}

export function MissionHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health/mission")
      .then(async (r) => {
        if (r.ok) return r.json();
        // Read the body for the server's own message, but never let a parse
        // failure become the thing the user sees instead of the status.
        const body = await r
          .json()
          .then((d: { message?: string }) => d?.message ?? "")
          .catch(() => "");
        throw new Error(describeFailure(r.status, body));
      })
      .then((h) => !cancelled && setHealth(h))
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error && e.message
            ? e.message
            : "couldn't reach the server — check your connection and reload."
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error)
    return (
      <p className="t-body flex items-start gap-2.5 border-l-2 border-signal pl-3.5">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
        <span>{error}</span>
      </p>
    );
  if (!health) return <div className="h-40 animate-pulse rounded-card bg-cream-deep" aria-hidden="true" />;

  return (
    <div className="flex flex-col gap-4">
      {!health.background_execution_active && (
        <div className="t-body flex items-start gap-2.5 border-l-2 border-signal pl-3.5">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
          <span>{health.note}</span>
        </div>
      )}
      <ul className="rounded-card bg-surface px-4 shadow-rest">
        <Row label="background mission execution" ok={health.background_execution_active} value={health.background_execution_active ? "active" : "not configured"} />
        <Row label="mission cron" ok={health.mission_cron_configured} />
        <Row label="missions waiting for a tick" value={String(health.missions_waiting_for_tick)} />
        <Row label="database" value={health.database} />
        <Row label="AI" ok={health.planner_configured} />
        <Row label="browser provider" ok={health.browser_provider_configured} value={health.browser_provider_configured ? "configured" : "sandbox only"} />
        <Row label="live browser" ok={health.browser_live} value={health.browser_live ? "live" : "sandbox (labeled)"} />
      </ul>
    </div>
  );
}
