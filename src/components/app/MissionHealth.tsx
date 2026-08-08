"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

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

/** The live key check from /api/health/planner — verified, not assumed. */
interface PlannerHealth {
  ok: boolean;
  reason: string;
  vision: boolean;
  message: string;
  hint?: string;
  detail?: string;
}

export function MissionHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planner, setPlanner] = useState<PlannerHealth | null>(null);
  const [checking, setChecking] = useState(false);

  /**
   * "Is the key set?" and "does the key work?" are different questions, and
   * only the second one matters. This asks the second — it makes a real
   * call — which is why it is a button rather than something that fires on
   * every page load.
   */
  async function checkKey() {
    if (checking) return;
    setChecking(true);
    try {
      const res = await fetch("/api/health/planner");
      const body = await res.json().catch(() => ({}));
      setPlanner(
        res.ok
          ? (body as PlannerHealth)
          : {
              ok: false,
              reason: "unreachable",
              vision: false,
              message: body.message || `the check failed (${res.status}).`,
            }
      );
    } catch {
      setPlanner({
        ok: false,
        reason: "unreachable",
        vision: false,
        message: "the check couldn't be run from this browser.",
      });
    } finally {
      setChecking(false);
    }
  }

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
      <p className="flex items-start gap-2 rounded-card bg-signal/10 p-4 text-sm font-semibold ring-1 ring-inset ring-signal/30">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
        <span>{error}</span>
      </p>
    );
  if (!health) return <div className="h-40 animate-pulse rounded-card bg-cream-deep" aria-hidden="true" />;

  return (
    <div className="flex flex-col gap-4">
      {!health.background_execution_active && (
        <div className="flex items-start gap-2 rounded-card bg-signal/10 p-4 text-sm font-semibold ring-1 ring-inset ring-signal/30">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
          <span>{health.note}</span>
        </div>
      )}
      <ul className="rounded-card bg-surface/60 px-4 shadow-soft">
        <Row label="background mission execution" ok={health.background_execution_active} value={health.background_execution_active ? "active" : "not configured"} />
        <Row label="mission cron" ok={health.mission_cron_configured} />
        <Row label="missions waiting for a tick" value={String(health.missions_waiting_for_tick)} />
        <Row label="database" value={health.database} />
        <Row label="AI" ok={health.planner_configured} value={health.planner_configured ? "key present" : "no key"} />
        {planner && (
          <>
            <Row
              label="AI key verified against the provider"
              ok={planner.ok}
              value={planner.ok ? "working" : planner.reason.replace(/_/g, " ")}
            />
            <Row label="reads images" ok={planner.vision} value={planner.vision ? "yes" : "not verified"} />
          </>
        )}
        <Row label="browser provider" ok={health.browser_provider_configured} value={health.browser_provider_configured ? "configured" : "sandbox only"} />
        <Row label="live browser" ok={health.browser_live} value={health.browser_live ? "live" : "sandbox (labeled)"} />
      </ul>

      {/*
        A key that is PRESENT but rejected, out of credit, or pointed at a
        model that doesn't exist looks identical to a working one from the
        outside — until a user's first request fails with "temporarily
        unavailable". This runs the real call and says which it is.
      */}
      <div className="flex flex-col gap-2 rounded-card bg-surface/60 p-4 shadow-soft">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={checkKey}
            disabled={checking}
            className="rounded-btn bg-ink px-4 py-2 text-xs font-bold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:cursor-not-allowed"
          >
            {checking ? "checking…" : "test the AI connection"}
          </button>
          <span className="text-xs font-semibold text-ink-soft">
            sends one small real request, including an image, and reports what came back.
          </span>
        </div>
        {planner && (
          <div
            className={`flex items-start gap-2 rounded-btn p-3 text-sm font-semibold ${
              planner.ok ? "bg-signal/10 ring-1 ring-inset ring-signal/30" : "bg-cream-deep"
            }`}
          >
            {planner.ok ? (
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
            ) : (
              <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            )}
            <span>
              {planner.message}
              {planner.hint && <span className="mt-1 block text-xs text-ink-soft">{planner.hint}</span>}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
