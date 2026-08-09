/**
 * Compile every surface once, before any test runs.
 *
 * These specs run against `next dev`, which compiles a route the first time
 * something asks for it. On a loaded machine that first hit can take the
 * better part of a minute — long enough to blow a navigation timeout — so a
 * suite without this measures webpack's cold start and reports it as a
 * product failure. Which surface pays the cost depends on test ordering, so
 * the failure moves around and reads as flake.
 *
 * Warming here makes every test measure the same thing: the product, warm,
 * the way a user meets it.
 */
const SURFACES = [
  "/",
  "/product",
  "/operators",
  "/demo",
  "/templates",
  "/security",
  "/pricing",
  "/privacy",
  "/terms",
  "/checkout?plan=pro",
  "/sign-in",
  "/app",
  "/app/missions",
  "/app/approvals",
  "/app/templates",
  "/app/decisions",
  "/app/automations",
  "/app/connections",
  "/app/memory",
  "/app/files",
  "/app/team",
  "/app/health",
  "/app/activity",
  "/app/account",
  "/app/workspace",
  "/app/trust",
  "/app/monitoring",
  "/app/mission-control",
  "/app/settings/rules",
];

export default async function warm() {
  const base = process.env.BASE_URL ?? "http://localhost:3400";
  // Sequential on purpose: parallel cold compiles contend for the same CPU
  // and take longer in total than doing them one at a time.
  for (const path of SURFACES) {
    try {
      await fetch(base + path, { signal: AbortSignal.timeout(120_000) });
    } catch {
      // A surface that won't warm will fail its own test with a real
      // message. Warming is an optimisation, never a gate.
    }
  }
}
