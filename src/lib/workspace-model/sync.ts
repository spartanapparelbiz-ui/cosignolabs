/**
 * Live synchronization state.
 *
 * The Workspace Model is only useful if it reflects production, so every
 * connector declares HOW it stays current — webhooks where the provider pushes,
 * streaming where it holds a connection open, polling as the fallback that
 * always works — and every connector reports honestly how stale it currently
 * is.
 *
 * The staleness rule is the important one: a model that silently drifts is
 * more dangerous than no model, because plans get built against it. A connector
 * whose last observation is older than its own freshness budget is marked
 * STALE, and a stale connector's resources are flagged in every plan built
 * against them.
 */

import type { DigitalTwin } from "@/lib/twin/model";

export type SyncMode = "webhook" | "stream" | "poll";

export interface ConnectorSync {
  connector: string;
  name: string;
  mode: SyncMode;
  /** Why this mode — the model explains its own plumbing. */
  mode_reason: string;
  status: string;
  /** Last time cosigno actually observed this connection. */
  last_synced_at: string | null;
  /** Seconds since that observation, or null when never observed. */
  age_seconds: number | null;
  /** How old this connector's data may be before it is considered stale. */
  freshness_budget_seconds: number;
  stale: boolean;
  /** Monotonic version of the model for this connector. */
  version: number;
  resource_count: number;
  operation_count: number;
  /** Resources with observed instance counts vs. capability-only ones. */
  synced_resources: number;
  note: string;
}

export interface SyncReport {
  generated_at: string;
  connectors: ConnectorSync[];
  healthy: number;
  stale: number;
  never_synced: number;
  summary: string;
}

/**
 * Providers that push. Anything not listed falls back to polling — the safe
 * default, because assuming a webhook that isn't wired means believing the
 * model is fresh when nothing is updating it.
 */
const WEBHOOK_CAPABLE = new Set(["github", "slack", "stripe", "notion"]);
const STREAM_CAPABLE = new Set(["gmail", "google_calendar", "outlook"]);

/** Freshness budget by sync mode, in seconds. */
const BUDGET: Record<SyncMode, number> = {
  webhook: 15 * 60,
  stream: 30 * 60,
  poll: 60 * 60,
};

export function syncModeFor(twin: DigitalTwin): { mode: SyncMode; reason: string } {
  if (twin.kind === "mcp") {
    return {
      mode: "poll",
      reason: "MCP servers advertise tools on request and do not push change events, so the model re-reads the tool list on a schedule.",
    };
  }
  // Matched on the PROVIDER key: a twin is keyed by connection id, and a
  // connection id tells you nothing about whether that vendor pushes events.
  if (WEBHOOK_CAPABLE.has(twin.provider_key)) {
    return { mode: "webhook", reason: `${twin.name} pushes change events, so the model updates as they arrive.` };
  }
  if (STREAM_CAPABLE.has(twin.provider_key)) {
    return { mode: "stream", reason: `${twin.name} supports change streams, so the model follows them continuously.` };
  }
  return {
    mode: "poll",
    reason: `${twin.name} exposes no change feed cosigno can subscribe to, so the model is refreshed by polling — the fallback that always works.`,
  };
}

export interface SyncInput {
  twin: DigitalTwin;
  /** From the connection record — the last successful health observation. */
  last_synced_at: string | null;
  /** How many times this connector's model has been rebuilt. */
  version?: number;
}

export function buildSyncReport(inputs: SyncInput[], now = Date.now()): SyncReport {
  const connectors = inputs.map<ConnectorSync>(({ twin, last_synced_at, version }) => {
    const { mode, reason } = syncModeFor(twin);
    const budget = BUDGET[mode];
    const ageSeconds = last_synced_at ? Math.max(0, Math.round((now - Date.parse(last_synced_at)) / 1000)) : null;
    const stale = ageSeconds === null ? twin.status === "connected" : ageSeconds > budget;
    const syncedResources = twin.resources.filter((r) => r.synced_count !== null).length;

    return {
      connector: twin.connection_key,
      name: twin.name,
      mode,
      mode_reason: reason,
      status: twin.status,
      last_synced_at,
      age_seconds: ageSeconds,
      freshness_budget_seconds: budget,
      stale,
      version: version ?? 1,
      resource_count: twin.resources.length,
      operation_count: twin.operation_count,
      synced_resources: syncedResources,
      note: noteFor(twin, stale, ageSeconds, syncedResources),
    };
  });

  const stale = connectors.filter((c) => c.stale).length;
  const never = connectors.filter((c) => c.last_synced_at === null).length;

  return {
    generated_at: new Date(now).toISOString(),
    connectors: connectors.sort((a, b) => a.name.localeCompare(b.name)),
    healthy: connectors.length - stale,
    stale,
    never_synced: never,
    summary:
      connectors.length === 0
        ? "No connections yet, so there is no model to keep in sync."
        : stale === 0
          ? `All ${connectors.length} connected system${connectors.length === 1 ? " is" : "s are"} within their freshness budget.`
          : `${stale} of ${connectors.length} connected systems are stale. Plans built against them are flagged until they resync.`,
  };
}

function noteFor(twin: DigitalTwin, stale: boolean, age: number | null, syncedResources: number): string {
  if (twin.status !== "connected") return `Not connected (${twin.status}) — the model shows its capability surface only.`;
  if (age === null) return "Connected, but cosigno has not yet observed this system. The model is capability-only until it does.";
  if (stale) return `Last observed ${formatAge(age)} ago — past this connector's freshness budget. Treat its state as unverified.`;
  if (syncedResources === 0) {
    return `Observed ${formatAge(age)} ago. Capability surface only: no resource reports synced instance counts, and cosigno will not invent them.`;
  }
  return `Observed ${formatAge(age)} ago; ${syncedResources} resource${syncedResources === 1 ? "" : "s"} carry synced counts.`;
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

/* -------------------------------------------------------------------------- */
/* conflict resolution                                                         */
/* -------------------------------------------------------------------------- */

export interface Conflict {
  field: string;
  local: unknown;
  remote: unknown;
  /** Which value the model will hold after resolution. */
  resolution: "remote" | "local" | "unresolved";
  reason: string;
}

/**
 * Reconcile a locally-modelled object against a freshly observed remote one.
 *
 * Production is authoritative — the model exists to mirror it, not to argue
 * with it — so a divergent field resolves to the remote value. The exception
 * is a field the model has never observed remotely, which is left unresolved
 * rather than being blanked out by an absent key.
 */
export function reconcile(
  local: Record<string, unknown>,
  remote: Record<string, unknown>
): { merged: Record<string, unknown>; conflicts: Conflict[] } {
  const merged: Record<string, unknown> = { ...local };
  const conflicts: Conflict[] = [];

  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const l = local[key];
    const r = remote[key];
    if (JSON.stringify(l) === JSON.stringify(r)) continue;

    if (!(key in remote)) {
      conflicts.push({
        field: key,
        local: l,
        remote: undefined,
        resolution: "unresolved",
        reason: "The remote system did not report this field; the local value is kept but not treated as verified.",
      });
      continue;
    }
    merged[key] = r;
    conflicts.push({
      field: key,
      local: l,
      remote: r,
      resolution: "remote",
      reason: "Production is authoritative — the model takes the observed value.",
    });
  }

  return { merged, conflicts };
}
