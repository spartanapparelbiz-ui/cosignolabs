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

export function MissionHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/health/mission")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="text-sm font-semibold text-ink-soft">couldn&apos;t load health.</p>;
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
        <Row label="planner" ok={health.planner_configured} />
        <Row label="browser provider" ok={health.browser_provider_configured} value={health.browser_provider_configured ? "configured" : "sandbox only"} />
        <Row label="live browser" ok={health.browser_live} value={health.browser_live ? "live" : "sandbox (labeled)"} />
      </ul>
    </div>
  );
}
