/**
 * Startup diagnostic. Next calls register() once when the server boots, so
 * this is where we tell the operator EXACTLY which services are configured —
 * one clear line per missing service, straight into the Netlify function
 * logs. Names only; values are never logged.
 *
 * This never throws and never blocks boot: missing keys degrade (see
 * scripts/env-services.mjs) rather than crashing.
 */
export async function register() {
  // Only run in the Node server runtime (not edge / client).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { serviceStatus, appGated } = await import("../scripts/env-services.mjs");
  const status = serviceStatus();

  const prod = process.env.NODE_ENV === "production";
  console.log(`[cosigno] booting (${prod ? "production" : "development"}) — service check:`);

  for (const s of status) {
    if (s.present) {
      console.log(`[cosigno] ${s.name} configured.`);
    } else {
      console.warn(`[cosigno] ${s.name} keys absent — ${s.breaks}.`);
    }
  }

  if (prod && appGated()) {
    console.warn(
      "[cosigno] /app and real API routes will serve a branded 503 until " +
        "PLANNER, SUPABASE, and CLERK are all set. Marketing pages stay public."
    );
  }
}
