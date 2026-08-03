/**
 * The scheduler's dispatch logic — the piece that was missing.
 *
 * `/api/missions/tick` and `/api/automations/tick` were written to be called
 * by an external cron, and the middleware already exempts them from the cookie
 * gate, but nothing on the deployment ever called them. The practical effect
 * was that missions only advanced while their owner had the page open and
 * recurring automations never fired at all — the product looked complete and
 * quietly did nothing once the tab closed.
 *
 * This module holds the logic (so it is testable in isolation); the Netlify
 * scheduled function in netlify/functions/ is a thin wrapper around it.
 *
 * Two rules govern everything here:
 *
 *  · FAIL CLOSED. Without CRON_SECRET nothing is attempted. An unauthenticated
 *    background executor is strictly worse than no background executor.
 *  · NEVER LOG THE SECRET. Reports carry target names, HTTP status, and
 *    duration only — they land in build/function logs, which are not private.
 */

export interface TickTarget {
  /** Short name used in logs and the report. */
  name: string;
  /** Path on the deployment, called with POST. */
  path: string;
}

/** Every background heartbeat, in the order they should run. */
export const TICK_TARGETS: readonly TickTarget[] = [
  // Missions first: automations enqueue missions, so ticking missions after
  // automations in the same pass would leave freshly-enqueued work sitting
  // idle for a full interval. Running them in this order costs nothing and
  // means an automation's mission starts on the very next tick.
  { name: "missions", path: "/api/missions/tick" },
  { name: "automations", path: "/api/automations/tick" },
];

export interface TickOutcome {
  name: string;
  ok: boolean;
  status: number | null;
  ms: number;
  /** Present only on failure — a short reason, never a response body dump. */
  error?: string;
}

export interface TickReport {
  ran: boolean;
  /** Why the run was skipped, when `ran` is false. */
  skipped?: string;
  outcomes: TickOutcome[];
}

/**
 * Where the deployment lives. Explicit config wins; Netlify's own `URL` is the
 * canonical production site URL and is set automatically inside functions.
 *
 * `DEPLOY_URL` is deliberately NOT consulted: it points at a single immutable
 * deploy, so a scheduled function that used it would keep driving an old
 * deploy's routes after a release.
 */
export function resolveBaseUrl(env: Record<string, string | undefined>): string {
  const candidate =
    env.NEXT_PUBLIC_APP_URL ||
    env.NEXT_PUBLIC_SITE_URL ||
    env.URL ||
    "https://cosignolabs.com";
  return candidate.trim().replace(/\/+$/, "");
}

export interface RunTicksOptions {
  env?: Record<string, string | undefined>;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  /**
   * Per-target ceiling. Kept well under the platform's invocation limit so the
   * function returns a truthful report rather than being killed mid-flight.
   * The tick route runs in its own invocation with its own (longer) limit, so
   * a timeout here does not cancel the work it started.
   */
  timeoutMs?: number;
  targets?: readonly TickTarget[];
}

export async function runTicks(options: RunTicksOptions = {}): Promise<TickReport> {
  const env = options.env ?? process.env;
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const targets = options.targets ?? TICK_TARGETS;

  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    return {
      ran: false,
      skipped:
        "CRON_SECRET is not set — background execution is off. Missions advance only while their owner has the page open, and automations never fire.",
      outcomes: [],
    };
  }

  const base = resolveBaseUrl(env);
  const outcomes: TickOutcome[] = [];

  // Sequential, not parallel: see the ordering note on TICK_TARGETS, and two
  // concurrent ticks would contend for the same mission leases for no gain.
  for (const target of targets) {
    const startedAt = Date.now();
    try {
      const res = await doFetch(`${base}${target.path}`, {
        method: "POST",
        headers: { "x-cron-secret": secret, "content-type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      outcomes.push({
        name: target.name,
        ok: res.ok,
        status: res.status,
        ms: Date.now() - startedAt,
        // Status alone, never the body: a failing route's body can echo input.
        ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
      });
    } catch (err) {
      outcomes.push({
        name: target.name,
        ok: false,
        status: null,
        ms: Date.now() - startedAt,
        error: err instanceof Error ? err.name : "request failed",
      });
    }
  }

  return { ran: true, outcomes };
}

/** A single log line, safe for public function logs. */
export function formatReport(report: TickReport): string {
  if (!report.ran) return `[cosigno] scheduler skipped — ${report.skipped}`;
  const parts = report.outcomes.map(
    (o) => `${o.name}=${o.ok ? "ok" : (o.error ?? "failed")} (${o.ms}ms)`
  );
  return `[cosigno] scheduler ran — ${parts.join(" ")}`;
}
