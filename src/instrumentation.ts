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

  // This is a diagnostic ONLY, so it is wrapped to never crash the boot. If the
  // env-services module somehow isn't bundled into the serverless function, we
  // log and continue rather than taking down every route with a boot error.
  try {
    const { serviceStatus, appGated, publicSandbox } = await import(
      "../scripts/env-services.mjs"
    );
    const status = serviceStatus();

    const prod = process.env.NODE_ENV === "production";
    console.log(
      `[cosigno] booting (${prod ? "production" : "development"}) — service check:`
    );

    for (const s of status) {
      if (s.present) {
        console.log(`[cosigno] ${s.name} configured.`);
      } else {
        console.warn(`[cosigno] ${s.name} keys absent — ${s.breaks}.`);
      }
    }

    /**
     * The redirect URIs this deployment will actually send providers, printed
     * so they can be pasted into each provider's console without anyone having
     * to work out the pattern.
     *
     * This is the failure nothing else catches: a provider rejects a URI it
     * doesn't recognise BEFORE any of our code runs, so there is no error to
     * log and no message to show — the person just lands back where they
     * started. Google is the sharp edge, because Gmail, Calendar and Drive
     * share one OAuth client but are three separate connectors, so that one
     * client needs all three URIs registered.
     */
    try {
      const { appUrl } = await import("@/lib/stripe");
      const { listProviderMeta } = await import("@/lib/integrations/registry");
      const oauth = listProviderMeta().filter((p) => p.authType === "oauth2");
      console.log(
        `[cosigno] OAuth redirect URIs for this deployment (${appUrl()}) — ` +
          "each must be registered with its provider, or connecting fails silently:"
      );
      for (const p of oauth) {
        console.log(`[cosigno]   ${p.name}: ${appUrl()}/api/connections/${p.key}/callback`);
      }
    } catch {
      /* Diagnostic only — never let it affect boot. */
    }

    if (prod && appGated()) {
      if (publicSandbox()) {
        console.warn(
          "[cosigno] PUBLIC SANDBOX is ON (COSIGNO_PUBLIC_MODE=1): /app serves a " +
            "per-visitor, in-memory, offline, sandbox-only workspace — no sign-in, no " +
            "real data or actions. Add PLANNER + SUPABASE to switch to the real product."
        );
      } else {
        console.warn(
          "[cosigno] /app and real API routes will serve a branded 503 until " +
            "PLANNER and SUPABASE are all set. Marketing pages stay public. " +
            "(Set COSIGNO_PUBLIC_MODE=1 to open a safe public sandbox instead.)"
        );
      }
    }
  } catch (err) {
    console.warn("[cosigno] boot service-check skipped:", err);
  }
}
