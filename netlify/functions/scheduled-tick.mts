import { formatReport, runTicks } from "../../src/lib/cron/dispatch.ts";

/**
 * The background heartbeat for the whole product.
 *
 * `/api/missions/tick` and `/api/automations/tick` have always existed and the
 * middleware has always exempted them from the cookie gate — but no scheduler
 * on the deployment ever called them. Missions therefore advanced only while
 * their owner sat on the page, and recurring automations never ran once. This
 * function is the caller that was missing.
 *
 * Netlify invokes scheduled functions itself and refuses public HTTP access to
 * them, so this cannot be triggered from outside. The tick routes it calls are
 * publicly routable, which is exactly why they still demand CRON_SECRET — and
 * why this function refuses to run without it rather than falling back to
 * anything weaker.
 *
 * Runs every minute. Both ticks are internally bounded (missions process a
 * fixed batch per pass), so a minute is comfortably longer than a pass takes
 * and overlapping invocations are not a concern.
 */

export default async () => {
  const report = await runTicks();
  console.log(formatReport(report));

  // A skipped run is a configuration fact, not a crash: returning 503 (rather
  // than throwing) keeps it visible in the Netlify function log without
  // marking the deployment unhealthy.
  if (!report.ran) return new Response(report.skipped, { status: 503 });

  const failed = report.outcomes.filter((o) => !o.ok);
  return new Response(JSON.stringify(report), {
    status: failed.length === report.outcomes.length && failed.length > 0 ? 502 : 200,
    headers: { "content-type": "application/json" },
  });
};

export const config = {
  name: "cosigno-scheduled-tick",
  schedule: "* * * * *",
};
